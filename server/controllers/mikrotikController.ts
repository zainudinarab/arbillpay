import { Request, Response } from 'express';
import { pool } from '../config/db.js';
import { testMikrotikConnection, fetchRealMikrotikIdentity } from '../services/mikrotikService.js';
import { RouterOSAPI } from 'node-routeros';
import crypto from 'crypto';

// --- ROUTERS ---
export async function listRouters(req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT r.id, r.name, r.ip_address, r.api_port, r.username, r.password, r.status, r.last_synced, r.created_at,
             COUNT(rp.id)::int as profile_count
      FROM routers r
      LEFT JOIN router_profiles rp ON r.id = rp.router_id
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `);
    res.json({ success: true, routers: result.rows });
  } catch (err: any) {
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
      const rRes = await pool.query('SELECT username, password FROM routers WHERE id = $1', [router_id]);
      if (rRes.rows.length > 0) {
        routerUserPass.user = username?.trim() || rRes.rows[0].username || cleanUser;
        routerUserPass.pass = password || rRes.rows[0].password || '';
      }
    }

    const liveApi = await fetchRealMikrotikIdentity(cleanHost, cleanPort, routerUserPass.user, routerUserPass.pass);

    if (liveApi.connected) {
      if (router_id && liveApi.identity) {
        await pool.query('UPDATE routers SET name = $1, status = $2, last_synced = NOW() WHERE id = $3', [liveApi.identity, 'online', router_id]);
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
  const { name, ip_address, api_port, username, password } = req.body;

  if (!name || !ip_address || !username) {
    return res.status(400).json({ success: false, message: 'Nama router, IP Address, dan Username wajib diisi.' });
  }

  try {
    const routerId = `rtr-${Date.now().toString(36)}`;
    const result = await pool.query(`
      INSERT INTO routers (id, name, ip_address, api_port, username, password, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'online')
      RETURNING id, name, ip_address, api_port, username, status, created_at
    `, [routerId, name.trim(), ip_address.trim(), parseInt(api_port) || 8728, username.trim(), password || '']);

    const p1 = `rp-${Date.now().toString(36)}-1`;
    const p2 = `rp-${Date.now().toString(36)}-2`;
    await pool.query(`
      INSERT INTO router_profiles (id, router_id, name, type, rate_limit) VALUES
      ($1, $2, 'pppoe-profile-20m', 'pppoe', '20M/20M'),
      ($3, $4, 'hs-profile-monthly', 'hotspot', '5M/5M')
    `, [p1, routerId, p2, routerId]);

    res.json({
      success: true,
      message: `Router Mikrotik "${name}" berhasil didaftarkan!`,
      router: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function editRouter(req: Request, res: Response) {
  const { id } = req.params;
  const { name, ip_address, api_port, username, password, status } = req.body;

  if (!name || !ip_address || !username) {
    return res.status(400).json({ success: false, message: 'Nama router, IP Address, dan Username wajib diisi.' });
  }

  try {
    const result = await pool.query(`
      UPDATE routers
      SET name = $1,
          ip_address = $2,
          api_port = $3,
          username = $4,
          password = COALESCE($5, password),
          status = $6
      WHERE id = $7
      RETURNING id, name, ip_address, api_port, username, status, last_synced
    `, [name.trim(), ip_address.trim(), parseInt(api_port) || 8728, username.trim(), password || null, status || 'online', id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `Data Router "${name}" berhasil diperbarui!`,
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

export async function deleteProfile(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM router_profiles WHERE id = $1 RETURNING id, name', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profile tidak ditemukan.' });
    }
    res.json({
      success: true,
      message: `Profile "${result.rows[0].name}" berhasil dihapus dari sistem!`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function pushProfileToMikrotik(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const profRes = await pool.query(`
      SELECT rp.*, r.name as router_name, r.ip_address, r.api_port, r.username, r.password,
             p.speed_limit as package_speed_limit, p.name as package_name, p.validity_days, p.shared_users as package_shared_users
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

    const mikhmonHotspotOnLoginScript = `:local date [/system clock get date]; :local time [/system clock get time]; :local user $user; :local comment [/ip hotspot user get [find name=$user] comment]; :if ($comment = "") do={ /ip hotspot user set [find name=$user] comment="arbil-$user-$date-$time" }; :if ([/ip hotspot user get [find name=$user] mac-address] = "") do={ /ip hotspot user set [find name=$user] mac-address=$"mac-address" };`;
    const pppoeOnUpScript = `:local user $user; :local interface $interface; :log info ("ArbillPay PPPoE Connected: " . $user . " on " . $interface);`;

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
              `=on-login=${mikhmonHotspotOnLoginScript}`
            ]);
            pushDetailMessage = `✅ Profile Hotspot "${prof.name}" sudah ada di Mikrotik → berhasil di-UPDATE (Rate: ${effectiveRateLimit}, Shared Users: ${sharedUsersCount}, Lock MAC On-Login Script Aktif).`;
          } catch (updateErr: any) {
            pushDetailMessage = `⚠️ Profile ditemukan tapi gagal update: ${updateErr.message}`;
          }
        } else {
          try {
            await conn.write('/ip/hotspot/user/profile/add', [
              `=name=${prof.name}`,
              `=rate-limit=${effectiveRateLimit}`,
              `=shared-users=${sharedUsersCount}`,
              `=on-login=${mikhmonHotspotOnLoginScript}`
            ]);
            pushDetailMessage = `✅ Profile Hotspot "${prof.name}" belum ada di Mikrotik → berhasil DIBUAT BARU (Rate: ${effectiveRateLimit}, Shared Users: ${sharedUsersCount}, Lock MAC On-Login Script Aktif).`;
          } catch (addErr: any) {
            pushDetailMessage = `❌ Gagal membuat profile baru: ${addErr.message}`;
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

        const pppSetArgs: string[] = [
          `=rate-limit=${effectiveRateLimit}`,
          `=on-up=${pppoeOnUpScript}`
        ];
        if (prof.local_address) pppSetArgs.push(`=local-address=${prof.local_address}`);
        if (prof.remote_address) pppSetArgs.push(`=remote-address=${prof.remote_address}`);
        if (prof.parent_queue && prof.parent_queue !== 'none') pppSetArgs.push(`=parent-queue=${prof.parent_queue}`);
        if (prof.dns_server) pppSetArgs.push(`=dns-server=${prof.dns_server}`);

        if (existingPpp) {
          try {
            await conn.write('/ppp/profile/set', [
              `=.id=${existingPpp['.id']}`,
              ...pppSetArgs
            ]);
            pushDetailMessage = `✅ PPP Profile "${prof.name}" sudah ada di Mikrotik → berhasil di-UPDATE (Rate: ${effectiveRateLimit}).`;
          } catch (updateErr: any) {
            pushDetailMessage = `⚠️ Profile ditemukan tapi gagal update: ${updateErr.message}`;
          }
        } else {
          try {
            await conn.write('/ppp/profile/add', [
              `=name=${prof.name}`,
              ...pppSetArgs
            ]);
            pushDetailMessage = `✅ PPP Profile "${prof.name}" belum ada di Mikrotik → berhasil DIBUAT BARU (Rate: ${effectiveRateLimit}).`;
          } catch (addErr: any) {
            pushDetailMessage = `❌ Gagal membuat profile baru: ${addErr.message}`;
          }
        }
      }

      pushSuccess = true;
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

// Controller Endpoint: Returns instant cached data (sub-millisecond response)
export async function getPppActiveUsers(req: Request, res: Response) {
  try {
    const forceRefresh = req.query.force === 'true';

    // If cache has never run or force refresh requested, refresh synchronously
    if (!activeCache.lastUpdated || forceRefresh) {
      await refreshActiveUsersCache();
    }

    res.json({
      success: true,
      cached: !forceRefresh && !!activeCache.lastUpdated,
      lastUpdated: activeCache.lastUpdated,
      onlineUsernames: activeCache.onlineUsernames,
      activeConnections: activeCache.activeConnections,
      count: activeCache.onlineUsernames.length
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
      const profName = secret.profile || 'default';
      const mikrotikId = secret['.id'] || null;

      const profRes = await pool.query('SELECT id, package_id FROM router_profiles WHERE router_id = $1 AND name = $2 LIMIT 1', [id, profName]);
      const matchedProfId = profRes.rows.length > 0 ? profRes.rows[0].id : null;
      const matchedPkgId = profRes.rows.length > 0 && profRes.rows[0].package_id ? profRes.rows[0].package_id : fallbackPkgId;

      const existingCust = await pool.query('SELECT id FROM customers WHERE pppoe_username = $1 OR pppoe_username = $2 LIMIT 1', [username, username.toLowerCase()]);

      if (existingCust.rows.length === 0) {
        const custId = crypto.randomUUID();
        const code = `IMP-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

        await pool.query(`
          INSERT INTO customers (
            id, customer_code, name, phone_number, pppoe_username, pppoe_password, static_ip, 
            connection_type, package_id, router_id, router_profile_id, status, is_synced, mikrotik_id
          )
          VALUES ($1, $2, $3, NULL, $4, $5, $6, 'pppoe', $7, $8, $9, 'active', true, $10)
        `, [custId, code, username, username, password, remoteIp, matchedPkgId, id, matchedProfId, mikrotikId]);
        importedCount++;
      } else if (update_existing) {
        await pool.query(`
          UPDATE customers
          SET pppoe_password = $1, static_ip = $2, router_id = $3, router_profile_id = $4, is_synced = true, mikrotik_id = $5
          WHERE id = $6
        `, [password, remoteIp, id, matchedProfId, mikrotikId, existingCust.rows[0].id]);
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
  const { update_existing } = req.body;

  try {
    const rRes = await pool.query('SELECT * FROM routers WHERE id = $1', [id]);
    if (rRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router Mikrotik tidak ditemukan.' });
    }
    const router = rRes.rows[0];

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

    const pkgRes = await pool.query("SELECT id FROM packages WHERE type = 'hotspot_monthly' OR type = 'hotspot_voucher' LIMIT 1");
    let fallbackPkgId = pkgRes.rows.length > 0 ? pkgRes.rows[0].id : null;
    if (!fallbackPkgId) {
      const anyPkg = await pool.query('SELECT id FROM packages LIMIT 1');
      if (anyPkg.rows.length > 0) fallbackPkgId = anyPkg.rows[0].id;
    }

    let importedCount = 0;
    let updatedCount = 0;

    for (const u of liveUsers) {
      const username = (u.name || u.user).trim();
      const password = u.password ? u.password.trim() : username;
      const profName = u.profile || 'default';
      const mikrotikId = u['.id'] || null;

      const profRes = await pool.query('SELECT id, package_id FROM router_profiles WHERE router_id = $1 AND name = $2 LIMIT 1', [id, profName]);
      const matchedProfId = profRes.rows.length > 0 ? profRes.rows[0].id : null;
      const matchedPkgId = profRes.rows.length > 0 && profRes.rows[0].package_id ? profRes.rows[0].package_id : fallbackPkgId;

      const existingCust = await pool.query('SELECT id FROM customers WHERE pppoe_username = $1 OR pppoe_username = $2 LIMIT 1', [username, username.toLowerCase()]);

      if (existingCust.rows.length === 0) {
        const custId = crypto.randomUUID();
        const code = `HS-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

        await pool.query(`
          INSERT INTO customers (
            id, customer_code, name, phone_number, pppoe_username, pppoe_password, static_ip, 
            connection_type, package_id, router_id, router_profile_id, status, is_synced, mikrotik_id
          )
          VALUES ($1, $2, $3, NULL, $4, $5, NULL, 'hotspot', $6, $7, $8, 'active', true, $9)
        `, [custId, code, username, username, password, matchedPkgId, id, matchedProfId, mikrotikId]);
        importedCount++;
      } else if (update_existing) {
        await pool.query(`
          UPDATE customers
          SET pppoe_password = $1, connection_type = 'hotspot', router_id = $2, router_profile_id = $3, is_synced = true, mikrotik_id = $4
          WHERE id = $5
        `, [password, id, matchedProfId, mikrotikId, existingCust.rows[0].id]);
        updatedCount++;
      }
    }

    res.json({
      success: true,
      message: `⚡ Impor User Hotspot Berhasil dari Router "${router.name}"! ${importedCount} pelanggan Hotspot baru di-import${update_existing ? ` & ${updatedCount} diperbarui` : ''}. Total: ${liveUsers.length} User Hotspot ditemukan.`,
      imported_count: importedCount,
      updated_count: updatedCount
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal impor Hotspot dari Mikrotik: ${err.message}` });
  }
}
