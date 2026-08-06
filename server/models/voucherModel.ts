import { pool } from '../config/db.js';

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
  const result = await pool.query(`
    SELECT v.id, v.batch_id, v.router_id, v.router_profile_id, v.code, v.password, v.status, v.comment, v.created_at,
           r.name as router_name, r.ip_address as router_ip,
           rp.name as profile_name, rp.rate_limit,
           p.name as package_name, p.price as package_price, p.validity_days, p.validity_unit, p.validity_value, p.uptime_limit, p.quota_mb
    FROM hotspot_vouchers v
    LEFT JOIN routers r ON v.router_id = r.id
    LEFT JOIN router_profiles rp ON v.router_profile_id = rp.id
    LEFT JOIN packages p ON rp.package_id = p.id
    ORDER BY v.created_at DESC, v.code ASC
  `);
  return result.rows;
}

export async function deleteBatchVouchers(batchId: string) {
  const result = await pool.query('DELETE FROM hotspot_vouchers WHERE batch_id = $1 RETURNING id', [batchId]);
  return result.rows.length;
}
