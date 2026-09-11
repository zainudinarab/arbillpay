import { pool } from '../config/db.js';
import { getFirestore } from '../config/firebase.js';

export async function syncFirestoreCustomersToPostgres() {
  const db = getFirestore();
  if (!db) {
    console.warn('[SYNC] Firebase Admin not available, skipping Firestore -> Postgres customer sync.');
    return { success: false, message: 'Firestore not available' };
  }

  try {
    const snap = await db.collection('customers').get();
    if (snap.empty) {
      console.log('[SYNC] No customer documents found in Firestore.');
      return { success: true, count: 0 };
    }

    const firestoreCustomers = snap.docs
      .filter(d => d.id !== '_init')
      .map(d => ({ id: d.id, ...d.data() }));

    console.log(`[SYNC] Found ${firestoreCustomers.length} customers in Cloud Firestore. Synchronizing to PostgreSQL...`);

    let syncedCount = 0;
    for (const c of firestoreCustomers as any[]) {
      const custId = c.id;
      const code = c.customer_code || custId;
      const name = c.name || 'Pelanggan';
      const phone = c.phone_number || null;
      const address = c.address || null;
      const connType = c.connection_type || 'pppoe';
      const pppUser = c.pppoe_username || null;
      const pppPass = c.pppoe_password || null;
      const staticIp = c.static_ip || null;
      const instDate = c.installation_date ? new Date(c.installation_date) : null;
      const expDate = c.expired_at ? new Date(c.expired_at) : null;
      const graceDate = c.grace_until ? new Date(c.grace_until) : null;
      const odpPort = c.odp_port || null;
      const snOnu = c.sn_onu || null;
      const powerLaser = c.power_laser ? parseFloat(c.power_laser) : null;
      const teknisi = c.teknisi || null;
      const lat = c.latitude ? parseFloat(c.latitude) : null;
      const lng = c.longitude ? parseFloat(c.longitude) : null;
      const mapUrl = c.maps_url || null;
      const pkgId = c.package_id || null;
      const rtrId = c.router_id || null;
      const profId = c.router_profile_id || null;
      const status = c.status || 'active';
      const isOnline = Boolean(c.is_online);
      const createdAt = c.created_at ? new Date(c.created_at) : new Date();

      // Check if package exists in PostgreSQL, if not set null to avoid FK error
      let validPkgId = null;
      if (pkgId) {
        const pkgRes = await pool.query('SELECT id FROM packages WHERE id = $1', [pkgId]);
        if (pkgRes.rows.length > 0) validPkgId = pkgId;
      }

      // Check if router exists in PostgreSQL
      let validRtrId = null;
      if (rtrId) {
        const rtrRes = await pool.query('SELECT id FROM routers WHERE id = $1', [rtrId]);
        if (rtrRes.rows.length > 0) validRtrId = rtrId;
      }

      // Check if profile exists in PostgreSQL
      let validProfId = null;
      if (profId) {
        const profRes = await pool.query('SELECT id FROM router_profiles WHERE id = $1', [profId]);
        if (profRes.rows.length > 0) validProfId = profId;
      }

      await pool.query(`
        INSERT INTO customers (
          id, customer_code, name, phone_number, address, dusun, desa, kecamatan, kabupaten, provinsi,
          connection_type, pppoe_username, pppoe_password, static_ip, installation_date, expired_at, grace_until,
          odp_port, sn_onu, power_laser, teknisi, latitude, longitude, maps_url,
          package_id, router_id, router_profile_id, status, is_online, is_synced, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22, $23, $24,
          $25, $26, $27, $28, $29, true, $30
        )
        ON CONFLICT (id) DO UPDATE SET
          customer_code = EXCLUDED.customer_code,
          name = EXCLUDED.name,
          phone_number = EXCLUDED.phone_number,
          address = EXCLUDED.address,
          dusun = EXCLUDED.dusun,
          desa = EXCLUDED.desa,
          kecamatan = EXCLUDED.kecamatan,
          kabupaten = EXCLUDED.kabupaten,
          provinsi = EXCLUDED.provinsi,
          connection_type = EXCLUDED.connection_type,
          pppoe_username = EXCLUDED.pppoe_username,
          pppoe_password = EXCLUDED.pppoe_password,
          static_ip = EXCLUDED.static_ip,
          installation_date = EXCLUDED.installation_date,
          expired_at = EXCLUDED.expired_at,
          grace_until = EXCLUDED.grace_until,
          odp_port = EXCLUDED.odp_port,
          sn_onu = EXCLUDED.sn_onu,
          power_laser = EXCLUDED.power_laser,
          teknisi = EXCLUDED.teknisi,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          maps_url = EXCLUDED.maps_url,
          package_id = EXCLUDED.package_id,
          router_id = EXCLUDED.router_id,
          router_profile_id = EXCLUDED.router_profile_id,
          status = EXCLUDED.status,
          is_online = EXCLUDED.is_online;
      `, [
        custId, code, name, phone, address, c.dusun || null, c.desa || null, c.kecamatan || null, c.kabupaten || null, c.provinsi || null,
        connType, pppUser, pppPass, staticIp, instDate, expDate, graceDate,
        odpPort, snOnu, powerLaser, teknisi, lat, lng, mapUrl,
        validPkgId, validRtrId, validProfId, status, isOnline, createdAt
      ]);

      syncedCount++;
    }

    console.log(`✅ [SYNC SUCCESS] Berhasil menyinkronkan ${syncedCount} pelanggan dari Cloud Firestore ke PostgreSQL!`);
    return { success: true, count: syncedCount };
  } catch (err: any) {
    console.error('[SYNC ERROR] Gagal menyinkronkan pelanggan dari Firestore ke PostgreSQL:', err.message);
    return { success: false, message: err.message };
  }
}

export async function syncFirestoreSettingsAndUsersToPostgres() {
  const db = getFirestore();
  const bcrypt = (await import('bcryptjs')).default;

  // 1. Sync Settings dari Firestore ke tabel system_settings di PostgreSQL
  try {
    let clientId: string | null = null;
    let clientSecret: string | null = null;
    let ownerUserId: string | null = null;

    if (db) {
      const settingsSnap = await db.collection('settings').doc('merchant_credentials').get();
      if (settingsSnap.exists) {
        const data = settingsSnap.data() || {};
        clientId = data.client_id || null;
        clientSecret = data.client_secret || null;
        ownerUserId = data.owner_user_id || null;
      }
    }

    // Fallback ke process.env jika Firestore belum terisi
    if (!clientId) clientId = process.env.ARABPAY_CLIENT_ID || null;
    if (!clientSecret) clientSecret = process.env.ARABPAY_CLIENT_SECRET || null;
    if (!ownerUserId) ownerUserId = process.env.ARABPAY_OWNER_USER_ID || '019f74af9fcdWDgDxM8g';

    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const saveSetting = async (k: string, v: string) => {
      await pool.query(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [k, v]);
    };

    if (clientId && clientSecret) {
      await saveSetting('arabpay_client_id', clientId);
      await saveSetting('arabpay_client_secret', clientSecret);
      if (ownerUserId) await saveSetting('arabpay_owner_user_id', ownerUserId);
      await saveSetting('app_installed', 'true');
      console.log('✅ [SYNC SUCCESS] Kredensial merchant berhasil disinkronkan ke tabel system_settings di PostgreSQL!');
    }
  } catch (err: any) {
    console.warn('[SYNC NOTICE] Gagal sync system_settings:', err.message);
  }

  // 2. Sync Koleksi USERS dari Firestore ke PostgreSQL
  try {
    if (db) {
      const usersSnap = await db.collection('users').get();
      for (const docSnap of usersSnap.docs) {
        const u = docSnap.data();
        const uId = docSnap.id;
        const username = (u.username || u.name || 'user').toLowerCase().trim();
        const name = u.name || 'User';
        const email = (u.email || `${username}@arabnet.local`).toLowerCase().trim();
        const phone = u.phone_number || null;
        const role = u.role || 'pelanggan';
        const passHash = u.password_hash || u.password || null;

        await pool.query(`
          INSERT INTO users (id, username, name, email, phone_number, role, password_hash, password)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            phone_number = EXCLUDED.phone_number,
            role = EXCLUDED.role,
            password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
            password = COALESCE(EXCLUDED.password, users.password)
        `, [uId, username, name, email, phone, role, passHash, u.password || null]);
      }
    }

    // Pastikan akun Owner default (zainudinarab) selalu ada di tabel users
    const ownerCheck = await pool.query("SELECT id FROM users WHERE role = 'owner' LIMIT 1");
    if (ownerCheck.rows.length === 0) {
      const defaultOwnerId = '019f74af9fcdWDgDxM8g';
      const defaultHash = await bcrypt.hash('zainudinarab', 10);
      await pool.query(`
        INSERT INTO users (id, username, name, email, phone_number, role, password_hash, password)
        VALUES ($1, $2, $3, $4, $5, 'owner', $6, 'zainudinarab')
        ON CONFLICT (id) DO UPDATE SET role = 'owner', password_hash = EXCLUDED.password_hash
      `, [defaultOwnerId, 'zainudinarab', 'Zainudin Arab (Owner)', 'ketua11@gmail.com', '085746520724', defaultHash]);
      console.log('👑 [SEED] Akun Owner (zainudinarab) berhasil dibuat di PostgreSQL users!');
    }
  } catch (err: any) {
    console.warn('[SYNC NOTICE] Gagal sync users:', err.message);
  }
}
