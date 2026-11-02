import { pool } from '../config/db.js';
import { getFirestore } from 'firebase-admin/firestore';
import { mikrotikTimeToIso } from '../controllers/mikrotikController.js';

export interface Package {
  id: string;
  name: string;
  type: string;
  price: number;
  speed_limit?: string;
  validity_iso?: string;
  grace_period_iso?: string;
  only_one_user?: boolean;
  lock_server?: boolean;
  expired_mode?: string;
  uptime_limit?: string;
  quota_mb?: number;
  fup_enabled?: boolean;
  fup_action?: 'speed' | 'profile' | 'isolir' | string;
  fup_profile?: string;
  fup_speed?: string;
  mikrotik_profile?: string;
  shared_users?: number;
  is_active?: boolean;
  created_at?: string;
}

export async function getAllPackages(): Promise<Package[]> {
  if (process.env.DB_DRIVER === 'firebase') {
    const db = getFirestore();
    if (db) {
      const snap = await db.collection('packages').get();
      const list: Package[] = [];
      snap.forEach((doc: any) => {
        if (doc.id !== '_init') {
          list.push({ id: doc.id, ...doc.data() } as Package);
        }
      });
      return list;
    }
  }

  const result = await pool.query('SELECT id, name, type, price, speed_limit, validity_iso, grace_period_iso, only_one_user, uptime_limit, quota_mb, COALESCE(fup_enabled, false) as fup_enabled, COALESCE(fup_action, \'speed\') as fup_action, fup_profile, COALESCE(fup_speed, \'1M/1M\') as fup_speed, mikrotik_profile, shared_users, COALESCE(lock_server, false) as lock_server, COALESCE(expired_mode, \'rem\') as expired_mode, COALESCE(is_active, true) as is_active, created_at FROM packages ORDER BY type ASC, price ASC');
  return result.rows;
}

export async function createPackage(data: any) {
  const vUnit = data.validity_unit || 'month';
  const vVal = parseInt(data.validity_value) || 1;
  const vIso = data.validity_iso?.trim() || (vUnit === 'month' ? `P${vVal}M` : vUnit === 'day' ? `P${vVal}D` : vUnit === 'hour' ? `PT${vVal}H` : `PT${vVal}M`);
  const gDays = parseInt(data.grace_period_days) || 5;
  const gIso = data.grace_period_iso?.trim() || `P${gDays}D`;
  const isOnlyOne = Boolean(data.only_one_user);
  const isLockServer = Boolean(data.lock_server);
  const expMode = (data.expired_mode || 'rem').trim();
  const sUsers = parseInt(data.shared_users) || 1;
  const pkgId = `pkg-${data.type}-${Date.now().toString(36)}`;

  const rawUptime = data.uptime_limit?.trim() || null;
  const uptimeIso = rawUptime ? (mikrotikTimeToIso(rawUptime) || rawUptime) : null;

  const pkgObj = {
    id: pkgId,
    name: data.name.trim(),
    type: data.type,
    price: parseFloat(data.price),
    speed_limit: data.speed_limit?.trim() || '10M/10M',
    validity_iso: vIso,
    grace_period_iso: gIso,
    only_one_user: isOnlyOne,
    lock_server: isLockServer,
    expired_mode: expMode,
    uptime_limit: uptimeIso,
    quota_mb: data.quota_mb ? parseInt(data.quota_mb) : null,
    fup_enabled: Boolean(data.fup_enabled),
    fup_action: data.fup_action || 'speed',
    fup_profile: data.fup_profile ? data.fup_profile.trim() : null,
    fup_speed: data.fup_speed ? data.fup_speed.trim() : '1M/1M',
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
    INSERT INTO packages (
      id, name, type, price, speed_limit, validity_iso, grace_period_iso, only_one_user,
      uptime_limit, quota_mb, fup_enabled, fup_action, fup_profile, fup_speed,
      mikrotik_profile, shared_users, lock_server, expired_mode
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING id, name, type, price, speed_limit, validity_iso, grace_period_iso, only_one_user, uptime_limit, quota_mb, fup_enabled, fup_action, fup_profile, fup_speed, mikrotik_profile, shared_users, lock_server, expired_mode, created_at
  `, [
    pkgId, 
    pkgObj.name, 
    pkgObj.type, 
    pkgObj.price, 
    pkgObj.speed_limit, 
    vIso,
    gIso,
    isOnlyOne,
    pkgObj.uptime_limit,
    pkgObj.quota_mb,
    pkgObj.fup_enabled,
    pkgObj.fup_action,
    pkgObj.fup_profile,
    pkgObj.fup_speed,
    pkgObj.mikrotik_profile,
    sUsers,
    isLockServer,
    expMode
  ]);

  return result.rows[0];
}

export async function updatePackage(id: string, data: any) {
  const vUnit = data.validity_unit || 'month';
  const vVal = parseInt(data.validity_value) || 1;
  const vIso = data.validity_iso?.trim() || (vUnit === 'month' ? `P${vVal}M` : vUnit === 'day' ? `P${vVal}D` : vUnit === 'hour' ? `PT${vVal}H` : `PT${vVal}M`);
  const gDays = parseInt(data.grace_period_days) || 5;
  const gIso = data.grace_period_iso?.trim() || `P${gDays}D`;
  const isOnlyOne = Boolean(data.only_one_user);
  const isLockServer = Boolean(data.lock_server);
  const expMode = (data.expired_mode || 'rem').trim();
  const sUsers = parseInt(data.shared_users) || 1;

  const rawUptime = data.uptime_limit?.trim() || null;
  const uptimeIso = rawUptime ? (mikrotikTimeToIso(rawUptime) || rawUptime) : null;

  const pkgObj = {
    id,
    name: data.name.trim(),
    type: data.type,
    price: parseFloat(data.price),
    speed_limit: data.speed_limit?.trim() || '10M/10M',
    validity_iso: vIso,
    grace_period_iso: gIso,
    only_one_user: isOnlyOne,
    lock_server: isLockServer,
    expired_mode: expMode,
    uptime_limit: uptimeIso,
    quota_mb: data.quota_mb ? parseInt(data.quota_mb) : null,
    fup_enabled: Boolean(data.fup_enabled),
    fup_action: data.fup_action || 'speed',
    fup_profile: data.fup_profile ? data.fup_profile.trim() : null,
    fup_speed: data.fup_speed ? data.fup_speed.trim() : '1M/1M',
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
        validity_iso = $5,
        grace_period_iso = $6,
        only_one_user = $7,
        uptime_limit = $8,
        quota_mb = $9,
        fup_enabled = $10,
        fup_action = $11,
        fup_profile = $12,
        fup_speed = $13,
        mikrotik_profile = $14,
        shared_users = $15,
        lock_server = $16,
        expired_mode = $17
    WHERE id = $18
    RETURNING id, name, type, price, speed_limit, validity_iso, grace_period_iso, only_one_user, uptime_limit, quota_mb, fup_enabled, fup_action, fup_profile, fup_speed, mikrotik_profile, shared_users, lock_server, expired_mode, created_at
  `, [
    pkgObj.name,
    pkgObj.type,
    pkgObj.price,
    pkgObj.speed_limit,
    vIso,
    gIso,
    isOnlyOne,
    pkgObj.uptime_limit,
    pkgObj.quota_mb,
    pkgObj.fup_enabled,
    pkgObj.fup_action,
    pkgObj.fup_profile,
    pkgObj.fup_speed,
    pkgObj.mikrotik_profile,
    sUsers,
    isLockServer,
    expMode,
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
