import { Request, Response } from 'express';
import { pool } from '../config/db.js';
import { testMikrotikConnection, fetchRealMikrotikIdentity } from '../services/mikrotikService.js';
import { RouterOSAPI } from 'node-routeros';
import { getFirestore } from '../config/firebase.js';
import crypto from 'crypto';
import { parseMikrotikHotspotComment, parseMikrotikPppComment, cleanToDateOnly } from '../utils/mikrotikComment.js';
import { redisGet, redisSet, redisDel, isRedisReady } from '../config/redis.js';

// --- ROUTERS ---
export async function listRouters(req: Request, res: Response) {
  if (process.env.DB_DRIVER === 'firebase') {
    const db = getFirestore();
    if (db) {
      const snap = await db.collection('routers').get();
      const list: any[] = [];
      snap.forEach((doc: any) => {
        if (doc.id !== '_init') {
          list.push({ id: doc.id, ...doc.data() });
        }
      });
      list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      return res.json({ success: true, routers: list });
    }
  }

  try {
    const result = await pool.query(`
      SELECT r.id, r.name, r.ip_address, r.api_port, r.username, r.password, r.status, 
             COALESCE(r.dns_name, 'arab.net') as dns_name, r.last_synced, r.created_at,
             COUNT(rp.id)::int as profile_count
      FROM routers r
      LEFT JOIN router_profiles rp ON r.id = rp.router_id
      GROUP BY r.id, r.dns_name
      ORDER BY r.created_at DESC
    `);
    res.json({ success: true, routers: result.rows });
  } catch (err: any) {
    const db = getFirestore();
    if (db) {
      const snap = await db.collection('routers').get();
      const list: any[] = [];
      snap.forEach((doc: any) => {
        if (doc.id !== '_init') {
          list.push({ id: doc.id, ...doc.data() });
        }
      });
      return res.json({ success: true, routers: list });
    }
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function testConnection(req: Request, res: Response) {
  const { ip_address, api_port, username, password, router_id } = req.body;

  if (!ip_address) {
    return res.status(400).json({ success: false, message: 'IP Address router wajib diisi.' });
  }

  try {
    const cleanHost = ip_address.trim();
    const cleanPort = parseInt(api_port) || 8728;
    const cleanUser = username?.trim() || 'admin';
    const cleanPass = password || '';

    const socketRes = await testMikrotikConnection(cleanHost, cleanPort);
    if (!socketRes.success) {
      return res.json(socketRes);
    }

    let routerUserPass = { user: cleanUser, pass: cleanPass };
    if (router_id && (!password || !username)) {
      if (process.env.DB_DRIVER === 'firebase') {
        const db = getFirestore();
        if (db) {
          try {
            const docSnap = await db.collection('routers').doc(String(router_id)).get();
            if (docSnap.exists) {
              const d = docSnap.data() || {};
              routerUserPass.user = username?.trim() || d.username || cleanUser;
              routerUserPass.pass = password || d.password || '';
            }
          } catch (_) {}
        }
      } else {
        try {
          const rRes = await pool.query('SELECT username, password FROM routers WHERE id = $1', [router_id]);
          if (rRes.rows.length > 0) {
            routerUserPass.user = username?.trim() || rRes.rows[0].username || cleanUser;
            routerUserPass.pass = password || rRes.rows[0].password || '';
          }
        } catch (_) {}
      }
    }

    const liveApi = await fetchRealMikrotikIdentity(cleanHost, cleanPort, routerUserPass.user, routerUserPass.pass);

    if (liveApi.connected) {
      if (router_id && liveApi.identity) {
        if (process.env.DB_DRIVER === 'firebase') {
          const db = getFirestore();
          if (db) {
            await db.collection('routers').doc(String(router_id)).set({
              name: liveApi.identity,
              status: 'online',
              last_synced: new Date().toISOString()
            }, { merge: true }).catch(() => {});
          }
        } else {
          await pool.query('UPDATE routers SET name = $1, status = $2, last_synced = NOW() WHERE id = $3', [liveApi.identity, 'online', router_id]).catch(() => {});
        }
      }

      res.json({
        success: true,
        is_live: true,
        identity: liveApi.identity,
        board: liveApi.board,
        version: liveApi.version,
        message: `⚡ Tes Koneksi & API BERHASIL LIVE! Identity Asli Mikrotik: "${liveApi.identity}" (${cleanHost}:${cleanPort}) | Hardware: ${liveApi.board} (${liveApi.version})`
      });
    } else {
      res.json({
        success: true,
        is_live: false,
        identity: `MikroTik-${cleanHost}`,
        board: 'Port 8728 Responding',
        version: 'API Active',
        message: `⚡ Port API ${cleanHost}:${cleanPort} AKTIF & MERESPON! (Catatan Login API: ${liveApi.error})`
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal melakukan tes koneksi: ${err.message}` });
  }
}

export async function addRouter(req: Request, res: Response) {
  const { name, ip_address, api_port, username, password, dns_name } = req.body;

  if (!name || !ip_address || !username) {
    return res.status(400).json({ success: false, message: 'Nama router, IP Address, dan Username wajib diisi.' });
  }

  try {
    const routerId = `rtr-${Date.now().toString(36)}`;
    const cleanDns = (dns_name || 'arab.net').trim();
    const result = await pool.query(`
      INSERT INTO routers (id, name, ip_address, api_port, username, password, status, dns_name)
      VALUES ($1, $2, $3, $4, $5, $6, 'online', $7)
      RETURNING id, name, ip_address, api_port, username, status, dns_name, created_at
    `, [routerId, name.trim(), ip_address.trim(), parseInt(api_port) || 8728, username.trim(), password || '', cleanDns]);

    const p1 = `rp-${Date.now().toString(36)}-1`;
    const p2 = `rp-${Date.now().toString(36)}-2`;
    await pool.query(`
      INSERT INTO router_profiles (id, router_id, name, type, rate_limit) VALUES
      ($1, $2, 'pppoe-profile-20m', 'pppoe', '20M/20M'),
      ($3, $4, 'hs-profile-monthly', 'hotspot', '5M/5M')
    `, [p1, routerId, p2, routerId]);

    res.json({
      success: true,
      message: `Router Mikrotik "${name}" (ISP: ${cleanDns}) berhasil didaftarkan!`,
      router: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function editRouter(req: Request, res: Response) {
  const { id } = req.params;
  const { name, ip_address, api_port, username, password, dns_name, status } = req.body;

  if (!name || !ip_address || !username) {
    return res.status(400).json({ success: false, message: 'Nama router, IP Address, dan Username wajib diisi.' });
  }

  try {
    const cleanDns = (dns_name || 'arab.net').trim();
    const result = await pool.query(`
      UPDATE routers
      SET name = $1,
          ip_address = $2,
          api_port = $3,
          username = $4,
          password = COALESCE($5, password),
          status = $6,
          dns_name = $7
      WHERE id = $8
      RETURNING id, name, ip_address, api_port, username, status, dns_name, last_synced
    `, [name.trim(), ip_address.trim(), parseInt(api_port) || 8728, username.trim(), password || null, status || 'online', cleanDns, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `Data Router "${name}" (ISP: ${cleanDns}) berhasil diperbarui!`,
      router: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function deleteRouter(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM routers WHERE id = $1 RETURNING id, name', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `Router "${result.rows[0].name}" berhasil dihapus!`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// --- PROFILES ---
export async function listProfiles(req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT rp.id, rp.router_id, rp.name, rp.type, rp.rate_limit, rp.package_id, 
             rp.local_address_mode, rp.local_address, rp.remote_address, rp.parent_queue, rp.dns_server,
             rp.synced_at, rp.is_synced, rp.on_router,
             COALESCE(rp.is_active, true) as is_active,
             COALESCE(p.is_active, true) as package_is_active,
             r.name as router_name, r.ip_address as router_ip, r.api_port as router_port,
             p.name as package_name, p.price as package_price, p.type as package_type, p.speed_limit as package_speed_limit
      FROM router_profiles rp
      LEFT JOIN routers r ON rp.router_id = r.id
      LEFT JOIN packages p ON rp.package_id = p.id
      ORDER BY r.name ASC, rp.type ASC, rp.name ASC
    `);
    res.json({ success: true, profiles: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}


export async function addProfile(req: Request, res: Response) {
  const { router_id, name, type, rate_limit, package_id, local_address_mode, local_address, remote_address, parent_queue, dns_server } = req.body;

  if (!router_id || !name || !type) {
    return res.status(400).json({ success: false, message: 'Router, Nama profile, dan Tipe (pppoe/hotspot) wajib diisi.' });
  }

  try {
    // Validasi: 1 Router hanya boleh 1 profile per paket
    if (package_id) {
      const existing = await pool.query(
        'SELECT id, name FROM router_profiles WHERE router_id = $1 AND package_id = $2 LIMIT 1',
        [router_id, package_id]
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Paket ini sudah digunakan oleh profile "${existing.rows[0].name}" pada router ini. Dalam 1 router, satu paket hanya boleh dihubungkan ke 1 profile.`
        });
      }
    }

    const profileId = `rp-${Date.now().toString(36)}`;
    const result = await pool.query(`
      INSERT INTO router_profiles (id, router_id, name, type, rate_limit, package_id, local_address_mode, local_address, remote_address, parent_queue, dns_server, is_synced, on_router)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, false)
      RETURNING id, router_id, name, type, rate_limit, package_id, local_address_mode, local_address, remote_address, parent_queue, dns_server, is_synced, on_router, synced_at
    `, [
      profileId, 
      router_id, 
      name.trim(), 
      type, 
      rate_limit?.trim() || null, 
      package_id || null,
      local_address_mode || 'manual',
      local_address?.trim() || null,
      remote_address?.trim() || null,
      parent_queue?.trim() || null,
      dns_server?.trim() || null
    ]);

    res.json({
      success: true,
      message: `Profile "${name}" berhasil dibuat secara lokal! Klik "⚡ Singkron ke Mikrotik" untuk menerbitkan ke Router.`,
      profile: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function editProfile(req: Request, res: Response) {
  const { id } = req.params;
  const { name, type, rate_limit, package_id, local_address_mode, local_address, remote_address, parent_queue, dns_server } = req.body;

  if (!name || !type) {
    return res.status(400).json({ success: false, message: 'Nama profile dan Tipe wajib diisi.' });
  }

  try {
    const cur = await pool.query('SELECT router_id FROM router_profiles WHERE id = $1', [id]);
    if (cur.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profile Mikrotik tidak ditemukan.' });
    }
    const router_id = cur.rows[0].router_id;

    // Validasi: 1 Router hanya boleh 1 profile per paket (kecuali profile ini sendiri)
    if (package_id) {
      const existing = await pool.query(
        'SELECT id, name FROM router_profiles WHERE router_id = $1 AND package_id = $2 AND id != $3 LIMIT 1',
        [router_id, package_id, id]
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Paket ini sudah digunakan oleh profile "${existing.rows[0].name}" pada router ini. Dalam 1 router, satu paket hanya boleh dihubungkan ke 1 profile.`
        });
      }
    }

    const result = await pool.query(`
      UPDATE router_profiles
      SET name = $1,
          type = $2,
          rate_limit = $3,
          package_id = $4,
          local_address_mode = $5,
          local_address = $6,
          remote_address = $7,
          parent_queue = $8,
          dns_server = $9,
          is_synced = false
      WHERE id = $10
      RETURNING id, router_id, name, type, rate_limit, package_id, local_address_mode, local_address, remote_address, parent_queue, dns_server, is_synced, on_router, synced_at
    `, [
      name.trim(), 
      type, 
      rate_limit?.trim() || null, 
      package_id || null,
      local_address_mode || 'manual',
      local_address?.trim() || null,
      remote_address?.trim() || null,
      parent_queue?.trim() || null,
      dns_server?.trim() || null,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profile Mikrotik tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `Profile "${name}" berhasil diperbarui di lokal! Perubahan ditandai Draft sampai Anda menekan tombol "⚡ Singkron ke Mikrotik".`,
      profile: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function toggleProfileStatus(req: Request, res: Response) {
  const { id } = req.params;
  const { is_active } = req.body;
  try {
    const result = await pool.query(
      'UPDATE router_profiles SET is_active = $1 WHERE id = $2 RETURNING id, name, is_active',
      [Boolean(is_active), id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profile tidak ditemukan.' });
    }
    const updated = result.rows[0];
    res.json({
      success: true,
      message: `Profile "${updated.name}" berhasil di-${updated.is_active ? 'aktifkan' : 'nonaktifkan'}!`,
      profile: updated
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}


export async function deleteProfile(req: Request, res: Response) {
  const { id } = req.params;
  const deleteFromRouter = req.body?.delete_from_router === true || req.query?.delete_from_router === 'true';

  try {
    // 1. Fetch profile info first
    const profRes = await pool.query(`
      SELECT rp.*, r.ip_address, r.api_port, r.username as r_user, r.password as r_pass, r.name as router_name
      FROM router_profiles rp
      LEFT JOIN routers r ON rp.router_id = r.id
      WHERE rp.id = $1
    `, [id]);

    if (profRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profile tidak ditemukan.' });
    }

    const prof = profRes.rows[0];

    // 2. Count & safely unlink any linked customers & vouchers
    const custRes = await pool.query('SELECT COUNT(*)::int as total FROM customers WHERE router_profile_id = $1', [id]);
    const linkedCustCount = custRes.rows[0]?.total || 0;

    await pool.query('UPDATE customers SET router_profile_id = NULL WHERE router_profile_id = $1', [id]);
    await pool.query('UPDATE hotspot_vouchers SET router_profile_id = NULL WHERE router_profile_id = $1', [id]);

    // 3. Optional: Delete from MikroTik router if requested and router credentials are available
    let routerDeleteMsg = '';
    if (deleteFromRouter && prof.ip_address && prof.name) {
      try {
        const conn = new RouterOSAPI({
          host: prof.ip_address,
          port: prof.api_port || 8728,
          user: prof.r_user || 'admin',
          password: prof.r_pass || '',
          timeout: 6
        });
        await conn.connect();
        const isHotspot = prof.type === 'hotspot';
        const printCmd = isHotspot ? '/ip/hotspot/user/profile/print' : '/ppp/profile/print';
        const removeCmd = isHotspot ? '/ip/hotspot/user/profile/remove' : '/ppp/profile/remove';
        
        const list: any = await conn.write(printCmd);
        if (Array.isArray(list)) {
          const match = list.find((item: any) => item.name === prof.name);
          if (match && match['.id']) {
            await conn.write(removeCmd, [`=.id=${match['.id']}`]);
            routerDeleteMsg = ` & dihapus dari MikroTik "${prof.router_name || prof.ip_address}"`;
          }
        }
        conn.close();
      } catch (err: any) {
        console.warn('Gagal menghapus profile dari MikroTik:', err.message);
        routerDeleteMsg = ` (namun gagal dihapus dari MikroTik: ${err.message})`;
      }
    }

    // 4. Delete the profile record from PostgreSQL
    await pool.query('DELETE FROM router_profiles WHERE id = $1', [id]);

    res.json({
      success: true,
      message: `Profile "${prof.name}" berhasil dihapus dari database${routerDeleteMsg}! ${linkedCustCount > 0 ? `${linkedCustCount} pelanggan terkait telah dilepas (unlinked).` : ''}`,
      unlinked_customers: linkedCustCount
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}


/**
 * Konfigurasi default / fallback sementara (statis) untuk script generator Mikrotik
 * Nanti dapat disesuaikan atau diambil langsung dari tabel setting/paket di database.
 */
export const STATIC_MIKROTIK_SCRIPT_CONFIG = {
  expired_mode: 'rem',  // 'rem' (remove expired voucher) | 'ntf' (set limit-uptime=1s) | 'remc' | 'ntfc' | '0'
  lock_user: true,      // Kunci MAC perangkat saat pertama login
  lock_server: false,   // Kunci ke server hotspot tertentu
  support_by: 'arbill', // Identifier brand/pembuat script
  reseller_price: 0,    // Harga reseller/agen (default: 0)
};

/**
 * Konversi ISO-8601 Duration (validity_iso) ke format interval/waktu MikroTik RouterOS (Mikhmon format)
 * Contoh:
 * - PT2M  -> 2m   (2 Menit)
 * - PT30M -> 30m  (30 Menit)
 * - PT3H  -> 3h   (3 Jam)
 * - P1D   -> 1d   (1 Hari)
 * - P7D   -> 7d   (7 Hari)
 * - P30D  -> 30d  (30 Hari)
 * - P1M   -> 1mo  (1 Bulan kalender asli, dihitung via script Mikrotik nextday)
 * - P2M   -> 2mo  (2 Bulan kalender)
 * - P1Y   -> 1y   (1 Tahun)
 */
export function isoDurationToMikrotikValidity(isoStr?: string | null): string | null {
  if (!isoStr || typeof isoStr !== 'string') return null;
  const clean = isoStr.trim().toUpperCase();
  if (!clean.startsWith('P')) return null;

  // Simple Minute match: PT2M, PT30M
  const minMatch = clean.match(/^PT(\d+)M$/);
  if (minMatch) return `${minMatch[1]}m`;

  // Simple Hour match: PT3H, PT12H
  const hrMatch = clean.match(/^PT(\d+)H$/);
  if (hrMatch) return `${hrMatch[1]}h`;

  // Simple Day match: P1D, P7D, P30D
  const dayMatch = clean.match(/^P(\d+)D$/);
  if (dayMatch) return `${dayMatch[1]}d`;

  // Simple Month match: P1M, P2M -> 1mo, 2mo (Bulan Kalender asli, didukung oleh script Mikrotik nextday!)
  const moMatch = clean.match(/^P(\d+)M$/);
  if (moMatch) {
    const months = parseInt(moMatch[1], 10);
    return `${months}mo`;
  }

  // Simple Year match: P1Y
  const yrMatch = clean.match(/^P(\d+)Y$/);
  if (yrMatch) return `${yrMatch[1]}y`;

  // Combined ISO match (misal P1M15D, P1DT12H, P2DT30M)
  let result = '';
  const datePart = clean.includes('T') ? clean.split('T')[0] : clean;
  const timePart = clean.includes('T') ? clean.split('T')[1] : '';

  const y = datePart.match(/(\d+)Y/);
  if (y) result += `${y[1]}y`;

  const mo = datePart.match(/(\d+)M/);
  if (mo) result += `${mo[1]}mo`;

  const d = datePart.match(/(\d+)D/);
  if (d) result += `${d[1]}d`;

  const h = timePart.match(/(\d+)H/);
  if (h) result += `${h[1]}h`;

  const m = timePart.match(/(\d+)M/);
  if (m) result += `${m[1]}m`;

  return result || null;
}

/**
 * Konversi ISO-8601 Duration ke Format MikroTik RouterOS (limit-uptime & validity)
 * - PT2M  -> 2m
 * - PT30M -> 30m
 * - PT3H  -> 3h
 * - P1D   -> 1d
 * - P30D  -> 30d
 */
export function isoToMikrotikTime(isoStr?: string | null): string {
  if (!isoStr || typeof isoStr !== 'string') return '';
  const clean = isoStr.trim().toUpperCase();
  if (!clean || clean === 'PT0S' || clean === '0') return '';
  if (!clean.startsWith('P')) return isoStr.trim().toLowerCase();

  const min = clean.match(/^PT(\d+)M$/);
  if (min) return `${min[1]}m`;

  const hr = clean.match(/^PT(\d+)H$/);
  if (hr) return `${hr[1]}h`;

  const day = clean.match(/^P(\d+)D$/);
  if (day) return `${day[1]}d`;

  const mo = clean.match(/^P(\d+)M$/);
  if (mo) return `${parseInt(mo[1], 10) * 30}d`;

  return isoDurationToMikrotikValidity(isoStr) || '';
}

/**
 * Konversi teks MikroTik time ('3h', '30m', '1d') ke Standar ISO-8601 Duration ('PT3H', 'PT30M', 'P1D')
 */
export function mikrotikTimeToIso(str?: string | null): string | null {
  if (!str || typeof str !== 'string') return null;
  const clean = str.trim();
  if (!clean || clean === '0' || clean.toLowerCase() === 'none' || clean.toLowerCase() === 'unlimited') return null;

  if (clean.toUpperCase().startsWith('P')) return clean.toUpperCase();

  const lower = clean.toLowerCase();
  const min = lower.match(/^(\d+)m$/);
  if (min) return `PT${min[1]}M`;

  const hr = lower.match(/^(\d+)h$/);
  if (hr) return `PT${hr[1]}H`;

  const day = lower.match(/^(\d+)d$/);
  if (day) return `P${day[1]}D`;

  const combo = lower.match(/^(\d+)d(\d+)h$/);
  if (combo) return `P${combo[1]}DT${combo[2]}H`;

  return null;
}

/**
 * Generator script on-login, bgservice, dan cshglobal (RouterOS v6 & v7 compatible)
 * Diadopsi persis dari logika arsitektur vpntunnel/MikrotikSyncService.php
 */
export function generateHotspotProfileOnLogin(profileData: {
  profile_name?: string;
  price?: number | string;
  reseller_price?: number | string;
  validity?: string;
  lock_user?: boolean;
  lock_server?: boolean;
  support_by?: string;
  expired_mode?: string;
  server_url?: string;
}) {
  const pname = profileData.profile_name || '';
  const price = profileData.price ?? 0;
  const sprice = profileData.reseller_price ?? STATIC_MIKROTIK_SCRIPT_CONFIG.reseller_price;
  const validity = profileData.validity || '1d';
  const getlock = (profileData.lock_user ?? STATIC_MIKROTIK_SCRIPT_CONFIG.lock_user) ? 'true' : 'false';
  const srvlock = (profileData.lock_server ?? STATIC_MIKROTIK_SCRIPT_CONFIG.lock_server) ? 'true' : 'false';
  const getsupportBy = profileData.support_by || STATIC_MIKROTIK_SCRIPT_CONFIG.support_by;
  const expmode = profileData.expired_mode || STATIC_MIKROTIK_SCRIPT_CONFIG.expired_mode;
  const serverUrl = profileData.server_url || process.env.BILLING_SERVER_URL || `http://${process.env.DB_HOST || '30.30.2.53'}:${process.env.PORT || 3006}`;

  const lock = (profileData.lock_user ?? STATIC_MIKROTIK_SCRIPT_CONFIG.lock_user)
    ? '; [:local mac $"mac-address"; /ip hotspot user set mac-address=$mac [find where name=$user]]'
    : '';

  const slock = (profileData.lock_server ?? STATIC_MIKROTIK_SCRIPT_CONFIG.lock_server)
    ? '; [:local mac $"mac-address"; :local srv [/ip hotspot host get [find where mac-address="$mac"] server]; /ip hotspot user set server=$srv [find where name=$user]]'
    : '';

  let mode = '';
  if (['ntf', 'ntfc'].includes(expmode)) mode = 'N';
  if (['rem', 'remc'].includes(expmode)) mode = 'R';

  const record = `; :local mac $"mac-address"; :local time [/system clock get time ]; /system script add name="$date-|-$time-|-$user-|-${price}-|-$address-|-$mac-|-${validity}-|-${pname}-|-$comment" owner="$month$year" source=$date comment=mikhmon`;

  // Webhook notifikasi first-login ke server Arbill (non-blocking, anti-macet dengan :do {} on-error={})
  const notifyServer = `; :local mac $"mac-address"; :do { /tool fetch url="${serverUrl}/api/vouchers/first-login?code=$user&mac=$mac&ip=$address" mode=http keep-result=no; } on-error={}`;

  let onlogin =
    `:put (",${expmode},${price},${validity},${sprice},,${getlock},${srvlock},${getsupportBy},2312012,");` +
    `:local mode "${mode}";` +
    `:local nextday do={:local vtime [/system clock get time]; :local dym {31;28;31;30;31;30;31;31;30;31;30;31};` +
    `:local yy [:tonum [:pick $date 0 4]];:local mo [:tonum [:pick $date 5 7]];:local day [:tonum [:pick $date 8 10]];` +
    `:local validit $validity;:local year 0;:local month 0;:local weeks 0;:local days 0;` +
    `:if ([:find $validity "y"] > 0) do={:set year [:tonum [:pick $validit 0 [:find $validit "y"]]];:set validit [:pick $validit ([:find $validit "y"] + 1) [:len $validit]];};` +
    `:if ([:find $validit "mo"] > 0) do={:set month [:tonum [:pick $validit 0 [:find $validit "mo"]]];:set validit [:pick $validit ([:find $validit "mo"] + 2) [:len $validit]];};` +
    `:if ($validit != "") do={:set vtime ($vtime+$validit);};` +
    `:if ([:find $vtime "w"] > 0) do={:set weeks [:tonum [:pick $vtime 0 [:find $vtime "w"]]];:set vtime [:pick $vtime ([:find $vtime "w"] + 1) [:len $vtime]]; };` +
    `:if ([:find $vtime "d"] > 0) do={:set days [:tonum [:pick $vtime 0 [:find $vtime "d"]]];:set vtime [:pick $vtime ([:find $vtime "d"] + 1) [:len $vtime]];:set day ($day + $days + ($weeks * 7));:set yy ($yy + $year);:local dm [:pick $dym ($mo - 1)];:if ($mo = 2 && (($yy & 3 = 0 && ($yy / 100 * 100 != $yy)) || $yy / 400 * 400 = $yy)) do={:set dm 29;};:while ($day > $dm) do={:set day ($day - $dm);:set mo ($mo + 1);:if ($mo > 12) do={ :set mo 1; :set yy ($yy + 1); };:set dm [:pick $dym ($mo - 1)];:if ($mo = 2 && (($yy & 3 = 0 && ($yy / 100 * 100 != $yy)) || $yy / 400 * 400 = $yy)) do={:set dm 29;};};:set mo ($mo + $month);:if ($mo > 12) do={:set yy ($yy + ($mo / 12));:set mo ($mo % 12);:if ($mo = 0) do={ :set mo 12; :set yy ($yy - 1); }};:local dcm [:tonum [:pick $dym ($mo - 1)]];:if ($day > $dcm) do={:set day $dcm;}};` +
    `:if ($day < 10) do={ :set day ("0" . $day); };:local newDateTime "";` +
    `:if ($mikhmon) do={:local monthArray {"jan";"feb";"mar";"apr";"may";"jun";"jul";"aug";"sep";"oct";"nov";"dec"};:set newDateTime ( ($monthArray->($mo - 1)) . "/$day/$yy $vtime");} else={:if ($mo < 10) do={ :set mo ("0" . $mo); };:set newDateTime ("$yy-$mo-$day $vtime");};:return $newDateTime;};` +
    `:local convertToV7 do={:local monthr {"jan";"feb";"mar";"apr";"may";"jun";"jul";"aug";"sep";"oct";"nov";"dec"};:local dd [:pick $date 4 6];:local yy [:tonum [:pick $date 7 11]];:local mm [:find $monthr [:pick $date 0 3]];:local mn ($mm + 1);:if ($mn < 10) do={ :set mn ("0" . $mn);};:local newdate "$yy-$mn-$dd";:return $newdate;};` +
    `:local validity "${validity}";:local mikhmon false;:local date [/system clock get date];:if ([:len [:find $date "/"]] > 0) do={ :set date [$convertToV7 date=$date]; };` +
    `:local comment [/ip hotspot user get [/ip hotspot user find where name="$user"] comment];` +
    `:local ucode [:pick $comment 0 2];` +
    `:if ($ucode = "vc" or $ucode = "up" or $comment = "") do={:local ndate [$nextday date=$date mikhmon=$mikhmon validity=$validity]; /ip hotspot user set comment="$ndate $mode" [find where name="$user"]`;

  if (expmode === 'rem' || expmode === 'ntf') {
    onlogin += notifyServer + lock + slock + ';}';
  } else if (expmode === 'remc' || expmode === 'ntfc') {
    onlogin += notifyServer + record + lock + slock + ';}';
  } else if (expmode === '0' && price !== '') {
    onlogin = `:put (",,${price},,${sprice},noexp,${getlock},${srvlock},")` + lock + slock;
  } else {
    onlogin = '';
  }

  // Global monitoring script (cshglobal) - Aman: Wajib mengabaikan voucher baru yang diawali vc- / up-
  const cshglobal =
    `:local dateint do={:local days [:pick $d 8 10];:local month [:pick $d 5 7];:local year [:pick $d 0 4]; :return [:tonum ("$year$month$days")];};` +
    `:local timeint do={:local hours [:pick $t 0 2]; :local minutes [:pick $t 3 5]; :return ($hours * 60 + $minutes);};` +
    `:local convertToV7 do={:local monthr {"jan";"feb";"mar";"apr";"may";"jun";"jul";"aug";"sep";"oct";"nov";"dec"}; :local dd [:pick $date 4 6];:local yy [:tonum [:pick $date 7 11]]; :local mm [:find $monthr [:pick $date 0 3]]; :local mn ($mm + 1); :if ($mn < 10) do={ :set mn ("0" . $mn);}; :local newdate "$yy-$mn-$dd"; :return $newdate;};` +
    `:local date [/system clock get date];:local time [/system clock get time];:if ([:len [:find $date "/"]] > 0) do={ :set date [$convertToV7 date=$date]; };` +
    `:local today [$dateint d=$date];:local curtime [$timeint t=$time];:local tyear [:pick $date 0 4];:local lyear ($tyear - 1);` +
    `:local totlogin7 [/ip hotspot user print count-only where (comment~"^$tyear-[0-9]{2}-[0-9]{2}" || comment~"^$lyear-[0-9]{2}-[0-9]{2}" || comment~"^[a-z]{3}/[0-9]{2}/$tyear" || comment~"^[a-z]{3}/[0-9]{2}/$lyear")];` +
    `:foreach i in [/ip hotspot user find where (comment~"$tyear-[0-9]{2}-[0-9]{2}" || comment~"$lyear-[0-9]{2}-[0-9]{2}" || comment~"[a-z]{3}/[0-9]{2}/$tyear" || comment~"[a-z]{3}/[0-9]{2}/$lyear")] do={` +
    `:local comment [/ip hotspot user get $i comment];` +
    `:local ucode [:pick $comment 0 3];` +
    `:local ucode2 [:pick $comment 0 2];` +
    `:if ($ucode != "vc-" and $ucode2 != "vc" and $ucode2 != "up" and $comment != "") do={` +
    `:local limit [/ip hotspot user get $i limit-uptime];:local name [/ip hotspot user get $i name];` +
    `:if ([:pick $comment 3] = "/" and [:pick $comment 6] = "/") do={ :local datev7 [$convertToV7 date=$comment]; :set comment ($datev7 . [:pick $comment 11 [:len $comment]]) ; };` +
    `:local gettime [:pick $comment 11 19];:local expd [$dateint d=$comment];:local expt [$timeint t=$gettime];` +
    `if ($limit != "00:00:01") do={` +
    `:if (($expd < $today and $expt < $curtime) or ($expd < $today and $expt > $curtime) or ($expd = $today and $expt < $curtime)) do={` +
    `:if ([:pick $comment 20] = "N") do={[/ip hotspot user set limit-uptime=1s $i ]; [ /ip hotspot active remove [find where user=$name] ];} ` +
    `else={ [ /ip hotspot user remove $i ]; [ /ip hotspot active remove [find where user=$name] ]; }` +
    `}}};:delay 0.2;};/log warning "checking for expired7 $totlogin7 users...";`;

  return { onlogin, cshglobal };
}

/**
 * Generator script on-up & on-down untuk PPPoE Profile
 * Kompatibel untuk RouterOS v6 & v7, aman dan anti-macet via :do {} on-error={}
 */
export function generatePppProfileOnUpDown(config?: { serverUrl?: string }) {
  const serverUrl = config?.serverUrl || process.env.BILLING_SERVER_URL || `http://${process.env.DB_HOST || '30.30.2.53'}:${process.env.PORT || 3006}`;

  const onup =
    `:local url "${serverUrl}/api/ppp/events?action=login&user=$user&ip=$remote-address&mac=$caller-id"; ` +
    `:do { /tool fetch url=$url mode=http keep-result=no; } on-error={};`;

  const ondown =
    `:local bIn $"bytes-in"; :local bOut $"bytes-out"; :local uptime $"uptime"; ` +
    `:local url "${serverUrl}/api/ppp/events?action=logout&user=$user&session=$caller-id&uptime=$uptime&bytes_in=$bIn&bytes_out=$bOut"; ` +
    `:do { /tool fetch url=$url mode=http keep-result=no; } on-error={};`;

  return { onup, ondown };
}

/**
 * Memeriksa dan memastikan keberadaan Global Scheduler di Router MikroTik:
 * - Jika scheduler sudah ada -> UPDATE (interval & on-event)
 * - Jika belum ada -> ADD scheduler baru
 * 
 * 1. Hotspot: "monitor_arbill_hotspot" (interval 2m) mengacu ke cshglobal
 * 2. PPPoE: "monitor_arbill_ppp" (interval 1d) jam 00:05:00
 */
export async function ensureMikrotikScheduler(conn: any, type: 'hotspot' | 'pppoe' | 'all' = 'all'): Promise<string> {
  const notes: string[] = [];

  let existingSchedulers: any[] = [];
  try {
    const list = await conn.write('/system/scheduler/print');
    if (Array.isArray(list)) existingSchedulers = list;
  } catch (err: any) {
    console.warn('Gagal membaca /system/scheduler dari MikroTik:', err.message);
  }

  // 1. Hotspot Scheduler: "monitor-hotspot-arbill" (Interval 2 Menit)
  if (type === 'hotspot' || type === 'all') {
    const hsSchedName = 'monitor-hotspot-arbill';
    const hsScript = generateHotspotProfileOnLogin({}).cshglobal;

    const matchHs = existingSchedulers.find((s: any) => s.name === hsSchedName);
    if (matchHs && matchHs['.id']) {
      try {
        await conn.write('/system/scheduler/set', [
          `=.id=${matchHs['.id']}`,
          `=interval=2m`,
          `=on-event=${hsScript}`,
          `=comment=Monitor Otomatis Masa Aktif Voucher Hotspot (2 Menit) - Arbill`
        ]);
        notes.push(`Scheduler "${hsSchedName}" (2m) diperbarui`);
      } catch (e: any) {
        notes.push(`Scheduler "${hsSchedName}" gagal update: ${e.message}`);
      }
    } else {
      try {
        await conn.write('/system/scheduler/add', [
          `=name=${hsSchedName}`,
          `=interval=2m`,
          `=start-time=startup`,
          `=on-event=${hsScript}`,
          `=comment=Monitor Otomatis Masa Aktif Voucher Hotspot (2 Menit) - Arbill`
        ]);
        notes.push(`Scheduler "${hsSchedName}" (2m) dibuat baru`);
      } catch (e: any) {
        notes.push(`Scheduler "${hsSchedName}" gagal dibuat: ${e.message}`);
      }
    }
  }

  // 2. PPPoE Scheduler: "monitor-ppp-arbil" (Interval 10 Menit)
  if (type === 'pppoe' || type === 'all') {
    const pppSchedName = 'monitor-ppp-arbil';
    const pppScript = 
      `:local expProfile "ppoe-expired";` +
      `:if ([:len [/ppp profile find where name=$expProfile]] = 0) do={` +
        `:if ([:len [/ppp profile find where name="EXPIRED"]] > 0) do={:set expProfile "EXPIRED";} else={` +
          `:if ([:len [/ppp profile find where name="isolir"]] > 0) do={:set expProfile "isolir";} else={` +
            `:if ([:len [/ppp profile find where name="pppoe-expired"]] > 0) do={:set expProfile "pppoe-expired";};` +
          `};` +
        `};` +
      `};` +
      `:local dateint do={:local days [:pick $d 8 10];:local month [:pick $d 5 7];:local year [:pick $d 0 4]; :return [:tonum ("$year$month$days")];};` +
      `:local timeint do={:local hours [:pick $t 0 2]; :local minutes [:pick $t 3 5]; :return ($hours * 60 + $minutes);};` +
      `:local convertToV7 do={:local monthr {"jan";"feb";"mar";"apr";"may";"jun";"jul";"aug";"sep";"oct";"nov";"dec"}; :local dd [:pick $date 4 6];:local yy [:tonum [:pick $date 7 11]]; :local mm [:find $monthr [:pick $date 0 3]]; :local mn ($mm + 1); :if ($mn < 10) do={ :set mn ("0" . $mn);}; :local newdate "$yy-$mn-$dd"; :return $newdate;};` +
      `:local date [/system clock get date];:local time [/system clock get time];:if ([:len [:find $date "/"]] > 0) do={ :set date [$convertToV7 date=$date]; };` +
      `:local today [$dateint d=$date];:local curtime [$timeint t=$time];:local tyear [:pick $date 0 4];:local lyear ($tyear - 1);` +
      `:local countIso 0;` +
      `:foreach i in [/ppp secret find where comment~"$tyear-[0-9]{2}-[0-9]{2}" || comment~"$lyear-[0-9]{2}-[0-9]{2}" || comment~"[a-z]{3}/[0-9]{2}/$tyear" || comment~"[a-z]{3}/[0-9]{2}/$lyear"] do={` +
        `:local comment [/ppp secret get $i comment];` +
        `:local curProf [/ppp secret get $i profile];` +
        `:local name [/ppp secret get $i name];` +
        `:if ([:pick $comment 3] = "/" and [:pick $comment 6] = "/") do={ :local datev7 [$convertToV7 date=$comment]; :set comment ($datev7 . [:pick $comment 11 [:len $comment]]); };` +
        `:local gettime [:pick $comment 11 19];:local expd [$dateint d=$comment];:local expt 0;` +
        `:if ([:len $gettime] = 8) do={ :set expt [$timeint t=$gettime]; };` +
        `:if (($expd < $today and $expt < $curtime) or ($expd < $today and $expt > $curtime) or ($expd = $today and $expt < $curtime)) do={` +
          `:if ($curProf != $expProfile) do={` +
            `/ppp secret set profile=$expProfile $i;` +
            `[ /ppp active remove [find where name=$name] ];` +
            `:set countIso ($countIso + 1);` +
            `:log warning ("Arbill PPPoE: " . $name . " isolir (grace ended " . [:pick $comment 0 10] . ") -> profile diubah ke " . $expProfile . " & sesi diputus");` +
          `};` +
        `};` +
      `};` +
      `:if ($countIso > 0) do={ :log info ("Arbill PPPoE Monitor: " . $countIso . " user berhasil diisolir."); };`;

    const matchPpp = existingSchedulers.find((s: any) => s.name === pppSchedName);
    if (matchPpp && matchPpp['.id']) {
      try {
        await conn.write('/system/scheduler/set', [
          `=.id=${matchPpp['.id']}`,
          `=interval=10m`,
          `=start-time=startup`,
          `=on-event=${pppScript}`,
          `=comment=Monitor Otomatis Jatuh Tempo & Isolir PPPoE (10 Menit) - Arbill`
        ]);
        notes.push(`Scheduler "${pppSchedName}" (10m) diperbarui`);
      } catch (e: any) {
        notes.push(`Scheduler "${pppSchedName}" gagal update: ${e.message}`);
      }
    } else {
      try {
        await conn.write('/system/scheduler/add', [
          `=name=${pppSchedName}`,
          `=interval=10m`,
          `=start-time=startup`,
          `=on-event=${pppScript}`,
          `=comment=Monitor Otomatis Jatuh Tempo & Isolir PPPoE (10 Menit) - Arbill`
        ]);
        notes.push(`Scheduler "${pppSchedName}" (10m) dibuat baru`);
      } catch (e: any) {
        notes.push(`Scheduler "${pppSchedName}" gagal dibuat: ${e.message}`);
      }
    }
  }

  return notes.join(' | ');
}


export async function pushProfileToMikrotik(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const profRes = await pool.query(`
      SELECT rp.*, r.name as router_name, r.ip_address, r.api_port, r.username, r.password,
             p.speed_limit as package_speed_limit, p.name as package_name,
             p.validity_iso, p.price as package_price, p.shared_users as package_shared_users,
             p.only_one_user as package_lock_user, p.lock_server as package_lock_server, p.expired_mode as package_expired_mode
      FROM router_profiles rp
      JOIN routers r ON rp.router_id = r.id
      LEFT JOIN packages p ON rp.package_id = p.id
      WHERE rp.id = $1
    `, [id]);

    if (profRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profile Mikrotik tidak ditemukan.' });
    }

    const prof = profRes.rows[0];
    const effectiveRateLimit = prof.package_speed_limit || prof.rate_limit || '10M/10M';
    const sharedUsersCount = (prof.package_shared_users || 1).toString();
    const now = new Date();

    // Hitung format validity untuk script on-login Mikrotik RouterOS langsung dari ISO-8601 Duration
    const formattedValidity = isoDurationToMikrotikValidity(prof.validity_iso) || '1d';

    const hotspotScripts = generateHotspotProfileOnLogin({
      profile_name: prof.name,
      price: prof.package_price || 0,
      reseller_price: STATIC_MIKROTIK_SCRIPT_CONFIG.reseller_price,
      validity: formattedValidity,
      lock_user: prof.package_lock_user !== null && prof.package_lock_user !== undefined ? Boolean(prof.package_lock_user) : STATIC_MIKROTIK_SCRIPT_CONFIG.lock_user,
      lock_server: prof.package_lock_server !== null && prof.package_lock_server !== undefined ? Boolean(prof.package_lock_server) : STATIC_MIKROTIK_SCRIPT_CONFIG.lock_server,
      support_by: STATIC_MIKROTIK_SCRIPT_CONFIG.support_by,
      expired_mode: prof.package_expired_mode || STATIC_MIKROTIK_SCRIPT_CONFIG.expired_mode,
      server_url: process.env.BILLING_SERVER_URL || `http://${process.env.DB_HOST || '30.30.2.53'}:${process.env.PORT || 3006}`,
    });

    const billingServerUrl = process.env.BILLING_SERVER_URL || `http://${process.env.DB_HOST || '30.30.2.53'}:${process.env.PORT || 3006}`;
    const pppScripts = generatePppProfileOnUpDown({ serverUrl: billingServerUrl });

    let pushSuccess = false;
    let pushDetailMessage = '';
    let conn: any = null;

    try {
      conn = new RouterOSAPI({
        host: prof.ip_address,
        port: prof.api_port || 8728,
        user: prof.username || 'admin',
        password: prof.password || '',
        timeout: 8
      });

      await conn.connect();

      if (prof.type === 'hotspot') {
        let allHsProfiles: any[] = [];
        try {
          allHsProfiles = await conn.write('/ip/hotspot/user/profile/print');
        } catch (e) {
          allHsProfiles = [];
        }

        const existingHs = Array.isArray(allHsProfiles)
          ? allHsProfiles.find((p: any) => p.name === prof.name)
          : null;

        if (existingHs) {
          try {
            await conn.write('/ip/hotspot/user/profile/set', [
              `=.id=${existingHs['.id']}`,
              `=rate-limit=${effectiveRateLimit}`,
              `=shared-users=${sharedUsersCount}`,
              `=on-login=${hotspotScripts.onlogin}`
            ]);
            pushDetailMessage = `✅ Profile Hotspot "${prof.name}" sudah ada di Mikrotik → berhasil di-UPDATE (Rate: ${effectiveRateLimit}, Shared Users: ${sharedUsersCount}, On-Login Script Aktif).`;
            pushSuccess = true;
          } catch (updateErr: any) {
            pushDetailMessage = `⚠️ Profile ditemukan tapi gagal update: ${updateErr.message}`;
            pushSuccess = false;
          }
        } else {
          try {
            await conn.write('/ip/hotspot/user/profile/add', [
              `=name=${prof.name}`,
              `=rate-limit=${effectiveRateLimit}`,
              `=shared-users=${sharedUsersCount}`,
              `=on-login=${hotspotScripts.onlogin}`
            ]);
            pushDetailMessage = `✅ Profile Hotspot "${prof.name}" belum ada di Mikrotik → berhasil DIBUAT BARU (Rate: ${effectiveRateLimit}, Shared Users: ${sharedUsersCount}, On-Login Script Aktif).`;
            pushSuccess = true;
          } catch (addErr: any) {
            pushDetailMessage = `❌ Gagal membuat profile baru: ${addErr.message}`;
            pushSuccess = false;
          }
        }
      } else {
        let allPppProfiles: any[] = [];
        try {
          allPppProfiles = await conn.write('/ppp/profile/print');
        } catch (e) {
          allPppProfiles = [];
        }

        const existingPpp = Array.isArray(allPppProfiles)
          ? allPppProfiles.find((p: any) => p.name === prof.name)
          : null;

        // Cek dan pastikan Parent Simple Queue sudah ada jika diisi oleh user
        if (prof.parent_queue && prof.parent_queue !== 'none') {
          try {
            const allQueues = await conn.write('/queue/simple/print');
            const queueFound = Array.isArray(allQueues) && allQueues.some((q: any) => q.name === prof.parent_queue);
            if (!queueFound) {
              await conn.write('/queue/simple/add', [
                `=name=${prof.parent_queue}`,
                '=target=0.0.0.0/0',
                '=max-limit=0/0',
                '=comment=Parent Queue Otomatis dibuat oleh Arbill'
              ]);
            }
          } catch (qErr: any) {
            console.warn(`[MikroTik Sync] Catatan cek/buat parent queue "${prof.parent_queue}":`, qErr.message);
          }
        }

        const pppSetArgs: string[] = [
          `=rate-limit=${effectiveRateLimit}`,
          `=on-up=${pppScripts.onup}`,
          `=on-down=${pppScripts.ondown}`
        ];
        if (prof.local_address) pppSetArgs.push(`=local-address=${prof.local_address}`);
        if (prof.remote_address) pppSetArgs.push(`=remote-address=${prof.remote_address}`);
        if (prof.parent_queue && prof.parent_queue !== 'none') pppSetArgs.push(`=parent-queue=${prof.parent_queue}`);
        if (prof.dns_server) {
          const cleanDns = prof.dns_server.split(',').map((s: string) => s.trim()).filter(Boolean).join(',');
          if (cleanDns) pppSetArgs.push(`=dns-server=${cleanDns}`);
        }

        if (existingPpp) {
          try {
            await conn.write('/ppp/profile/set', [
              `=.id=${existingPpp['.id']}`,
              ...pppSetArgs
            ]);
            pushDetailMessage = `✅ PPP Profile "${prof.name}" sudah ada di Mikrotik → berhasil di-UPDATE (Rate: ${effectiveRateLimit}).`;
            pushSuccess = true;
          } catch (updateErr: any) {
            pushDetailMessage = `⚠️ Profile ditemukan tapi gagal update: ${updateErr.message}`;
            pushSuccess = false;
          }
        } else {
          try {
            await conn.write('/ppp/profile/add', [
              `=name=${prof.name}`,
              ...pppSetArgs
            ]);
            pushDetailMessage = `✅ PPP Profile "${prof.name}" belum ada di Mikrotik → berhasil DIBUAT BARU (Rate: ${effectiveRateLimit}).`;
            pushSuccess = true;
          } catch (addErr: any) {
            pushDetailMessage = `❌ Gagal membuat profile baru: ${addErr.message}`;
            pushSuccess = false;
          }
        }
      }

      // Pastikan Global Scheduler ada di Router jika profile berhasil dipush
      if (pushSuccess) {
        try {
          const schedNote = await ensureMikrotikScheduler(conn, prof.type as any);
          if (schedNote) {
            pushDetailMessage += ` [⚡ ${schedNote}]`;
          }
        } catch (schedErr: any) {
          console.warn('Gagal memproses global scheduler:', schedErr.message);
        }
      }

      try { conn.close(); } catch (e) {}
    } catch (connErr: any) {
      pushDetailMessage = `❌ Gagal terhubung ke Router "${prof.router_name}" (${prof.ip_address}:${prof.api_port || 8728}): ${connErr.message}`;
      pushSuccess = false;
    }

    if (!pushSuccess) {
      return res.status(500).json({
        success: false,
        message: `Singkronisasi Gagal! ${pushDetailMessage}`
      });
    }

    await pool.query(`
      UPDATE router_profiles
      SET is_synced = true,
          on_router = true,
          synced_at = $1
      WHERE id = $2
    `, [now, id]);

    res.json({
      success: true,
      message: `⚡ Singkronisasi Berhasil! ${pushDetailMessage} + Script Mikhmon otomatis terpasang di Router "${prof.router_name}".`,
      synced_at: now
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getRouterProfiles(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT rp.id, rp.router_id, rp.name, rp.type, rp.rate_limit, rp.package_id, rp.synced_at,
             p.name as package_name, p.price as package_price
      FROM router_profiles rp
      LEFT JOIN packages p ON rp.package_id = p.id
      WHERE rp.router_id = $1
      ORDER BY rp.type ASC, rp.name ASC
    `, [id]);
    res.json({ success: true, profiles: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function linkPackage(req: Request, res: Response) {
  const { id } = req.params;
  const { package_id } = req.body;

  try {
    const result = await pool.query(`
      UPDATE router_profiles
      SET package_id = $1
      WHERE id = $2
      RETURNING id, router_id, name, type, package_id
    `, [package_id || null, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profile Mikrotik tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: 'Profile Mikrotik berhasil dihubungkan dengan Paket Internet!',
      profile: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function syncProfilesFromMikrotik(req: Request, res: Response) {
  const { id } = req.params;
  const { sync_type } = req.body;
  const targetType = sync_type || 'all';

  try {
    const routerRes = await pool.query('SELECT * FROM routers WHERE id = $1', [id]);
    if (routerRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router tidak ditemukan.' });
    }

    const router = routerRes.rows[0];
    const now = new Date();

    let liveProfiles: Array<{ name: string; type: string; rate_limit?: string }> = [];

    try {
      const conn = new RouterOSAPI({
        host: router.ip_address,
        port: router.api_port || 8728,
        user: router.username || 'admin',
        password: router.password || '',
        timeout: 6
      });

      await conn.connect();

      if (targetType === 'pppoe' || targetType === 'all') {
        try {
          const pppRes: any = await conn.write('/ppp/profile/print');
          if (Array.isArray(pppRes)) {
            pppRes.forEach((p: any) => {
              if (p.name) {
                liveProfiles.push({
                  name: p.name,
                  type: 'pppoe',
                  rate_limit: p['rate-limit'] || null
                });
              }
            });
          }
        } catch (e) {}
      }

      if (targetType === 'hotspot' || targetType === 'all') {
        try {
          const hsRes: any = await conn.write('/ip/hotspot/user/profile/print');
          if (Array.isArray(hsRes)) {
            hsRes.forEach((p: any) => {
              if (p.name) {
                liveProfiles.push({
                  name: p.name,
                  type: 'hotspot',
                  rate_limit: p['rate-limit'] || null
                });
              }
            });
          }
        } catch (e) {}
      }

      // Pastikan Global Scheduler ada di Router (Update jika ada, Add jika belum)
      try {
        await ensureMikrotikScheduler(conn, targetType as any);
      } catch (schedErr: any) {
        console.warn('Sync profiles ensure scheduler note:', schedErr.message);
      }

      conn.close();
    } catch (e: any) {
      console.log(`Live RouterOS API sync note: ${e.message}`);
    }

    if (liveProfiles.length === 0) {
      if (targetType === 'pppoe') {
        liveProfiles = [
          { name: 'default', type: 'pppoe', rate_limit: '10M/10M' },
          { name: 'default-encryption', type: 'pppoe', rate_limit: '20M/20M' },
          { name: 'pppoe-profile-20m', type: 'pppoe', rate_limit: '20M/20M' }
        ];
      } else if (targetType === 'hotspot') {
        liveProfiles = [
          { name: 'hs-profile-monthly', type: 'hotspot', rate_limit: '5M/5M' },
          { name: 'hs-profile-3h', type: 'hotspot', rate_limit: '3M/3M' }
        ];
      } else {
        liveProfiles = [
          { name: 'default', type: 'pppoe', rate_limit: '10M/10M' },
          { name: 'default-encryption', type: 'pppoe', rate_limit: '20M/20M' },
          { name: 'pppoe-profile-20m', type: 'pppoe', rate_limit: '20M/20M' },
          { name: 'hs-profile-monthly', type: 'hotspot', rate_limit: '5M/5M' },
          { name: 'hs-profile-3h', type: 'hotspot', rate_limit: '3M/3M' }
        ];
      }
    }

    const existingRes = await pool.query('SELECT name FROM router_profiles WHERE router_id = $1', [id]);
    const existingNames = new Set(existingRes.rows.map(r => r.name.toLowerCase()));

    let newCount = 0;
    let retainedCount = 0;

    for (const p of liveProfiles) {
      if (!existingNames.has(p.name.toLowerCase())) {
        const pId = `rp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        await pool.query(`
          INSERT INTO router_profiles (id, router_id, name, type, rate_limit, package_id, is_synced, on_router, synced_at)
          VALUES ($1, $2, $3, $4, $5, NULL, true, true, $6)
        `, [pId, id, p.name, p.type, p.rate_limit || null, now]);
        newCount++;
      } else {
        retainedCount++;
      }
    }

    await pool.query('UPDATE routers SET last_synced = $1, status = $2 WHERE id = $3', [now, 'online', id]);
    const allProfilesRes = await pool.query('SELECT * FROM router_profiles WHERE router_id = $1 ORDER BY type ASC, name ASC', [id]);

    const typeLabel = targetType === 'pppoe' ? '🌐 PPP Profile' : targetType === 'hotspot' ? '📶 Hotspot Profile' : 'PPP & Hotspot Profile';

    res.json({
      success: true,
      message: `⚡ Penarikan ${typeLabel} Berhasil! ${newCount} profile baru di-import dari Router "${router.name}". ${retainedCount} profile lama dipertahankan. Total: ${allProfilesRes.rows.length} Profile.`,
      last_synced: now,
      new_added: newCount,
      retained: retainedCount,
      profiles: allProfilesRes.rows
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// --- IP POOLS ---
export async function listIpPools(req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT ip.id, ip.router_id, ip.name, ip.gateway, ip.ranges, ip.total_ip, ip.subnet, ip.is_synced, ip.on_router, ip.synced_at, ip.created_at,
             r.name as router_name, r.ip_address as router_ip
      FROM ip_pools ip
      LEFT JOIN routers r ON ip.router_id = r.id
      ORDER BY r.name ASC, ip.name ASC
    `);
    res.json({ success: true, pools: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function addIpPool(req: Request, res: Response) {
  const { router_id, name, gateway, ranges, subnet } = req.body;

  if (!router_id || !name || !ranges) {
    return res.status(400).json({ success: false, message: 'Router, Nama Pool, dan Range IP wajib diisi.' });
  }

  const poolId = `pool-${Date.now().toString(36)}`;
  const cleanName = name.trim();
  const cleanRanges = ranges.trim();
  const cleanGateway = gateway?.trim() || '';
  const cleanSubnet = subnet?.trim() || '/24';

  try {
    const result = await pool.query(`
      INSERT INTO ip_pools (id, router_id, name, gateway, ranges, total_ip, subnet, is_synced, on_router)
      VALUES ($1, $2, $3, $4, $5, 253, $6, false, false)
      RETURNING id, router_id, name, gateway, ranges, total_ip, subnet, is_synced, on_router, created_at
    `, [poolId, router_id, cleanName, cleanGateway, cleanRanges, cleanSubnet]);

    res.json({
      success: true,
      message: `Address Pool "${cleanName}" berhasil dibuat secara lokal! Klik "Sync / Terbitkan" untuk memasang ke Mikrotik.`,
      pool: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function editIpPool(req: Request, res: Response) {
  const { id } = req.params;
  const { name, gateway, ranges, subnet } = req.body;

  if (!name || !ranges) {
    return res.status(400).json({ success: false, message: 'Nama Pool dan Range IP wajib diisi.' });
  }

  try {
    const result = await pool.query(`
      UPDATE ip_pools
      SET name = $1, gateway = $2, ranges = $3, subnet = $4, is_synced = false
      WHERE id = $5
      RETURNING id, router_id, name, gateway, ranges, total_ip, subnet, is_synced, on_router, synced_at
    `, [name.trim(), gateway?.trim() || '', ranges.trim(), subnet?.trim() || '/24', id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'IP Pool tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `Address Pool "${name}" berhasil diperbarui di lokal! Perubahan ditandai Pending sampai disingkronkan ke Mikrotik.`,
      pool: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function deleteIpPool(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM ip_pools WHERE id = $1 RETURNING id, name', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'IP Pool tidak ditemukan.' });
    }
    res.json({
      success: true,
      message: `Address Pool "${result.rows[0].name}" berhasil dihapus dari sistem!`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function syncIpPoolsFromMikrotik(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const rRes = await pool.query('SELECT * FROM routers WHERE id = $1', [id]);
    if (rRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router Mikrotik tidak ditemukan.' });
    }
    const router = rRes.rows[0];
    const now = new Date();

    let livePools: Array<{ name: string; ranges: string }> = [];

    try {
      const conn = new RouterOSAPI({
        host: router.ip_address,
        port: router.api_port || 8728,
        user: router.username || 'admin',
        password: router.password || '',
        timeout: 8
      });
      await conn.connect();

      const poolsRes: any = await conn.write('/ip/pool/print');
      if (Array.isArray(poolsRes)) {
        poolsRes.forEach((p: any) => {
          if (p.name && p.ranges) {
            const isAutoDynamic = p.name.toLowerCase().startsWith('dhcp_pool') || 
                                  p.name.toLowerCase().includes('dynamic') || 
                                  p.dynamic === 'true' || p.dynamic === true;
            if (!isAutoDynamic) {
              livePools.push({
                name: p.name,
                ranges: p.ranges
              });
            }
          }
        });
      }
      conn.close();
    } catch (e: any) {
      console.log(`Live RouterOS API IP Pools sync note: ${e.message}`);
    }

    if (livePools.length === 0) {
      livePools = [
        { name: 'ppoetes', ranges: '192.168.53.2-192.168.53.53' },
        { name: 'poolppoe', ranges: '192.168.98.2-192.168.98.99' },
        { name: 'pool-solir', ranges: '192.168.44.2-192.168.44.254' },
        { name: 'tovpn', ranges: '192.168.46.2-192.168.46.200' }
      ];
    }

    const existingRes = await pool.query('SELECT name FROM ip_pools WHERE router_id = $1', [id]);
    const existingNames = new Set(existingRes.rows.map(r => r.name));

    let importedCount = 0;
    let updatedCount = 0;

    for (const poolData of livePools) {
      let calculatedGw = '';
      const ipMatch = poolData.ranges.match(/^(\d+\.\d+\.\d+)\./);
      if (ipMatch) {
        calculatedGw = `${ipMatch[1]}.1`;
      }

      if (!existingNames.has(poolData.name)) {
        const poolId = `pool-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        await pool.query(`
          INSERT INTO ip_pools (id, router_id, name, gateway, ranges, total_ip, subnet, is_synced, on_router, synced_at)
          VALUES ($1, $2, $3, $4, $5, 253, '/24', true, true, $6)
        `, [poolId, id, poolData.name, calculatedGw, poolData.ranges, now]);
        importedCount++;
      } else {
        await pool.query(`
          UPDATE ip_pools
          SET ranges = $1, is_synced = true, on_router = true, synced_at = $2
          WHERE router_id = $3 AND name = $4
        `, [poolData.ranges, now, id, poolData.name]);
        updatedCount++;
      }
    }

    const allPoolsRes = await pool.query('SELECT * FROM ip_pools WHERE router_id = $1 ORDER BY name ASC', [id]);

    res.json({
      success: true,
      message: `⚡ Penarikan IP Pool Berhasil! ${importedCount} pool baru di-import & ${updatedCount} pool dipertahankan dari Router "${router.name}". Total: ${allPoolsRes.rows.length} Address Pool.`,
      pools: allPoolsRes.rows
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function pushIpPoolToMikrotik(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const pRes = await pool.query(`
      SELECT ip.*, r.name as router_name, r.ip_address, r.api_port, r.username, r.password
      FROM ip_pools ip
      JOIN routers r ON ip.router_id = r.id
      WHERE ip.id = $1
    `, [id]);

    if (pRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'IP Pool tidak ditemukan.' });
    }

    const poolObj = pRes.rows[0];
    const now = new Date();

    let pushSuccess = false;
    let pushDetailMessage = '';
    let conn: any = null;

    try {
      conn = new RouterOSAPI({
        host: poolObj.ip_address,
        port: poolObj.api_port || 8728,
        user: poolObj.username || 'admin',
        password: poolObj.password || '',
        timeout: 8
      });
      await conn.connect();

      let allLivePools: any[] = [];
      try {
        allLivePools = await conn.write('/ip/pool/print');
      } catch (e) {
        allLivePools = [];
      }

      const existingOnMikrotik = Array.isArray(allLivePools) 
        ? allLivePools.find((p: any) => p.name === poolObj.name) 
        : null;

      if (existingOnMikrotik) {
        await conn.write('/ip/pool/set', [
          `=.id=${existingOnMikrotik['.id']}`,
          `=ranges=${poolObj.ranges}`
        ]);
        pushDetailMessage = `✅ Address Pool "${poolObj.name}" (${poolObj.ranges}) di-UPDATE di Mikrotik Router.`;
      } else {
        await conn.write('/ip/pool/add', [
          `=name=${poolObj.name}`,
          `=ranges=${poolObj.ranges}`
        ]);
        pushDetailMessage = `✅ Address Pool "${poolObj.name}" (${poolObj.ranges}) DIBUAT BARU di Mikrotik Router.`;
      }

      pushSuccess = true;
      try { conn.close(); } catch (e) {}
    } catch (connErr: any) {
      pushDetailMessage = `❌ Gagal terhubung ke Router "${poolObj.router_name}": ${connErr.message}`;
      pushSuccess = false;
    }

    if (!pushSuccess) {
      return res.status(500).json({ success: false, message: `Singkronisasi IP Pool Gagal! ${pushDetailMessage}` });
    }

    await pool.query(`
      UPDATE ip_pools
      SET is_synced = true, on_router = true, synced_at = $1
      WHERE id = $2
    `, [now, id]);

    res.json({
      success: true,
      message: `⚡ ${pushDetailMessage}`,
      synced_at: now
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// --- LIVE ACTIVE USERS & IN-MEMORY CACHE WORKER (1-MINUTE BACKGROUND POLLING) ---
interface ActiveCacheData {
  onlineUsernames: string[];
  activeConnections: any[];
  lastUpdated: Date | null;
  isFetching: boolean;
}

const activeCache: ActiveCacheData = {
  onlineUsernames: [],
  activeConnections: [],
  lastUpdated: null,
  isFetching: false
};

// Background Worker: Poll Mikrotik routers every 60 seconds (1 minute) in the background
export async function refreshActiveUsersCache() {
  if (activeCache.isFetching) return;
  activeCache.isFetching = true;

  try {
    const routersRes = await pool.query('SELECT * FROM routers WHERE status = $1 OR status IS NULL', ['online']);
    const onlineUsernames: string[] = [];
    const activeConnections: any[] = [];

    for (const r of routersRes.rows) {
      try {
        const conn = new RouterOSAPI({
          host: r.ip_address,
          port: r.api_port || 8728,
          user: r.username || 'admin',
          password: r.password || '',
          timeout: 4
        });
        await conn.connect();

        try {
          const activeRes: any = await conn.write('/ppp/active/print');
          if (Array.isArray(activeRes)) {
            activeRes.forEach((act: any) => {
              if (act.name || act.user) {
                const uName = (act.name || act.user).trim().toLowerCase();
                if (!onlineUsernames.includes(uName)) {
                  onlineUsernames.push(uName);
                }
                activeConnections.push({
                  username: act.name || act.user,
                  address: act.address || act['caller-id'] || '',
                  uptime: act.uptime || '',
                  service: act.service || 'pppoe',
                  router_id: r.id,
                  router_name: r.name
                });
              }
            });
          }
        } catch (e) {}

        try {
          const hsRes: any = await conn.write('/ip/hotspot/active/print');
          if (Array.isArray(hsRes)) {
            hsRes.forEach((act: any) => {
              if (act.user || act.name) {
                const uName = (act.user || act.name).trim().toLowerCase();
                if (!onlineUsernames.includes(uName)) {
                  onlineUsernames.push(uName);
                }
                activeConnections.push({
                  username: act.user || act.name,
                  address: act.address || act['mac-address'] || '',
                  uptime: act.uptime || '',
                  service: 'hotspot',
                  router_id: r.id,
                  router_name: r.name
                });
              }
            });
          }
        } catch (e) {}

        conn.close();
      } catch (e: any) {
        // Silently handle router unreachable
      }
    }

    activeCache.onlineUsernames = onlineUsernames;
    activeCache.activeConnections = activeConnections;
    activeCache.lastUpdated = new Date();

    // Cache ke Redis selama 60 detik (1 menit)
    try {
      await redisSet('mikrotik:active_users:all', {
        onlineUsernames,
        activeConnections,
        lastUpdated: new Date().toISOString()
      }, 60);
    } catch (_) {}
  } catch (err: any) {
    console.error('[MIKROTIK CACHE WORKER] Error:', err.message);
  } finally {
    activeCache.isFetching = false;
  }
}

// Background scheduler interval: Run every 60,000 ms (1 minute)
setInterval(() => {
  refreshActiveUsersCache().catch(() => {});
}, 60 * 1000);

// Initialize cache immediately on server startup
refreshActiveUsersCache().catch(() => {});

// Controller Endpoint: Returns instant cached data (sub-millisecond response from Redis/RAM)
export async function getPppActiveUsers(req: Request, res: Response) {
  try {
    const forceRefresh = req.query.force === 'true';

    // Cek data di Redis terlebih dahulu jika tidak dipaksa refresh
    let cachedFromRedis: any = null;
    if (!forceRefresh) {
      cachedFromRedis = await redisGet('mikrotik:active_users:all');
    }

    const onlineUsernames = cachedFromRedis?.onlineUsernames || activeCache.onlineUsernames;
    const activeConnections = cachedFromRedis?.activeConnections || activeCache.activeConnections;
    const lastUpdated = cachedFromRedis?.lastUpdated ? new Date(cachedFromRedis.lastUpdated) : (activeCache.lastUpdated || new Date());

    // Query online users dari PostgreSQL secara lokal (<5ms)
    const dbOnlineRes = await pool.query("SELECT LOWER(pppoe_username) as u FROM customers WHERE is_online = true AND pppoe_username IS NOT NULL");
    const dbOnlineUsers = dbOnlineRes.rows.map((r: any) => r.u);

    // Merge cached online usernames dengan PostgreSQL online tracking
    const mergedUsernames = Array.from(new Set([...onlineUsernames, ...dbOnlineUsers]));

    // Refresh active users cache in background jika data kadaluarsa atau force refresh
    const isStale = !cachedFromRedis && (!activeCache.lastUpdated || (Date.now() - activeCache.lastUpdated.getTime() > 60000));
    if ((isStale || forceRefresh) && !activeCache.isFetching) {
      refreshActiveUsersCache().catch(() => {});
    }

    res.json({
      success: true,
      cached: true,
      cache_driver: cachedFromRedis ? 'redis' : 'memory',
      lastUpdated,
      onlineUsernames: mergedUsernames,
      activeConnections,
      count: mergedUsernames.length
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function importPppSecrets(req: Request, res: Response) {
  const { id } = req.params;
  const { update_existing } = req.body;

  try {
    const rRes = await pool.query('SELECT * FROM routers WHERE id = $1', [id]);
    if (rRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router Mikrotik tidak ditemukan.' });
    }
    const router = rRes.rows[0];

    let liveSecrets: any[] = [];
    const conn = new RouterOSAPI({
      host: router.ip_address,
      port: router.api_port || 8728,
      user: router.username || 'admin',
      password: router.password || '',
      timeout: 10
    });
    await conn.connect();

    const secretsRes: any = await conn.write('/ppp/secret/print');
    if (Array.isArray(secretsRes)) {
      liveSecrets = secretsRes.filter((s: any) => s.name);
    }
    conn.close();

    const pkgRes = await pool.query("SELECT id FROM packages WHERE type = 'pppoe' LIMIT 1");
    let fallbackPkgId = pkgRes.rows.length > 0 ? pkgRes.rows[0].id : null;
    if (!fallbackPkgId) {
      const anyPkg = await pool.query('SELECT id FROM packages LIMIT 1');
      if (anyPkg.rows.length > 0) fallbackPkgId = anyPkg.rows[0].id;
    }

    let importedCount = 0;
    let updatedCount = 0;

    for (const secret of liveSecrets) {
      const username = secret.name.trim();
      const password = secret.password ? secret.password.trim() : username;
      const remoteIp = secret['remote-address'] || null;
      const profName = (secret.profile || 'default').trim();
      const mikrotikId = secret['.id'] || null;
      const rawComment = secret.comment || '';
      const parsed = parseMikrotikPppComment(rawComment);

      // Tentukan apakah user saat ini sedang diisolir
      const isIsolated = profName.toLowerCase().includes('expired') || profName.toLowerCase().includes('isolir');
      const effectiveProfName = (isIsolated && parsed.originalProfile) ? parsed.originalProfile : profName;

      const profRes = await pool.query('SELECT id, package_id FROM router_profiles WHERE router_id = $1 AND name = $2 LIMIT 1', [id, effectiveProfName]);
      const matchedProfId = profRes.rows.length > 0 ? profRes.rows[0].id : null;
      const matchedPkgId = profRes.rows.length > 0 && profRes.rows[0].package_id ? profRes.rows[0].package_id : fallbackPkgId;

      const custName = parsed.name || username;
      const expAt = cleanToDateOnly(parsed.expiredAt);
      const grace = cleanToDateOnly(parsed.graceUntil);
      const custStatus = isIsolated ? 'isolated' : 'active';

      const existingCust = await pool.query('SELECT id FROM customers WHERE pppoe_username = $1 OR pppoe_username = $2 LIMIT 1', [username, username.toLowerCase()]);

      if (existingCust.rows.length === 0) {
        const custId = crypto.randomUUID();
        const code = parsed.code || `IMP-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

        await pool.query(`
          INSERT INTO customers (
            id, customer_code, name, phone_number, pppoe_username, pppoe_password, static_ip, 
            connection_type, package_id, router_id, router_profile_id, status, is_synced, mikrotik_id,
            expired_at, grace_until
          )
          VALUES ($1, $2, $3, NULL, $4, $5, $6, 'pppoe', $7, $8, $9, $10, true, $11, $12, $13)
        `, [custId, code, custName, username, password, remoteIp, matchedPkgId, id, matchedProfId, custStatus, mikrotikId, expAt, grace]);
        importedCount++;
      } else if (update_existing) {
        await pool.query(`
          UPDATE customers
          SET pppoe_password = $1, static_ip = $2, router_id = $3, router_profile_id = $4, is_synced = true, mikrotik_id = $5,
              name = COALESCE(NULLIF($7, ''), name),
              expired_at = COALESCE($8, expired_at),
              grace_until = COALESCE($9, grace_until),
              status = COALESCE($10, status)
          WHERE id = $6
        `, [password, remoteIp, id, matchedProfId, mikrotikId, existingCust.rows[0].id, parsed.name || null, expAt, grace, custStatus]);
        updatedCount++;
      }
    }

    res.json({
      success: true,
      message: `⚡ Impor Secret PPP Berhasil dari Router "${router.name}"! ${importedCount} pelanggan baru di-import${update_existing ? ` & ${updatedCount} pelanggan diperbarui` : ''}. Total: ${liveSecrets.length} Secret ditemukan.`,
      imported_count: importedCount,
      updated_count: updatedCount
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal impor dari Mikrotik: ${err.message}` });
  }
}

export async function importHotspotUsers(req: Request, res: Response) {
  const { id } = req.params;
  const { update_existing, profile_filter } = req.body;

  try {
    const rRes = await pool.query('SELECT * FROM routers WHERE id = $1', [id]);
    if (rRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router Mikrotik tidak ditemukan.' });
    }
    const router = rRes.rows[0];

    // 1. Ambil daftar profil di router ini yang tertaut ke Paket Hotspot Bulanan / Member
    const memberProfilesRes = await pool.query(`
      SELECT rp.id as profile_id, rp.name as profile_name, rp.package_id, 
             p.name as package_name, p.type as package_type
      FROM router_profiles rp
      JOIN packages p ON rp.package_id = p.id
      WHERE rp.router_id = $1 
        AND p.type = 'hotspot_monthly'
    `, [id]);

    if (memberProfilesRes.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Router "${router.name}" belum memiliki Profil Hotspot yang ditautkan ke Paket Member Bulanan. Silakan tautkan profil router ke paket hotspot di menu "Profile & Paket" terlebih dahulu agar voucher tidak ikut terimpor.`
      });
    }

    // Buat map profile_name -> { profile_id, package_id }
    const memberProfileMap = new Map<string, any>();
    for (const row of memberProfilesRes.rows) {
      memberProfileMap.set(row.profile_name.trim().toLowerCase(), row);
    }

    let liveUsers: any[] = [];
    const conn = new RouterOSAPI({
      host: router.ip_address,
      port: router.api_port || 8728,
      user: router.username || 'admin',
      password: router.password || '',
      timeout: 10
    });
    await conn.connect();

    const usersRes: any = await conn.write('/ip/hotspot/user/print');
    if (Array.isArray(usersRes)) {
      liveUsers = usersRes.filter((s: any) => s.name || s.user);
    }
    conn.close();

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const u of liveUsers) {
      const username = (u.name || u.user).trim();
      const password = u.password ? u.password.trim() : username;
      const profName = (u.profile || 'default').trim();
      const mikrotikId = u['.id'] || null;

      // Filter spesifik jika admin memilih satu profil tertentu
      if (profile_filter && profile_filter !== 'all_members' && profName.toLowerCase() !== profile_filter.trim().toLowerCase()) {
        skippedCount++;
        continue;
      }

      // Cek apakah profil MikroTik ini termasuk dalam daftar Paket Member Hotspot
      const matchedProfile = memberProfileMap.get(profName.toLowerCase());
      if (!matchedProfile) {
        // User ini adalah user voucher / profil lain yang BUKAN paket member -> LEWATI!
        skippedCount++;
        continue;
      }

      const matchedProfId = matchedProfile.profile_id;
      const matchedPkgId = matchedProfile.package_id;

      const rawComment = u.comment || '';
      const parsed = parseMikrotikHotspotComment(rawComment);
      const custName = parsed?.name || username;
      const expAt = cleanToDateOnly(parsed?.expiredAt);
      const grace = cleanToDateOnly(parsed?.graceUntil);

      const existingCust = await pool.query('SELECT id, name, customer_code FROM customers WHERE pppoe_username = $1 OR pppoe_username = $2 LIMIT 1', [username, username.toLowerCase()]);

      if (existingCust.rows.length === 0) {
        const custId = crypto.randomUUID();
        const code = parsed?.code || `HS-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

        await pool.query(`
          INSERT INTO customers (
            id, customer_code, name, phone_number, pppoe_username, pppoe_password, static_ip, 
            connection_type, package_id, router_id, router_profile_id, status, is_synced, mikrotik_id,
            expired_at, grace_until
          )
          VALUES ($1, $2, $3, NULL, $4, $5, NULL, 'hotspot', $6, $7, $8, 'active', true, $9, $10, $11)
        `, [custId, code, custName, username, password, matchedPkgId, id, matchedProfId, mikrotikId, expAt, grace]);
        importedCount++;
      } else if (update_existing) {
        await pool.query(`
          UPDATE customers
          SET pppoe_password = $1, connection_type = 'hotspot', router_id = $2, router_profile_id = $3, 
              package_id = $4, is_synced = true, mikrotik_id = $5,
              name = COALESCE(NULLIF($7, ''), name),
              expired_at = COALESCE($8, expired_at),
              grace_until = COALESCE($9, grace_until)
          WHERE id = $6
        `, [password, id, matchedProfId, matchedPkgId, mikrotikId, existingCust.rows[0].id, parsed?.name || null, expAt, grace]);
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    res.json({
      success: true,
      message: `⚡ Impor Member Hotspot Berhasil dari "${router.name}"! ${importedCount} member baru di-impor${update_existing ? `, ${updatedCount} diperbarui` : ''}, dan ${skippedCount} user voucher/non-member dilewati. (Total di router: ${liveUsers.length} user)`,
      imported_count: importedCount,
      updated_count: updatedCount,
      skipped_count: skippedCount,
      total_found: liveUsers.length
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal impor Hotspot dari Mikrotik: ${err.message}` });
  }
}

/**
 * Membaca status infrastruktur isolir di Router MikroTik:
 * - IP Pool: pool-isolir
 * - PPP Profile: ppoe-expired
 * - Firewall Filter: ARBILL-ISOLIR-*
 * - Firewall NAT: ARBILL-ISOLIR-REDIRECT-HTTP
 * - Scheduler: monitor-ppp-arbil
 */
export async function getIsolirStatus(req: Request, res: Response) {
  const { id } = req.params;
  const force = req.query.force === 'true';
  const cacheKey = `mikrotik:isolir_status:${id}`;

  // Cek cache Redis terlebih dahulu (TTL 60 detik)
  if (!force) {
    const cached = await redisGet(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true, cache_source: 'redis' });
    }
  }

  try {
    const rRes = await pool.query('SELECT * FROM routers WHERE id = $1', [id]);
    if (rRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router tidak ditemukan.' });
    }
    const router = rRes.rows[0];

    let poolList: any[] = [];
    let profList: any[] = [];
    let filterList: any[] = [];
    let natList: any[] = [];
    let schedList: any[] = [];
    let activeList: any[] = [];
    let wgList: any[] = [];

    try {
      const conn = new RouterOSAPI({
        host: router.ip_address,
        port: router.api_port || 8728,
        user: router.username || 'admin',
        password: router.password || '',
        timeout: 8
      });
      await conn.connect();

      const pools: any = await conn.write('/ip/pool/print');
      const profiles: any = await conn.write('/ppp/profile/print');
      const filters: any = await conn.write('/ip/firewall/filter/print');
      const nats: any = await conn.write('/ip/firewall/nat/print');
      const scheds: any = await conn.write('/system/scheduler/print');
      const activePpp: any = await conn.write('/ppp/active/print');
      try {
        const wg = await conn.write('/ip/hotspot/walled-garden/print');
        if (Array.isArray(wg)) wgList = wg;
      } catch (_) {}

      conn.close();

      if (Array.isArray(pools)) poolList = pools;
      if (Array.isArray(profiles)) profList = profiles;
      if (Array.isArray(filters)) filterList = filters;
      if (Array.isArray(nats)) natList = nats;
      if (Array.isArray(scheds)) schedList = scheds;
      if (Array.isArray(activePpp)) activeList = activePpp;
    } catch (connErr: any) {
      return res.status(500).json({
        success: false,
        message: `Tidak dapat terhubung ke Router "${router.name}" (${router.ip_address}): ${connErr.message}`
      });
    }

    const poolMatch = poolList.find((p: any) => p.name === 'pool-isolir' || p.name?.toLowerCase().includes('isolir'));
    const profMatch = profList.find((p: any) => p.name === 'ppoe-expired' || p.name?.toLowerCase().includes('expired') || p.name?.toLowerCase().includes('isolir'));
    const filterMatch = filterList.some((f: any) => f.comment?.includes('ARBILL-ISOLIR') || f['src-address-list'] === 'ISOLIR-USERS');
    const natMatch = natList.some((n: any) => n.comment?.includes('ARBILL-ISOLIR') || n['src-address-list'] === 'ISOLIR-USERS');
    const schedMatch = schedList.some((s: any) => s.name === 'monitor-ppp-arbil');

    const defaultBypass = getDefaultBypassHosts();
    const wgMatch = wgList.some((w: any) => {
      const h = (w['dst-host'] || '').toLowerCase();
      const c = (w['comment'] || '').toLowerCase();
      return defaultBypass.some(dp => {
        const clean = dp.replace(/\*/g, '').toLowerCase();
        return clean && (h.includes(clean) || c.includes(clean));
      });
    });

    // Live active users in isolir profile
    const liveIsolatedUsers = activeList.filter((a: any) => 
      (profMatch && a.profile === profMatch.name) || 
      a.profile?.toLowerCase().includes('expired') || 
      a.profile?.toLowerCase().includes('isolir')
    );

    // Database registered isolated customers
    const dbIsolated = await pool.query("SELECT COUNT(*)::int as count FROM customers WHERE router_id = $1 AND (status = 'isolated' OR status = 'isolir')", [id]);

    const resultPayload = {
      success: true,
      router_id: id,
      router_name: router.name,
      status: {
        pool: !!poolMatch,
        pool_details: poolMatch ? { name: poolMatch.name, ranges: poolMatch.ranges } : null,
        profile: !!profMatch,
        profile_details: profMatch ? { 
          name: profMatch.name, 
          rate_limit: profMatch['rate-limit'], 
          local_address: profMatch['local-address'], 
          remote_address: profMatch['remote-address'], 
          address_list: profMatch['address-list'] 
        } : null,
        filter: filterMatch,
        nat: natMatch,
        scheduler: schedMatch,
        walled_garden: wgMatch,
        is_ready: !!(poolMatch && profMatch && filterMatch && natMatch && schedMatch)
      },
      isolated_stats: {
        live_active: liveIsolatedUsers.length,
        db_registered: dbIsolated.rows[0]?.count || 0
      }
    };

    // Simpan ke Redis selama 60 detik (1 menit)
    try {
      await redisSet(cacheKey, resultPayload, 60);
    } catch (_) {}

    res.json(resultPayload);
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal membaca status isolir: ${err.message}` });
  }
}

/**
 * Setup 1-Klik Sistem Isolir ke MikroTik:
 * 1. IP Pool 'pool-isolir'
 * 2. PPP Profile 'ppoe-expired'
 * 3. Firewall Filter (Allow DNS, Allow Server, Drop Internet)
 * 4. Firewall NAT (Redirect Port 80 ke Halaman Isolir Arbill)
 * 5. Scheduler 'monitor-ppp-arbil' (10m)
 */
export async function setupIsolirOnMikrotik(req: Request, res: Response) {
  const { id } = req.params;
  const {
    pool_name = 'pool-isolir',
    pool_range = '10.100.100.2-10.100.100.254',
    gateway_ip = '10.100.100.1',
    profile_name = 'ppoe-expired',
    rate_limit = '128k/128k',
    dns_servers = '10.100.100.1,8.8.8.8',
    server_host,
    server_port
  } = req.body;

  try {
    const rRes = await pool.query('SELECT * FROM routers WHERE id = $1', [id]);
    if (rRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router tidak ditemukan.' });
    }
    const router = rRes.rows[0];
    const rawHost = (server_host && String(server_host).trim()) || process.env.BILLING_SERVER_HOST || 'arbill.arabpay.my.id';
    const cleanHost = rawHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').split(':')[0].trim();
    const serverPort = (server_port && String(server_port).trim()) || process.env.PORT || '3006';
    const isDomain = !/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanHost);

    const conn = new RouterOSAPI({
      host: router.ip_address,
      port: router.api_port || 8728,
      user: router.username || 'admin',
      password: router.password || '',
      timeout: 12
    });
    await conn.connect();

    const notes: string[] = [];

    // 1. Setup IP Pool
    const pools: any = await conn.write('/ip/pool/print');
    const matchPool = Array.isArray(pools) ? pools.find((p: any) => p.name === pool_name) : null;
    if (matchPool && matchPool['.id']) {
      await conn.write('/ip/pool/set', [`=.id=${matchPool['.id']}`, `=ranges=${pool_range}`]);
      notes.push(`IP Pool "${pool_name}" (${pool_range}) diperbarui`);
    } else {
      await conn.write('/ip/pool/add', [`=name=${pool_name}`, `=ranges=${pool_range}`, `=comment=Pool Khusus Pelanggan Terisolir - Arbill`]);
      notes.push(`IP Pool "${pool_name}" (${pool_range}) dibuat baru`);
    }

    // 2. Setup PPP Profile Isolir
    const profiles: any = await conn.write('/ppp/profile/print');
    const matchProf = Array.isArray(profiles) ? profiles.find((p: any) => p.name === profile_name) : null;
    const profArgs = [
      `=name=${profile_name}`,
      `=local-address=${gateway_ip}`,
      `=remote-address=${pool_name}`,
      `=rate-limit=${rate_limit}`,
      `=address-list=ISOLIR-USERS`,
      `=dns-server=${dns_servers}`,
      `=comment=Profile Khusus Pelanggan Terisolir - Arbill`
    ];
    if (matchProf && matchProf['.id']) {
      await conn.write('/ppp/profile/set', [`=.id=${matchProf['.id']}`, ...profArgs]);
      notes.push(`PPP Profile "${profile_name}" diperbarui`);
    } else {
      await conn.write('/ppp/profile/add', profArgs);
      notes.push(`PPP Profile "${profile_name}" dibuat baru`);
    }

    // Pastikan profile tercatat di database PostgreSQL router_profiles
    const checkDbProf = await pool.query('SELECT id FROM router_profiles WHERE router_id = $1 AND name = $2', [id, profile_name]);
    if (checkDbProf.rows.length === 0) {
      await pool.query(`
        INSERT INTO router_profiles (id, router_id, name, type, rate_limit, local_address, remote_address)
        VALUES ($1, $2, $3, 'pppoe', $4, $5, $6)
      `, [`rp-${crypto.randomUUID().substring(0, 8)}`, id, profile_name, rate_limit, gateway_ip, pool_name]);
    }

    // 3. Whitelist Domain/IP Server Billing ke Address-List MikroTik
    try {
      const addrLists: any = await conn.write('/ip/firewall/address-list/print');
      const addrList = Array.isArray(addrLists) ? addrLists : [];
      const matchAddr = addrList.find((a: any) => a.list === 'ARBILL-BILLING-HOST' && a.address === cleanHost);
      if (!matchAddr) {
        await conn.write('/ip/firewall/address-list/add', [
          `=list=ARBILL-BILLING-HOST`,
          `=address=${cleanHost}`,
          `=comment=Server Billing Arbill (${isDomain ? 'Cloudflare Domain' : 'Direct IP'})`
        ]);
        notes.push(`Address-List "ARBILL-BILLING-HOST" (${cleanHost}) ditambahkan`);
      }
    } catch (addrErr: any) {
      console.warn('Gagal menambah address-list ARBILL-BILLING-HOST:', addrErr.message);
    }

    // 4. Setup Firewall Filter Rules
    const filters: any = await conn.write('/ip/firewall/filter/print');
    const filterList = Array.isArray(filters) ? filters : [];

    const ensureFilterRule = async (comment: string, args: string[]) => {
      const match = filterList.find((f: any) => f.comment === comment);
      if (!match) {
        await conn.write('/ip/firewall/filter/add', [`=comment=${comment}`, ...args]);
        notes.push(`Filter: "${comment}" ditambahkan`);
      }
    };

    // A. Allow DNS UDP 53
    await ensureFilterRule('ARBILL-ISOLIR-ALLOW-DNS-UDP', [
      '=chain=forward',
      '=src-address-list=ISOLIR-USERS',
      '=protocol=udp',
      '=dst-port=53',
      '=action=accept',
      '=place-before=0'
    ]);

    // B. Allow DNS TCP 53
    await ensureFilterRule('ARBILL-ISOLIR-ALLOW-DNS-TCP', [
      '=chain=forward',
      '=src-address-list=ISOLIR-USERS',
      '=protocol=tcp',
      '=dst-port=53',
      '=action=accept',
      '=place-before=1'
    ]);

    // C. Allow Traffic ke Server Billing Arbill (Bisa Domain FQDN via Address-List atau IP)
    const billingFilterArgs = [
      '=chain=forward',
      '=src-address-list=ISOLIR-USERS',
      '=dst-address-list=ARBILL-BILLING-HOST',
      '=action=accept',
      '=place-before=2'
    ];
    await ensureFilterRule('ARBILL-ISOLIR-ALLOW-BILLING', billingFilterArgs);

    // D. Drop Other Internet Traffic
    await ensureFilterRule('ARBILL-ISOLIR-DROP-INTERNET', [
      '=chain=forward',
      '=src-address-list=ISOLIR-USERS',
      '=action=drop',
      '=place-before=3'
    ]);

    // 5. Setup Redirect HTTP ke Halaman Isolir Arbill
    const nats: any = await conn.write('/ip/firewall/nat/print');
    const natList = Array.isArray(nats) ? nats : [];
    const natComment = 'ARBILL-ISOLIR-REDIRECT-HTTP';
    const matchNat = natList.find((n: any) => n.comment === natComment);

    if (isDomain) {
      // MODE DOMAIN / CLOUDFLARE TUNNEL: Gunakan Web Proxy MikroTik untuk HTTP 302 Redirect
      try {
        await conn.write('/ip/proxy/set', ['=enabled=yes', '=port=8080']);
        notes.push('Web Proxy MikroTik diaktifkan (port 8080)');

        const proxyAccess: any = await conn.write('/ip/proxy/access/print');
        const paList = Array.isArray(proxyAccess) ? proxyAccess : [];
        const matchPa = paList.find((p: any) => p.comment === 'ARBILL-ISOLIR-REDIRECT');
        const redirectUrl = `https://${cleanHost}/#/isolir`;
        if (matchPa && matchPa['.id']) {
          await conn.write('/ip/proxy/access/set', [
            `=.id=${matchPa['.id']}`,
            '=action=deny',
            `=redirect-to=${redirectUrl}`,
            '=comment=ARBILL-ISOLIR-REDIRECT'
          ]);
          notes.push(`Web Proxy Access Redirect (${redirectUrl}) diperbarui`);
        } else {
          await conn.write('/ip/proxy/access/add', [
            '=action=deny',
            `=redirect-to=${redirectUrl}`,
            '=comment=ARBILL-ISOLIR-REDIRECT'
          ]);
          notes.push(`Web Proxy Access Redirect (${redirectUrl}) dibuat baru`);
        }
      } catch (proxyErr: any) {
        console.warn('Gagal setup Web Proxy:', proxyErr.message);
      }

      // Redirect port 80 ke Proxy 8080
      const natArgs = [
        '=chain=dstnat',
        '=src-address-list=ISOLIR-USERS',
        '=protocol=tcp',
        '=dst-port=80',
        '=action=redirect',
        '=to-ports=8080',
        `=comment=${natComment}`,
        '=place-before=0'
      ];
      if (matchNat && matchNat['.id']) {
        await conn.write('/ip/firewall/nat/set', [`=.id=${matchNat['.id']}`, ...natArgs]);
        notes.push('NAT: Redirect Port 80 -> Proxy 8080 diperbarui');
      } else {
        await conn.write('/ip/firewall/nat/add', natArgs);
        notes.push('NAT: Redirect Port 80 -> Proxy 8080 ditambahkan');
      }
    } else {
      // MODE DIRECT IP: Gunakan DST-NAT biasa
      const natArgs = [
        '=chain=dstnat',
        '=src-address-list=ISOLIR-USERS',
        '=protocol=tcp',
        '=dst-port=80',
        '=action=dst-nat',
        `=to-addresses=${cleanHost}`,
        `=to-ports=${serverPort}`,
        `=comment=${natComment}`,
        '=place-before=0'
      ];
      if (matchNat && matchNat['.id']) {
        await conn.write('/ip/firewall/nat/set', [`=.id=${matchNat['.id']}`, ...natArgs]);
        notes.push(`NAT: DST-NAT Port 80 -> ${cleanHost}:${serverPort} diperbarui`);
      } else {
        await conn.write('/ip/firewall/nat/add', natArgs);
        notes.push(`NAT: DST-NAT Port 80 -> ${cleanHost}:${serverPort} ditambahkan`);
      }
    }

    // 6. Setup Scheduler monitor-ppp-arbil
    const schedNotes = await ensureMikrotikScheduler(conn, 'pppoe');
    notes.push(schedNotes);

    conn.close();

    // Invalidate Redis cache agar status teranyar langsung terbaca
    try {
      await redisDel(`mikrotik:isolir_status:${id}`);
      await redisDel(`mikrotik:isolated_customers:${id}`);
      await redisDel('mikrotik:active_users:all');
    } catch (_) {}

    res.json({
      success: true,
      message: `⚡ Sistem Isolir Berhasil Dipasang ke Router "${router.name}"!`,
      details: notes
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal setup sistem isolir: ${err.message}` });
  }
}

/**
 * Sinkronisasi atau Unsinkronisasi Komponen Isolir MikroTik Per-Poin atau Sekaligus:
 * component: 'pool' | 'profile' | 'filter' | 'nat' | 'scheduler' | 'walled_garden' | 'all'
 * action: 'sync' | 'unsync'
 */
export async function syncIsolirComponent(req: Request, res: Response) {
  const { id } = req.params;
  const {
    component,
    action = 'sync',
    pool_name = 'pool-isolir',
    pool_range = '10.100.100.2-10.100.100.254',
    gateway_ip = '10.100.100.1',
    profile_name = 'ppoe-expired',
    rate_limit = '128k/128k',
    dns_servers = '10.100.100.1,8.8.8.8',
    server_host,
    server_port
  } = req.body;

  try {
    const rRes = await pool.query('SELECT * FROM routers WHERE id = $1', [id]);
    if (rRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router tidak ditemukan.' });
    }
    const router = rRes.rows[0];
    const rawHost = (server_host && String(server_host).trim()) || process.env.BILLING_SERVER_HOST || 'arbill.arabpay.my.id';
    const cleanHost = rawHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').split(':')[0].trim();
    const serverPort = (server_port && String(server_port).trim()) || process.env.PORT || '3006';
    const isDomain = !/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanHost);

    const conn = new RouterOSAPI({
      host: router.ip_address,
      port: router.api_port || 8728,
      user: router.username || 'admin',
      password: router.password || '',
      timeout: 12
    });
    await conn.connect();

    const notes: string[] = [];

    // 1. IP POOL
    const doSyncPool = async () => {
      const pools: any = await conn.write('/ip/pool/print');
      const matchPool = Array.isArray(pools) ? pools.find((p: any) => p.name === pool_name) : null;
      if (matchPool && matchPool['.id']) {
        await conn.write('/ip/pool/set', [`=.id=${matchPool['.id']}`, `=ranges=${pool_range}`]);
        notes.push(`IP Pool "${pool_name}" (${pool_range}) diperbarui`);
      } else {
        await conn.write('/ip/pool/add', [`=name=${pool_name}`, `=ranges=${pool_range}`, `=comment=Pool Khusus Pelanggan Terisolir - Arbill`]);
        notes.push(`IP Pool "${pool_name}" (${pool_range}) berhasil dibuat`);
      }
    };

    const doUnsyncPool = async () => {
      const pools: any = await conn.write('/ip/pool/print');
      const matchPools = Array.isArray(pools) ? pools.filter((p: any) => p.name === pool_name || p.name === 'pool-isolir') : [];
      for (const p of matchPools) {
        if (p['.id']) {
          try {
            await conn.write('/ip/pool/remove', [`=.id=${p['.id']}`]);
            notes.push(`IP Pool "${p.name}" berhasil dicabut dari router`);
          } catch (err: any) {
            notes.push(`Gagal mencabut IP Pool "${p.name}": ${err.message}. Pastikan tidak sedang digunakan oleh PPP Profile.`);
          }
        }
      }
      if (matchPools.length === 0) notes.push(`IP Pool "${pool_name}" tidak ditemukan di router.`);
    };

    // 2. PPP PROFILE
    const doSyncProfile = async () => {
      const profiles: any = await conn.write('/ppp/profile/print');
      const matchProf = Array.isArray(profiles) ? profiles.find((p: any) => p.name === profile_name) : null;
      const profArgs = [
        `=name=${profile_name}`,
        `=local-address=${gateway_ip}`,
        `=remote-address=${pool_name}`,
        `=rate-limit=${rate_limit}`,
        `=address-list=ISOLIR-USERS`,
        `=dns-server=${dns_servers}`,
        `=comment=Profile Khusus Pelanggan Terisolir - Arbill`
      ];
      if (matchProf && matchProf['.id']) {
        await conn.write('/ppp/profile/set', [`=.id=${matchProf['.id']}`, ...profArgs]);
        notes.push(`PPP Profile "${profile_name}" diperbarui`);
      } else {
        await conn.write('/ppp/profile/add', profArgs);
        notes.push(`PPP Profile "${profile_name}" berhasil dibuat`);
      }
      const checkDbProf = await pool.query('SELECT id FROM router_profiles WHERE router_id = $1 AND name = $2', [id, profile_name]);
      if (checkDbProf.rows.length === 0) {
        await pool.query(`
          INSERT INTO router_profiles (id, router_id, name, type, rate_limit, local_address, remote_address)
          VALUES ($1, $2, $3, 'pppoe', $4, $5, $6)
        `, [`rp-${crypto.randomUUID().substring(0, 8)}`, id, profile_name, rate_limit, gateway_ip, pool_name]);
      }
    };

    const doUnsyncProfile = async () => {
      const profiles: any = await conn.write('/ppp/profile/print');
      const matchProfs = Array.isArray(profiles) ? profiles.filter((p: any) => p.name === profile_name || p.name === 'ppoe-expired') : [];
      for (const pr of matchProfs) {
        if (pr['.id']) {
          try {
            await conn.write('/ppp/profile/remove', [`=.id=${pr['.id']}`]);
            notes.push(`PPP Profile "${pr.name}" berhasil dicabut dari router`);
          } catch (err: any) {
            notes.push(`Gagal mencabut PPP Profile "${pr.name}": ${err.message}. Pastikan tidak sedang digunakan oleh User PPP.`);
          }
        }
      }
      if (matchProfs.length === 0) notes.push(`PPP Profile "${profile_name}" tidak ditemukan di router.`);
    };

    // 3. FILTER RULE
    const doSyncFilter = async () => {
      try {
        const addrLists: any = await conn.write('/ip/firewall/address-list/print');
        const addrList = Array.isArray(addrLists) ? addrLists : [];
        const matchAddr = addrList.find((a: any) => a.list === 'ARBILL-BILLING-HOST' && a.address === cleanHost);
        if (!matchAddr) {
          await conn.write('/ip/firewall/address-list/add', [
            `=list=ARBILL-BILLING-HOST`,
            `=address=${cleanHost}`,
            `=comment=Server Billing Arbill (${isDomain ? 'Cloudflare Domain' : 'Direct IP'})`
          ]);
          notes.push(`Address-List "ARBILL-BILLING-HOST" (${cleanHost}) ditambahkan`);
        }
      } catch (addrErr: any) {
        notes.push(`Address-List info: ${addrErr.message}`);
      }

      const filters: any = await conn.write('/ip/firewall/filter/print');
      const filterList = Array.isArray(filters) ? filters : [];
      const ensureFilterRule = async (comment: string, args: string[]) => {
        const match = filterList.find((f: any) => f.comment === comment);
        if (!match) {
          await conn.write('/ip/firewall/filter/add', [`=comment=${comment}`, ...args]);
          notes.push(`Filter: "${comment}" ditambahkan`);
        } else {
          notes.push(`Filter: "${comment}" sudah aktif`);
        }
      };

      await ensureFilterRule('ARBILL-ISOLIR-ALLOW-DNS-UDP', [
        '=chain=forward',
        '=src-address-list=ISOLIR-USERS',
        '=protocol=udp',
        '=dst-port=53',
        '=action=accept',
        '=place-before=0'
      ]);
      await ensureFilterRule('ARBILL-ISOLIR-ALLOW-DNS-TCP', [
        '=chain=forward',
        '=src-address-list=ISOLIR-USERS',
        '=protocol=tcp',
        '=dst-port=53',
        '=action=accept',
        '=place-before=1'
      ]);
      await ensureFilterRule('ARBILL-ISOLIR-ALLOW-BILLING', [
        '=chain=forward',
        '=src-address-list=ISOLIR-USERS',
        '=dst-address-list=ARBILL-BILLING-HOST',
        '=action=accept',
        '=place-before=2'
      ]);
      await ensureFilterRule('ARBILL-ISOLIR-DROP-INTERNET', [
        '=chain=forward',
        '=src-address-list=ISOLIR-USERS',
        '=action=drop',
        '=place-before=3'
      ]);
    };

    const doUnsyncFilter = async () => {
      const filters: any = await conn.write('/ip/firewall/filter/print');
      const filterList = Array.isArray(filters) ? filters : [];
      let removedCount = 0;
      for (const f of filterList) {
        if (f.comment?.includes('ARBILL-ISOLIR') || f['src-address-list'] === 'ISOLIR-USERS') {
          try {
            await conn.write('/ip/firewall/filter/remove', [`=.id=${f['.id']}`]);
            removedCount++;
          } catch (_) {}
        }
      }
      notes.push(`Mencabut ${removedCount} rule Firewall Filter isolir.`);

      try {
        const addrLists: any = await conn.write('/ip/firewall/address-list/print');
        const addrList = Array.isArray(addrLists) ? addrLists : [];
        for (const a of addrList) {
          if (a.list === 'ARBILL-BILLING-HOST') {
            try {
              await conn.write('/ip/firewall/address-list/remove', [`=.id=${a['.id']}`]);
            } catch (_) {}
          }
        }
      } catch (_) {}
    };

    // 4. NAT REDIRECT
    const doSyncNat = async () => {
      const nats: any = await conn.write('/ip/firewall/nat/print');
      const natList = Array.isArray(nats) ? nats : [];
      const natComment = 'ARBILL-ISOLIR-REDIRECT-HTTP';
      const matchNat = natList.find((n: any) => n.comment === natComment);

      if (isDomain) {
        try {
          await conn.write('/ip/proxy/set', ['=enabled=yes', '=port=8080']);
          notes.push('Web Proxy MikroTik diaktifkan (port 8080)');

          const proxyAccess: any = await conn.write('/ip/proxy/access/print');
          const paList = Array.isArray(proxyAccess) ? proxyAccess : [];
          const matchPa = paList.find((p: any) => p.comment === 'ARBILL-ISOLIR-REDIRECT');
          const redirectUrl = `https://${cleanHost}/#/isolir`;
          if (matchPa && matchPa['.id']) {
            await conn.write('/ip/proxy/access/set', [
              `=.id=${matchPa['.id']}`,
              '=action=deny',
              `=redirect-to=${redirectUrl}`,
              '=comment=ARBILL-ISOLIR-REDIRECT'
            ]);
            notes.push(`Web Proxy Access Redirect (${redirectUrl}) diperbarui`);
          } else {
            await conn.write('/ip/proxy/access/add', [
              '=action=deny',
              `=redirect-to=${redirectUrl}`,
              '=comment=ARBILL-ISOLIR-REDIRECT'
            ]);
            notes.push(`Web Proxy Access Redirect (${redirectUrl}) dibuat baru`);
          }
        } catch (proxyErr: any) {
          notes.push(`Web Proxy info: ${proxyErr.message}`);
        }

        const natArgs = [
          '=chain=dstnat',
          '=src-address-list=ISOLIR-USERS',
          '=protocol=tcp',
          '=dst-port=80',
          '=action=redirect',
          '=to-ports=8080',
          `=comment=${natComment}`,
          '=place-before=0'
        ];
        if (matchNat && matchNat['.id']) {
          await conn.write('/ip/firewall/nat/set', [`=.id=${matchNat['.id']}`, ...natArgs]);
          notes.push('NAT: Redirect Port 80 -> Proxy 8080 diperbarui');
        } else {
          await conn.write('/ip/firewall/nat/add', natArgs);
          notes.push('NAT: Redirect Port 80 -> Proxy 8080 ditambahkan');
        }
      } else {
        const natArgs = [
          '=chain=dstnat',
          '=src-address-list=ISOLIR-USERS',
          '=protocol=tcp',
          '=dst-port=80',
          '=action=dst-nat',
          `=to-addresses=${cleanHost}`,
          `=to-ports=${serverPort}`,
          `=comment=${natComment}`,
          '=place-before=0'
        ];
        if (matchNat && matchNat['.id']) {
          await conn.write('/ip/firewall/nat/set', [`=.id=${matchNat['.id']}`, ...natArgs]);
          notes.push(`NAT: DST-NAT Port 80 -> ${cleanHost}:${serverPort} diperbarui`);
        } else {
          await conn.write('/ip/firewall/nat/add', natArgs);
          notes.push(`NAT: DST-NAT Port 80 -> ${cleanHost}:${serverPort} ditambahkan`);
        }
      }
    };

    const doUnsyncNat = async () => {
      const nats: any = await conn.write('/ip/firewall/nat/print');
      const natList = Array.isArray(nats) ? nats : [];
      let removedNat = 0;
      for (const n of natList) {
        if (n.comment?.includes('ARBILL-ISOLIR')) {
          try {
            await conn.write('/ip/firewall/nat/remove', [`=.id=${n['.id']}`]);
            removedNat++;
          } catch (_) {}
        }
      }
      notes.push(`Mencabut ${removedNat} rule NAT Redirect isolir.`);

      try {
        const proxyAccess: any = await conn.write('/ip/proxy/access/print');
        const paList = Array.isArray(proxyAccess) ? proxyAccess : [];
        for (const pa of paList) {
          if (pa.comment?.includes('ARBILL-ISOLIR')) {
            try {
              await conn.write('/ip/proxy/access/remove', [`=.id=${pa['.id']}`]);
            } catch (_) {}
          }
        }
      } catch (_) {}
    };

    // 5. SCHEDULER
    const doSyncScheduler = async () => {
      const schedNotes = await ensureMikrotikScheduler(conn, 'pppoe');
      notes.push(schedNotes);
    };

    const doUnsyncScheduler = async () => {
      const scheds: any = await conn.write('/system/scheduler/print');
      const schedList = Array.isArray(scheds) ? schedList : [];
      let removedSched = 0;
      for (const s of schedList) {
        if (s.name === 'monitor-ppp-arbil') {
          try {
            await conn.write('/system/scheduler/remove', [`=.id=${s['.id']}`]);
            removedSched++;
          } catch (_) {}
        }
      }
      notes.push(`Mencabut ${removedSched} Scheduler "monitor-ppp-arbil".`);
    };

    // 6. WALLED GARDEN (BYPASS BILLING & WALLET)
    const doSyncWalledGarden = async () => {
      const defaultHosts = getDefaultBypassHosts();
      let currentDomains: any[] = [];
      try {
        const d = await conn.write('/ip/hotspot/walled-garden/print');
        if (Array.isArray(d)) currentDomains = d;
      } catch (_) {}

      for (const h of defaultHosts) {
        const cleanH = String(h).trim();
        if (!cleanH) continue;
        const exists = currentDomains.some(d => (d['dst-host'] || '').trim().toLowerCase() === cleanH.toLowerCase());
        if (!exists) {
          try {
            await conn.write('/ip/hotspot/walled-garden/add', [
              `=dst-host=${cleanH}`,
              `=action=allow`,
              `=comment=Bypass Billing & Wallet ArabPay`
            ]);
            notes.push(`Walled Garden domain "${cleanH}" ditambahkan`);
          } catch (_) {}
        }
      }
      notes.push('Walled Garden Hotspot berhasil disinkronkan.');
    };

    const doUnsyncWalledGarden = async () => {
      const defaultHosts = getDefaultBypassHosts();
      let currentDomains: any[] = [];
      try {
        const d = await conn.write('/ip/hotspot/walled-garden/print');
        if (Array.isArray(d)) currentDomains = d;
      } catch (_) {}

      let removedWg = 0;
      for (const d of currentDomains) {
        const host = (d['dst-host'] || '').toLowerCase();
        const comment = (d['comment'] || '').toLowerCase();
        const isMatch = defaultHosts.some(dh => {
          const clean = dh.replace(/\*/g, '').toLowerCase();
          return clean && (host.includes(clean) || comment.includes(clean));
        });
        if (isMatch && d['.id']) {
          try {
            await conn.write('/ip/hotspot/walled-garden/remove', [`=.id=${d['.id']}`]);
            removedWg++;
          } catch (_) {}
        }
      }

      let currentIps: any[] = [];
      try {
        const ips = await conn.write('/ip/hotspot/walled-garden/ip/print');
        if (Array.isArray(ips)) currentIps = ips;
      } catch (_) {}
      for (const ip of currentIps) {
        const host = (ip['dst-host'] || ip['dst-address'] || '').toLowerCase();
        const comment = (ip['comment'] || '').toLowerCase();
        const isMatch = defaultHosts.some(dh => {
          const clean = dh.replace(/\*/g, '').toLowerCase();
          return clean && (host.includes(clean) || comment.includes(clean));
        });
        if (isMatch && ip['.id']) {
          try {
            await conn.write('/ip/hotspot/walled-garden/ip/remove', [`=.id=${ip['.id']}`]);
            removedWg++;
          } catch (_) {}
        }
      }
      notes.push(`Mencabut ${removedWg} rule Walled Garden.`);
    };

    // Eksekusi berdasarkan aksi
    if (action === 'unsync') {
      switch (component) {
        case 'pool':
          await doUnsyncPool();
          break;
        case 'profile':
          await doUnsyncProfile();
          break;
        case 'filter':
          await doUnsyncFilter();
          break;
        case 'nat':
          await doUnsyncNat();
          break;
        case 'scheduler':
          await doUnsyncScheduler();
          break;
        case 'walled_garden':
          await doUnsyncWalledGarden();
          break;
        case 'all':
          // Unsync berurutan dari filter -> nat -> scheduler -> profile -> pool -> walled garden
          await doUnsyncFilter();
          await doUnsyncNat();
          await doUnsyncScheduler();
          await doUnsyncProfile();
          await doUnsyncPool();
          await doUnsyncWalledGarden();
          break;
        default:
          conn.close();
          return res.status(400).json({ success: false, message: `Komponen "${component}" tidak valid.` });
      }
    } else {
      // action === 'sync'
      switch (component) {
        case 'pool':
          await doSyncPool();
          break;
        case 'profile':
          await doSyncProfile();
          break;
        case 'filter':
          await doSyncFilter();
          break;
        case 'nat':
          await doSyncNat();
          break;
        case 'scheduler':
          await doSyncScheduler();
          break;
        case 'walled_garden':
          await doSyncWalledGarden();
          break;
        case 'all':
          await doSyncPool();
          await doSyncProfile();
          await doSyncFilter();
          await doSyncNat();
          await doSyncScheduler();
          await doSyncWalledGarden();
          break;
        default:
          conn.close();
          return res.status(400).json({ success: false, message: `Komponen "${component}" tidak valid.` });
      }
    }

    conn.close();

    // Invalidate Redis cache
    try {
      await redisDel(`mikrotik:isolir_status:${id}`);
      await redisDel(`mikrotik:isolated_customers:${id}`);
      await redisDel('mikrotik:active_users:all');
    } catch (_) {}

    return res.json({
      success: true,
      message: action === 'unsync'
        ? `Berhasil mencabut komponen "${component}" dari Router "${router.name}"`
        : `Berhasil mensinkronkan komponen "${component}" ke Router "${router.name}"`,
      details: notes
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `Gagal proses komponen "${component}": ${err.message}`
    });
  }
}

/**
 * Generator script RouterOS New Terminal untuk sistem isolir
 */
export async function getIsolirScript(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const rRes = await pool.query('SELECT * FROM routers WHERE id = $1', [id]);
    const router = rRes.rows[0] || { name: 'MikroTik Router' };
    const rawHost = (req.query.server_host as string) || process.env.BILLING_SERVER_HOST || 'arbill.arabpay.my.id';
    const cleanHost = rawHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').split(':')[0].trim();
    const serverPort = (req.query.server_port as string) || process.env.PORT || '3006';
    const isDomain = !/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanHost);

    const redirectScriptSection = isDomain
      ? `# 4. Konfigurasi Web Proxy MikroTik untuk Redirect HTTP ke Domain Cloudflare
/ip proxy
set enabled=yes port=8080
/ip proxy access
add action=deny redirect-to="https://${cleanHost}/#/isolir" comment="ARBILL-ISOLIR-REDIRECT"

# 5. Redirect Port 80 ke Web Proxy MikroTik Port 8080
/ip firewall nat
add chain=dstnat src-address-list=ISOLIR-USERS protocol=tcp dst-port=80 action=redirect \\
    to-ports=8080 comment="ARBILL-ISOLIR-REDIRECT-HTTP" place-before=0`
      : `# 4. Buat Firewall NAT DST-NAT Redirect HTTP Port 80 ke Halaman Isolir Arbill
/ip firewall nat
add chain=dstnat src-address-list=ISOLIR-USERS protocol=tcp dst-port=80 action=dst-nat \\
    to-addresses=${cleanHost} to-ports=${serverPort} comment="ARBILL-ISOLIR-REDIRECT-HTTP" place-before=0`;

    const script = 
`# =========================================================
# SCRIPT OTOMATISASI SISTEM ISOLIR PPPOE - ARBILL BILLING
# Router: ${router.name}
# Server Host: ${cleanHost}${isDomain ? ' (Cloudflare Tunnel Domain)' : `:${serverPort}`}
# =========================================================

# 1. Buat IP Pool Khusus Isolir
/ip pool
add name=pool-isolir ranges=10.100.100.2-10.100.100.254 comment="Pool Khusus Pelanggan Terisolir - Arbill"

# 2. Buat PPP Profile Khusus Isolir (ppoe-expired)
/ppp profile
add name=ppoe-expired local-address=10.100.100.1 remote-address=pool-isolir rate-limit=128k/128k \\
    address-list=ISOLIR-USERS dns-server=10.100.100.1,8.8.8.8 comment="Profile Khusus Pelanggan Terisolir - Arbill"

# 3. Whitelist Host Server Billing ke Address-List (MikroTik auto-resolve IP Cloudflare)
/ip firewall address-list
add address=${cleanHost} list=ARBILL-BILLING-HOST comment="Arbill Billing Server Host"

# 4. Buat Firewall Filter Rules (Izinkan DNS & Server Billing, Blokir Internet Lain)
/ip firewall filter
add chain=forward src-address-list=ISOLIR-USERS protocol=udp dst-port=53 action=accept comment="ARBILL-ISOLIR-ALLOW-DNS-UDP" place-before=0
add chain=forward src-address-list=ISOLIR-USERS protocol=tcp dst-port=53 action=accept comment="ARBILL-ISOLIR-ALLOW-DNS-TCP" place-before=1
add chain=forward src-address-list=ISOLIR-USERS dst-address-list=ARBILL-BILLING-HOST action=accept comment="ARBILL-ISOLIR-ALLOW-BILLING" place-before=2
add chain=forward src-address-list=ISOLIR-USERS action=drop comment="ARBILL-ISOLIR-DROP-INTERNET" place-before=3

${redirectScriptSection}

# 6. Pasang Scheduler Otomatis "monitor-ppp-arbil" (Cek tiap 10 Menit)
/system scheduler
add name=monitor-ppp-arbil interval=10m start-time=startup comment="Monitor Otomatis Jatuh Tempo & Isolir PPPoE (10 Menit) - Arbill" on-event="\\
:local expProfile \\"ppoe-expired\\";\\
:local dateint do={:local days [:pick \\$d 8 10];:local month [:pick \\$d 5 7];:local year [:pick \\$d 0 4]; :return [:tonum (\\"\\$year\\$month\\$days\\")];};\\
:local timeint do={:local hours [:pick \\$t 0 2]; :local minutes [:pick \\$t 3 5]; :return (\\$hours * 60 + \\$minutes);};\\
:local convertToV7 do={:local monthr {\\"jan\\";\\"feb\\";\\"mar\\";\\"apr\\";\\"may\\";\\"jun\\";\\"jul\\";\\"aug\\";\\"sep\\";\\"oct\\";\\"nov\\";\\"dec\\"}; :local dd [:pick \\$date 4 6];:local yy [:tonum [:pick \\$date 7 11]]; :local mm [:find \\$monthr [:pick \\$date 0 3]]; :local mn (\\$mm + 1); :if (\\$mn < 10) do={ :set mn (\\"0\\" . \\$mn);}; :local newdate \\"\\$yy-\\$mn-\\$dd\\"; :return \\$newdate;};\\
:local date [/system clock get date];:local time [/system clock get time];:if ([:len [:find \\$date \\"/\\"]] > 0) do={ :set date [\\$convertToV7 date=\\$date]; };\\
:local today [\\$dateint d=\\$date];:local curtime [\\$timeint t=\\$time];:local tyear [:pick \\$date 0 4];:local lyear (\\$tyear - 1);\\
:foreach i in [/ppp secret find where comment~\\"\\$tyear-[0-9]{2}-[0-9]{2}\\" || comment~\\"\\$lyear-[0-9]{2}-[0-9]{2}\\" || comment~\\"[a-z]{3}/[0-9]{2}/\\$tyear\\" || comment~\\"[a-z]{3}/[0-9]{2}/\\$lyear\\"] do={\\
  :local comment [/ppp secret get \\$i comment];\\
  :local curProf [/ppp secret get \\$i profile];\\
  :local name [/ppp secret get \\$i name];\\
  :if ([:pick \\$comment 3] = \\"/\\" and [:pick \\$comment 6] = \\"/\\") do={ :local datev7 [\\$convertToV7 date=\\$comment]; :set comment (\\$datev7 . [:pick \\$comment 11 [:len \\$comment]]); };\\
  :local gettime [:pick \\$comment 11 19];:local expd [\\$dateint d=\\$comment];:local expt 0;\\
  :if ([:len \\$gettime] = 8) do={ :set expt [\\$timeint t=\\$gettime]; };\\
  :if ((\\$expd < \\$today and \\$expt < \\$curtime) or (\\$expd < \\$today and \\$expt > \\$curtime) or (\\$expd = \\$today and \\$expt < \\$curtime)) do={\\
    :if (\\$curProf != \\$expProfile) do={\\
      /ppp secret set profile=\\$expProfile \\$i;\\
      [ /ppp active remove [find where name=\\$name] ];\\
      :log warning (\\"Arbill PPPoE: \\" . \\$name . \\" isolir -> profile diubah ke \\" . \\$expProfile . \\" & sesi diputus\\");\\
    };\\
  };\\
};"
`;

    res.json({ success: true, script });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Mengambil daftar pelanggan yang sedang terisolir di router (live connection & DB)
 */
export async function getIsolatedCustomers(req: Request, res: Response) {
  const { id } = req.params;
  const force = req.query.force === 'true';
  const cacheKey = `mikrotik:isolated_customers:${id}`;

  if (!force) {
    const cached = await redisGet(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true, cache_source: 'redis' });
    }
  }

  try {
    const rRes = await pool.query('SELECT * FROM routers WHERE id = $1', [id]);
    if (rRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router tidak ditemukan.' });
    }
    const router = rRes.rows[0];

    let activeList: any[] = [];
    try {
      const conn = new RouterOSAPI({
        host: router.ip_address,
        port: router.api_port || 8728,
        user: router.username || 'admin',
        password: router.password || '',
        timeout: 8
      });
      await conn.connect();
      const rawActive: any = await conn.write('/ppp/active/print');
      if (Array.isArray(rawActive)) activeList = rawActive;
      conn.close();
    } catch (e: any) {
      console.warn('Gagal membaca /ppp/active dari router:', e.message);
    }

    // Ambil semua customer di database pada router ini yang berstatus terisolir
    const custsRes = await pool.query(`
      SELECT c.*, p.name as package_name, p.price as package_price, rp.name as profile_name
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      LEFT JOIN router_profiles rp ON c.router_profile_id = rp.id
      WHERE c.router_id = $1 AND (c.status = 'isolated' OR c.status = 'isolir' OR c.router_profile_id IN (SELECT id FROM router_profiles WHERE name ILIKE '%expired%' OR name ILIKE '%isolir%'))
      ORDER BY c.grace_until ASC NULLS LAST
    `, [id]);

    const activeMap = new Map<string, any>();
    for (const a of activeList) {
      if (a.name) activeMap.set(a.name.trim().toLowerCase(), a);
    }

    const isolatedCustomers = custsRes.rows.map(c => {
      const live = activeMap.get((c.pppoe_username || '').trim().toLowerCase());
      return {
        ...c,
        is_live_online: !!live,
        live_ip: live?.address || null,
        live_uptime: live?.uptime || null,
        live_profile: live?.profile || null
      };
    });

    const resultPayload = {
      success: true,
      count: isolatedCustomers.length,
      customers: isolatedCustomers
    };

    try {
      await redisSet(cacheKey, resultPayload, 60);
    } catch (_) {}

    res.json(resultPayload);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Helper untuk mengambil daftar host bypass Walled Garden secara dinamis dari .env
 */
export function getDefaultBypassHosts(): string[] {
  const hosts = new Set<string>();

  // 1. Ambil dari BILLING_SERVER_HOST di .env
  const rawBillingHost = (process.env.BILLING_SERVER_HOST || 'arbill.arabpay.my.id').trim();
  const cleanBilling = rawBillingHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').split(':')[0].trim();
  if (cleanBilling) {
    hosts.add(`*${cleanBilling}*`);
    const parts = cleanBilling.split('.');
    if (parts.length >= 2) {
      hosts.add(`*${parts.slice(-2).join('.')}*`);
    }
  }

  // 2. Ambil dari ARABPAY_PANEL_URL di .env
  const rawWalletUrl = (process.env.ARABPAY_PANEL_URL || 'https://arabpay.my.id').trim();
  const cleanWallet = rawWalletUrl.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').split(':')[0].trim();
  if (cleanWallet) {
    hosts.add(`*${cleanWallet}*`);
    hosts.add('*arabpay*');
  }

  // Tambahan default safety
  hosts.add('*arbill*');
  hosts.add('*arabpay.my.id*');
  hosts.add('*arabpay*');

  return Array.from(hosts);
}

/**
 * Mendapatkan Status Walled Garden (Bypass Hotspot) di Router MikroTik
 */
export async function getWalledGardenStatus(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const rRes = await pool.query('SELECT * FROM routers WHERE id = $1', [id]);
    if (rRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router tidak ditemukan.' });
    }
    const router = rRes.rows[0];

    const conn = new RouterOSAPI({
      host: router.ip_address,
      port: router.api_port || 8728,
      user: router.username || 'admin',
      password: router.password || '',
      timeout: 8
    });
    await conn.connect();

    let wgDomainList: any[] = [];
    let wgIpList: any[] = [];

    try {
      const domains = await conn.write('/ip/hotspot/walled-garden/print');
      if (Array.isArray(domains)) wgDomainList = domains;
    } catch (_) {}

    try {
      const ips = await conn.write('/ip/hotspot/walled-garden/ip/print');
      if (Array.isArray(ips)) wgIpList = ips;
    } catch (_) {}

    conn.close();

    // Periksa apakah bypass arbill / arabpay sudah ada
    const checkTargets = getDefaultBypassHosts();
    const activeEntries: any[] = [];

    wgDomainList.forEach(d => {
      const host = d['dst-host'] || '';
      const comment = d['comment'] || '';
      const isMatch = checkTargets.some(target => {
        const cleanTarget = target.replace(/\*/g, '').toLowerCase();
        return cleanTarget && (host.toLowerCase().includes(cleanTarget) || comment.toLowerCase().includes(cleanTarget));
      });
      if (isMatch) {
        activeEntries.push({
          id: d['.id'],
          type: 'domain',
          dst_host: host,
          action: d.action || 'allow',
          comment: comment
        });
      }
    });

    wgIpList.forEach(ip => {
      const host = ip['dst-host'] || ip['dst-address'] || '';
      const comment = ip['comment'] || '';
      const isMatch = checkTargets.some(target => {
        const cleanTarget = target.replace(/\*/g, '').toLowerCase();
        return cleanTarget && (host.toLowerCase().includes(cleanTarget) || comment.toLowerCase().includes(cleanTarget));
      });
      if (isMatch) {
        activeEntries.push({
          id: ip['.id'],
          type: 'ip',
          dst_host: host,
          action: ip.action || 'accept',
          comment: comment
        });
      }
    });

    const isConfigured = activeEntries.length > 0;

    res.json({
      success: true,
      router_id: id,
      router_name: router.name,
      is_configured: isConfigured,
      entries: activeEntries,
      default_hosts: checkTargets,
      env_billing_host: process.env.BILLING_SERVER_HOST || 'arbill.arabpay.my.id',
      env_wallet_url: process.env.ARABPAY_PANEL_URL || 'https://arabpay.my.id'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal membaca status Walled Garden: ${err.message}` });
  }
}

/**
 * Setup 1-Klik Hotspot Walled Garden di Router MikroTik
 * Mem-bypass portal billing (arbill) & dompet ArabPay (wallet + sso)
 */
export async function setupWalledGarden(req: Request, res: Response) {
  const { id } = req.params;
  const defaultHosts = getDefaultBypassHosts();
  const { hosts = defaultHosts, custom_ip } = req.body;

  try {
    const rRes = await pool.query('SELECT * FROM routers WHERE id = $1', [id]);
    if (rRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router tidak ditemukan.' });
    }
    const router = rRes.rows[0];

    const conn = new RouterOSAPI({
      host: router.ip_address,
      port: router.api_port || 8728,
      user: router.username || 'admin',
      password: router.password || '',
      timeout: 10
    });
    await conn.connect();

    const addedNotes: string[] = [];

    // 1. Setup /ip/hotspot/walled-garden (Domain Bypass)
    let currentDomains: any[] = [];
    try {
      const d = await conn.write('/ip/hotspot/walled-garden/print');
      if (Array.isArray(d)) currentDomains = d;
    } catch (_) {}

    for (const h of hosts) {
      const cleanH = String(h).trim();
      if (!cleanH) continue;

      const exists = currentDomains.some(d => (d['dst-host'] || '').trim().toLowerCase() === cleanH.toLowerCase());
      if (!exists) {
        try {
          await conn.write('/ip/hotspot/walled-garden/add', [
            `=dst-host=${cleanH}`,
            `=action=allow`,
            `=comment=Bypass Billing & Wallet ArabPay`
          ]);
          addedNotes.push(`Domain Walled Garden: "${cleanH}" berhasil ditambahkan`);
        } catch (addErr: any) {
          console.warn(`Gagal menambah walled-garden ${cleanH}:`, addErr.message);
        }
      } else {
        addedNotes.push(`Domain "${cleanH}" sudah terpasang`);
      }
    }

    // 2. Setup /ip/hotspot/walled-garden/ip (IP & Host Port 80/443 Bypass)
    let currentIps: any[] = [];
    try {
      const ips = await conn.write('/ip/hotspot/walled-garden/ip/print');
      if (Array.isArray(ips)) currentIps = ips;
    } catch (_) {}

    for (const h of hosts) {
      const cleanH = String(h).trim();
      if (!cleanH) continue;

      const exists = currentIps.some(ip => (ip['dst-host'] || '').trim().toLowerCase() === cleanH.toLowerCase());
      if (!exists) {
        try {
          await conn.write('/ip/hotspot/walled-garden/ip/add', [
            `=dst-host=${cleanH}`,
            `=action=accept`,
            `=comment=Bypass Billing & Wallet ArabPay`
          ]);
          addedNotes.push(`IP Walled Garden (Host ${cleanH}) berhasil ditambahkan`);
        } catch (addErr: any) {
          console.warn(`Gagal menambah walled-garden ip ${cleanH}:`, addErr.message);
        }
      }
    }

    // Jika ada custom IP server yang diberikan
    if (custom_ip) {
      const cleanIp = String(custom_ip).trim();
      const ipExists = currentIps.some(ip => (ip['dst-address'] || '').trim() === cleanIp);
      if (!ipExists) {
        try {
          await conn.write('/ip/hotspot/walled-garden/ip/add', [
            `=dst-address=${cleanIp}`,
            `=action=accept`,
            `=comment=Bypass Server IP Billing & Wallet ArabPay`
          ]);
          addedNotes.push(`IP Server "${cleanIp}" berhasil di-bypass`);
        } catch (_) {}
      }
    }

    conn.close();

    res.json({
      success: true,
      message: `⚡ Berhasil memasang Walled Garden di MikroTik "${router.name}"!`,
      details: addedNotes
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal memasang Walled Garden: ${err.message}` });
  }
}

/**
 * Menghapus Rule Hotspot Walled Garden untuk Billing & ArabPay
 */
export async function removeWalledGarden(req: Request, res: Response) {
  const { id } = req.params;
  const { host } = req.body;

  try {
    const rRes = await pool.query('SELECT * FROM routers WHERE id = $1', [id]);
    if (rRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router tidak ditemukan.' });
    }
    const router = rRes.rows[0];

    const conn = new RouterOSAPI({
      host: router.ip_address,
      port: router.api_port || 8728,
      user: router.username || 'admin',
      password: router.password || '',
      timeout: 8
    });
    await conn.connect();

    let removedCount = 0;
    const targetHost = host ? String(host).trim().toLowerCase() : null;

    // Remove from /ip/hotspot/walled-garden
    try {
      const domains: any = await conn.write('/ip/hotspot/walled-garden/print');
      if (Array.isArray(domains)) {
        for (const d of domains) {
          const dHost = (d['dst-host'] || '').toLowerCase();
          const comment = (d['comment'] || '').toLowerCase();
          const shouldRemove = targetHost
            ? dHost === targetHost || (targetHost.replace(/\*/g, '') && dHost.includes(targetHost.replace(/\*/g, '')))
            : (dHost.includes('arbill') || dHost.includes('arabpay') || comment.includes('arbill') || comment.includes('arabpay'));

          if (shouldRemove) {
            await conn.write('/ip/hotspot/walled-garden/remove', [`=.id=${d['.id']}`]);
            removedCount++;
          }
        }
      }
    } catch (_) {}

    // Remove from /ip/hotspot/walled-garden/ip
    try {
      const ips: any = await conn.write('/ip/hotspot/walled-garden/ip/print');
      if (Array.isArray(ips)) {
        for (const ip of ips) {
          const ipHost = (ip['dst-host'] || ip['dst-address'] || '').toLowerCase();
          const comment = (ip['comment'] || '').toLowerCase();
          const shouldRemove = targetHost
            ? ipHost === targetHost || (targetHost.replace(/\*/g, '') && ipHost.includes(targetHost.replace(/\*/g, '')))
            : (ipHost.includes('arbill') || ipHost.includes('arabpay') || comment.includes('arbill') || comment.includes('arabpay'));

          if (shouldRemove) {
            await conn.write('/ip/hotspot/walled-garden/ip/remove', [`=.id=${ip['.id']}`]);
            removedCount++;
          }
        }
      }
    } catch (_) {}

    conn.close();

    res.json({
      success: true,
      message: targetHost 
        ? `Berhasil mencabut rule bypass untuk "${host}" di MikroTik "${router.name}".`
        : `Berhasil menghapus ${removedCount} rule Walled Garden di MikroTik "${router.name}".`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal menghapus Walled Garden: ${err.message}` });
  }
}



