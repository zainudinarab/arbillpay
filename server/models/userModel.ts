import { pool } from '../config/db.js';
import { getFirestore } from '../config/firebase.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const getDriver = () => process.env.DB_DRIVER || 'postgres';

/**
 * Pembersihan otomatis integritas user:
 * 1. Hapus nilai nil UUID '00000000-0000-0000-0000-000000000000'
 * 2. Pastikan OWNER HANYA 1 (demote duplicate owner ke pelanggan)
 * 3. Hapus duplikasi user dengan nomor HP / email yang sama persis
 */
export async function cleanupUserIntegrity() {
  const driver = getDriver();
  if (driver === 'firebase') return;

  try {
    // 1. Bersihkan arabpay_user_id bernilai '00000000-...'
    await pool.query("UPDATE users SET arabpay_user_id = NULL WHERE arabpay_user_id LIKE '00000000%'");

    // 2. Dapatkan ID Owner yang sah dari system_settings jika ada
    let preferredOwnerId = '';
    const ownerSetting = await pool.query("SELECT value FROM system_settings WHERE key = 'arabpay_owner_user_id' LIMIT 1").catch(() => ({ rows: [] }));
    if (ownerSetting.rows.length > 0 && ownerSetting.rows[0].value && !ownerSetting.rows[0].value.startsWith('00000000')) {
      preferredOwnerId = ownerSetting.rows[0].value.trim();
    }

    // 3. Pastikan OWNER HANYA 1!
    const ownerRows = await pool.query("SELECT id, username, email, phone_number, created_at FROM users WHERE role = 'owner' ORDER BY created_at DESC");
    if (ownerRows.rows.length > 1) {
      let keeperId = ownerRows.rows[0].id;
      if (preferredOwnerId) {
        const match = ownerRows.rows.find((r: any) => r.id === preferredOwnerId || r.username === 'zainudinarab');
        if (match) keeperId = match.id;
      }
      await pool.query("UPDATE users SET role = 'pelanggan' WHERE role = 'owner' AND id != $1", [keeperId]);
      console.log(`👑 [USER INTEGRITY] Enforced single owner. Active owner ID: ${keeperId}`);
    }

    // 4. Bersihkan duplikat user berdasarkan phone_number yang sama (pertahankan yang owner atau terbaru)
    await pool.query(`
      DELETE FROM users u1
      WHERE u1.phone_number IS NOT NULL AND u1.phone_number <> ''
        AND EXISTS (
          SELECT 1 FROM users u2
          WHERE u2.phone_number = u1.phone_number
            AND u2.id <> u1.id
            AND (
              (u2.role = 'owner' AND u1.role <> 'owner')
              OR (u2.role = u1.role AND u2.created_at >= u1.created_at AND u2.id > u1.id)
            )
        )
    `);

    // 5. Bersihkan duplikat user berdasarkan email yang sama
    await pool.query(`
      DELETE FROM users u1
      WHERE u1.email IS NOT NULL AND u1.email <> ''
        AND EXISTS (
          SELECT 1 FROM users u2
          WHERE LOWER(u2.email) = LOWER(u1.email)
            AND u2.id <> u1.id
            AND (
              (u2.role = 'owner' AND u1.role <> 'owner')
              OR (u2.role = u1.role AND u2.created_at >= u1.created_at AND u2.id > u1.id)
            )
        )
    `);
  } catch (err: any) {
    console.warn('[USER INTEGRITY WARNING]:', err.message);
  }
}

export async function getAllUsers() {
  await cleanupUserIntegrity();

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
  const cleanEmail = data.email.trim().toLowerCase();
  const cleanPhone = data.phone_number ? data.phone_number.trim() : null;
  const targetRole = data.role || 'pelanggan';

  // ATURAN USER: Jika email atau nomor HP sudah ada, otomatis UPDATE user yang ada (tidak gagal/duplikat!)
  let existingUser = null;
  if (cleanEmail) {
    const resEmail = await pool.query('SELECT id, name, role FROM users WHERE LOWER(email) = $1 LIMIT 1', [cleanEmail]);
    if (resEmail.rows.length > 0) existingUser = resEmail.rows[0];
  }
  if (!existingUser && cleanPhone) {
    const resPhone = await pool.query('SELECT id, name, role FROM users WHERE phone_number = $1 LIMIT 1', [cleanPhone]);
    if (resPhone.rows.length > 0) existingUser = resPhone.rows[0];
  }

  if (existingUser) {
    console.log(`🔄 [USER AUTO-UPDATE] Akun dengan email "${cleanEmail}" / HP "${cleanPhone}" sudah ada. Memperbarui user ID: ${existingUser.id}`);
    return await updateUser(existingUser.id, {
      name: data.name,
      username: data.username,
      email: data.email,
      phone_number: data.phone_number,
      role: targetRole,
      password: data.password
    });
  }

  const userId = crypto.randomUUID();
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(data.password, saltRounds);
  const now = new Date();

  // Jika user baru di-set sebagai Owner, demote owner lain ke pelanggan (Owner hanya boleh 1!)
  if (targetRole === 'owner') {
    await pool.query("UPDATE users SET role = 'pelanggan' WHERE role = 'owner'");
  }

  const userObj = {
    id: userId,
    username: data.username.trim().toLowerCase(),
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    phone_number: data.phone_number || null,
    role: targetRole,
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
      if (data.arabpay_user_id && !data.arabpay_user_id.startsWith('00000000')) updateData.arabpay_user_id = data.arabpay_user_id.trim();
      if (data.password && data.password.trim().length >= 4) {
        updateData.password_hash = await bcrypt.hash(data.password.trim(), 10);
      }

      await docRef.update(updateData);
      const updatedDoc = await docRef.get();
      const { password_hash, ...resUser } = updatedDoc.data();
      return resUser;
    }
  }

  const targetUserCheck = await pool.query('SELECT id, name, email, phone_number, role, arabpay_user_id FROM users WHERE id = $1 OR arabpay_user_id = $1 LIMIT 1', [id]);
  if (targetUserCheck.rows.length === 0) {
    return null;
  }
  const existingRow = targetUserCheck.rows[0];
  const targetId = existingRow.id;

  const finalRole = data.role || existingRow.role || 'pelanggan';

  // ATURAN OWNER HANYA 1: Jika user ini di-set sebagai owner, demote seluruh owner lainnya!
  if (finalRole === 'owner') {
    await pool.query("UPDATE users SET role = 'pelanggan' WHERE role = 'owner' AND id != $1", [targetId]);
  }

  // Jika ada user lain dengan email atau HP yang sama, gabungkan (hapus duplikat user lain)
  if (data.email && data.email.trim()) {
    const cleanEmail = data.email.trim().toLowerCase();
    await pool.query('DELETE FROM users WHERE LOWER(email) = $1 AND id != $2', [cleanEmail, targetId]);
  }

  if (data.phone_number && data.phone_number.trim()) {
    const cleanPhone = data.phone_number.trim();
    await pool.query('DELETE FROM users WHERE phone_number = $1 AND id != $2', [cleanPhone, targetId]);
  }

  const newName = data.name ? data.name.trim() : existingRow.name;
  const newEmail = data.email ? data.email.trim().toLowerCase() : existingRow.email;
  const newPhone = data.phone_number !== undefined ? data.phone_number : existingRow.phone_number;

  const cleanArabPayId = (data.arabpay_user_id && !data.arabpay_user_id.startsWith('00000000'))
    ? data.arabpay_user_id.trim()
    : null;

  const params: any[] = [newName, newEmail, newPhone, finalRole, targetId];

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

  if (cleanArabPayId !== null) {
    params.push(cleanArabPayId);
    queryStr += `, arabpay_user_id = $${params.length}`;
  }

  if (data.password && data.password.trim().length >= 4) {
    const passwordHash = await bcrypt.hash(data.password.trim(), 10);
    params.push(passwordHash);
    queryStr += `, password_hash = $${params.length}`;
  }

  queryStr += ` WHERE id = $5 RETURNING id, username, name, email, phone_number, arabpay_user_id, role, created_at`;

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

export async function deleteUser(id: string) {
  const driver = getDriver();
  if (driver === 'firebase') {
    const db = getFirestore();
    if (db) {
      await db.collection('users').doc(id).delete();
      return true;
    }
  }

  const result = await pool.query('DELETE FROM users WHERE id = $1 OR arabpay_user_id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
