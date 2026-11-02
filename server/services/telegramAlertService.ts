import { pool } from '../config/db.js';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
  graceMinutes: number;
}

/**
 * Mengambil konfigurasi Telegram & Grace Period dari tabel system_settings atau environment
 */
export async function getTelegramConfig(): Promise<TelegramConfig> {
  const config: TelegramConfig = {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    enabled: process.env.TELEGRAM_ALERT_ENABLED === 'false' ? false : true,
    graceMinutes: parseInt(process.env.OFFLINE_ALERT_GRACE_MINUTES || '5', 10) || 5
  };

  try {
    const res = await pool.query(`
      SELECT key, value FROM system_settings 
      WHERE key IN (
        'telegram_bot_token', 
        'telegram_chat_id', 
        'telegram_alert_enabled', 
        'offline_alert_grace_minutes'
      )
    `);

    for (const row of res.rows) {
      if (row.key === 'telegram_bot_token' && row.value) config.botToken = row.value.trim();
      if (row.key === 'telegram_chat_id' && row.value) config.chatId = row.value.trim();
      if (row.key === 'telegram_alert_enabled') config.enabled = row.value === 'true' || row.value === '1';
      if (row.key === 'offline_alert_grace_minutes' && row.value) {
        const parsed = parseInt(row.value, 10);
        if (!isNaN(parsed) && parsed > 0) config.graceMinutes = parsed;
      }
    }
  } catch (err: any) {
    console.warn('[TELEGRAM] Gagal membaca system_settings:', err.message);
  }

  return config;
}

/**
 * Menyimpan konfigurasi Telegram ke database PostgreSQL
 */
export async function saveTelegramConfig(newConfig: Partial<TelegramConfig>): Promise<TelegramConfig> {
  const current = await getTelegramConfig();
  const updated: TelegramConfig = {
    botToken: newConfig.botToken !== undefined ? newConfig.botToken.trim() : current.botToken,
    chatId: newConfig.chatId !== undefined ? newConfig.chatId.trim() : current.chatId,
    enabled: newConfig.enabled !== undefined ? newConfig.enabled : current.enabled,
    graceMinutes: newConfig.graceMinutes !== undefined ? Math.max(1, newConfig.graceMinutes) : current.graceMinutes
  };

  const queries = [
    { key: 'telegram_bot_token', val: updated.botToken },
    { key: 'telegram_chat_id', val: updated.chatId },
    { key: 'telegram_alert_enabled', val: updated.enabled ? 'true' : 'false' },
    { key: 'offline_alert_grace_minutes', val: String(updated.graceMinutes) }
  ];

  for (const q of queries) {
    await pool.query(`
      INSERT INTO system_settings (key, value, updated_at) 
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [q.key, q.val]).catch(() => {});
  }

  return updated;
}

/**
 * Mengirim pesan ke bot Telegram via HTTP POST API
 */
export async function sendTelegramMessage(text: string): Promise<{ success: boolean; message?: string }> {
  const config = await getTelegramConfig();

  if (!config.enabled) {
    return { success: false, message: 'Notifikasi Telegram dinonaktifkan di pengaturan.' };
  }

  if (!config.botToken || !config.chatId) {
    return { success: false, message: 'Bot Token atau Chat ID Telegram belum dikonfigurasi.' };
  }

  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      const errMsg = data.description || `HTTP ${res.status}`;
      console.error('[TELEGRAM ALERT ERROR]', errMsg);
      return { success: false, message: errMsg };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[TELEGRAM HTTP ERROR]', err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Format helper tanggal jam WIB
 */
function formatWib(date: Date | string): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'medium',
      timeStyle: 'medium'
    }) + ' WIB';
  } catch (_) {
    return String(date);
  }
}

/**
 * Format helper durasi waktu
 */
function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours} Jam ${remainingMinutes} Menit`;
  }
  if (minutes > 0) {
    return `${minutes} Menit ${seconds} Detik`;
  }
  return `${seconds} Detik`;
}

/**
 * Masukkan pelanggan yang terputus (disconnect) ke antrean pemantauan
 */
export async function enqueueDisconnectedCustomer(params: {
  customerId?: string | null;
  username: string;
  routerId?: string | null;
  ip?: string | null;
  mac?: string | null;
  disconnectedAt?: Date;
}) {
  const user = (params.username || '').trim();
  if (!user) return;

  try {
    // 1. Cek apakah user sudah ada di antrean aktif (PENDING atau ALERT_SENT)
    const existing = await pool.query(`
      SELECT id, status FROM customer_offline_queue 
      WHERE LOWER(pppoe_username) = LOWER($1) 
        AND status IN ('PENDING', 'ALERT_SENT')
      LIMIT 1
    `, [user]);

    if (existing.rows.length > 0) {
      // Sudah ada di antrean aktif, tidak perlu duplikasi
      return;
    }

    // 2. Ambil informasi detail pelanggan dari database
    let custId = params.customerId || null;
    let custName = user;
    let packageName = '-';
    let routerName = '-';
    let routerId = params.routerId || null;

    try {
      const cRes = await pool.query(`
        SELECT c.id, c.name, c.customer_code, c.router_id, p.name as package_name, r.name as router_name
        FROM customers c
        LEFT JOIN packages p ON c.package_id = p.id
        LEFT JOIN routers r ON c.router_id = r.id
        WHERE LOWER(c.pppoe_username) = LOWER($1) OR c.id = $2
        LIMIT 1
      `, [user, custId]);

      if (cRes.rows.length > 0) {
        const c = cRes.rows[0];
        custId = c.id;
        custName = `${c.name} (${c.customer_code || user})`;
        if (c.package_name) packageName = c.package_name;
        if (c.router_name) routerName = c.router_name;
        if (c.router_id && !routerId) routerId = c.router_id;
      }
    } catch (_) {}

    // 3. Ambil konfigurasi grace period menit
    const cfg = await getTelegramConfig();
    const graceMinutes = cfg.graceMinutes || 5;
    const disTime = params.disconnectedAt || new Date();
    const alertDueAt = new Date(disTime.getTime() + graceMinutes * 60 * 1000);

    // 4. Masukkan ke tabel customer_offline_queue
    await pool.query(`
      INSERT INTO customer_offline_queue (
        customer_id, pppoe_username, customer_name, router_id, router_name, package_name,
        ip_address, mac_address, disconnected_at, grace_period_minutes, alert_due_at, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING'
      )
    `, [
      custId,
      user,
      custName,
      routerId || 'default',
      routerName,
      packageName,
      params.ip || null,
      params.mac || null,
      disTime,
      graceMinutes,
      alertDueAt
    ]);

    console.log(`[OFFLINE WATCHER] ⏳ User '${user}' masuk antrean pemantauan (toleransi: ${graceMinutes} menit).`);
  } catch (err: any) {
    console.error('[OFFLINE WATCHER ERROR] Gagal enqueue user:', err.message);
  }
}

/**
 * Tangani pelanggan yang terhubung kembali (reconnected / up)
 */
export async function handleCustomerReconnected(username: string, customerId?: string | null) {
  const user = (username || '').trim();
  if (!user) return;

  try {
    const queueRes = await pool.query(`
      SELECT * FROM customer_offline_queue 
      WHERE LOWER(pppoe_username) = LOWER($1) 
        AND status IN ('PENDING', 'ALERT_SENT')
      ORDER BY id DESC LIMIT 1
    `, [user]);

    if (queueRes.rows.length === 0) {
      return; // Tidak ada di antrean pemantauan
    }

    const item = queueRes.rows[0];
    const now = new Date();

    if (item.status === 'PENDING') {
      // Kasus A: Konek lagi SEBELUM grace period habis!
      // Hapus / tandai RECOVERED tanpa kirim alert (anti-flapping)
      await pool.query(`
        UPDATE customer_offline_queue 
        SET status = 'RECOVERED', recovered_at = $1, notes = 'Pulih sebelum batas waktu alert (Anti-Flapping)'
        WHERE id = $2
      `, [now, item.id]);

      console.log(`[OFFLINE WATCHER] ✨ User '${user}' pulih sebelum waktu alert habis. Antrean selesai tanpa mengirim notifikasi.`);
    } else if (item.status === 'ALERT_SENT') {
      // Kasus B: Alert gangguan SUDAH sempat terkirim sebelumnya ke Telegram!
      // Sekarang koneksi sembuh -> Kirim notifikasi RECOVERY ke Telegram
      const disTime = new Date(item.disconnected_at);
      const diffMs = now.getTime() - disTime.getTime();
      const durasiStr = formatDurationMs(diffMs);

      await pool.query(`
        UPDATE customer_offline_queue 
        SET status = 'RECOVERED', recovered_at = $1, notes = $2
        WHERE id = $3
      `, [now, `Pulih setelah durasi ${durasiStr}`, item.id]);

      const message = 
        `✅ <b>KONEKSI PULIH (RECOVERY)</b>\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>Pelanggan:</b> ${item.customer_name || user}\n` +
        `🔑 <b>PPPoE User:</b> <code>${item.pppoe_username}</code>\n` +
        `📡 <b>Router:</b> ${item.router_name || 'MikroTik'}\n` +
        `📦 <b>Paket:</b> ${item.package_name || '-'}\n` +
        `⏰ <b>Waktu Pulih:</b> ${formatWib(now)}\n` +
        `⏱️ <b>Durasi Terputus:</b> ${durasiStr}\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `<i>Layanan internet pelanggan sudah kembali aktif normal.</i>`;

      sendTelegramMessage(message).catch(() => {});
      console.log(`[OFFLINE WATCHER] 📢 User '${user}' pulih setelah mati ${durasiStr}. Notifikasi Recovery terkirim ke Telegram.`);
    }
  } catch (err: any) {
    console.error('[OFFLINE WATCHER ERROR] Gagal handle reconnect:', err.message);
  }
}

/**
 * Worker berkala yang memeriksa antrean PENDING yang batas waktunya telah tiba
 */
let isProcessingQueue = false;

export async function processOfflineQueueWorker() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    // 1. Cari antrean yang PENDING dan sudah melewati alert_due_at
    const dueRes = await pool.query(`
      SELECT * FROM customer_offline_queue 
      WHERE status = 'PENDING' AND alert_due_at <= NOW()
      ORDER BY alert_due_at ASC LIMIT 20
    `);

    if (dueRes.rows.length === 0) {
      isProcessingQueue = false;
      return;
    }

    const cfg = await getTelegramConfig();

    for (const item of dueRes.rows) {
      try {
        // Cek verifikasi real-time apakah pelanggan sudah online kembali
        const checkOnline = await pool.query(`
          SELECT is_online FROM customers 
          WHERE LOWER(pppoe_username) = LOWER($1) OR id = $2
          LIMIT 1
        `, [item.pppoe_username, item.customer_id]);

        if (checkOnline.rows.length > 0 && checkOnline.rows[0].is_online === true) {
          // Ternyata pelanggan sudah online
          await pool.query(`
            UPDATE customer_offline_queue 
            SET status = 'RECOVERED', recovered_at = NOW(), notes = 'Terdeteksi sudah online saat pemeriksaan alert'
            WHERE id = $1
          `, [item.id]);
          continue;
        }

        // Pelanggan MASIH OFFLINE setelah melewati grace period!
        // 1. Tandai status ALERT_SENT
        await pool.query(`
          UPDATE customer_offline_queue 
          SET status = 'ALERT_SENT', alert_sent_at = NOW()
          WHERE id = $1
        `, [item.id]);

        // 2. Kirim Pesan Alert ke Telegram jika konfigurasi aktif
        if (cfg.enabled && cfg.botToken && cfg.chatId) {
          const now = new Date();
          const disTime = new Date(item.disconnected_at);
          const diffMs = now.getTime() - disTime.getTime();
          const durasiStr = formatDurationMs(diffMs);

          const alertMsg = 
            `🚨 <b>ALERT: KONEKSI PELANGGAN TERPUTUS!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `👤 <b>Pelanggan:</b> ${item.customer_name || item.pppoe_username}\n` +
            `🔑 <b>PPPoE User:</b> <code>${item.pppoe_username}</code>\n` +
            `🌐 <b>IP Address:</b> <code>${item.ip_address || '-'}</code>\n` +
            `📱 <b>MAC Address:</b> <code>${item.mac_address || '-'}</code>\n` +
            `📡 <b>Router:</b> ${item.router_name || 'MikroTik'}\n` +
            `📦 <b>Paket:</b> ${item.package_name || '-'}\n` +
            `⏰ <b>Terputus Sejak:</b> ${formatWib(disTime)}\n` +
            `⏳ <b>Durasi Mati:</b> > ${item.grace_period_minutes} Menit (${durasiStr})\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `⚠️ <i>Koneksi belum pulih setelah melebihi batas toleransi ${item.grace_period_minutes} menit. Mohon cek perangkat/jaringan pelanggan.</i>`;

          await sendTelegramMessage(alertMsg);
          console.log(`[OFFLINE WATCHER] 🚨 Alert Telegram terkirim untuk pelanggan '${item.pppoe_username}'.`);
        }
      } catch (itemErr: any) {
        console.error(`[OFFLINE WATCHER] Gagal memproses item queue id ${item.id}:`, itemErr.message);
      }
    }
  } catch (err: any) {
    console.error('[OFFLINE WATCHER WORKER ERROR]:', err.message);
  } finally {
    isProcessingQueue = false;
  }
}

// Jalankan background worker setiap 30 detik
setInterval(() => {
  processOfflineQueueWorker().catch(() => {});
  checkMassOutageCorrelation().catch(() => {});
}, 30 * 1000);

/**
 * ==============================================================
 * ENGINE DETEKSI GANGGUAN MASSAL (MASS OUTAGE & FIBER CUT CORRELATION)
 * ==============================================================
 */
interface MassOutageCluster {
  key: string;
  clusterType: 'ODP' | 'ROUTER' | 'AREA';
  clusterName: string;
  routerName: string;
  customers: { pppoe_username: string; customer_name: string; disconnected_at: Date }[];
  detectedAt: Date;
  alertSent: boolean;
}

const activeOutageClusters: Map<string, MassOutageCluster> = new Map();

/**
 * Menganalisis korelasi disconnect pelanggan untuk mendeteksi kabel putus massal
 */
export async function checkMassOutageCorrelation() {
  const cfg = await getTelegramConfig();
  if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return;

  try {
    // 1. Ambil semua antrean pelanggan yang offline dalam 15 menit terakhir
    const res = await pool.query(`
      SELECT q.id, q.pppoe_username, q.customer_name, q.router_id, q.router_name, q.disconnected_at,
             c.odp_port, c.dusun, c.desa
      FROM customer_offline_queue q
      LEFT JOIN customers c ON (LOWER(c.pppoe_username) = LOWER(q.pppoe_username) OR c.id = q.customer_id)
      WHERE q.status IN ('PENDING', 'ALERT_SENT')
        AND q.disconnected_at >= NOW() - INTERVAL '15 minutes'
      ORDER BY q.disconnected_at DESC
    `);

    if (res.rows.length < 3) {
      // Periksa apakah cluster yang sebelumnya aktif kini sudah pulih
      await checkMassOutageRecovery(new Set());
      return;
    }

    // 2. Kelompokkan berdasarkan ODP (jika diisi)
    const odpGroups: Map<string, any[]> = new Map();
    const routerGroups: Map<string, any[]> = new Map();

    for (const row of res.rows) {
      const odp = (row.odp_port || '').trim().toUpperCase();
      if (odp && odp !== '-' && odp !== 'NONE') {
        if (!odpGroups.has(odp)) odpGroups.set(odp, []);
        odpGroups.get(odp)!.push(row);
      }

      const routerKey = row.router_name || row.router_id || 'MikroTik';
      if (!routerGroups.has(routerKey)) routerGroups.set(routerKey, []);
      routerGroups.get(routerKey)!.push(row);
    }

    const currentClusterKeys = new Set<string>();

    // 3. Deteksi Cluster ODP (Ambang Batas: >= 3 pelanggan di 1 ODP yang sama)
    for (const [odp, list] of odpGroups.entries()) {
      if (list.length >= 3) {
        const clusterKey = `ODP:${odp}`;
        currentClusterKeys.add(clusterKey);

        if (!activeOutageClusters.has(clusterKey)) {
          const firstRouter = list[0]?.router_name || 'MikroTik Utama';
          const cluster: MassOutageCluster = {
            key: clusterKey,
            clusterType: 'ODP',
            clusterName: `ODP ${odp}`,
            routerName: firstRouter,
            customers: list.map(x => ({
              pppoe_username: x.pppoe_username,
              customer_name: x.customer_name || x.pppoe_username,
              disconnected_at: new Date(x.disconnected_at)
            })),
            detectedAt: new Date(),
            alertSent: false
          };

          activeOutageClusters.set(clusterKey, cluster);

          // Kirim Alert Mass Outage Telegram
          const custListStr = cluster.customers
            .slice(0, 10)
            .map((c, idx) => `${idx + 1}. <b>${c.customer_name}</b> (<code>${c.pppoe_username}</code>)`)
            .join('\n');

          const moreNotice = cluster.customers.length > 10 ? `\n<i>...dan ${cluster.customers.length - 10} pelanggan lainnya</i>` : '';

          const alertText =
            `🚨⚠️ <b>PERINGATAN GANGGUAN MASSAL (MASS OUTAGE)!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📍 <b>Titik ODP Terdampak:</b> <b>${cluster.clusterName}</b>\n` +
            `📡 <b>Router:</b> ${cluster.routerName}\n` +
            `👥 <b>Pelanggan Padam:</b> <b>${cluster.customers.length} Pelanggan Serentak</b>\n\n` +
            `📋 <b>Daftar Pelanggan Terputus:</b>\n` +
            `${custListStr}${moreNotice}\n\n` +
            `⏰ <b>Waktu Deteksi:</b> ${formatWib(cluster.detectedAt)}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `⚠️ <b>Indikasi Teknis:</b> Kemungkinan besar kabel distribusi Fiber Optik (FO) putus / tertekuk parah, atau splitter ODP rusak. Tim teknisi mohon lakukan pengecekan fisik ke lokasi!`;

          await sendTelegramMessage(alertText);
          cluster.alertSent = true;
          console.log(`[MASS OUTAGE DETECTOR] 🚨 Alert dikirim untuk cluster: ${clusterKey} (${list.length} users).`);
        }
      }
    }

    // 4. Deteksi Cluster Router (Ambang Batas: >= 5 pelanggan di Router yang sama tanpa terpetakan ODP)
    for (const [rName, list] of routerGroups.entries()) {
      if (list.length >= 5) {
        const clusterKey = `ROUTER:${rName}`;
        currentClusterKeys.add(clusterKey);

        if (!activeOutageClusters.has(clusterKey)) {
          const cluster: MassOutageCluster = {
            key: clusterKey,
            clusterType: 'ROUTER',
            clusterName: `Router ${rName}`,
            routerName: rName,
            customers: list.map(x => ({
              pppoe_username: x.pppoe_username,
              customer_name: x.customer_name || x.pppoe_username,
              disconnected_at: new Date(x.disconnected_at)
            })),
            detectedAt: new Date(),
            alertSent: false
          };

          activeOutageClusters.set(clusterKey, cluster);

          const custListStr = cluster.customers
            .slice(0, 10)
            .map((c, idx) => `${idx + 1}. <b>${c.customer_name}</b> (<code>${c.pppoe_username}</code>)`)
            .join('\n');

          const moreNotice = cluster.customers.length > 10 ? `\n<i>...dan ${cluster.customers.length - 10} pelanggan lainnya</i>` : '';

          const alertText =
            `🚨⚠️ <b>PERINGATAN GANGGUAN AREA / ROUTER!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📡 <b>Router / Gateway:</b> <b>${cluster.routerName}</b>\n` +
            `👥 <b>Total Pelanggan Terputus:</b> <b>${cluster.customers.length} Pelanggan Bersamaan</b>\n\n` +
            `📋 <b>Daftar Pelanggan:</b>\n` +
            `${custListStr}${moreNotice}\n\n` +
            `⏰ <b>Waktu Terdeteksi:</b> ${formatWib(cluster.detectedAt)}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `⚠️ <i>Kemungkinan terjadi pemadaman listrik di area POP/Server atau uplink backbone terputus.</i>`;

          await sendTelegramMessage(alertText);
          cluster.alertSent = true;
          console.log(`[MASS OUTAGE DETECTOR] 🚨 Alert dikirim untuk cluster router: ${clusterKey} (${list.length} users).`);
        }
      }
    }

    // 5. Periksa cluster yang sudah sembuh
    await checkMassOutageRecovery(currentClusterKeys);

  } catch (err: any) {
    console.warn('[MASS OUTAGE DETECTOR ERROR]:', err.message);
  }
}

/**
 * Notifikasi pemulihan jika gangguan massal telah selesai
 */
async function checkMassOutageRecovery(activeKeys: Set<string>) {
  for (const [key, cluster] of activeOutageClusters.entries()) {
    if (!activeKeys.has(key) && cluster.alertSent) {
      const now = new Date();
      const diffMs = now.getTime() - cluster.detectedAt.getTime();
      const durasiStr = formatDurationMs(diffMs);

      const recoveryMsg =
        `✅🎉 <b>GANGGUAN MASSAL TELAH PULIH (MASS OUTAGE RESOLVED)!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📍 <b>Cluster / Titik:</b> <b>${cluster.clusterName}</b> (${cluster.routerName})\n` +
        `👥 <b>Pelanggan:</b> Seluruh pelanggan telah kembali online normal\n` +
        `⏱️ <b>Durasi Gangguan:</b> ${durasiStr}\n` +
        `⏰ <b>Waktu Pulih:</b> ${formatWib(now)}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `<i>Kabel distribusi / jaringan telah aktif kembali. Kerja bagus tim teknisi! 🚀</i>`;

      await sendTelegramMessage(recoveryMsg);
      console.log(`[MASS OUTAGE DETECTOR] ✅ Cluster ${key} pulih setelah ${durasiStr}.`);
      activeOutageClusters.delete(key);
    }
  }
}

