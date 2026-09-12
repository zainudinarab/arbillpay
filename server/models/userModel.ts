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

export async function updateUser(id: string, data: { name?: string; username?: string; email?: string; phone_number?: string; role?: string; password?: string; arabpay_user_id?: string }) {
  const ownerUserId = (process.env.ARABPAY_OWNER_USER_ID || '019f74af9fcdWDgDxM8g').trim();
  const driver = getDriver();

  if (driver === 'firebase') {
    const db = getFirestore();
    if (db) {
      const docRef = db.collection('users').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) return null;

      const updateData: any = {};
      if (data.name) updateData.name = data.name.trim();
      if (data.email) updateData.email = data.email.trim().toLowerCase();
      if (data.phone_number !== undefined) updateData.phone_number = data.phone_number;
      if (data.role) updateData.role = data.role;
      if (data.username) updateData.username = data.username.trim().toLowerCase();
      if (data.arabpay_user_id) updateData.arabpay_user_id = data.arabpay_user_id.trim();
      if (data.password && data.password.trim().length >= 4) {
        updateData.password_hash = await bcrypt.hash(data.password.trim(), 10);
      }

      await docRef.update(updateData);
      const updatedDoc = await docRef.get();
      const { password_hash, ...resUser } = updatedDoc.data();
      return resUser;
    }
  }

  const targetUserCheck = await pool.query('SELECT name, email, phone_number, role, arabpay_user_id FROM users WHERE id = $1 OR arabpay_user_id = $1', [id]);
  if (targetUserCheck.rows.length === 0) {
    return null;
  }
  const existingRow = targetUserCheck.rows[0];

  let finalRole = data.role || existingRow.role || 'pelanggan';
  if (existingRow.role === 'owner' || existingRow.arabpay_user_id === ownerUserId) {
    finalRole = 'owner';
  }

  const newName = data.name ? data.name.trim() : existingRow.name;
  const newEmail = data.email ? data.email.trim().toLowerCase() : existingRow.email;
  const newPhone = data.phone_number !== undefined ? data.phone_number : existingRow.phone_number;

  const params: any[] = [newName, newEmail, newPhone, finalRole, id];

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

  if (data.arabpay_user_id) {
    params.push(data.arabpay_user_id.trim());
    queryStr += `, arabpay_user_id = $${params.length}`;
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
    'SELECT id, username, name, email, phone_number, role, password_hash, password FROM users WHERE username = $1 OR email = $1 OR phone_number = $1',
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
