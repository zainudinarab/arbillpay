import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../config/db.js';

// Siapkan buffer dummy 64 KB di memori sekali saja untuk efisiensi CPU & RAM
const CHUNK_SIZE = 64 * 1024; // 64 KB
const dummyChunk = crypto.randomBytes(CHUNK_SIZE);

/**
 * Inisialisasi tabel riwayat speedtest di PostgreSQL jika belum ada
 */
async function ensureSpeedtestTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS speedtest_results (
        id BIGSERIAL PRIMARY KEY,
        customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
        pppoe_username VARCHAR(128),
        ping_ms NUMERIC(6, 2),
        jitter_ms NUMERIC(6, 2),
        download_mbps NUMERIC(8, 2),
        upload_mbps NUMERIC(8, 2),
        client_ip VARCHAR(64),
        user_agent TEXT,
        tested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_speedtest_cust ON speedtest_results (customer_id, tested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_speedtest_time ON speedtest_results (tested_at DESC);
    `);
  } catch (_) {}
}
ensureSpeedtestTable().catch(() => {});

/**
 * 1. Ping Endpoint: Mengembalikan waktu server instan untuk hitung RTT & Jitter
 */
export function handleSpeedtestPing(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.status(200).json({
    status: 'ok',
    server_time: Date.now()
  });
}

/**
 * 2. Download Endpoint: Mengalirkan stream binary buffer acak ke browser
 * Ukuran dapat ditentukan via query `size` (misal 5MB, 10MB, 20MB, default 15MB)
 */
export function handleSpeedtestDownload(req: Request, res: Response) {
  const reqMb = Math.min(50, Math.max(1, parseInt(req.query.size as string, 10) || 15));
  const totalBytes = reqMb * 1024 * 1024;
  const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', totalBytes);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  let chunkSent = 0;

  function sendNextChunk() {
    let canContinue = true;
    while (chunkSent < totalChunks && canContinue) {
      chunkSent++;
      canContinue = res.write(dummyChunk);
    }

    if (chunkSent >= totalChunks) {
      res.end();
    } else {
      res.once('drain', sendNextChunk);
    }
  }

  req.on('close', () => {
    chunkSent = totalChunks; // Hentikan stream jika client menutup koneksi
  });

  sendNextChunk();
}

/**
 * 3. Upload Endpoint: Menerima stream payload dari browser dan mengukur throughput upload
 */
export function handleSpeedtestUpload(req: Request, res: Response) {
  const startTime = Date.now();
  let bytesReceived = 0;

  req.on('data', (chunk) => {
    bytesReceived += chunk.length;
  });

  req.on('end', () => {
    const durationMs = Math.max(1, Date.now() - startTime);
    const bits = bytesReceived * 8;
    const mbps = (bits / (durationMs / 1000)) / (1024 * 1024);

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      success: true,
      bytes_received: bytesReceived,
      duration_ms: durationMs,
      mbps: Math.round(mbps * 100) / 100
    });
  });

  req.on('error', (err) => {
    res.status(500).json({ success: false, message: err.message });
  });
}

/**
 * 4. Simpan Riwayat Hasil Speedtest ke Database
 */
export async function saveSpeedtestResult(req: Request, res: Response) {
  const {
    customer_id,
    pppoe_username,
    ping_ms,
    jitter_ms,
    download_mbps,
    upload_mbps
  } = req.body;

  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;

  try {
    await pool.query(`
      INSERT INTO speedtest_results (
        customer_id, pppoe_username, ping_ms, jitter_ms, download_mbps, upload_mbps, client_ip, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      customer_id || null,
      pppoe_username || null,
      ping_ms || 0,
      jitter_ms || 0,
      download_mbps || 0,
      upload_mbps || 0,
      clientIp,
      userAgent
    ]);

    res.json({ success: true, message: 'Hasil speedtest berhasil dicatat.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * 5. Ambil Riwayat Hasil Speedtest Terakhir Pelanggan
 */
export async function getCustomerSpeedtestHistory(req: Request, res: Response) {
  const { customer_id } = req.params;

  try {
    const r = await pool.query(`
      SELECT * FROM speedtest_results 
      WHERE customer_id = $1 OR pppoe_username = (SELECT pppoe_username FROM customers WHERE id = $1 LIMIT 1)
      ORDER BY tested_at DESC LIMIT 10
    `, [customer_id]);

    res.json({ success: true, history: r.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

