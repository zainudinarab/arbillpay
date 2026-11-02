import { pool } from '../config/db.js';
import { RouterOSAPI } from 'node-routeros';
import { sendTelegramMessage } from './telegramAlertService.js';

export interface UserQuotaUpdateResult {
  customer_id: string;
  name: string;
  pppoe_username: string;
  package_name?: string;
  quota_mb: number;
  delta_bytes: number;
  delta_mb: number;
  total_bytes_used: number;
  total_mb: number;
  is_fup: boolean;
  newly_fup: boolean;
}

export interface RouterQuotaSyncResult {
  success: boolean;
  router_id: string;
  router_name: string;
  total_queues_found: number;
  matched_users_count: number;
  updated_users: UserQuotaUpdateResult[];
  fup_triggered_users: UserQuotaUpdateResult[];
  message?: string;
}

/**
 * Melakukan sinkronisasi pemakaian kuota PPPoE untuk satu router tertentu.
 * Mengambil data dari Simple Queue MikroTik, menghitung delta pemakaian,
 * dan mengupdate database customers secara presisi.
 */
export async function syncRouterPppQuota(routerId: string): Promise<RouterQuotaSyncResult> {
  const routerRes = await pool.query(
    'SELECT id, name, ip_address, api_port, username, password, sync_ppp_quota_enabled FROM routers WHERE id = $1',
    [routerId]
  );

  if (routerRes.rows.length === 0) {
    return {
      success: false,
      router_id: routerId,
      router_name: 'Unknown',
      total_queues_found: 0,
      matched_users_count: 0,
      updated_users: [],
      fup_triggered_users: [],
      message: 'Router tidak ditemukan.'
    };
  }

  const router = routerRes.rows[0];

  const conn = new RouterOSAPI({
    host: router.ip_address,
    port: router.api_port || 8728,
    user: router.username || 'admin',
    password: router.password || '',
    timeout: 8
  });

  try {
    await conn.connect();
  } catch (connErr: any) {
    console.warn(`[PPP QUOTA] Gagal konek ke router ${router.name} (${router.ip_address}):`, connErr.message);
    return {
      success: false,
      router_id: router.id,
      router_name: router.name,
      total_queues_found: 0,
      matched_users_count: 0,
      updated_users: [],
      fup_triggered_users: [],
      message: `Koneksi ke router gagal: ${connErr.message}`
    };
  }

  const updatedUsers: UserQuotaUpdateResult[] = [];
  const fupTriggeredUsers: UserQuotaUpdateResult[] = [];

  try {
    // 1. Ambil Simple Queue dari MikroTik
    const queueList: any = await conn.write('/queue/simple/print');
    if (!Array.isArray(queueList)) {
      await conn.close().catch(() => {});
      return {
        success: true,
        router_id: router.id,
        router_name: router.name,
        total_queues_found: 0,
        matched_users_count: 0,
        updated_users: [],
        fup_triggered_users: [],
        message: 'Tidak ada queue yang ditemukan di router.'
      };
    }

    // 2. Ambil profil yang tersedia di MikroTik untuk cek profil isolir
    let isolirProfileName = 'isolir';
    try {
      const pppProfiles: any = await conn.write('/ppp/profile/print');
      if (Array.isArray(pppProfiles)) {
        const foundIso = pppProfiles.find((p: any) =>
          p.name === 'isolir' || p.name === 'pppoe-expired' || (p.name && p.name.toLowerCase().includes('isolir'))
        );
        if (foundIso) isolirProfileName = foundIso.name;
      }
    } catch (_) {}

    // 3. Iterasi setiap antrean
    for (const q of queueList) {
      if (!q.name) continue;

      // Queue PPPoE dinamis biasanya bernama: <pppoe-username>
      let rawUsername = q.name.trim();
      if (rawUsername.startsWith('<pppoe-') && rawUsername.endsWith('>')) {
        rawUsername = rawUsername.slice(7, -1);
      } else if (rawUsername.startsWith('<') && rawUsername.endsWith('>')) {
        rawUsername = rawUsername.slice(1, -1);
      }

      if (!rawUsername) continue;

      // Parsing total bytes dari antrean
      let currBytes = 0;
      if (q.bytes && typeof q.bytes === 'string') {
        const parts = q.bytes.split('/');
        const upload = parseInt(parts[0], 10) || 0;
        const download = parseInt(parts[1], 10) || 0;
        currBytes = upload + download;
      } else if (q['total-bytes']) {
        currBytes = parseInt(q['total-bytes'], 10) || 0;
      }

      // Ambil data pelanggan dari database
      const custRes = await pool.query(
        `SELECT c.id, c.name, c.pppoe_username, 
                COALESCE(c.total_bytes_used, 0)::bigint as total_bytes_used,
                COALESCE(c.last_queue_bytes, 0)::bigint as last_queue_bytes,
                COALESCE(c.is_fup, false) as is_fup,
                c.package_id, c.router_id,
                p.name as package_name, COALESCE(p.quota_mb, 0) as quota_mb
         FROM customers c
         LEFT JOIN packages p ON c.package_id = p.id
         WHERE LOWER(c.pppoe_username) = LOWER($1)
           AND (c.router_id = $2 OR c.router_id IS NULL)
         LIMIT 1`,
        [rawUsername, router.id]
      );

      if (custRes.rows.length === 0) continue;

      const cust = custRes.rows[0];
      const prevTotal = Number(cust.total_bytes_used) || 0;
      const lastQueue = Number(cust.last_queue_bytes) || 0;

      // Hitung delta (selisih) pemakaian
      let delta = 0;
      if (currBytes >= lastQueue) {
        // Sesi yang sama masih berjalan
        delta = currBytes - lastQueue;
      } else {
        // Router klien sempat restart / sesi baru dimulai
        delta = currBytes;
      }

      // Hindari update jika tidak ada perubahan sama sekali
      if (delta === 0 && currBytes === lastQueue) {
        continue;
      }

      const newTotal = prevTotal + delta;
      let isFup = cust.is_fup;
      let newlyFup = false;

      // Cek apakah paket memiliki kuota (quota_mb > 0)
      const quotaMb = Number(cust.quota_mb) || 0;
      if (quotaMb > 0) {
        const maxQuotaBytes = quotaMb * 1024 * 1024;
        if (newTotal >= maxQuotaBytes && !isFup) {
          isFup = true;
          newlyFup = true;
        }
      }

      // Update data pelanggan di database
      await pool.query(
        `UPDATE customers
         SET total_bytes_used = $1,
             last_queue_bytes = $2,
             is_fup = $3,
             fup_at = CASE WHEN $4 = true THEN NOW() ELSE fup_at END,
             updated_at = NOW()
         WHERE id = $5`,
        [newTotal, currBytes, isFup, newlyFup, cust.id]
      );

      const updateInfo: UserQuotaUpdateResult = {
        customer_id: cust.id,
        name: cust.name,
        pppoe_username: cust.pppoe_username,
        package_name: cust.package_name,
        quota_mb: quotaMb,
        delta_bytes: delta,
        delta_mb: parseFloat((delta / (1024 * 1024)).toFixed(2)),
        total_bytes_used: newTotal,
        total_mb: parseFloat((newTotal / (1024 * 1024)).toFixed(2)),
        is_fup: isFup,
        newly_fup: newlyFup
      };

      updatedUsers.push(updateInfo);

      // Jika baru saja habis kuota (FUP), eksekusi isolir di MikroTik & kirim notifikasi
      if (newlyFup) {
        fupTriggeredUsers.push(updateInfo);

        // Ubah profile di /ppp/secret ke isolir
        try {
          const secrets: any = await conn.write('/ppp/secret/print', [`?name=${cust.pppoe_username}`]);
          if (Array.isArray(secrets) && secrets.length > 0) {
            await conn.write('/ppp/secret/set', [
              `=.id=${secrets[0]['.id']}`,
              `=profile=${isolirProfileName}`,
              `=comment=KUOTA HABIS (FUP) - ${new Date().toISOString().slice(0, 10)}`
            ]);
          }

          // Putus sesi aktif agar login ulang dengan profil isolir
          const actives: any = await conn.write('/ppp/active/print', [`?name=${cust.pppoe_username}`]);
          if (Array.isArray(actives)) {
            for (const act of actives) {
              await conn.write('/ppp/active/remove', [`=.id=${act['.id']}`]);
            }
          }
        } catch (isoErr: any) {
          console.warn(`[PPP QUOTA] Gagal ubah profil isolir di MikroTik untuk ${cust.pppoe_username}:`, isoErr.message);
        }

        // Catat log kejadian ke pppoe_connection_logs
        await pool.query(
          `INSERT INTO pppoe_connection_logs
           (router_id, customer_id, pppoe_username, event_type, terminate_cause, recorded_at)
           VALUES ($1, $2, $3, 'quota_exceeded', 'Batas kuota FUP paket telah habis', NOW())`,
          [router.id, cust.id, cust.pppoe_username]
        ).catch(() => {});

        // Kirim Notifikasi Telegram
        const alertMsg =
          `⚠️ *[PERINGATAN KUOTA PPPoE HABIS / FUP]*\n\n` +
          `👤 *Pelanggan:* ${cust.name} (\`${cust.pppoe_username}\`)\n` +
          `📦 *Paket:* ${cust.package_name || '-'}\n` +
          `📊 *Batas Kuota:* ${quotaMb} MB\n` +
          `📈 *Total Terpakai:* ${updateInfo.total_mb} MB\n` +
          `🌐 *Router:* ${router.name}\n` +
          `🔒 *Tindakan:* Otomatis dialihkan ke profil \`${isolirProfileName}\` & sesi aktif di-disconnect.`;

        await sendTelegramMessage(alertMsg).catch(() => {});
      }
    }

    // Update timestamp sinkronisasi terakhir di router
    await pool.query('UPDATE routers SET last_ppp_quota_synced_at = NOW() WHERE id = $1', [router.id]);

    await conn.close().catch(() => {});

    return {
      success: true,
      router_id: router.id,
      router_name: router.name,
      total_queues_found: queueList.length,
      matched_users_count: updatedUsers.length,
      updated_users: updatedUsers,
      fup_triggered_users: fupTriggeredUsers,
      message: `Sinkronisasi kuota router "${router.name}" selesai: ${updatedUsers.length} user diperbarui, ${fupTriggeredUsers.length} user habis kuota.`
    };
  } catch (err: any) {
    await conn.close().catch(() => {});
    console.error(`[PPP QUOTA] Error saat proses sinkronisasi kuota ${router.name}:`, err.message);
    return {
      success: false,
      router_id: router.id,
      router_name: router.name,
      total_queues_found: 0,
      matched_users_count: 0,
      updated_users: [],
      fup_triggered_users: [],
      message: `Terjadi error: ${err.message}`
    };
  }
}

/**
 * Worker Background: Berjalan setiap 60 detik.
 * Memeriksa router mana saja yang fitur sync_ppp_quota_enabled = true
 * dan sudah mencapai interval menit yang ditentukan.
 */
let isWorkerRunning = false;

export async function processPppQuotaBackgroundWorker() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  try {
    const activeRouters = await pool.query(`
      SELECT id, name, 
             COALESCE(sync_ppp_quota_interval, 10) as interval_minutes,
             last_ppp_quota_synced_at
      FROM routers
      WHERE sync_ppp_quota_enabled = true
    `);

    const now = Date.now();

    for (const r of activeRouters.rows) {
      const intervalMs = (Math.max(1, Number(r.interval_minutes) || 10)) * 60 * 1000;
      const lastSyncTime = r.last_ppp_quota_synced_at ? new Date(r.last_ppp_quota_synced_at).getTime() : 0;

      // Jika belum pernah disinkronkan atau sudah melewati interval
      if (now - lastSyncTime >= intervalMs) {
        syncRouterPppQuota(r.id).catch((err) => {
          console.warn(`[PPP QUOTA WORKER] Error pada router ${r.name}:`, err.message);
        });
      }
    }
  } catch (err: any) {
    console.warn('[PPP QUOTA WORKER] Error query routers:', err.message);
  } finally {
    isWorkerRunning = false;
  }
}

// Inisialisasi scheduler otomatis setiap 60 detik
setInterval(() => {
  processPppQuotaBackgroundWorker().catch(() => {});
}, 60 * 1000);
