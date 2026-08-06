import { pool } from '../config/db.js';
import { getFirestore } from '../config/firebase.js';

export async function getAllPackages() {
  if (process.env.DB_DRIVER === 'firebase') {
    const db = getFirestore();
    if (db) {
      const snap = await db.collection('packages').get();
      const list: any[] = [];
      snap.forEach((doc: any) => {
        if (doc.id !== '_init') {
          list.push({ id: doc.id, ...doc.data() });
        }
      });
      return list;
    }
  }

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

  const pkgObj = {
    id: pkgId,
    name: data.name.trim(),
    type: data.type,
    price: parseFloat(data.price),
    speed_limit: data.speed_limit?.trim() || '10M/10M',
    validity_days: vDays,
    validity_unit: vUnit,
    validity_value: vVal,
    validity_iso: vIso,
    grace_period_days: gDays,
    grace_period_iso: gIso,
    only_one_user: isOnlyOne,
    uptime_limit: data.uptime_limit?.trim() || null,
    quota_mb: data.quota_mb ? parseInt(data.quota_mb) : null,
    mikrotik_profile: data.mikrotik_profile?.trim() || 'default',
    shared_users: sUsers,
    created_at: new Date().toISOString()
  };

  if (process.env.DB_DRIVER === 'firebase') {
    const db = getFirestore();
    if (db) {
      await db.collection('packages').doc(pkgId).set(pkgObj);
      return pkgObj;
    }
  }

  const result = await pool.query(`
    INSERT INTO packages (id, name, type, price, speed_limit, validity_days, validity_unit, validity_value, validity_iso, grace_period_days, grace_period_iso, only_one_user, uptime_limit, quota_mb, mikrotik_profile, shared_users)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING id, name, type, price, speed_limit, validity_days, validity_unit, validity_value, validity_iso, grace_period_days, grace_period_iso, only_one_user, uptime_limit, quota_mb, mikrotik_profile, shared_users, created_at
  `, [
    pkgId, 
    pkgObj.name, 
    pkgObj.type, 
    pkgObj.price, 
    pkgObj.speed_limit, 
    vDays, 
    vUnit,
    vVal,
    vIso,
    gDays,
    gIso,
    isOnlyOne,
    pkgObj.uptime_limit,
    pkgObj.quota_mb,
    pkgObj.mikrotik_profile,
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

  const pkgObj = {
    id,
    name: data.name.trim(),
    type: data.type,
    price: parseFloat(data.price),
    speed_limit: data.speed_limit?.trim() || '10M/10M',
    validity_days: vDays,
    validity_unit: vUnit,
    validity_value: vVal,
    validity_iso: vIso,
    grace_period_days: gDays,
    grace_period_iso: gIso,
    only_one_user: isOnlyOne,
    uptime_limit: data.uptime_limit?.trim() || null,
    quota_mb: data.quota_mb ? parseInt(data.quota_mb) : null,
    mikrotik_profile: data.mikrotik_profile?.trim() || 'default',
    shared_users: sUsers
  };

  if (process.env.DB_DRIVER === 'firebase') {
    const db = getFirestore();
    if (db) {
      await db.collection('packages').doc(id).set(pkgObj, { merge: true });
      return pkgObj;
    }
  }

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
    RETURNING id, name, type, price, speed_limit, validity_days, validity_unit, validity_value, validity_iso, grace_period_days, grace_period_iso, only_one_user, uptime_limit, quota_mb, mikrotik_profile, shared_users, created_at
  `, [
    pkgObj.name,
    pkgObj.type,
    pkgObj.price,
    pkgObj.speed_limit,
    vDays,
    vUnit,
    vVal,
    vIso,
    gDays,
    gIso,
    isOnlyOne,
    pkgObj.uptime_limit,
    pkgObj.quota_mb,
    pkgObj.mikrotik_profile,
    sUsers,
    id
  ]);

  return result.rows[0];
}

export async function deletePackage(id: string) {
  if (process.env.DB_DRIVER === 'firebase') {
    const db = getFirestore();
    if (db) {
      await db.collection('packages').doc(id).delete();
      return true;
    }
  }

  await pool.query('DELETE FROM packages WHERE id = $1', [id]);
  return true;
}
