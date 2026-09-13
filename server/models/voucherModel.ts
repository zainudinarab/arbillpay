import { pool } from '../config/db.js';
import { getFirestore } from '../config/firebase.js';

export function generateRandomCode(length: number, charType: string, prefix: string = '') {
  let chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  if (charType === 'numbers') chars = '0123456789';
  if (charType === 'upper') chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  if (charType === 'mixed') chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  let randomStr = '';
  for (let i = 0; i < length; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}${randomStr}`;
}

export async function getAllVouchers() {
  if (process.env.DB_DRIVER === 'firebase') {
    const db = getFirestore();
    if (db) {
      const snap = await db.collection('hotspot_vouchers').get();
      const list: any[] = [];
      snap.forEach((doc: any) => {
        if (doc.id !== '_init') {
          list.push({ id: doc.id, ...doc.data() });
        }
      });
      list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      return list;
    }
  }

  try {
    const result = await pool.query(`
      SELECT v.id, v.batch_id, v.router_id, v.router_profile_id, v.code, v.password, v.status, v.comment, v.created_at,
             v.is_synced, v.last_synced_at, v.sync_error,
             v.sold_to, v.sold_at, v.invoice_id, v.invoice_number,
             v.first_login_at, v.mac_address, v.ip_address, v.expired_at,
             r.name as router_name, r.ip_address as router_ip,
             rp.name as profile_name, rp.rate_limit,
             p.name as package_name, p.price as package_price, p.validity_iso, p.grace_period_iso, p.uptime_limit, p.quota_mb
      FROM hotspot_vouchers v
      LEFT JOIN routers r ON v.router_id = r.id
      LEFT JOIN router_profiles rp ON v.router_profile_id = rp.id
      LEFT JOIN packages p ON rp.package_id = p.id
      ORDER BY v.created_at DESC, v.code ASC
    `);
    return result.rows;
  } catch (err: any) {
    console.warn('[VOUCHERS] Postgres query failed, falling back to Cloud Firestore:', err.message);
    const db = getFirestore();
    if (db) {
      const snap = await db.collection('hotspot_vouchers').get();
      const list: any[] = [];
      snap.forEach((doc: any) => {
        if (doc.id !== '_init') {
          list.push({ id: doc.id, ...doc.data() });
        }
      });
      list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      return list;
    }
    throw err;
  }
}

export async function deleteBatchVouchers(batchId: string) {
  const result = await pool.query('DELETE FROM hotspot_vouchers WHERE batch_id = $1 RETURNING id', [batchId]);
  return result.rows.length;
}
