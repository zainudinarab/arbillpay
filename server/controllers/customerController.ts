import { Request, Response } from 'express';
import { pool } from '../config/db.js';
import { getAllCustomers, createCustomer, deleteCustomer } from '../models/customerModel.js';
import { RouterOSAPI } from 'node-routeros';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function listCustomers(req: Request, res: Response) {
  try {
    const customers = await getAllCustomers();
    res.json({ success: true, customers });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function addCustomer(req: Request, res: Response) {
  const { name, package_id, router_id, pppoe_username, pppoe_password, static_ip, router_profile_id } = req.body;

  if (!name || !package_id) {
    return res.status(400).json({ success: false, message: 'Nama dan Paket Internet wajib diisi.' });
  }

  try {
    const { customer, code } = await createCustomer(req.body);

    let livePushNote = '';
    if (router_id && pppoe_username && pppoe_password) {
      try {
        const rRes = await pool.query('SELECT * FROM routers WHERE id = $1', [router_id]);
        if (rRes.rows.length > 0) {
          const router = rRes.rows[0];
          const conn = new RouterOSAPI({
            host: router.ip_address,
            port: router.api_port || 8728,
            user: router.username || 'admin',
            password: router.password || '',
            timeout: 8
          });
          await conn.connect();

          let profName = 'default';
          if (router_profile_id) {
            const profRes = await pool.query('SELECT name FROM router_profiles WHERE id = $1', [router_profile_id]);
            if (profRes.rows.length > 0) profName = profRes.rows[0].name;
          }

          const secretArgs = [
            `=name=${pppoe_username.trim()}`,
            `=password=${pppoe_password.trim()}`,
            `=service=pppoe`,
            `=profile=${profName}`,
            `=comment=arbil-cust-${code}`
          ];
          if (static_ip) secretArgs.push(`=remote-address=${static_ip.trim()}`);

          await conn.write('/ppp/secret/add', secretArgs);
          livePushNote = ` (Berhasil dipush ke Router Mikrotik "${router.name}")`;
          conn.close();
        }
      } catch (e: any) {
        livePushNote = ` (Catatan Mikrotik: ${e.message})`;
      }
    }

    res.json({
      success: true,
      message: `Pelanggan PPPoE "${name}" (${code}) berhasil didaftarkan!${livePushNote}`,
      customer
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function editCustomer(req: Request, res: Response) {
  const { id } = req.params;
  const { 
    user_id, customer_code, name, phone_number, address, dusun, desa, kecamatan, kabupaten, provinsi, connection_type, 
    pppoe_username, pppoe_password, static_ip, installation_date,
    expired_at, grace_until, odp_port, sn_onu, power_laser, teknisi,
    latitude, longitude, maps_url,
    package_id, router_id, router_profile_id, status 
  } = req.body;

  if (!name || !package_id) {
    return res.status(400).json({ success: false, message: 'Nama dan Paket Internet wajib diisi.' });
  }

  try {
    const lat = latitude ? parseFloat(latitude) : null;
    const lng = longitude ? parseFloat(longitude) : null;
    const mapUrl = maps_url || (lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null);

    const result = await pool.query(`
      UPDATE customers
      SET user_id = COALESCE($1, user_id),
          customer_code = COALESCE($2, customer_code),
          name = $3,
          phone_number = $4,
          address = $5,
          dusun = $6,
          desa = $7,
          kecamatan = $8,
          kabupaten = $9,
          provinsi = $10,
          connection_type = $11,
          pppoe_username = $12,
          pppoe_password = COALESCE($13, pppoe_password),
          static_ip = $14,
          installation_date = $15,
          expired_at = $16,
          grace_until = $17,
          odp_port = $18,
          sn_onu = $19,
          power_laser = $20,
          teknisi = $21,
          latitude = $22,
          longitude = $23,
          maps_url = $24,
          package_id = $25,
          router_id = $26,
          router_profile_id = $27,
          status = $28,
          is_synced = true
      WHERE id = $29
      RETURNING id, user_id, customer_code, name, phone_number, pppoe_username, latitude, longitude, maps_url, dusun, desa, kecamatan, kabupaten, provinsi, status
    `, [
      user_id || null, customer_code || null, name.trim(), phone_number?.trim() || null, address?.trim() || null,
      dusun?.trim() || null, desa?.trim() || null, kecamatan?.trim() || null, kabupaten?.trim() || null, provinsi?.trim() || null,
      connection_type || 'pppoe', pppoe_username?.trim() || null, pppoe_password?.trim() || null,
      static_ip?.trim() || null, installation_date || null, expired_at || null, grace_until || null,
      odp_port?.trim() || null, sn_onu?.trim() || null, power_laser?.trim() || null, teknisi?.trim() || null,
      lat, lng, mapUrl,
      package_id, router_id || null, router_profile_id || null, status || 'active', id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `Data pelanggan "${name}" berhasil diperbarui!`,
      customer: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateLocation(req: Request, res: Response) {
  const { id } = req.params;
  const { latitude, longitude, maps_url } = req.body;

  try {
    const lat = latitude !== undefined && latitude !== null && latitude !== '' ? parseFloat(latitude) : null;
    const lng = longitude !== undefined && longitude !== null && longitude !== '' ? parseFloat(longitude) : null;
    const mapUrl = maps_url || (lat !== null && lng !== null ? `https://www.google.com/maps?q=${lat},${lng}` : null);

    const result = await pool.query(`
      UPDATE customers 
      SET latitude = $1, longitude = $2, maps_url = $3 
      WHERE id = $4 
      RETURNING id, name, latitude, longitude, maps_url
    `, [lat, lng, mapUrl, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `📍 Lokasi titik koordinat "${result.rows[0].name}" (${lat ?? '-'}, ${lng ?? '-'}) berhasil disimpan!`,
      customer: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function createUserAccount(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const custRes = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
    if (custRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Data pelanggan tidak ditemukan.' });
    }

    const c = custRes.rows[0];
    const username = (c.pppoe_username || c.customer_code || `user_${Date.now().toString(36)}`).trim().toLowerCase();
    const rawPhone = c.phone_number?.trim() || null;
    const rawEmail = c.email?.trim().toLowerCase() || `${username}@arbil.net`;
    const plainPass = c.pppoe_password || rawPhone || '123456';
    const passwordHash = await bcrypt.hash(plainPass, 10);

    let userId = c.user_id;

    if (!userId) {
      const uRes = await pool.query(`
        SELECT id FROM users 
        WHERE username = $1 OR (phone_number IS NOT NULL AND phone_number = $2) OR email = $3 
        LIMIT 1
      `, [username, rawPhone, rawEmail]);
      if (uRes.rows.length > 0) {
        userId = uRes.rows[0].id;
      }
    }

    if (!userId) {
      const newId = crypto.randomUUID();
      const newU = await pool.query(`
        INSERT INTO users (id, username, name, email, phone_number, role, password_hash)
        VALUES ($1, $2, $3, $4, $5, 'pelanggan', $6)
        RETURNING id, username, name, email
      `, [newId, username, c.name, rawEmail, rawPhone, passwordHash]);
      userId = newU.rows[0].id;
    }

    await pool.query('UPDATE customers SET user_id = $1 WHERE id = $2', [userId, id]);

    res.json({
      success: true,
      message: `🔑 Akun User Login Member Portal berhasil dibuat & dihubungkan ke "${c.name}"! Username: ${username}, Password: ${plainPass}`,
      user_id: userId,
      username,
      password: plainPass
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function payCustomerBill(req: Request, res: Response) {
  const { id } = req.params;
  const { payment_method } = req.body;

  try {
    const custRes = await pool.query(`
      SELECT c.*, p.name as package_name, p.price as package_price, p.validity_days, p.grace_period_days
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      WHERE c.id = $1
    `, [id]);

    if (custRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan.' });
    }

    const c = custRes.rows[0];
    const vDays = c.validity_days || 30;
    const gDays = c.grace_period_days || 5;

    await pool.query(`
      UPDATE invoices 
      SET status = 'paid', paid_at = CURRENT_TIMESTAMP, payment_method = $1 
      WHERE customer_id = $2 AND status = 'pending'
    `, [payment_method || 'Kasir / Tunai', id]);

    const baseDate = (c.expired_at && new Date(c.expired_at) > new Date()) 
      ? new Date(c.expired_at) 
      : new Date();

    const newExpDate = new Date(baseDate);
    newExpDate.setDate(newExpDate.getDate() + vDays);

    const newGraceDate = new Date(newExpDate);
    newGraceDate.setDate(newGraceDate.getDate() + gDays);

    const formattedExp = newExpDate.toISOString().split('T')[0];
    const formattedGrace = newGraceDate.toISOString().split('T')[0];

    await pool.query(`
      UPDATE customers 
      SET expired_at = $1, grace_until = $2, status = 'active' 
      WHERE id = $3
    `, [formattedExp, formattedGrace, id]);

    res.json({
      success: true,
      message: `🎉 Tagihan pelanggan "${c.name}" berhasil DILUNASI! Masa aktif diperpanjang +${vDays} hari hingga ${formattedExp}.`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function removeCustomer(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const customer = await deleteCustomer(id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan.' });
    }
    res.json({
      success: true,
      message: `Pelanggan "${customer.name}" berhasil dihapus!`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function checkPhone(req: Request, res: Response) {
  const { phone_number, userId } = req.body;

  if (!phone_number) {
    return res.status(400).json({ success: false, message: 'Nomor HP wajib disertakan.' });
  }

  try {
    const cleanPhone = phone_number.trim();
    
    const alreadyLinked = await pool.query(`
      SELECT c.id, c.name, c.connection_type, c.status, p.name as package_name, p.price as package_price
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      WHERE c.user_id = $1 OR c.phone_number = $2 AND c.user_id = $1
      LIMIT 1
    `, [userId, cleanPhone]);

    if (alreadyLinked.rows.length > 0) {
      return res.json({
        success: true,
        isLinked: true,
        customer: alreadyLinked.rows[0]
      });
    }

    const unlinkedMatch = await pool.query(`
      SELECT c.id, c.name, c.phone_number, c.connection_type, c.status, p.name as package_name, p.price as package_price
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      WHERE c.phone_number = $1 AND (c.user_id IS NULL OR c.user_id = '')
      LIMIT 1
    `, [cleanPhone]);

    if (unlinkedMatch.rows.length > 0) {
      const foundCust = unlinkedMatch.rows[0];
      if (userId) {
        // Auto-link customer to user_id directly in database!
        await pool.query('UPDATE customers SET user_id = $1 WHERE id = $2', [userId, foundCust.id]);
        foundCust.user_id = userId;
      }
      return res.json({
        success: true,
        isLinked: true,
        matchFound: true,
        autoLinked: Boolean(userId),
        customer: foundCust
      });
    }

    return res.json({
      success: true,
      isLinked: false,
      matchFound: false
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function checkMyStatus(req: Request, res: Response) {
  const { ids = [], usernames = [], phone_numbers = [] } = req.body;

  try {
    const cleanIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
    const cleanUsernames = Array.isArray(usernames) ? usernames.filter(Boolean) : [];
    const cleanPhones = Array.isArray(phone_numbers) ? phone_numbers.filter(Boolean) : [];

    if (cleanIds.length === 0 && cleanUsernames.length === 0 && cleanPhones.length === 0) {
      return res.json({ success: true, customers: [] });
    }

    const result = await pool.query(`
      SELECT c.id, c.name, c.phone_number, c.pppoe_username, c.connection_type, c.status,
             p.name as package_name, p.price as package_price, p.speed_limit, c.created_at
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      WHERE c.id = ANY($1::text[]) 
         OR c.pppoe_username = ANY($2::text[]) 
         OR c.phone_number = ANY($3::text[])
      ORDER BY c.created_at DESC
    `, [cleanIds, cleanUsernames, cleanPhones]);

    return res.json({
      success: true,
      customers: result.rows
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function linkPhone(req: Request, res: Response) {
  const { customerId, userId, phone_number } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID ArabPay wajib disertakan.' });
  }

  try {
    let result;
    if (customerId) {
      result = await pool.query(`
        UPDATE customers SET user_id = $1 WHERE id = $2 RETURNING id, name, phone_number, connection_type, status
      `, [userId, customerId]);
    } else if (phone_number) {
      result = await pool.query(`
        UPDATE customers SET user_id = $1 WHERE phone_number = $2 RETURNING id, name, phone_number, connection_type, status
      `, [userId, phone_number.trim()]);
    }

    if (!result || result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Data pelanggan tidak ditemukan untuk dihubungkan.' });
    }

    res.json({
      success: true,
      message: `Selamat! Akun ArabPay Anda berhasil dihubungkan dengan Pelanggan RT/RW Net "${result.rows[0].name}"!`,
      customer: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function syncCustomerToMikrotik(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const cRes = await pool.query(`
      SELECT c.*, r.name as router_name, r.ip_address, r.api_port, r.username as r_user, r.password as r_pass,
             rp.name as profile_name
      FROM customers c
      LEFT JOIN routers r ON c.router_id = r.id
      LEFT JOIN router_profiles rp ON c.router_profile_id = rp.id
      WHERE c.id = $1
    `, [id]);

    if (cRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan.' });
    }

    const cust = cRes.rows[0];
    if (!cust.router_id || !cust.ip_address) {
      return res.status(400).json({ success: false, message: 'Pelanggan belum dihubungkan ke Router Mikrotik.' });
    }
    if (!cust.pppoe_username) {
      return res.status(400).json({ success: false, message: 'Username pelanggan masih kosong.' });
    }

    const conn = new RouterOSAPI({
      host: cust.ip_address,
      port: cust.api_port || 8728,
      user: cust.r_user || 'admin',
      password: cust.r_pass || '',
      timeout: 8
    });
    await conn.connect();

    const profName = cust.profile_name || 'default';
    const isHotspot = cust.connection_type === 'hotspot';
    const targetPrintCmd = isHotspot ? '/ip/hotspot/user/print' : '/ppp/secret/print';
    const targetSetCmd = isHotspot ? '/ip/hotspot/user/set' : '/ppp/secret/set';
    const targetAddCmd = isHotspot ? '/ip/hotspot/user/add' : '/ppp/secret/add';

    const itemsList: any = await conn.write(targetPrintCmd);
    const existingItem = Array.isArray(itemsList) 
      ? itemsList.find((s: any) => (cust.mikrotik_id && s['.id'] === cust.mikrotik_id) || (s.name && s.name.trim().toLowerCase() === cust.pppoe_username.trim().toLowerCase()) || (s.user && s.user.trim().toLowerCase() === cust.pppoe_username.trim().toLowerCase()))
      : null;

    const userArgs = [
      `=name=${cust.pppoe_username.trim()}`,
      `=password=${cust.pppoe_password || cust.pppoe_username}`,
      `=profile=${profName}`,
      `=comment=arbil-cust-${cust.customer_code || cust.id.substring(0, 5)}`
    ];
    if (!isHotspot && cust.static_ip) userArgs.push(`=remote-address=${cust.static_ip.trim()}`);

    let activeMikrotikId = cust.mikrotik_id;

    if (existingItem) {
      activeMikrotikId = existingItem['.id'];
      await conn.write(targetSetCmd, [
        `=.id=${existingItem['.id']}`,
        ...userArgs
      ]);
    } else {
      await conn.write(targetAddCmd, userArgs);
      try {
        const rePrint: any = await conn.write(targetPrintCmd);
        if (Array.isArray(rePrint)) {
          const created = rePrint.find((s: any) => (s.name && s.name.trim().toLowerCase() === cust.pppoe_username.trim().toLowerCase()) || (s.user && s.user.trim().toLowerCase() === cust.pppoe_username.trim().toLowerCase()));
          if (created) activeMikrotikId = created['.id'];
        }
      } catch (e) {}
    }
    conn.close();

    await pool.query('UPDATE customers SET is_synced = true, mikrotik_id = $1 WHERE id = $2', [activeMikrotikId, id]);

    res.json({
      success: true,
      message: `⚡ Berhasil Sync! Akun ${isHotspot ? 'Hotspot' : 'PPPoE'} "${cust.pppoe_username}" (ID: ${activeMikrotikId || 'Mikrotik'}) diperbarui ke Router "${cust.router_name}".`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal Sync Mikrotik: ${err.message}` });
  }
}

export async function disconnectCustomerPpp(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const cRes = await pool.query(`
      SELECT c.*, r.name as router_name, r.ip_address, r.api_port, r.username as r_user, r.password as r_pass
      FROM customers c
      LEFT JOIN routers r ON c.router_id = r.id
      WHERE c.id = $1
    `, [id]);

    if (cRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan.' });
    }

    const cust = cRes.rows[0];
    if (!cust.pppoe_username) {
      return res.status(400).json({ success: false, message: 'Username pelanggan kosong.' });
    }

    let disconnectedCount = 0;
    const isHotspot = cust.connection_type === 'hotspot';
    const activePrintCmd = isHotspot ? '/ip/hotspot/active/print' : '/ppp/active/print';
    const activeRemoveCmd = isHotspot ? '/ip/hotspot/active/remove' : '/ppp/active/remove';

    const routersToQuery = cust.router_id 
      ? [{ id: cust.router_id, ip_address: cust.ip_address, api_port: cust.api_port, r_user: cust.r_user, r_pass: cust.r_pass, router_name: cust.router_name }]
      : (await pool.query('SELECT *, username as r_user, password as r_pass, name as router_name FROM routers')).rows;

    for (const r of routersToQuery) {
      try {
        const conn = new RouterOSAPI({
          host: r.ip_address,
          port: r.api_port || 8728,
          user: r.r_user || 'admin',
          password: r.r_pass || '',
          timeout: 6
        });
        await conn.connect();
        const activeList: any = await conn.write(activePrintCmd);
        if (Array.isArray(activeList)) {
          const targetUsername = (cust.pppoe_username || '').trim().toLowerCase();
          const activeSess = activeList.find((act: any) => {
            const actUser = (act.name || act.user || '').trim().toLowerCase();
            return actUser === targetUsername || (cust.mikrotik_id && act['.id'] === cust.mikrotik_id);
          });
          if (activeSess && activeSess['.id']) {
            await conn.write(activeRemoveCmd, [`=.id=${activeSess['.id']}`]);
            disconnectedCount++;
          }
        }
        conn.close();
      } catch (e) {}
    }

    if (disconnectedCount > 0) {
      res.json({
        success: true,
        message: `🔌 Disconnect Berhasil! Sesi koneksi aktif "${cust.pppoe_username}" diputuskan dari Mikrotik agar dapat terhubung kembali.`
      });
    } else {
      res.json({
        success: true,
        message: `Sesi koneksi aktif "${cust.pppoe_username}" sudah tidak ditemukan di Mikrotik (Offline).`
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal Disconnect: ${err.message}` });
  }
}
