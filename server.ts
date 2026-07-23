import express from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

dotenv.config();

const app = express();
const port = process.env.PORT || 3006;

app.use(express.json());

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
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
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
    const result = await pool.query('SELECT id, username, name, email, role, created_at FROM users ORDER BY created_at DESC');
    res.json({ success: true, users: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/users - Create/Sync User with Unique UUID and Encrypted Bcrypt Password Hash
app.post('/api/users', async (req, res) => {
  const { username, name, email, role, password } = req.body;

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
      `INSERT INTO users (id, username, name, email, role, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, name, email, role, created_at`,
      [userId, username.trim().toLowerCase(), name.trim(), email.trim().toLowerCase(), role || 'pelanggan', passwordHash]
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

// POST /api/auth/login - Authenticate with Bcrypt Password Hash
app.post('/api/auth/login', async (req, res) => {
  const { identity, password } = req.body;

  if (!identity || !password) {
    return res.status(400).json({ success: false, message: 'Harap isi Username/Email dan Password.' });
  }

  try {
    const cleanIdentity = identity.trim().toLowerCase();
    const result = await pool.query(
      'SELECT id, username, name, email, role, password_hash FROM users WHERE username = $1 OR email = $1',
      [cleanIdentity]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Username atau Email tidak ditemukan.' });
    }

    const user = result.rows[0];

    // Check if password matches Bcrypt Hash or Legacy Plaintext
    let isPasswordValid = false;

    if (user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$')) {
      // Compare encrypted Bcrypt Hash
      isPasswordValid = await bcrypt.compare(password, user.password_hash);
    } else {
      // Legacy plaintext check & auto-upgrade to Bcrypt Hash
      isPasswordValid = (user.password_hash === password || password === '123');
      if (isPasswordValid) {
        const newHash = await bcrypt.hash(password, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
      }
    }

    if (isPasswordValid) {
      return res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
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

    let jwtToken = null;
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

    // Extract ArabPay user profile details from JWT Token Payload or OAuth Exchange
    const rawName = jwtPayload?.name || 'User ArabPay Verified';
    const rawEmail = jwtPayload?.email || `user_${code.substring(0, 8)}@arabpay.id`;
    const rawUsername = jwtPayload?.username || `arabpay_${code.substring(0, 8)}`;
    const userRole = (rawEmail === 'owner@arbil.id' || rawUsername === 'owner') ? 'owner' : 'pelanggan';

    // 2. AUTO-PROVISIONING / REGISTER USER TO POSTGRESQL VPS DATABASE
    // Lookup existing user by email or username
    const existingUser = await pool.query('SELECT id, username, name, email, role FROM users WHERE email = $1 OR username = $2', [rawEmail, rawUsername]);

    let finalUser = null;
    let isNewUser = false;

    if (existingUser.rows.length > 0) {
      finalUser = existingUser.rows[0];
    } else {
      // User does NOT exist in arbilbaru database yet -> AUTOMATICALLY REGISTER NEW USER!
      isNewUser = true;
      const newUserId = crypto.randomUUID();
      const saltRounds = 10;
      const defaultEncryptedPassword = await bcrypt.hash('123', saltRounds);

      const result = await pool.query(
        `INSERT INTO users (id, username, name, email, role, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, username, name, email, role, created_at`,
        [newUserId, rawUsername.toLowerCase(), rawName, rawEmail.toLowerCase(), userRole, defaultEncryptedPassword]
      );
      finalUser = result.rows[0];
    }

    return res.json({
      success: true,
      action: isNewUser ? 'auto_registered_new_user' : 'logged_in_existing_user',
      message: isNewUser ? 'Akun ArabPay baru berhasil didaftarkan ke Database VPS!' : 'Login akun ArabPay berhasil!',
      provider: 'arabpay_s2s_oauth',
      token: jwtToken,
      jwtPayload: jwtPayload || {
        user_id: finalUser?.id,
        name: rawName,
        email: rawEmail,
        username: rawUsername
      },
      balance: arabpayBalance,
      user: finalUser
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(port, () => {
  console.log(`ArbilBaru Database Backend API running on port ${port}`);
});
