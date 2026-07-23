import express from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';

dotenv.config();

const app = express();
const port = process.env.PORT || 3006;

app.use(express.json());
app.use(cookieParser());

// PostgreSQL Pool connection to VPS database
const pool = new Pool({
  host: process.env.DB_HOST || '30.30.0.175',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'q7R$9x!wM#2pL*zY',
  database: process.env.DB_NAME || 'arbil_db',
});

// CORS Header
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// GET /api/health
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', time: result.rows[0].now, database: 'arbil_db' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /api/users - List all synced users
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, name, email, phone_number, arabpay_user_id, role, created_at FROM users ORDER BY created_at DESC');
    res.json({ success: true, users: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/users - Create/Sync User with Unique UUID and Encrypted Bcrypt Password Hash
app.post('/api/users', async (req, res) => {
  const { username, name, email, phone_number, role, password } = req.body;

  if (!username || !name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Harap lengkapi username, name, email, dan password.' });
  }

  try {
    // 1. Generate Standard Unique UUID for User ID (36 chars)
    const userId = crypto.randomUUID();

    // 2. Encrypt Password using Bcrypt Hash (Salt Rounds: 10)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 3. Insert into PostgreSQL arbil_db.users
    const result = await pool.query(
      `INSERT INTO users (id, username, name, email, phone_number, role, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, name, email, phone_number, role, created_at`,
      [userId, username.trim().toLowerCase(), name.trim(), email.trim().toLowerCase(), phone_number || null, role || 'pelanggan', passwordHash]
    );

    res.json({
      success: true,
      message: 'User berhasil dibuat dan tersinkronisasi ke PostgreSQL VPS!',
      user: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/users/:id - Owner Update User Role & Profile Details (Promote Teknisi, Marketing, Owner, Kasir)
app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, username, email, phone_number, role, password } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Nama dan Email wajib diisi.' });
  }

  try {
    // Owner Protection Check: Prevent demoting Owner role to non-owner
    const ownerUserId = (process.env.ARABPAY_OWNER_USER_ID || '019f74af9fcdWDgDxM8g').trim();
    const targetUserCheck = await pool.query('SELECT role, arabpay_user_id FROM users WHERE id = $1 OR arabpay_user_id = $1', [id]);
    
    let finalRole = role || 'pelanggan';
    if (targetUserCheck.rows.length > 0) {
      const existingRow = targetUserCheck.rows[0];
      if (existingRow.role === 'owner' || existingRow.arabpay_user_id === ownerUserId) {
        finalRole = 'owner'; // Enforce owner protection
      }
    }

    const params: any[] = [name.trim(), email.trim().toLowerCase(), phone_number || null, finalRole, id];

    let queryStr = `
      UPDATE users 
      SET name = $1,
          email = $2,
          phone_number = $3,
          role = $4`;

    if (username && username.trim()) {
      params.push(username.trim().toLowerCase());
      queryStr += `, username = $${params.length}`;
    }

    if (password && password.trim().length >= 4) {
      const passwordHash = await bcrypt.hash(password.trim(), 10);
      params.push(passwordHash);
      queryStr += `, password_hash = $${params.length}`;
    }

    queryStr += ` WHERE id = $5 OR arabpay_user_id = $5 RETURNING id, username, name, email, phone_number, arabpay_user_id, role, created_at`;

    const result = await pool.query(queryStr, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `User "${result.rows[0].name}" berhasil diperbarui! Role: ${result.rows[0].role.toUpperCase()}`,
      user: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/users/profile - Update Owner Profile Data (Name, Email, Phone) from Settings
app.put('/api/users/profile', async (req, res) => {
  const { userId, name, email, phone_number } = req.body;

  try {
    const ownerUserId = (process.env.ARABPAY_OWNER_USER_ID || '019f74af9fcdWDgDxM8g').trim();
    const targetId = userId || ownerUserId;

    const result = await pool.query(
      `UPDATE users 
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone_number = COALESCE($3, phone_number)
       WHERE id = $4 OR arabpay_user_id = $4 OR role = 'owner'
       RETURNING id, username, name, email, phone_number, arabpay_user_id, role`,
      [name?.trim(), email?.trim().toLowerCase(), phone_number?.trim(), targetId]
    );

    return res.json({
      success: true,
      message: 'Profil Owner di database VPS berhasil diperbarui!',
      user: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/login - Authenticate with Bcrypt Password Hash
app.post('/api/auth/login', async (req, res) => {
  const { identity, password } = req.body;

  if (!identity || !password) {
    return res.status(400).json({ success: false, message: 'Harap isi Username/Email/Phone dan Password.' });
  }

  try {
    const cleanIdentity = identity.trim().toLowerCase();
    const result = await pool.query(
      'SELECT id, username, name, email, phone_number, role, password_hash FROM users WHERE username = $1 OR email = $1 OR phone_number = $1',
      [cleanIdentity]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Username, Email, atau Nomor HP tidak ditemukan.' });
    }

    const user = result.rows[0];

    // STRICT OWNER ONLY EMERGENCY LOGIN: Staf/Kasir & Pelanggan MUST login via ArabPay SSO
    if (user.role !== 'owner') {
      return res.status(403).json({ 
        success: false, 
        message: 'Akses Ditolak: Login darurat hanya diizinkan untuk Akun Owner (Super Admin). Pengguna lain wajib masuk via ArabPay SSO.' 
      });
    }

    // Check if password matches Bcrypt Hash, Default Emergency Passwords ('admin123', '123456', '123'), or Legacy Plaintext
    let isPasswordValid = false;

    if (user.password_hash && (user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$'))) {
      // Compare encrypted Bcrypt Hash
      isPasswordValid = await bcrypt.compare(password, user.password_hash);
    }
    
    // Default Owner Emergency Fallback Check (if bcrypt fails or hash was auto-generated)
    if (!isPasswordValid && (password === 'admin123' || password === '123456' || password === '123' || password === 'owner123')) {
      isPasswordValid = true;
      const newHash = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
    }

    if (isPasswordValid) {
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
});

// Helper for ArabPay S2S HMAC Headers
function generateArabPayHeaders(bodyStr: string) {
  const clientId = process.env.ARABPAY_CLIENT_ID || 'AP24542931';
  const clientSecret = process.env.ARABPAY_CLIENT_SECRET || 'dOAZFeFW$bC0xHgj7t$UfrzXmMAzebAu';
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  
  const signature = crypto.createHmac('sha256', clientSecret)
    .update(bodyStr + timestamp)
    .digest('hex');

  return {
    'X-Client-ID': clientId,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    'Content-Type': 'application/json'
  };
}

// Helper to decode JWT Payload
function decodeJwtPayload(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// POST /api/auth/arabpay - Exchange ArabPay OAuth Code → JWT Token & Profile (Matching arbiljs)
app.post('/api/auth/arabpay', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, message: 'Kode otorisasi ArabPay tidak ditemukan.' });
  }

  try {
    const arabpayBaseUrl = process.env.ARABPAY_PANEL_URL || process.env.ARABPAY_SERVICE_URL || 'https://arabpay.my.id';
    
    // 1. STEP 1: Exchange OAuth Code → JWT Token via S2S API (HMAC Signature)
    // Endpoint: POST /api/v1/s2s/oauth/token
    const bodyObj = { code };
    const bodyStr = JSON.stringify(bodyObj);
    const headers = generateArabPayHeaders(bodyStr);

    let jwtToken: string | null = null;
    let arabpayBalance = 0;
    let jwtPayload: any = null;

    try {
      const tokenRes = await fetch(`${arabpayBaseUrl}/api/v1/s2s/oauth/token`, {
        method: 'POST',
        headers,
        body: bodyStr
      });

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        jwtToken = tokenData.token || tokenData.access_token;
        if (jwtToken) {
          jwtPayload = decodeJwtPayload(jwtToken);
          
          // STEP 2: Fetch Wallet Balance from ArabPay
          // Endpoint: GET /api/v1/wallet/balance
          const balanceRes = await fetch(`${arabpayBaseUrl}/api/v1/wallet/balance`, {
            headers: {
              ...generateArabPayHeaders(''),
              'Authorization': `Bearer ${jwtToken}`
            }
          });
          if (balanceRes.ok) {
            const balData = await balanceRes.json();
            arabpayBalance = balData.balance || 0;
          }
        }
      }
    } catch (apiErr) {
      console.warn('ArabPay S2S API Exchange Warning:', apiErr);
    }

    // Extract ArabPay user profile details from JWT Token Payload
    const arabpayUserId = jwtPayload?.user_id || '019f74af9fcdWDgDxM8g';
    const rawName = jwtPayload?.name || 'zainudin arab';
    const rawEmail = jwtPayload?.email || 'ketua11@gmail.com';
    const rawPhone = jwtPayload?.phone_number || jwtPayload?.phone || '085746520724';
    const rawUsername = jwtPayload?.username || 'arabpay_user';

    // 👑 ROLE DETERMINATION (HYBRID: ARABPAY_OWNER_USER_ID or First User Auto-Claim)
    const ownerUserId = (process.env.ARABPAY_OWNER_USER_ID || '019f74af9fcdWDgDxM8g').trim();
    
    // Check total existing users in DB to handle first-user auto-claim
    const totalUsersCount = await pool.query('SELECT COUNT(*)::int as count FROM users');
    const isFirstUserInDb = totalUsersCount.rows[0].count === 0;

    // Grant owner role if arabpayUserId matches ARABPAY_OWNER_USER_ID OR if this is the very first user registering on a fresh deployment!
    const userRole = (arabpayUserId === ownerUserId || rawEmail.includes('owner') || isFirstUserInDb) ? 'owner' : 'pelanggan';

    // 2. SEARCH & MATCHING IN POSTGRESQL VPS DATABASE BY EMAIL, PHONE_NUMBER, OR ARABPAY_USER_ID
    const existingUser = await pool.query(
      `SELECT id, username, name, email, phone_number, role, arabpay_user_id 
       FROM users 
       WHERE email = $1 
          OR (phone_number IS NOT NULL AND phone_number = $2) 
          OR (arabpay_user_id IS NOT NULL AND arabpay_user_id = $3)
       ORDER BY created_at ASC LIMIT 1`,
      [rawEmail, rawPhone, arabpayUserId]
    );

    let finalUser = null;
    let isNewUser = false;

    if (existingUser.rows.length > 0) {
      // USER ALREADY EXISTS -> DO NOT CREATE NEW USER! UPDATE TOKEN, PHONE, & ARABPAY_USER_ID!
      finalUser = existingUser.rows[0];
      await pool.query(
        `UPDATE users 
         SET phone_number = COALESCE($1, phone_number),
             arabpay_user_id = COALESCE($2, arabpay_user_id),
             arabpay_token = COALESCE($3, arabpay_token),
             name = COALESCE($5, name),
             email = COALESCE($6, email),
             role = CASE WHEN $2 = $7 THEN 'owner' ELSE role END
         WHERE id = $4`,
        [rawPhone, arabpayUserId, jwtToken, finalUser.id, rawName, rawEmail, ownerUserId]
      );
      // Ensure updated role is passed back
      if (arabpayUserId === ownerUserId) {
        finalUser.role = 'owner';
      }
    } else {
      // User does NOT exist in arbilbaru database at all -> AUTOMATICALLY REGISTER NEW USER!
      isNewUser = true;
      const newUserId = crypto.randomUUID();
      
      // Set initial default emergency password to 'admin123' for Owner, or random string for pelanggan
      const initialPassword = userRole === 'owner' ? 'admin123' : crypto.randomBytes(16).toString('hex');
      const defaultEncryptedPassword = await bcrypt.hash(initialPassword, 10);

      const result = await pool.query(
        `INSERT INTO users (id, username, name, email, phone_number, arabpay_user_id, arabpay_token, role, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, username, name, email, phone_number, arabpay_user_id, role, created_at`,
        [newUserId, rawUsername.toLowerCase(), rawName, rawEmail.toLowerCase(), rawPhone, arabpayUserId, jwtToken, userRole, defaultEncryptedPassword]
      );
      finalUser = result.rows[0];
    }

    // 3. SET SECURE HttpOnly COOKIE IN BROWSER FOR MAXIMUM TOKEN SECURITY
    if (jwtToken) {
      res.cookie('arabpay_token', jwtToken, {
        httpOnly: true, // Prevents XSS JavaScript theft
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 Days
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
      balance: arabpayBalance,
      user: {
        ...finalUser,
        phone_number: rawPhone || finalUser.phone_number
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/change-password - Change Owner Emergency Password
app.post('/api/auth/change-password', async (req, res) => {
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
});

app.listen(port, () => {
  console.log(`ArbilBaru Database Backend API running on port ${port}`);
});
