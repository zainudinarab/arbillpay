import { Request, Response } from 'express';
import { pool } from '../config/db.js';
import { getFirestore } from '../config/firebase.js';

/**
 * Webhook Event Handler untuk PPPoE Mikrotik (On-Up / On-Down)
 * Dipanggil otomatis oleh RouterOS saat user PPPoE connect atau disconnect
 * 
 * Parameter GET/POST:
 * - action: 'login' | 'logout'
 * - user: username pppoe
 * - ip: remote IP address
 * - mac: caller-id / MAC address ONT
 * - session: session-id
 * - uptime: durasi koneksi saat disconnect (cth: "01:23:45")
 * - bytes_in: bytes diterima (download)
 * - bytes_out: bytes terkirim (upload)
 */
export async function handlePppEvent(req: Request, res: Response) {
  const action = (req.query.action || req.body.action || 'login').toString().toLowerCase().trim();
  const user = (req.query.user || req.body.user || req.query.username || req.body.username || '').toString().trim();
  const ip = (req.query.ip || req.body.ip || '').toString().trim();
  const mac = (req.query.mac || req.body.mac || req.query.caller_id || req.body.caller_id || '').toString().trim();
  const session = (req.query.session || req.body.session || req.query.session_id || req.body.session_id || '').toString().trim();
  const uptime = (req.query.uptime || req.body.uptime || '').toString().trim();
  const bytesIn = parseInt((req.query.bytes_in || req.body.bytes_in || '0').toString(), 10) || 0;
  const bytesOut = parseInt((req.query.bytes_out || req.body.bytes_out || '0').toString(), 10) || 0;

  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'Parameter "user" (username PPPoE) wajib disertakan.'
    });
  }

  const logId = `ppplog-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date();

  console.log(`[PPP WEBHOOK] Event: ${action.toUpperCase()} | User: ${user} | IP: ${ip || '-'} | MAC: ${mac || '-'} | Uptime: ${uptime || '-'}`);

  try {
    // 1. Cari pelanggan berdasarkan pppoe_username
    const custRes = await pool.query(`
      SELECT id, name, customer_code, package_id, status, is_online
      FROM customers
      WHERE LOWER(pppoe_username) = LOWER($1)
      LIMIT 1
    `, [user]);

    const customer = custRes.rows.length > 0 ? custRes.rows[0] : null;

    // 2. Perbarui status live pelanggan
    if (customer) {
      if (action === 'login' || action === 'up') {
        await pool.query(`
          UPDATE customers
          SET is_online = true,
              last_connected_at = $1,
              current_ip = COALESCE(NULLIF($2, ''), current_ip)
          WHERE id = $3
        `, [now, ip, customer.id]);
      } else if (action === 'logout' || action === 'down') {
        await pool.query(`
          UPDATE customers
          SET is_online = false,
              last_disconnected_at = $1
          WHERE id = $2
        `, [now, customer.id]);
      }
    }

    // 3. Catat Riwayat Koneksi ke tabel ppp_connection_logs
    await pool.query(`
      INSERT INTO ppp_connection_logs (
        id, customer_id, username, action, ip_address, mac_address, session_id, bytes_in, bytes_out, uptime, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      logId,
      customer ? customer.id : null,
      user,
      action === 'up' ? 'login' : action === 'down' ? 'logout' : action,
      ip || null,
      mac || null,
      session || null,
      bytesIn,
      bytesOut,
      uptime || null,
      now
    ]);

    // 4. Sinkronisasi status ke Firebase jika aktif
    try {
      const db = getFirestore();
      if (db && customer) {
        await db.collection('customers').doc(customer.id).set({
          is_online: action === 'login' || action === 'up',
          last_event: action,
          last_event_at: now.toISOString(),
          current_ip: ip || null
        }, { merge: true });
      }
    } catch (_) {}

    return res.json({
      success: true,
      message: `✅ Log PPPoE [${action.toUpperCase()}] untuk user "${user}" berhasil dicatat.`,
      log_id: logId,
      user: user,
      action: action,
      is_online: action === 'login' || action === 'up',
      customer_found: Boolean(customer)
    });
  } catch (err: any) {
    console.error(`[PPP EVENT ERROR] Gagal memproses event PPP untuk ${user}:`, err.message);
    return res.status(500).json({
      success: false,
      message: `Terjadi kesalahan saat memproses event: ${err.message}`
    });
  }
}

/**
 * Mengambil daftar riwayat log koneksi PPPoE (untuk panel monitoring)
 */
export async function listPppLogs(req: Request, res: Response) {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 500);
  const username = (req.query.username || '').toString().trim();
  const customerId = (req.query.customer_id || req.query.customerId || '').toString().trim();

  try {
    let query = `
      SELECT l.*, c.name as customer_name, c.customer_code, p.name as package_name
      FROM ppp_connection_logs l
      LEFT JOIN customers c ON l.customer_id = c.id
      LEFT JOIN packages p ON c.package_id = p.id
    `;
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (customerId) {
      // Find customer's pppoe_username to match both linked and legacy unlinked logs
      let custUsername = '';
      try {
        const cRes = await pool.query('SELECT pppoe_username FROM customers WHERE id = $1', [customerId]);
        if (cRes.rows.length > 0 && cRes.rows[0].pppoe_username) {
          custUsername = cRes.rows[0].pppoe_username.trim();
        }
      } catch (_) {}

      params.push(customerId);
      const custParamIdx = params.length;
      if (custUsername) {
        params.push(custUsername.toLowerCase());
        const userParamIdx = params.length;
        whereClauses.push(`(l.customer_id = $${custParamIdx} OR LOWER(l.username) = $${userParamIdx})`);
      } else {
        whereClauses.push(`l.customer_id = $${custParamIdx}`);
      }
    } else if (username) {
      params.push(`%${username.toLowerCase()}%`);
      whereClauses.push(`LOWER(l.username) LIKE $${params.length}`);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ` + whereClauses.join(' AND ');
    }

    params.push(limit);
    query += ` ORDER BY l.created_at DESC LIMIT $${params.length}`;

    const result = await pool.query(query, params);
    
    // Calculate aggregate summary
    let totalBytesIn = 0;
    let totalBytesOut = 0;
    let loginCount = 0;
    let logoutCount = 0;

    for (const r of result.rows) {
      totalBytesIn += parseInt(r.bytes_in || '0', 10);
      totalBytesOut += parseInt(r.bytes_out || '0', 10);
      if (r.action === 'login' || r.action === 'up') loginCount++;
      if (r.action === 'logout' || r.action === 'down') logoutCount++;
    }

    res.json({
      success: true,
      count: result.rows.length,
      stats: {
        total_bytes_in: totalBytesIn,
        total_bytes_out: totalBytesOut,
        login_count: loginCount,
        logout_count: logoutCount
      },
      logs: result.rows
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
}
