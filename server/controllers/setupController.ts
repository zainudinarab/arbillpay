import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

export const getSetupStatus = async (req: Request, res: Response) => {
  try {
    let clientId = '';
    let clientSecret = '';
    let ownerUserId = '';
    let ownerPhone = '';
    let hasDbConfig = false;

    try {
      const { pool } = await import('../config/db.js');
      if (pool) {
        hasDbConfig = true;
        const resSettings = await pool.query(
          "SELECT key, value FROM system_settings WHERE key IN ('arabpay_client_id', 'arabpay_client_secret', 'arabpay_owner_user_id', 'arabpay_owner_phone', 'app_installed')"
        );
        for (const row of resSettings.rows) {
          if (row.key === 'arabpay_client_id') clientId = row.value;
          if (row.key === 'arabpay_client_secret') clientSecret = row.value;
          if (row.key === 'arabpay_owner_user_id') ownerUserId = row.value;
          if (row.key === 'arabpay_owner_phone') ownerPhone = row.value;
        }
      }
    } catch (e) {}

    // Fallback ke .env hanya jika DB tidak terhubung
    if (!hasDbConfig) {
      clientId = process.env.ARABPAY_CLIENT_ID || '';
      clientSecret = process.env.ARABPAY_CLIENT_SECRET || '';
      ownerUserId = process.env.ARABPAY_OWNER_USER_ID || '';
      ownerPhone = process.env.ARABPAY_OWNER_PHONE || '';
    }

    // Check if installed (has valid client ID & Secret)
    const isInstalled = !!(clientId && clientSecret && clientId !== 'AP_YOUR_CLIENT_ID_HERE' && !clientId.includes('YOUR_CLIENT_ID'));

    return res.json({
      installed: isInstalled,
      client_id: clientId || '',
      owner_user_id: ownerUserId || '',
      owner_phone: ownerPhone || '',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const verifyArabPay = async (req: Request, res: Response) => {
  try {
    const { client_id, client_secret, panel_url } = req.body;
    if (!client_id || !client_secret) {
      return res.status(400).json({ error: 'Client ID dan Client Secret wajib diisi' });
    }

    const arabpayBaseUrl = (panel_url || process.env.ARABPAY_PANEL_URL || 'https://arabpay.my.id').replace(/\/$/, '');
    
    // Fetch Client Info from ArabPay Server
    const checkUrl = `${arabpayBaseUrl}/api/v1/oauth/client-info?client_id=${encodeURIComponent(client_id.trim())}`;
    const arabpayRes = await fetch(checkUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!arabpayRes.ok) {
      const errText = await arabpayRes.text();
      return res.status(400).json({
        valid: false,
        error: `Gagal memverifikasi ke ArabPay Server (${arabpayRes.status}): ${errText || 'Client ID tidak ditemukan'}`
      });
    }

    const clientData = await arabpayRes.json();

    return res.json({
      valid: true,
      client_id: clientData.client_id || client_id,
      client_name: clientData.client_name || 'Merchant Client',
      owner_user_id: clientData.user_id || clientData.owner_user_id || '019f74af9fcdWDgDxM8g',
      owner_phone: clientData.owner_phone || '',
      owner_name: clientData.owner_name || '',
    });
  } catch (err: any) {
    console.error('[SETUP VERIFY ERROR]', err);
    return res.status(500).json({
      valid: false,
      error: `Koneksi ke ArabPay Server gagal: ${err.message}`
    });
  }
};

export const saveSetupConfig = async (req: Request, res: Response) => {
  try {
    const { client_id, client_secret, panel_url, business_name, owner_name, owner_phone, owner_user_id, owner_email } = req.body;

    if (!client_id || !client_secret) {
      return res.status(400).json({ error: 'Client ID dan Client Secret wajib diisi' });
    }

    const cleanClientId = client_id.trim();
    const cleanClientSecret = client_secret.trim();
    const arabpayBaseUrl = (panel_url || process.env.ARABPAY_PANEL_URL || 'https://arabpay.my.id').replace(/\/$/, '');

    // 1. Verifikasi kredensial ke ArabPay Server untuk mendapatkan ID Owner asli
    let realOwnerUserId = (owner_user_id || '').trim();
    let realOwnerName = (owner_name || '').trim();
    let realOwnerPhone = (owner_phone || '').trim();

    try {
      const verifyRes = await fetch(`${arabpayBaseUrl}/api/v1/oauth/verify-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: cleanClientId, client_secret: cleanClientSecret })
      });
      if (verifyRes.ok) {
        const vData = await verifyRes.json();
        if (vData.owner_user_id && !vData.owner_user_id.startsWith('00000000')) {
          realOwnerUserId = vData.owner_user_id;
        }
        if (vData.owner_name && !realOwnerName) realOwnerName = vData.owner_name;
        if (vData.owner_phone && !realOwnerPhone) realOwnerPhone = vData.owner_phone;
      }
    } catch (e) {
      console.warn('[SETUP] ArabPay verify-credentials notice:', e);
    }

    if (!realOwnerUserId || realOwnerUserId.startsWith('00000000')) {
      realOwnerUserId = realOwnerPhone ? `AP-${realOwnerPhone}` : (process.env.ARABPAY_OWNER_USER_ID || '01a1admin00000000001');
    }

    // Set runtime environment variables
    process.env.ARABPAY_CLIENT_ID = cleanClientId;
    process.env.ARABPAY_CLIENT_SECRET = cleanClientSecret;
    process.env.VITE_ARABPAY_CLIENT_ID = cleanClientId;
    process.env.VITE_ARABPAY_CLIENT_SECRET = cleanClientSecret;
    if (panel_url) process.env.ARABPAY_PANEL_URL = panel_url;
    process.env.ARABPAY_OWNER_USER_ID = realOwnerUserId;
    if (realOwnerPhone) process.env.ARABPAY_OWNER_PHONE = realOwnerPhone;
    if (business_name) process.env.BUSINESS_NAME = business_name;

    // Update .env file on disk if exists
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');

      const updateEnvKey = (key: string, val: string) => {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${val}`);
        } else {
          envContent += `\n${key}=${val}`;
        }
      };

      updateEnvKey('ARABPAY_CLIENT_ID', cleanClientId);
      updateEnvKey('ARABPAY_CLIENT_SECRET', cleanClientSecret);
      updateEnvKey('VITE_ARABPAY_CLIENT_ID', cleanClientId);
      updateEnvKey('VITE_ARABPAY_CLIENT_SECRET', cleanClientSecret);
      if (panel_url) updateEnvKey('ARABPAY_PANEL_URL', panel_url);
      updateEnvKey('ARABPAY_OWNER_USER_ID', realOwnerUserId);
      if (realOwnerPhone) updateEnvKey('ARABPAY_OWNER_PHONE', realOwnerPhone);
      if (business_name) updateEnvKey('BUSINESS_NAME', business_name);

      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log('✅ [SETUP WIZARD] Updated .env configuration on disk successfully');
    }

    // Save to PostgreSQL database system_settings table & synchronize SINGLE OWNER
    try {
      const { pool } = await import('../config/db.js');
      if (pool) {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS system_settings (
            key VARCHAR(255) PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        const saveSetting = async (k: string, v: string) => {
          await pool.query(`
            INSERT INTO system_settings (key, value, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
          `, [k, v]);
        };

        await saveSetting('arabpay_client_id', cleanClientId);
        await saveSetting('arabpay_client_secret', cleanClientSecret);
        await saveSetting('arabpay_owner_user_id', realOwnerUserId);
        if (realOwnerPhone) await saveSetting('arabpay_owner_phone', realOwnerPhone);
        if (business_name) await saveSetting('business_name', business_name);
        await saveSetting('app_installed', 'true');

        console.log('✅ [SETTINGS/SETUP] Saved setup credentials into PostgreSQL database table system_settings');

        // ==============================================================================
        // ATURAN KETAT: OWNER HANYA BOLEH 1!
        // Update akun owner menjadi 1-satunya Super Admin resmi dengan AP-ID ArabPay
        // ==============================================================================
        const bcrypt = (await import('bcryptjs')).default;
        const oPass = req.body.owner_password || 'zainudinarab';
        const oHash = await bcrypt.hash(oPass, 10);
        const finalOwnerName = realOwnerName || business_name || 'Zainudin Arab (Owner)';
        const finalOwnerPhone = realOwnerPhone || '085746520724';
        const finalOwnerEmail = owner_email || 'ketua11@gmail.com';

        // 1. Turunkan seluruh owner lama menjadi pelanggan biasa
        await pool.query("UPDATE users SET role = 'pelanggan' WHERE role = 'owner'");

        // 2. Bersihkan akun dummy lawas / ID nil berpola '00000000%'
        await pool.query("UPDATE users SET arabpay_user_id = NULL WHERE arabpay_user_id LIKE '00000000%'");

        // 3. Cek apakah ada akun yang cocok untuk di-update menjadi Owner Tunggal (cocok via AP-ID, Email, ATAU Nomor HP)
        // Jika nomor HP / email tersebut sebelumnya terdaftar sebagai 'pelanggan', otomatis DI-UPDATE menjadi OWNER!
        const checkExistingOwner = await pool.query(
          `SELECT id, username, email, phone_number, arabpay_user_id, role FROM users
           WHERE arabpay_user_id = $1 
              OR id = $1 
              OR (email IS NOT NULL AND LOWER(email) = LOWER($2))
              OR (phone_number IS NOT NULL AND phone_number = $3)
           ORDER BY (
             CASE 
               WHEN arabpay_user_id = $1 THEN 1 
               WHEN id = $1 THEN 2 
               WHEN (email IS NOT NULL AND LOWER(email) = LOWER($2)) THEN 3 
               ELSE 4 
             END
           )
           LIMIT 1`,
          [realOwnerUserId, finalOwnerEmail, finalOwnerPhone]
        );

        let ownerTargetId = realOwnerUserId;
        if (checkExistingOwner.rows.length > 0) {
          ownerTargetId = checkExistingOwner.rows[0].id;
          await pool.query(
            `UPDATE users 
             SET role = 'owner',
                 arabpay_user_id = $1,
                 name = COALESCE(NULLIF($2, ''), name),
                 phone_number = COALESCE(NULLIF($3, ''), phone_number),
                 email = COALESCE(NULLIF($4, ''), email),
                 password_hash = COALESCE($5, password_hash)
             WHERE id = $6`,
            [realOwnerUserId, finalOwnerName, finalOwnerPhone, finalOwnerEmail, oHash, ownerTargetId]
          );
          console.log(`👑 [SETUP WIZARD] User "${checkExistingOwner.rows[0].username}" (sebelumnya: ${checkExistingOwner.rows[0].role}) sukses DI-UPDATE menjadi 1-satunya OWNER RESMI (AP-ID: ${realOwnerUserId})!`);
        } else {
          // Jika belum ada akun sama sekali atau tidak cocok, daftarkan 1 akun Owner Tunggal
          await pool.query(
            `INSERT INTO users (id, username, name, email, phone_number, arabpay_user_id, role, password_hash, password)
             VALUES ($1, 'zainudinarab', $2, $3, $4, $1, 'owner', $5, $6)
             ON CONFLICT (id) DO UPDATE SET
               role = 'owner',
               arabpay_user_id = EXCLUDED.arabpay_user_id,
               name = EXCLUDED.name,
               email = EXCLUDED.email,
               phone_number = EXCLUDED.phone_number`,
            [realOwnerUserId, finalOwnerName, finalOwnerEmail, finalOwnerPhone, oHash, oPass]
          );
          console.log(`👑 [SETUP WIZARD] User baru ${realOwnerUserId} sukses DIBUAT sebagai 1-satunya OWNER RESMI!`);
        }

        // 4. ATURAN KETAT: EMAIL & NOMOR HP TIDAK BOLEH ADA YANG SAMA (DUPLIKAT)!
        // Hapus akun lama lainnya yang memiliki Nomor HP atau Email yang sama dengan Owner agar tidak ada duplikasi data
        await pool.query(
          `DELETE FROM users 
           WHERE id != $1 
             AND (
               (email IS NOT NULL AND LOWER(email) = LOWER($2)) 
               OR (phone_number IS NOT NULL AND phone_number = $3)
             )`,
          [ownerTargetId, finalOwnerEmail, finalOwnerPhone]
        );

        // 5. Kunci keamanan final: Pastikan STRICTLY hanya 1 akun yang memegang role 'owner'
        await pool.query("UPDATE users SET role = 'pelanggan' WHERE role = 'owner' AND arabpay_user_id != $1", [realOwnerUserId]);
      }
    } catch (dbErr) {
      console.warn('PostgreSQL database save notice:', dbErr);
    }

    return res.json({
      success: true,
      message: 'Client Secret & Kredensial SSO ArabPay BERHASIL DIPERBARUI! Akun Owner telah diperbarui & disinkronkan (hanya 1 Owner aktif).',
      owner_user_id: realOwnerUserId,
      owner_name: realOwnerName || business_name || 'Zainudin Arab (Owner)',
      owner_phone: realOwnerPhone
    });
  } catch (err: any) {
    console.error('[SETUP SAVE ERROR]', err);
    return res.status(500).json({ error: err.message });
  }
};
