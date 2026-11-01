import net from 'net';
import { RouterOSAPI } from 'node-routeros';
import { pool } from '../config/db.js';
import { redisDel } from '../config/redis.js';
import { formatMikrotikPppComment, formatMikrotikHotspotComment } from '../utils/mikrotikComment.js';

export const testMikrotikConnection = async (host: string, port: number): Promise<{ success: boolean; message: string }> => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(4000);

    socket.on('connect', () => {
      socket.destroy();
      resolve({
        success: true,
        message: `⚡ Tes Socket API Berhasil! IP Router Mikrotik ${host}:${port} merespon koneksi API dengan lancar!`
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        success: false,
        message: `❌ Gagal terhubung ke Mikrotik IP ${host}:${port}: Connection Timeout (Waktu Habis). Pastikan IP/Port API Router (8728) aktif di IP -> Services Winbox.`
      });
    });

    socket.on('error', (err: any) => {
      socket.destroy();
      resolve({
        success: false,
        message: `❌ Gagal terhubung ke Mikrotik IP ${host}:${port}: ${err.message || 'Connection Refused'}`
      });
    });

    socket.connect(port, host);
  });
};

export const fetchRealMikrotikIdentity = async (host: string, port: number, user: string, pass: string) => {
  try {
    const conn = new RouterOSAPI({
      host: host,
      port: port,
      user: user || 'admin',
      password: pass || '',
      timeout: 6
    });

    await conn.connect();

    let identityName = '';
    try {
      const idRes: any = await conn.write('/system/identity/print');
      if (Array.isArray(idRes) && idRes.length > 0) {
        identityName = idRes[0].name || idRes[0]['system-identity'] || '';
      }
    } catch (e) {}

    let boardName = '';
    let version = '';
    try {
      const resRes: any = await conn.write('/system/resource/print');
      if (Array.isArray(resRes) && resRes.length > 0) {
        boardName = resRes[0]['board-name'] || resRes[0]['architecture-name'] || '';
        version = resRes[0].version ? `RouterOS v${resRes[0].version}` : '';
      }
    } catch (e) {}

    conn.close();
    return {
      connected: true,
      identity: identityName || `MikroTik-${host}`,
      board: boardName || 'MikroTik Hardware',
      version: version || 'RouterOS'
    };
  } catch (err: any) {
    return {
      connected: false,
      error: err.message || 'Gagal login autentikasi ke RouterOS API'
    };
  }
};

/**
 * ⚡ Otomatis Meng-unisolir Akun Pelanggan di Router MikroTik saat Tagihan Lunas
 * 1. Memulihkan profile PPP Secret / Hotspot User ke profil paket normal pelanggan.
 * 2. Memperbarui tanggal expired_at & grace_until di comment MikroTik.
 * 3. Memastikan secret diaktifkan (disabled=no).
 * 4. Memutus sesi aktif (disconnect) agar pelanggan langsung dial-up ulang dengan profil kecepatan normal.
 * 5. Menghapus IP pelanggan dari address-list ISOLIR-USERS jika ada.
 */
export async function autoUnisolirCustomerOnMikrotik(customerId: string): Promise<{ success: boolean; message: string }> {
  try {
    const cRes = await pool.query(`
      SELECT c.*, r.name as router_name, r.ip_address, r.api_port, r.username as r_user, r.password as r_pass,
             rp.name as profile_name, p.name as pkg_name, p.mikrotik_profile
      FROM customers c
      LEFT JOIN routers r ON c.router_id = r.id
      LEFT JOIN router_profiles rp ON c.router_profile_id = rp.id
      LEFT JOIN packages p ON c.package_id = p.id
      WHERE c.id = $1
    `, [customerId]);

    if (cRes.rows.length === 0) {
      return { success: false, message: 'Pelanggan tidak ditemukan' };
    }

    const cust = cRes.rows[0];
    if (!cust.pppoe_username) {
      return { success: false, message: 'Username pelanggan kosong' };
    }

    let routerId = cust.router_id;
    let routerIp = cust.ip_address;
    let routerPort = cust.api_port || 8728;
    let routerUser = cust.r_user || 'admin';
    let routerPass = cust.r_pass || '';
    let routerName = cust.router_name || 'Mikrotik';

    if (!routerId || !routerIp) {
      const defRtr = await pool.query('SELECT *, username as r_user, password as r_pass, name as router_name FROM routers ORDER BY created_at ASC LIMIT 1');
      if (defRtr.rows.length > 0) {
        const r = defRtr.rows[0];
        routerId = r.id;
        routerIp = r.ip_address;
        routerPort = r.api_port || 8728;
        routerUser = r.r_user || 'admin';
        routerPass = r.r_pass || '';
        routerName = r.name || 'Mikrotik';
      } else {
        return { success: false, message: 'Tidak ada Router MikroTik terdaftar' };
      }
    }

    // Tentukan profile aktif (pastikan bukan isolir/expired)
    let profName = cust.profile_name || cust.mikrotik_profile || cust.pkg_name;
    if (!profName || profName.toLowerCase().includes('expired') || profName.toLowerCase().includes('isolir')) {
      if (cust.package_id) {
        const pkgRes = await pool.query('SELECT mikrotik_profile, name FROM packages WHERE id = $1', [cust.package_id]);
        if (pkgRes.rows.length > 0) {
          profName = pkgRes.rows[0].mikrotik_profile || pkgRes.rows[0].name;
        }
      }
    }
    if (!profName || profName.toLowerCase().includes('expired') || profName.toLowerCase().includes('isolir')) {
      profName = 'default';
    }

    const isHotspot = cust.connection_type === 'hotspot';
    const commentValue = isHotspot 
      ? formatMikrotikHotspotComment(cust)
      : formatMikrotikPppComment({
          grace_until: cust.grace_until,
          expired_at: cust.expired_at,
          name: cust.name,
          customer_code: cust.customer_code,
          id: cust.id,
          profile_name: profName
        });

    const conn = new RouterOSAPI({
      host: routerIp,
      port: routerPort,
      user: routerUser,
      password: routerPass,
      timeout: 8
    });
    await conn.connect();

    if (!isHotspot) {
      // 1. PPPoE Secret: Update profile kembali normal, comment diperbarui, disabled=no
      const printRes: any = await conn.write('/ppp/secret/print');
      if (Array.isArray(printRes)) {
        const matchSec = printRes.find((s: any) => 
          (cust.mikrotik_id && s['.id'] === cust.mikrotik_id) || 
          (s.name && s.name.trim().toLowerCase() === cust.pppoe_username.trim().toLowerCase())
        );

        if (matchSec && matchSec['.id']) {
          const updateArgs = [
            `=.id=${matchSec['.id']}`,
            `=profile=${profName}`,
            `=comment=${commentValue}`,
            `=disabled=no`
          ];
          if (cust.static_ip) {
            updateArgs.push(`=remote-address=${cust.static_ip.trim()}`);
          }
          await conn.write('/ppp/secret/set', updateArgs);
          console.log(`⚡ [AUTO UNISOLIR] PPP Secret "${cust.pppoe_username}" dipulihkan ke profile "${profName}".`);
        }
      }

      // 2. Putus koneksi aktif agar dial-up ulang dan mendapatkan IP / profile normal segera
      try {
        const activeList: any = await conn.write('/ppp/active/print');
        if (Array.isArray(activeList)) {
          const matchAct = activeList.find((a: any) => 
            a.name && a.name.trim().toLowerCase() === cust.pppoe_username.trim().toLowerCase()
          );
          if (matchAct && matchAct['.id']) {
            await conn.write('/ppp/active/remove', [`=.id=${matchAct['.id']}`]);
            console.log(`⚡ [AUTO UNISOLIR] Sesi PPPoE aktif "${cust.pppoe_username}" diputus agar reconnect dengan profile normal.`);
          }
        }
      } catch (_) {}

      // 3. Bersihkan dari Firewall Address List ISOLIR-USERS jika ada
      try {
        const addrList: any = await conn.write('/ip/firewall/address-list/print');
        if (Array.isArray(addrList)) {
          const isolirEntries = addrList.filter((al: any) => 
            al.list === 'ISOLIR-USERS' && 
            (
              (al.comment && al.comment.toLowerCase().includes(cust.pppoe_username.toLowerCase())) ||
              (cust.static_ip && al.address === cust.static_ip.trim())
            )
          );
          for (const entry of isolirEntries) {
            if (entry['.id']) {
              await conn.write('/ip/firewall/address-list/remove', [`=.id=${entry['.id']}`]);
            }
          }
        }
      } catch (_) {}

    } else {
      // Hotspot: Update user profile, disabled=no, comment diperbarui
      const printRes: any = await conn.write('/ip/hotspot/user/print');
      if (Array.isArray(printRes)) {
        const matchUser = printRes.find((u: any) => 
          (cust.mikrotik_id && u['.id'] === cust.mikrotik_id) || 
          (u.name && u.name.trim().toLowerCase() === cust.pppoe_username.trim().toLowerCase())
        );

        if (matchUser && matchUser['.id']) {
          await conn.write('/ip/hotspot/user/set', [
            `=.id=${matchUser['.id']}`,
            `=profile=${profName}`,
            `=comment=${commentValue}`,
            `=disabled=no`
          ]);
        }
      }

      // Putus sesi hotspot aktif agar reconnect dengan profil baru
      try {
        const actList: any = await conn.write('/ip/hotspot/active/print');
        if (Array.isArray(actList)) {
          const matchAct = actList.find((a: any) => 
            a.user && a.user.trim().toLowerCase() === cust.pppoe_username.trim().toLowerCase()
          );
          if (matchAct && matchAct['.id']) {
            await conn.write('/ip/hotspot/active/remove', [`=.id=${matchAct['.id']}`]);
          }
        }
      } catch (_) {}
    }

    conn.close();

    // Hapus cache Redis daftar isolir
    if (routerId) {
      redisDel(`mikrotik:isolated_customers:${routerId}`).catch(() => {});
    }

    // Pastikan status di customers table = 'active'
    await pool.query("UPDATE customers SET status = 'active', is_synced = true WHERE id = $1", [cust.id]);

    console.log(`✅ [AUTO UNISOLIR SUCCESS] Pelanggan "${cust.name}" (${cust.pppoe_username}) berhasil di-unisolir di Router "${routerName}".`);
    return { success: true, message: `Berhasil unisolir ${cust.name}` };
  } catch (err: any) {
    console.warn(`⚠️ [AUTO UNISOLIR NOTICE] Pelanggan ${customerId}: ${err.message}`);
    return { success: false, message: err.message };
  }
}
