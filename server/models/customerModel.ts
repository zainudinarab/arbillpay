import { pool } from '../config/db.js';
import { getFirestore } from '../config/firebase.js';
import crypto from 'crypto';

const getDriver = () => process.env.DB_DRIVER || 'postgres';

export async function getAllCustomers() {
  const driver = getDriver();
  if (driver === 'firebase') {
    const db = getFirestore();
    if (db) {
      const snapshot = await db.collection('customers').orderBy('created_at', 'desc').get();
      return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    }
  }

  const result = await pool.query(`
    SELECT c.id, c.user_id, c.customer_code, c.name, c.phone_number, c.address, c.connection_type, 
           c.dusun, c.desa, c.kecamatan, c.kabupaten, c.provinsi,
           c.pppoe_username, c.pppoe_password, c.static_ip, c.installation_date, c.expired_at, c.grace_until,
           c.odp_port, c.sn_onu, c.power_laser, c.teknisi, c.is_synced,
           c.latitude, c.longitude, c.maps_url,
           c.package_id, c.router_id, c.router_profile_id, c.status, c.created_at,
           p.name as package_name, p.price as package_price, p.type as package_type, p.speed_limit,
           r.name as router_name, r.ip_address as router_ip,
           rp.name as router_profile_name, rp.type as router_profile_type,
           u.email as linked_user_email, u.arabpay_user_id
    FROM customers c
    LEFT JOIN packages p ON c.package_id = p.id
    LEFT JOIN routers r ON c.router_id = r.id
    LEFT JOIN router_profiles rp ON c.router_profile_id = rp.id
    LEFT JOIN users u ON c.user_id = u.id
    ORDER BY c.created_at DESC
  `);
  return result.rows;
}

export async function createCustomer(data: any) {
  const customerId = crypto.randomUUID();
  const cleanPhone = data.phone_number?.trim() || '';
  const code = data.customer_code?.trim() || `CUST-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  let linkedUserId = data.user_id || null;
  if (!linkedUserId && cleanPhone) {
    const matchedUser = await pool.query('SELECT id FROM users WHERE phone_number = $1 OR arabpay_user_id = $1 LIMIT 1', [cleanPhone]);
    if (matchedUser.rows.length > 0) linkedUserId = matchedUser.rows[0].id;
  }

  const lat = data.latitude ? parseFloat(data.latitude) : null;
  const lng = data.longitude ? parseFloat(data.longitude) : null;
  const mapUrl = data.maps_url || (lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null);
  const now = new Date();

  const customerObj = {
    id: customerId,
    user_id: linkedUserId,
    customer_code: code,
    name: data.name.trim(),
    phone_number: cleanPhone,
    address: data.address?.trim() || null,
    dusun: data.dusun?.trim() || null,
    desa: data.desa?.trim() || null,
    kecamatan: data.kecamatan?.trim() || null,
    kabupaten: data.kabupaten?.trim() || null,
    provinsi: data.provinsi?.trim() || null,
    connection_type: data.connection_type || 'pppoe',
    pppoe_username: data.pppoe_username?.trim() || null,
    pppoe_password: data.pppoe_password?.trim() || null,
    static_ip: data.static_ip?.trim() || null,
    installation_date: data.installation_date || now,
    expired_at: data.expired_at || null,
    grace_until: data.grace_until || null,
    odp_port: data.odp_port?.trim() || null,
    sn_onu: data.sn_onu?.trim() || null,
    power_laser: data.power_laser?.trim() || null,
    teknisi: data.teknisi?.trim() || null,
    latitude: lat,
    longitude: lng,
    maps_url: mapUrl,
    package_id: data.package_id,
    router_id: data.router_id || null,
    router_profile_id: data.router_profile_id || null,
    status: (data.status === 'off' || data.status === 'pending') ? 'non-active' : (data.status || 'active'),
    is_synced: true,
    created_at: now
  };

  const driver = getDriver();
  if (driver === 'firebase') {
    const db = getFirestore();
    if (db) {
      await db.collection('customers').doc(customerId).set(customerObj);
      return { customer: customerObj, code };
    }
  }

  const result = await pool.query(`
    INSERT INTO customers (
      id, user_id, customer_code, name, phone_number, address, connection_type, 
      dusun, desa, kecamatan, kabupaten, provinsi,
      pppoe_username, pppoe_password, static_ip, installation_date, expired_at, grace_until,
      odp_port, sn_onu, power_laser, teknisi, latitude, longitude, maps_url, package_id, router_id, router_profile_id, status, is_synced
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, true)
    RETURNING id, user_id, customer_code, name, phone_number, pppoe_username, latitude, longitude, maps_url, dusun, desa, kecamatan, kabupaten, provinsi, status, created_at
  `, [
    customerId, linkedUserId, code, data.name.trim(), cleanPhone, data.address?.trim() || null, data.connection_type || 'pppoe',
    data.dusun?.trim() || null, data.desa?.trim() || null, data.kecamatan?.trim() || null, data.kabupaten?.trim() || null, data.provinsi?.trim() || null,
    data.pppoe_username?.trim() || null, data.pppoe_password?.trim() || null,
    data.static_ip?.trim() || null, data.installation_date || now, data.expired_at || null, data.grace_until || null,
    data.odp_port?.trim() || null, data.sn_onu?.trim() || null, data.power_laser?.trim() || null, data.teknisi?.trim() || null,
    lat, lng, mapUrl,
    data.package_id, data.router_id || null, data.router_profile_id || null, data.status || 'active'
  ]);

  return { customer: result.rows[0], code };
}

export async function deleteCustomer(id: string) {
  const driver = getDriver();
  if (driver === 'firebase') {
    const db = getFirestore();
    if (db) {
      const docRef = db.collection('customers').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) return null;
      const data = doc.data();
      await docRef.delete();
      return { id: doc.id, name: data.name };
    }
  }

  const result = await pool.query('DELETE FROM customers WHERE id = $1 RETURNING id, name', [id]);
  return result.rows[0] || null;
}
