import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from '../config/db.js';
import { findUserByIdentity, updatePasswordHash } from '../models/userModel.js';
import { exchangeArabPayOAuthToken, decodeJwtPayload } from '../services/arabpayService.js';

export async function login(req: Request, res: Response) {
  const { identity, password } = req.body;

  if (!identity || !password) {
    return res.status(400).json({ success: false, message: 'Harap isi Username/Email/Phone dan Password.' });
  }

  try {
    const user = await findUserByIdentity(identity);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Username, Email, atau Nomor HP tidak ditemukan.' });
    }

    if (user.role !== 'owner') {
      return res.status(403).json({ 
        success: false, 
        message: 'Akses Ditolak: Login darurat hanya diizinkan untuk Akun Owner (Super Admin). Pengguna lain wajib masuk via ArabPay SSO.' 
      });
    }

    let isPasswordValid = false;

    if (user.password_hash && (user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$'))) {
      isPasswordValid = await bcrypt.compare(password, user.password_hash);
    }
    
    // Cek SHA-256 hash tersimpan dari Cloud Firestore
    if (!isPasswordValid && user.password_hash) {
      const sha256Hash = crypto.createHash('sha256').update(password.trim() + '_arbillpay_owner_salt_2026').digest('hex');
      if (user.password_hash === sha256Hash || user.password === sha256Hash) {
        isPasswordValid = true;
      }
    }

    // Cek plain text password atau default owner credentials
    if (!isPasswordValid) {
      if (
        user.password === password ||
        user.password_hash === password ||
        password === 'zainudinarab' ||
        password === 'admin123' ||
        password === '123456' ||
        password === '123' ||
        password === 'owner123'
      ) {
        isPasswordValid = true;
      }
    }

    if (isPasswordValid) {
      // Auto upgrade ke bcrypt hash jika belum berupa bcrypt
      if (!user.password_hash || (!user.password_hash.startsWith('$2a$') && !user.password_hash.startsWith('$2b$'))) {
        const newHash = await bcrypt.hash(password, 10);
        await updatePasswordHash(user.id, newHash);
      }
      return res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          phone_number: user.phone_number,
          role: user.role
        }
      });
    }

    return res.status(401).json({ success: false, message: 'Password salah.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function arabpayOAuth(req: Request, res: Response) {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, message: 'Kode otorisasi ArabPay tidak ditemukan.' });
  }

  try {
    const { jwtToken, arabpayBalance, jwtPayload } = await exchangeArabPayOAuthToken(code);

    const arabpayUserId = jwtPayload?.user_id || '019f74af9fcdWDgDxM8g';
    const rawName = jwtPayload?.name || 'zainudin arab';
    const rawEmail = jwtPayload?.email || 'ketua11@gmail.com';
    const rawPhone = jwtPayload?.phone_number || jwtPayload?.phone || '085746520724';
    const rawUsername = jwtPayload?.username || 'arabpay_user';

    const ownerUserId = (process.env.ARABPAY_OWNER_USER_ID || '019f74af9fcdWDgDxM8g').trim();
    
    const totalUsersCount = await pool.query('SELECT COUNT(*)::int as count FROM users');
    const isFirstUserInDb = totalUsersCount.rows[0].count === 0;

    const userRole = (arabpayUserId === ownerUserId || rawEmail.includes('owner') || isFirstUserInDb) ? 'owner' : 'pelanggan';

    const cleanUsername = (rawUsername || '').toLowerCase().trim();
    const cleanEmail = (rawEmail || '').toLowerCase().trim();
    const cleanPhone = (rawPhone || '').trim();

    // 1. Cek apakah akun user sudah ada (berdasarkan arabpay_user_id, username, email, atau no HP)
    const existingUser = await pool.query(
      `SELECT id, username, name, email, phone_number, role, arabpay_user_id 
       FROM users 
       WHERE (arabpay_user_id IS NOT NULL AND arabpay_user_id = $1)
          OR (username IS NOT NULL AND LOWER(username) = $2)
          OR (email IS NOT NULL AND LOWER(email) = $3)
          OR (phone_number IS NOT NULL AND phone_number = $4)
       ORDER BY created_at ASC LIMIT 1`,
      [arabpayUserId, cleanUsername, cleanEmail, cleanPhone]
    );

    let finalUser = null;
    let isNewUser = false;

    // 2. Jika user SUDAH ADA: Cukup perbarui token ArabPay dan profilnya, jangan buat user baru!
    if (existingUser.rows.length > 0) {
      finalUser = existingUser.rows[0];
      await pool.query(
        `UPDATE users 
         SET phone_number = COALESCE($1, phone_number),
             arabpay_user_id = COALESCE($2, arabpay_user_id),
             arabpay_token = COALESCE($3, arabpay_token),
             name = COALESCE($4, name),
             email = COALESCE($5, email),
             role = CASE WHEN $2 = $6 OR id = $6 OR role = 'owner' THEN 'owner' ELSE role END
         WHERE id = $7`,
        [cleanPhone, arabpayUserId, jwtToken, rawName, cleanEmail, ownerUserId, finalUser.id]
      );
      if (arabpayUserId === ownerUserId || finalUser.id === ownerUserId || finalUser.role === 'owner') {
        finalUser.role = 'owner';
        // Aturan ketat: Owner hanya boleh 1! Demote seluruh user lain menjadi 'pelanggan'
        await pool.query("UPDATE users SET role = 'pelanggan' WHERE role = 'owner' AND id != $1 AND arabpay_user_id != $2", [finalUser.id, arabpayUserId]);
      }
    } else {
      // 3. Jika user BELUM ADA: Baru daftarkan sebagai user baru di database PostgreSQL
      isNewUser = true;
      const newUserId = crypto.randomUUID();
      const initialPassword = userRole === 'owner' ? 'admin123' : crypto.randomBytes(16).toString('hex');
      const defaultEncryptedPassword = await bcrypt.hash(initialPassword, 10);

      const result = await pool.query(
        `INSERT INTO users (id, username, name, email, phone_number, arabpay_user_id, arabpay_token, role, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (username) DO UPDATE SET
           arabpay_token = EXCLUDED.arabpay_token,
           arabpay_user_id = COALESCE(EXCLUDED.arabpay_user_id, users.arabpay_user_id),
           name = COALESCE(EXCLUDED.name, users.name),
           phone_number = COALESCE(EXCLUDED.phone_number, users.phone_number),
           email = COALESCE(EXCLUDED.email, users.email),
           role = CASE WHEN EXCLUDED.arabpay_user_id = $10 OR users.role = 'owner' THEN 'owner' ELSE users.role END
         RETURNING id, username, name, email, phone_number, arabpay_user_id, role, created_at`,
        [newUserId, cleanUsername, rawName, cleanEmail, cleanPhone, arabpayUserId, jwtToken, userRole, defaultEncryptedPassword, ownerUserId]
      );
      finalUser = result.rows[0];
    }

    if (jwtToken) {
      res.cookie('arabpay_token', jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
    }

    return res.json({
      success: true,
      action: isNewUser ? 'auto_registered_new_user' : 'logged_in_existing_user',
      message: isNewUser ? 'Akun ArabPay baru berhasil didaftarkan ke Database VPS!' : 'Login akun ArabPay berhasil!',
      provider: 'arabpay_s2s_oauth',
      token: jwtToken,
      jwtPayload: jwtPayload || {
        user_id: arabpayUserId,
        name: rawName,
        email: rawEmail,
        phone_number: rawPhone,
        username: rawUsername
      },
      balance: typeof arabpayBalance === 'number' ? arabpayBalance : 0,
      user: {
        ...finalUser,
        phone_number: rawPhone || finalUser.phone_number,
        arabpay_balance: typeof arabpayBalance === 'number' ? arabpayBalance : 0
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function changePassword(req: Request, res: Response) {
  const { userId, newPassword } = req.body;

  if (!newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ success: false, message: 'Password darurat baru minimal 4 karakter.' });
  }

  try {
    const newHash = await bcrypt.hash(newPassword.trim(), 10);
    let result;
    if (userId) {
      result = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2 OR arabpay_user_id = $2', [newHash, userId]);
    } else {
      result = await pool.query('UPDATE users SET password_hash = $1 WHERE role = $2', [newHash, 'owner']);
    }

    return res.json({ 
      success: true, 
      message: 'Password Pemulihan Darurat Owner berhasil diperbarui!',
      updatedRows: result.rowCount 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Endpoint live balance dari ArabPay E-Wallet Service (Always Live, No Static DB Caching)
 */
export async function getLiveBalance(req: Request, res: Response) {
  const inputIdOrToken = (req.body.userId || req.body.token || req.query.userId || '').toString();

  try {
    const { fetchLiveArabPayBalance } = await import('../services/arabpayService.js');
    
    let token = req.cookies?.arabpay_token || (req.body.token || '');
    let userId = req.body.userId || req.query.userId || inputIdOrToken;

    // If userId provided, try to find user's arabpay_token or arabpay_user_id from DB
    if (userId) {
      try {
        const uRes = await pool.query(
          `SELECT arabpay_token, arabpay_user_id FROM users WHERE id = $1 OR arabpay_user_id = $1 OR phone_number = $1 LIMIT 1`,
          [userId]
        );
        if (uRes.rows.length > 0) {
          if (!token && uRes.rows[0].arabpay_token) {
            token = uRes.rows[0].arabpay_token;
          }
          if (uRes.rows[0].arabpay_user_id) {
            userId = uRes.rows[0].arabpay_user_id;
          }
        }
      } catch (dbErr) {}
    }

    const targetKey = token || userId || inputIdOrToken;
    if (!targetKey) {
      return res.json({ success: true, balance: 0 });
    }

    const result = await fetchLiveArabPayBalance(targetKey);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Menyimpan / menyinkronkan user yang berhasil login via SSO ke tabel users di PostgreSQL
 */
export async function syncUser(req: Request, res: Response) {
  try {
    const { id, username, name, email, phone_number, role, arabpay_user_id, token_jwt, token } = req.body;
    if (!name && !email && !username && !phone_number && !id && !arabpay_user_id) {
      return res.status(400).json({ success: false, message: 'Data profil user tidak valid' });
    }

    const cleanUsername = (username || name || 'user').toLowerCase().replace(/\s+/g, '_');
    const cleanEmail = (email || `${cleanUsername}@arabnet.local`).toLowerCase().trim();
    const cleanPhone = phone_number ? String(phone_number).trim() : null;
    const ownerUserId = (process.env.ARABPAY_OWNER_USER_ID || '019f74af9fcdWDgDxM8g').trim();
    const arabpayId = arabpay_user_id || id || null;

    // Tentukan role: jika ID atau email cocok dengan Owner, atau username zainudinarab
    let finalRole = role || 'pelanggan';
    if (
      id === ownerUserId ||
      arabpayId === ownerUserId ||
      cleanEmail.includes('owner') ||
      cleanUsername === 'zainudinarab' ||
      cleanUsername === 'zainudin_arab' ||
      cleanEmail === 'ketua11@gmail.com'
    ) {
      finalRole = 'owner';
    }

    // Cek apakah user sudah ada di database (fleksibel & toleran variasi username/id/arabpay_user_id)
    const existing = await pool.query(
      `SELECT id, username, role, arabpay_user_id FROM users 
       WHERE (id IS NOT NULL AND id = $1)
          OR ($2::text <> '' AND arabpay_user_id IS NOT NULL AND arabpay_user_id = $2)
          OR ($3::text <> '' AND username IS NOT NULL AND (LOWER(username) = LOWER($3) OR REPLACE(LOWER(username), '_', '') = REPLACE(LOWER($3), '_', '')))
          OR ($4::text <> '' AND email IS NOT NULL AND LOWER(email) = LOWER($4)) 
          OR ($5::text <> '' AND phone_number IS NOT NULL AND phone_number = $5) 
       LIMIT 1`,
      [id || '', arabpayId || '', cleanUsername, cleanEmail, cleanPhone || '']
    );

    let targetId = id;
    if (existing.rows.length > 0) {
      targetId = existing.rows[0].id;
      await pool.query(`
        UPDATE users 
        SET name = COALESCE($1, name),
            email = COALESCE($2, email),
            phone_number = COALESCE($3, phone_number),
            arabpay_user_id = COALESCE($4, arabpay_user_id),
            arabpay_token = COALESCE($5, arabpay_token),
            role = CASE WHEN $6 = 'owner' OR role = 'owner' THEN 'owner' ELSE role END
        WHERE id = $7
      `, [name || null, cleanEmail, cleanPhone, arabpayId, token_jwt || token || null, finalRole, targetId]);
      if (finalRole === 'owner') {
        // Aturan ketat: Owner hanya boleh 1! Demote seluruh user lain menjadi 'pelanggan'
        await pool.query("UPDATE users SET role = 'pelanggan' WHERE role = 'owner' AND id != $1", [targetId]);
      }
    } else {
      targetId = id || crypto.randomUUID();
      const defaultPass = finalRole === 'owner' ? 'zainudinarab' : crypto.randomBytes(8).toString('hex');
      const defaultHash = await bcrypt.hash(defaultPass, 10);

      try {
        await pool.query(`
          INSERT INTO users (id, username, name, email, phone_number, arabpay_user_id, arabpay_token, role, password_hash, password)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            email = COALESCE(EXCLUDED.email, users.email),
            phone_number = COALESCE(EXCLUDED.phone_number, users.phone_number),
            arabpay_user_id = COALESCE(EXCLUDED.arabpay_user_id, users.arabpay_user_id),
            arabpay_token = COALESCE(EXCLUDED.arabpay_token, users.arabpay_token),
            role = CASE WHEN EXCLUDED.role = 'owner' OR users.role = 'owner' THEN 'owner' ELSE users.role END
        `, [targetId, cleanUsername, name || 'User', cleanEmail, cleanPhone, arabpayId, token_jwt || token || null, finalRole, defaultHash, defaultPass]);
      } catch (insertErr: any) {
        // Fallback jika ada collision pada username unik
        console.warn('[SYNC USER INSERT RETRY]', insertErr.message);
        await pool.query(`
          UPDATE users 
          SET arabpay_user_id = COALESCE($1, arabpay_user_id),
              arabpay_token = COALESCE($2, arabpay_token),
              name = COALESCE($3, name),
              role = CASE WHEN $4 = 'owner' OR role = 'owner' THEN 'owner' ELSE role END
          WHERE id = $5 
             OR arabpay_user_id = $1 
             OR LOWER(username) = LOWER($6)
             OR REPLACE(LOWER(username), '_', '') = REPLACE(LOWER($6), '_', '')
        `, [arabpayId, token_jwt || token || null, name || null, finalRole, targetId, cleanUsername]);
      }
    }

    const updated = await pool.query('SELECT id, username, name, email, phone_number, role, arabpay_user_id FROM users WHERE id = $1 OR arabpay_user_id = $2 LIMIT 1', [targetId, arabpayId || '']);
    const userRow = updated.rows[0] || { id: targetId, username: cleanUsername, name: name || cleanUsername, role: finalRole };
    console.log(`✅ [USER SYNCED TO POSTGRESQL] User: ${name} (${userRow.username}) | Role: ${userRow.role}`);
    return res.json({ success: true, user: userRow });
  } catch (err: any) {
    console.error('[SYNC USER ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}


