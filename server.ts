import express from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3006;

app.use(express.json());

// PostgreSQL Pool connection to VPS database
const pool = new Pool({
  host: process.env.DB_HOST || '30.30.0.175',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgrespassword',
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

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { identity, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, username, name, email, role FROM users WHERE (username = $1 OR email = $1) AND password_hash = $2',
      [identity, password]
    );

    if (result.rows.length > 0) {
      return res.json({ success: true, user: result.rows[0] });
    }
    return res.status(401).json({ success: false, message: 'Kredensial tidak ditemukan atau password salah.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/wifi-packages
app.get('/api/wifi-packages', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM wifi_packages ORDER BY price ASC');
    res.json({ success: true, packages: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/invoices
app.get('/api/invoices', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC');
    res.json({ success: true, invoices: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(port, () => {
  console.log(`ArbilBaru Database Backend API running on port ${port}`);
});
