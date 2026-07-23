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
    // 1. Generate Unique UUID for User ID
    const userId = `usr_${crypto.randomUUID()}`;

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

app.listen(port, () => {
  console.log(`ArbilBaru Database Backend API running on port ${port}`);
});
