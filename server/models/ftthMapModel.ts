import { pool } from '../config/db.js';
import { getFirestore } from '../config/firebase.js';

const getDriver = () => process.env.DB_DRIVER || 'postgres';

export interface FtthNodeData {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  splitterCapacity?: number;
  splitterRatio?: string;
  outputPower?: number;
  sfpPowerList?: number[];
  attenuationDb?: number;
  customerId?: string | null;
  internalSplitters?: any[];
}

export interface FtthCableData {
  id: string;
  fromId: string;
  fromPort?: number;
  toId: string;
  toPort?: number;
  waypoints?: Array<[number, number]>;
  cableLengthM?: number;
  attenuationDb?: number;
  cableColor?: string;
  coreNumber?: string;
  cableType?: string;
  totalCores?: number;
  coreSplicingMap?: Record<number, { action: string; note?: string }>;
}

async function ensureTablesExist() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ftth_nodes (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(32) NOT NULL DEFAULT 'ODP',
      lat NUMERIC(10, 8) NOT NULL,
      lng NUMERIC(11, 8) NOT NULL,
      splitter_capacity INT DEFAULT 8,
      splitter_ratio VARCHAR(32) DEFAULT '1:8',
      output_power NUMERIC(6, 2) DEFAULT 9.00,
      sfp_powers JSONB DEFAULT '[]'::jsonb,
      attenuation_db NUMERIC(6, 2) DEFAULT 0.00,
      customer_id VARCHAR(64),
      internal_splitters JSONB DEFAULT '[]'::jsonb,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => {});

  await pool.query(`
    ALTER TABLE ftth_nodes 
    ADD COLUMN IF NOT EXISTS splitter_ratio VARCHAR(32) DEFAULT '1:8',
    ADD COLUMN IF NOT EXISTS output_power NUMERIC(6, 2) DEFAULT 9.00,
    ADD COLUMN IF NOT EXISTS sfp_powers JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS attenuation_db NUMERIC(6, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS calculated_rx_power NUMERIC(6, 2),
    ADD COLUMN IF NOT EXISTS calculated_tx_power NUMERIC(6, 2),
    ADD COLUMN IF NOT EXISTS total_loss_db NUMERIC(6, 2),
    ADD COLUMN IF NOT EXISTS internal_splitters JSONB DEFAULT '[]'::jsonb;
  `).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ftth_cables (
      id VARCHAR(64) PRIMARY KEY,
      from_id VARCHAR(64) NOT NULL,
      from_port INT DEFAULT 1,
      to_id VARCHAR(64) NOT NULL,
      to_port INT DEFAULT 1,
      waypoints JSONB DEFAULT '[]'::jsonb,
      cable_length_m NUMERIC(10, 2) DEFAULT 0,
      attenuation_db NUMERIC(6, 2) DEFAULT 0,
      cable_color VARCHAR(32),
      core_number VARCHAR(64),
      cable_type VARCHAR(64),
      total_cores INT DEFAULT 4,
      core_splicing_map JSONB DEFAULT '{}'::jsonb,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => {});

  await pool.query(`
    ALTER TABLE ftth_cables 
    ADD COLUMN IF NOT EXISTS cable_length_m NUMERIC(10, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS attenuation_db NUMERIC(6, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cable_color VARCHAR(32),
    ADD COLUMN IF NOT EXISTS core_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS cable_type VARCHAR(64),
    ADD COLUMN IF NOT EXISTS total_cores INT DEFAULT 4,
    ADD COLUMN IF NOT EXISTS core_splicing_map JSONB DEFAULT '{}'::jsonb;
  `).catch(() => {});
}

export async function getFtthMapTopology() {
  const driver = getDriver();
  if (driver === 'firebase') {
    const db = getFirestore();
    if (db) {
      const nodesSnap = await db.collection('ftth_nodes').get();
      const cablesSnap = await db.collection('ftth_cables').get();
      
      const nodes = nodesSnap.docs.map((doc: any) => ({
        id: doc.id,
        name: doc.data().name,
        type: doc.data().type,
        lat: Number(doc.data().lat),
        lng: Number(doc.data().lng),
        splitterCapacity: Number(doc.data().splitterCapacity || 8),
        customerId: doc.data().customerId || null
      }));

      const lines = cablesSnap.docs.map((doc: any) => ({
        id: doc.id,
        fromId: doc.data().fromId,
        fromPort: Number(doc.data().fromPort || 1),
        toId: doc.data().toId,
        toPort: Number(doc.data().toPort || 1),
        waypoints: doc.data().waypoints || [],
        cableColor: doc.data().cableColor || undefined,
        coreNumber: doc.data().coreNumber || undefined,
        cableType: doc.data().cableType || undefined,
        totalCores: doc.data().totalCores || 4,
        coreSplicingMap: doc.data().coreSplicingMap || {}
      }));

      return { nodes, lines };
    }
  }

  await ensureTablesExist();

  const nodesRes = await pool.query('SELECT id, name, type, lat, lng, splitter_capacity, splitter_ratio, output_power, sfp_powers, attenuation_db, customer_id, internal_splitters FROM ftth_nodes');
  const cablesRes = await pool.query('SELECT id, from_id, from_port, to_id, to_port, waypoints, cable_length_m, attenuation_db, cable_color, core_number, cable_type, total_cores, core_splicing_map FROM ftth_cables');

  const nodes = nodesRes.rows.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    lat: Number(r.lat),
    lng: Number(r.lng),
    splitterCapacity: Number(r.splitter_capacity || 8),
    splitterRatio: r.splitter_ratio || '1:8',
    outputPower: r.output_power !== null && r.output_power !== undefined ? Number(r.output_power) : 9.0,
    sfpPowerList: typeof r.sfp_powers === 'string' ? JSON.parse(r.sfp_powers) : (Array.isArray(r.sfp_powers) ? r.sfp_powers : []),
    attenuationDb: r.attenuation_db !== null && r.attenuation_db !== undefined ? Number(r.attenuation_db) : 0,
    customerId: r.customer_id ? String(r.customer_id) : null,
    internalSplitters: typeof r.internal_splitters === 'string' ? JSON.parse(r.internal_splitters) : (Array.isArray(r.internal_splitters) ? r.internal_splitters : [])
  }));

  const lines = cablesRes.rows.map(r => ({
    id: r.id,
    fromId: r.from_id,
    fromPort: Number(r.from_port || 1),
    toId: r.to_id,
    toPort: Number(r.to_port || 1),
    waypoints: typeof r.waypoints === 'string' ? JSON.parse(r.waypoints) : (r.waypoints || []),
    cableLengthM: r.cable_length_m !== null && r.cable_length_m !== undefined ? Number(r.cable_length_m) : 0,
    attenuationDb: r.attenuation_db !== null && r.attenuation_db !== undefined ? Number(r.attenuation_db) : 0,
    cableColor: r.cable_color || undefined,
    coreNumber: r.core_number || undefined,
    cableType: r.cable_type || undefined,
    totalCores: r.total_cores !== null && r.total_cores !== undefined ? Number(r.total_cores) : 4,
    coreSplicingMap: typeof r.core_splicing_map === 'string' ? JSON.parse(r.core_splicing_map) : (r.core_splicing_map || {})
  }));

  return { nodes, lines };
}

export async function saveFtthMapTopology(nodes: FtthNodeData[], lines: FtthCableData[]) {
  const driver = getDriver();
  if (driver === 'firebase') {
    const db = getFirestore();
    if (db) {
      const batch = db.batch();
      
      const existingNodes = await db.collection('ftth_nodes').get();
      existingNodes.docs.forEach((doc: any) => batch.delete(doc.ref));

      const existingCables = await db.collection('ftth_cables').get();
      existingCables.docs.forEach((doc: any) => batch.delete(doc.ref));

      nodes.forEach(n => {
        const ref = db.collection('ftth_nodes').doc(n.id);
        batch.set(ref, {
          name: n.name || n.type,
          type: n.type,
          lat: Number(n.lat),
          lng: Number(n.lng),
          splitterCapacity: Number(n.splitterCapacity || 8),
          splitterRatio: n.splitterRatio || '1:8',
          outputPower: n.outputPower !== undefined ? Number(n.outputPower) : 9.0,
          sfpPowerList: n.sfpPowerList || [],
          attenuationDb: n.attenuationDb !== undefined ? Number(n.attenuationDb) : 0,
          customerId: n.customerId || null,
          internalSplitters: n.internalSplitters || [],
          updated_at: new Date()
        });
      });

      lines.forEach(l => {
        const ref = db.collection('ftth_cables').doc(l.id);
        const rawCores = (l as any).totalCores || (l as any).total_cores;
        batch.set(ref, {
          fromId: l.fromId,
          fromPort: Number(l.fromPort || 1),
          toId: l.toId,
          toPort: Number(l.toPort || 1),
          waypoints: l.waypoints || [],
          cableLengthM: Number(l.cableLengthM || 0),
          attenuationDb: Number(l.attenuationDb || 0),
          cableColor: l.cableColor || null,
          coreNumber: l.coreNumber || null,
          cableType: l.cableType || null,
          totalCores: rawCores !== undefined && rawCores !== null ? Number(rawCores) : 4,
          coreSplicingMap: l.coreSplicingMap || (l as any).core_splicing_map || {},
          updated_at: new Date()
        });
      });

      await batch.commit();
      return { success: true, countNodes: nodes.length, countLines: lines.length };
    }
  }

  await ensureTablesExist();

  // PostgreSQL Persistence Transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM ftth_cables');
    await client.query('DELETE FROM ftth_nodes');

    for (const n of nodes) {
      await client.query(
        `INSERT INTO ftth_nodes (id, name, type, lat, lng, splitter_capacity, splitter_ratio, output_power, sfp_powers, attenuation_db, customer_id, internal_splitters)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb)`,
        [
          n.id, n.name || n.type, n.type, Number(n.lat), Number(n.lng), 
          Number(n.splitterCapacity || 8), n.splitterRatio || '1:8', 
          n.outputPower !== undefined ? Number(n.outputPower) : 9.0,
          JSON.stringify(n.sfpPowerList || []),
          n.attenuationDb !== undefined ? Number(n.attenuationDb) : 0,
          n.customerId || null,
          JSON.stringify(n.internalSplitters || [])
        ]
      );
    }

    for (const l of lines) {
      const rawTotalCores = (l as any).totalCores || (l as any).total_cores;
      const totalCoresNum = rawTotalCores !== undefined && rawTotalCores !== null ? Number(rawTotalCores) : 4;
      const rawSplicingMap = l.coreSplicingMap || (l as any).core_splicing_map || {};

      await client.query(
        `INSERT INTO ftth_cables (id, from_id, from_port, to_id, to_port, waypoints, cable_length_m, attenuation_db, cable_color, core_number, cable_type, total_cores, core_splicing_map)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
        [
          l.id, l.fromId, Number(l.fromPort || 1), l.toId, Number(l.toPort || 1), 
          JSON.stringify(l.waypoints || []), Number(l.cableLengthM || 0), Number(l.attenuationDb || 0),
          l.cableColor || null, l.coreNumber || null, l.cableType || null,
          totalCoresNum, JSON.stringify(rawSplicingMap)
        ]
      );
    }

    await client.query('COMMIT');
    return { success: true, countNodes: nodes.length, countLines: lines.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface SplitterTypeRecord {
  id: string;
  name: string;
  category: 'symmetric' | 'asymmetric' | 'hybrid';
  ratioCode: string;
  capacity: number;
  passLossDb: number;
  dropLossDb: number;
  description?: string;
}

export async function getSplitterTypes(): Promise<SplitterTypeRecord[]> {
  const res = await pool.query('SELECT * FROM ftth_splitter_types ORDER BY category ASC, capacity ASC, created_at ASC');
  return res.rows.map(r => ({
    id: r.id,
    name: r.name,
    category: r.category as any,
    ratioCode: r.ratio_code,
    capacity: Number(r.capacity),
    passLossDb: Number(r.pass_loss_db),
    dropLossDb: Number(r.drop_loss_db),
    description: r.description
  }));
}

export async function addSplitterType(data: Partial<SplitterTypeRecord>): Promise<SplitterTypeRecord> {
  const id = data.id || `sp_custom_${Date.now()}`;
  const name = data.name || 'Splitter Custom';
  const category = data.category || 'symmetric';
  const ratioCode = data.ratioCode || '1:8';
  const capacity = Number(data.capacity || 8);
  const passLossDb = Number(data.passLossDb || 10.5);
  const dropLossDb = Number(data.dropLossDb || 10.5);
  const description = data.description || '';

  await pool.query(
    `INSERT INTO ftth_splitter_types (id, name, category, ratio_code, capacity, pass_loss_db, drop_loss_db, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET 
       name = EXCLUDED.name, category = EXCLUDED.category, ratio_code = EXCLUDED.ratio_code,
       capacity = EXCLUDED.capacity, pass_loss_db = EXCLUDED.pass_loss_db, drop_loss_db = EXCLUDED.drop_loss_db,
       description = EXCLUDED.description`,
    [id, name, category, ratioCode, capacity, passLossDb, dropLossDb, description]
  );
  return { id, name, category, ratioCode, capacity, passLossDb, dropLossDb, description };
}

export async function deleteSplitterType(id: string): Promise<boolean> {
  await pool.query('DELETE FROM ftth_splitter_types WHERE id = $1', [id]);
  return true;
}

export async function syncCustomerToFtthNode(customer: {
  id: string;
  name: string;
  customer_code?: string;
  pppoe_username?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  status?: string;
  sn_onu?: string | null;
  power_laser?: string | null;
  device_brand?: string | null;
  device_model?: string | null;
  odp_port?: string | null;
  device_type?: string | null;
}) {
  await ensureTablesExist();
  const lat = customer.latitude !== null && customer.latitude !== undefined && customer.latitude !== '' ? parseFloat(String(customer.latitude)) : null;
  const lng = customer.longitude !== null && customer.longitude !== undefined && customer.longitude !== '' ? parseFloat(String(customer.longitude)) : null;

  const custId = String(customer.id);
  const custCode = customer.customer_code ? String(customer.customer_code) : custId;
  const defaultNodeId = `node-dev-${custId}`;

  // If coordinates are valid numbers and not 0
  if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
    const nodeName = customer.pppoe_username ? customer.pppoe_username : (customer.name || `Pelanggan-${custCode}`);
    const devType = customer.device_type === 'ROUTER_WIFI' ? 'ROUTER_WIFI' : 'ONU';
    const laserDb = customer.power_laser ? parseFloat(String(customer.power_laser)) : 0;

    // Check if an existing node is already associated with this customer
    const existingNode = await pool.query(
      'SELECT id, lat, lng FROM ftth_nodes WHERE customer_id = $1 OR customer_id = $2 OR id = $3 OR id = $4 LIMIT 1',
      [custId, custCode, defaultNodeId, `node-onu-${custId}`]
    );

    const targetId = existingNode.rows.length > 0 ? existingNode.rows[0].id : defaultNodeId;

    await pool.query(`
      INSERT INTO ftth_nodes (
        id, name, type, lat, lng, splitter_capacity, splitter_ratio, output_power, sfp_powers, attenuation_db, customer_id, internal_splitters
      ) VALUES (
        $1, $2, $3, $4, $5, 1, '1:1', 0.00, '[]'::jsonb, $6, $7, '[]'::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        attenuation_db = EXCLUDED.attenuation_db,
        customer_id = EXCLUDED.customer_id,
        updated_at = CURRENT_TIMESTAMP
    `, [targetId, nodeName, devType, lat, lng, isNaN(laserDb) ? 0 : laserDb, custId]);

    // Handle ODP connection if odp_port is specified
    if (customer.odp_port && typeof customer.odp_port === 'string' && customer.odp_port.trim() !== '') {
      const rawOdp = customer.odp_port.trim();
      const odpMatches = await pool.query(
        `SELECT id, name, lat, lng, splitter_capacity FROM ftth_nodes 
         WHERE type = 'ODP' AND ($1 ILIKE '%' || name || '%' OR name ILIKE '%' || $1 || '%')
         LIMIT 1`,
        [rawOdp.split('(')[0].trim()]
      );

      if (odpMatches.rows.length > 0) {
        const odpNode = odpMatches.rows[0];
        const portMatch = rawOdp.match(/port\s*#?\s*(\d+)/i) || rawOdp.match(/\((\d+)\)/) || rawOdp.match(/\b(\d+)\b/);
        const odpPortNum = portMatch ? parseInt(portMatch[1]) : 1;

        // Calculate distance
        const R = 6371e3;
        const phi1 = Number(odpNode.lat) * Math.PI / 180;
        const phi2 = lat * Math.PI / 180;
        const deltaPhi = (lat - Number(odpNode.lat)) * Math.PI / 180;
        const deltaLambda = (lng - Number(odpNode.lng)) * Math.PI / 180;
        const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distM = Math.round(R * c);

        const dropCableId = `line-drop-${targetId}`;
        await pool.query(`
          INSERT INTO ftth_cables (
            id, from_id, from_port, to_id, to_port, waypoints, cable_length_m, attenuation_db, cable_color, core_number, cable_type, total_cores, core_splicing_map
          ) VALUES (
            $1, $2, $3, $4, 1, '[]'::jsonb, $5, $6, '#0284c7', 'Core #1 (Drop)', 'drop_core', 1, '{"1":{"action":"DROP_CUSTOMER"}}'::jsonb
          )
          ON CONFLICT (id) DO UPDATE SET
            from_id = EXCLUDED.from_id,
            from_port = EXCLUDED.from_port,
            to_id = EXCLUDED.to_id,
            to_port = EXCLUDED.to_port,
            cable_length_m = EXCLUDED.cable_length_m,
            attenuation_db = EXCLUDED.attenuation_db,
            updated_at = CURRENT_TIMESTAMP
        `, [dropCableId, odpNode.id, odpPortNum, targetId, distM, Number(((distM / 1000) * 0.35).toFixed(2))]);
      }
    }

    return { success: true, nodeId: targetId, action: 'upserted' };
  } else {
    // If coordinates are cleared or invalid, delete the node if it was previously created
    const existingNode = await pool.query(
      'SELECT id FROM ftth_nodes WHERE customer_id = $1 OR customer_id = $2 OR id = $3 LIMIT 1',
      [custId, custCode, defaultNodeId]
    );
    if (existingNode.rows.length > 0) {
      const nId = existingNode.rows[0].id;
      await pool.query('DELETE FROM ftth_cables WHERE from_id = $1 OR to_id = $1', [nId]);
      await pool.query('DELETE FROM ftth_nodes WHERE id = $1', [nId]);
    }
  }

  return { success: false, reason: 'No valid coordinates provided' };
}

export async function removeCustomerFtthNode(customerId: string) {
  await ensureTablesExist();
  const custId = String(customerId);
  const defaultNodeId = `node-dev-${custId}`;

  const nodeRes = await pool.query(
    'SELECT id FROM ftth_nodes WHERE customer_id = $1 OR id = $2 OR id = $3',
    [custId, defaultNodeId, `node-onu-${custId}`]
  );

  for (const row of nodeRes.rows) {
    const nId = row.id;
    await pool.query('DELETE FROM ftth_cables WHERE from_id = $1 OR to_id = $1', [nId]);
    await pool.query('DELETE FROM ftth_nodes WHERE id = $1', [nId]);
  }

  return { success: true, removedCount: nodeRes.rows.length };
}

