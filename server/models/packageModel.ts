import { pool } from '../config/db.js';

export async function getAllPackages() {
  const result = await pool.query('SELECT id, name, type, price, speed_limit, validity_days, validity_unit, validity_value, validity_iso, grace_period_days, grace_period_iso, only_one_user, uptime_limit, quota_mb, mikrotik_profile, shared_users, created_at FROM packages ORDER BY type ASC, price ASC');
  return result.rows;
}

export async function createPackage(data: any) {
  const vUnit = data.validity_unit || 'month';
  const vVal = parseInt(data.validity_value) || 1;
  const vDays = vUnit === 'month' ? vVal * 30 : vUnit === 'day' ? vVal : Math.ceil(vVal / 24) || 1;

  const vIso = data.validity_iso?.trim() || (vUnit === 'month' ? `P${vVal}M` : vUnit === 'day' ? `P${vVal}D` : vUnit === 'hour' ? `PT${vVal}H` : `PT${vVal}M`);
  const gDays = parseInt(data.grace_period_days) || 5;
  const gIso = data.grace_period_iso?.trim() || `P${gDays}D`;
  const isOnlyOne = Boolean(data.only_one_user);
  const sUsers = parseInt(data.shared_users) || 1;

  const pkgId = `pkg-${data.type}-${Date.now().toString(36)}`;
  const result = await pool.query(`
    INSERT INTO packages (id, name, type, price, speed_limit, validity_days, validity_unit, validity_value, validity_iso, grace_period_days, grace_period_iso, only_one_user, uptime_limit, quota_mb, mikrotik_profile, shared_users)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING id, name, type, price, speed_limit, validity_days, validity_unit, validity_value, validity_iso, grace_period_days, grace_period_iso, only_one_user, uptime_limit, quota_mb, mikrotik_profile, shared_users, created_at
  `, [
    pkgId, 
    data.name.trim(), 
    data.type, 
    parseFloat(data.price), 
    data.speed_limit?.trim() || '10M/10M', 
    vDays, 
    vUnit,
    vVal,
    vIso,
    gDays,
    gIso,
    isOnlyOne,
    data.uptime_limit?.trim() || null,
    data.quota_mb ? parseInt(data.quota_mb) : null,
    data.mikrotik_profile?.trim() || 'default',
    sUsers
  ]);

  return result.rows[0];
}

export async function updatePackage(id: string, data: any) {
  const vUnit = data.validity_unit || 'month';
  const vVal = parseInt(data.validity_value) || 1;
  const vDays = vUnit === 'month' ? vVal * 30 : vUnit === 'day' ? vVal : Math.ceil(vVal / 24) || 1;

  const vIso = data.validity_iso?.trim() || (vUnit === 'month' ? `P${vVal}M` : vUnit === 'day' ? `P${vVal}D` : vUnit === 'hour' ? `PT${vVal}H` : `PT${vVal}M`);
  const gDays = parseInt(data.grace_period_days) || 5;
  const gIso = data.grace_period_iso?.trim() || `P${gDays}D`;
  const isOnlyOne = Boolean(data.only_one_user);
  const sUsers = parseInt(data.shared_users) || 1;

  const result = await pool.query(`
    UPDATE packages
    SET name = $1,
        type = $2,
        price = $3,
        speed_limit = $4,
        validity_days = $5,
        validity_unit = $6,
        validity_value = $7,
        validity_iso = $8,
        grace_period_days = $9,
        grace_period_iso = $10,
        only_one_user = $11,
        uptime_limit = $12,
        quota_mb = $13,
        mikrotik_profile = $14,
        shared_users = $15
    WHERE id = $16
    RETURNING id, name, type, price, speed_limit, validity_days, validity_unit, validity_value, validity_iso, grace_period_days, grace_period_iso, only_one_user, uptime_limit, quota_mb, mikrotik_profile, shared_users
  `, [
    data.name.trim(), 
    data.type, 
    parseFloat(data.price), 
    data.speed_limit?.trim() || '10M/10M', 
    vDays, 
    vUnit,
    vVal,
    vIso,
    gDays,
    gIso,
    isOnlyOne,
    data.uptime_limit?.trim() || null,
    data.quota_mb ? parseInt(data.quota_mb) : null,
    data.mikrotik_profile?.trim() || 'default', 
    sUsers,
    id
  ]);

  return result.rows[0] || null;
}

export async function deletePackage(id: string) {
  const result = await pool.query('DELETE FROM packages WHERE id = $1 RETURNING id, name', [id]);
  return result.rows[0] || null;
}
