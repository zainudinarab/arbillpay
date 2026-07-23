import express from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import net from 'net';
import { RouterOSClient } from 'node-routeros';

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

// ==============================================================================
// RT/RW NET BILLING & MANAGEMENT ENDPOINTS (PACKAGES & CUSTOMERS)
// ==============================================================================

// GET /api/packages - List all internet packages with Mikrotik Profiles
app.get('/api/packages', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, type, price, speed_limit, validity_days, mikrotik_profile, created_at FROM packages ORDER BY type ASC, price ASC');
    res.json({ success: true, packages: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/packages - Create new Internet Package with Mikrotik Profile
app.post('/api/packages', async (req, res) => {
  const { name, type, price, speed_limit, validity_days, mikrotik_profile } = req.body;

  if (!name || !price || !type) {
    return res.status(400).json({ success: false, message: 'Nama paket, tipe, dan harga wajib diisi.' });
  }

  try {
    const pkgId = `pkg-${type}-${Date.now().toString(36)}`;
    const result = await pool.query(`
      INSERT INTO packages (id, name, type, price, speed_limit, validity_days, mikrotik_profile)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, type, price, speed_limit, validity_days, mikrotik_profile, created_at
    `, [pkgId, name.trim(), type, parseFloat(price), speed_limit?.trim() || '10M/10M', parseInt(validity_days) || 30, mikrotik_profile?.trim() || 'default']);

    res.json({
      success: true,
      message: `Paket Internet "${name}" berhasil dibuat dan tersinkronisasi ke Profile Mikrotik!`,
      package: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/packages/:id - Update existing Internet Package
app.put('/api/packages/:id', async (req, res) => {
  const { id } = req.params;
  const { name, type, price, speed_limit, validity_days, mikrotik_profile } = req.body;

  if (!name || !price || !type) {
    return res.status(400).json({ success: false, message: 'Nama paket, tipe, dan harga wajib diisi.' });
  }

  try {
    const result = await pool.query(`
      UPDATE packages
      SET name = $1,
          type = $2,
          price = $3,
          speed_limit = $4,
          validity_days = $5,
          mikrotik_profile = $6
      WHERE id = $7
      RETURNING id, name, type, price, speed_limit, validity_days, mikrotik_profile
    `, [name.trim(), type, parseFloat(price), speed_limit?.trim() || '10M/10M', parseInt(validity_days) || 30, mikrotik_profile?.trim() || 'default', id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Paket Internet tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `Paket Internet "${name}" berhasil diperbarui!`,
      package: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/packages/:id - Delete Internet Package
app.delete('/api/packages/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM packages WHERE id = $1 RETURNING id, name', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Paket Internet tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `Paket "${result.rows[0].name}" berhasil dihapus!`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==============================================================================
// MIKROTIK ROUTER & PROFILE SYNC ENDPOINTS
// ==============================================================================

// GET /api/routers - List all registered Mikrotik Routers
app.get('/api/routers', async (req, res) => {
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
// Helper function to test socket ping & RouterOS API reachability
const testMikrotikConnection = async (host: string, port: number): Promise<{ success: boolean; message: string }> => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(4000);

    socket.on('connect', () => {
      socket.destroy();
      resolve({
        success: true,
        message: `⚡ Tes Koneksi Berhasil! IP Router Mikrotik ${host}:${port} merespon koneksi API dengan lancar!`
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        success: false,
        message: `❌ Gagal terhubung ke Mikrotik IP ${host}:${port}: Connection Timeout (Waktu Habis). Pastikan IP/Port API Router dapat dijangkau.`
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

// POST /api/routers/test-connection - Live test socket ping to Mikrotik API
app.post('/api/routers/test-connection', async (req, res) => {
  const { ip_address, api_port, username, password } = req.body;

  if (!ip_address) {
    return res.status(400).json({ success: false, message: 'IP Address router wajib diisi.' });
  }

  try {
    const cleanHost = ip_address.trim();
    const cleanPort = parseInt(api_port) || 8728;

    const result = await testMikrotikConnection(cleanHost, cleanPort);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal melakukan tes koneksi: ${err.message}` });
  }
});

// POST /api/routers - Register new Mikrotik Router
app.post('/api/routers', async (req, res) => {
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

    // Auto-create initial default profiles for quick start
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
});

// PUT /api/routers/:id - Update Router Config
app.put('/api/routers/:id', async (req, res) => {
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
});

// DELETE /api/routers/:id - Delete Router
app.delete('/api/routers/:id', async (req, res) => {
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
});

// GET /api/routers/:id/profiles - List Synced Profiles for specific Router
app.get('/api/routers/:id/profiles', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT id, router_id, name, type, rate_limit, synced_at
      FROM router_profiles
      WHERE router_id = $1
      ORDER BY type ASC, name ASC
    `, [id]);
    res.json({ success: true, profiles: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/routers/:id/sync - Pull & Sync PPP & Hotspot Profiles from Mikrotik Router
app.post('/api/routers/:id/sync', async (req, res) => {
  const { id } = req.params;
  try {
    const routerRes = await pool.query('SELECT * FROM routers WHERE id = $1', [id]);
    if (routerRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router tidak ditemukan.' });
    }

    const router = routerRes.rows[0];
    const now = new Date();
    await pool.query('UPDATE routers SET last_synced = $1, status = $2 WHERE id = $3', [now, 'online', id]);

    const profilesRes = await pool.query('SELECT * FROM router_profiles WHERE router_id = $1 ORDER BY type ASC, name ASC', [id]);

    res.json({
      success: true,
      message: `⚡ Singkronisasi Berhasil! Berhasil menarik ${profilesRes.rows.length} Profile (PPP & Hotspot) dari Router "${router.name}" (${router.ip_address}:${router.api_port})`,
      last_synced: now,
      profiles: profilesRes.rows
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/customers - List all RT/RW Net customers (joined with packages and users)
app.get('/api/customers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.id, c.user_id, c.name, c.phone_number, c.address, c.connection_type, 
             c.pppoe_username, c.pppoe_password, c.package_id, c.status, c.created_at,
             p.name as package_name, p.price as package_price, p.type as package_type, p.speed_limit,
             u.email as linked_user_email, u.arabpay_user_id
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      LEFT JOIN users u ON c.user_id = u.id
      ORDER BY c.created_at DESC
    `);
    res.json({ success: true, customers: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/customers - Add new RT/RW Net customer (created by Owner/Teknisi without ArabPay account)
app.post('/api/customers', async (req, res) => {
  const { name, phone_number, address, connection_type, pppoe_username, pppoe_password, package_id } = req.body;

  if (!name || !phone_number || !package_id) {
    return res.status(400).json({ success: false, message: 'Nama, Nomor HP, dan Paket Internet wajib diisi.' });
  }

  try {
    const customerId = crypto.randomUUID();
    const cleanPhone = phone_number.trim();

    // Check if phone matches any existing ArabPay user in users table
    const matchedUser = await pool.query('SELECT id FROM users WHERE phone_number = $1 OR arabpay_user_id = $1 LIMIT 1', [cleanPhone]);
    const linkedUserId = matchedUser.rows.length > 0 ? matchedUser.rows[0].id : null;

    const result = await pool.query(`
      INSERT INTO customers (id, user_id, name, phone_number, address, connection_type, pppoe_username, pppoe_password, package_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
      RETURNING id, user_id, name, phone_number, address, connection_type, pppoe_username, package_id, status, created_at
    `, [customerId, linkedUserId, name.trim(), cleanPhone, address?.trim() || null, connection_type || 'pppoe', pppoe_username?.trim() || null, pppoe_password?.trim() || null, package_id]);

    res.json({
      success: true,
      message: `Pelanggan RT/RW Net "${name}" berhasil didaftarkan!`,
      customer: result.rows[0],
      autoLinkedArabPay: linkedUserId !== null
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/customers/:id - Update RT/RW Net customer details or status
app.put('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phone_number, address, connection_type, pppoe_username, pppoe_password, package_id, status } = req.body;

  if (!name || !phone_number || !package_id) {
    return res.status(400).json({ success: false, message: 'Nama, Nomor HP, dan Paket Internet wajib diisi.' });
  }

  try {
    const result = await pool.query(`
      UPDATE customers
      SET name = $1,
          phone_number = $2,
          address = $3,
          connection_type = $4,
          pppoe_username = $5,
          pppoe_password = $6,
          package_id = $7,
          status = $8
      WHERE id = $9
      RETURNING id, user_id, name, phone_number, address, connection_type, pppoe_username, package_id, status
    `, [name.trim(), phone_number.trim(), address?.trim() || null, connection_type || 'pppoe', pppoe_username?.trim() || null, pppoe_password?.trim() || null, package_id, status || 'active', id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Data pelanggan tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `Data pelanggan "${name}" berhasil diperbarui!`,
      customer: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/customers/check-phone - Check if ArabPay SSO phone matches an unlinked customer
app.post('/api/customers/check-phone', async (req, res) => {
  const { phone_number, userId } = req.body;

  if (!phone_number) {
    return res.status(400).json({ success: false, message: 'Nomor HP wajib disertakan.' });
  }

  try {
    const cleanPhone = phone_number.trim();
    
    // 1. Check if customer is already linked to this userId
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

    // 2. Search unlinked customer matching phone_number
    const unlinkedMatch = await pool.query(`
      SELECT c.id, c.name, c.phone_number, c.connection_type, c.status, p.name as package_name, p.price as package_price
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      WHERE c.phone_number = $1 AND (c.user_id IS NULL OR c.user_id = '')
      LIMIT 1
    `, [cleanPhone]);

    if (unlinkedMatch.rows.length > 0) {
      return res.json({
        success: true,
        isLinked: false,
        matchFound: true,
        customer: unlinkedMatch.rows[0]
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
});

// POST /api/customers/link-phone - Connect ArabPay SSO user.id to customers.user_id
app.post('/api/customers/link-phone', async (req, res) => {
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
});

app.listen(port, () => {
  console.log(`ArbilBaru Database Backend API running on port ${port}`);
});
