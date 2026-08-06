import { pool } from '../config/db.js';
import { getFirestore } from '../config/firebase.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const getDriver = () => process.env.DB_DRIVER || 'postgres';

export async function getAllUsers() {
  const driver = getDriver();
  if (driver === 'firebase') {
    const db = getFirestore();
    if (db) {
      const snapshot = await db.collection('users').orderBy('created_at', 'desc').get();
      return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    }
  }

  const result = await pool.query(
    'SELECT id, username, name, email, phone_number, arabpay_user_id, role, created_at FROM users ORDER BY created_at DESC'
  );
  return result.rows;
}

export async function createUser(data: { username: string; name: string; email: string; phone_number?: string; role?: string; password: string }) {
  const userId = crypto.randomUUID();
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(data.password, saltRounds);
  const now = new Date();

  const userObj = {
    id: userId,
    username: data.username.trim().toLowerCase(),
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    phone_number: data.phone_number || null,
    role: data.role || 'pelanggan',
    password_hash: passwordHash,
    created_at: now
  };

  const driver = getDriver();
  if (driver === 'firebase') {
    const db = getFirestore();
    if (db) {
      await db.collection('users').doc(userId).set(userObj);
      const { password_hash, ...publicUser } = userObj;
      return publicUser;
    }
  }

  const result = await pool.query(
    `INSERT INTO users (id, username, name, email, phone_number, role, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, username, name, email, phone_number, role, created_at`,
    [userId, userObj.username, userObj.name, userObj.email, userObj.phone_number, userObj.role, passwordHash]
  );
  return result.rows[0];
}

export async function updateUser(id: string, data: { name: string; username?: string; email: string; phone_number?: string; role?: string; password?: string }) {
  const ownerUserId = (process.env.ARABPAY_OWNER_USER_ID || '019f74af9fcdWDgDxM8g').trim();
  const driver = getDriver();

  if (driver === 'firebase') {
    const db = getFirestore();
    if (db) {
      const docRef = db.collection('users').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) return null;

      const updateData: any = {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        phone_number: data.phone_number || null,
        role: data.role || 'pelanggan'
      };
      if (data.username) updateData.username = data.username.trim().toLowerCase();
      if (data.password && data.password.trim().length >= 4) {
        updateData.password_hash = await bcrypt.hash(data.password.trim(), 10);
      }

      await docRef.update(updateData);
      const updatedDoc = await docRef.get();
      const { password_hash, ...resUser } = updatedDoc.data();
      return resUser;
    }
  }

  const targetUserCheck = await pool.query('SELECT role, arabpay_user_id FROM users WHERE id = $1 OR arabpay_user_id = $1', [id]);
  
  let finalRole = data.role || 'pelanggan';
  if (targetUserCheck.rows.length > 0) {
    const existingRow = targetUserCheck.rows[0];
    if (existingRow.role === 'owner' || existingRow.arabpay_user_id === ownerUserId) {
      finalRole = 'owner';
    }
  }

  const params: any[] = [data.name.trim(), data.email.trim().toLowerCase(), data.phone_number || null, finalRole, id];

  let queryStr = `
    UPDATE users 
    SET name = $1,
        email = $2,
        phone_number = $3,
        role = $4`;

  if (data.username && data.username.trim()) {
    params.push(data.username.trim().toLowerCase());
    queryStr += `, username = $${params.length}`;
  }

  if (data.password && data.password.trim().length >= 4) {
    const passwordHash = await bcrypt.hash(data.password.trim(), 10);
    params.push(passwordHash);
    queryStr += `, password_hash = $${params.length}`;
  }

  queryStr += ` WHERE id = $5 OR arabpay_user_id = $5 RETURNING id, username, name, email, phone_number, arabpay_user_id, role, created_at`;

  const result = await pool.query(queryStr, params);
  return result.rows[0] || null;
}

export async function updateOwnerProfile(userId: string | undefined, data: { name?: string; email?: string; phone_number?: string }) {
  const ownerUserId = (process.env.ARABPAY_OWNER_USER_ID || '019f74af9fcdWDgDxM8g').trim();
  const targetId = userId || ownerUserId;

  const driver = getDriver();
  if (driver === 'firebase') {
    const db = getFirestore();
    if (db) {
      const docRef = db.collection('users').doc(targetId);
      await docRef.set({
        name: data.name?.trim(),
        email: data.email?.trim().toLowerCase(),
        phone_number: data.phone_number?.trim()
      }, { merge: true });
      const doc = await docRef.get();
      return { id: doc.id, ...doc.data() };
    }
  }

  const result = await pool.query(
    `UPDATE users 
     SET name = COALESCE($1, name),
         email = COALESCE($2, email),
         phone_number = COALESCE($3, phone_number)
     WHERE id = $4 OR arabpay_user_id = $4 OR role = 'owner'
     RETURNING id, username, name, email, phone_number, arabpay_user_id, role`,
    [data.name?.trim(), data.email?.trim().toLowerCase(), data.phone_number?.trim(), targetId]
  );
  return result.rows[0];
}

export async function findUserByIdentity(identity: string) {
  const cleanIdentity = identity.trim().toLowerCase();
  const driver = getDriver();

  if (driver === 'firebase') {
    const db = getFirestore();
    if (db) {
      const snapshot = await db.collection('users').where('username', '==', cleanIdentity).get();
      if (!snapshot.empty) return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    }
  }

  const result = await pool.query(
    'SELECT id, username, name, email, phone_number, role, password_hash FROM users WHERE username = $1 OR email = $1 OR phone_number = $1',
    [cleanIdentity]
  );
  return result.rows[0] || null;
}

export async function updatePasswordHash(userId: string, newHash: string) {
  const driver = getDriver();
  if (driver === 'firebase') {
    const db = getFirestore();
    if (db) {
      await db.collection('users').doc(userId).update({ password_hash: newHash });
      return;
    }
  }

  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
}
