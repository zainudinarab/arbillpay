import { Request, Response } from 'express';
import { pool } from '../config/db.js';
import { 
  testOltConnection, 
  fetchOnuOpticalPower, 
  fetchOltOnuList, 
  rebootOltOnu, 
  scanUnconfiguredOnus,
  OltRecord
} from '../services/oltService.js';

export async function listOlts(req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT o.id, o.name, o.brand, o.model, o.ip_address, o.ssh_port, o.telnet_port,
             o.protocol, o.username, o.snmp_port, o.snmp_community, o.total_pon_ports,
             o.linked_node_id, o.status, o.last_checked_at, o.created_at,
             fn.name as linked_node_name, fn.type as linked_node_type,
             (SELECT COUNT(*) FROM customers c WHERE c.olt_id = o.id)::int as customer_count
      FROM olts o
      LEFT JOIN ftth_nodes fn ON o.linked_node_id = fn.id
      ORDER BY o.created_at ASC
    `);

    // Ambil daftar OLT nodes dari peta yang belum tertaut atau dapat ditautkan
    const mapNodesRes = await pool.query(`
      SELECT id, name, type, lat, lng
      FROM ftth_nodes
      WHERE type IN ('OLT', 'SERVER', 'DATACENTER')
      ORDER BY name ASC
    `).catch(() => ({ rows: [] }));

    res.json({
      success: true,
      olts: result.rows,
      available_map_nodes: mapNodesRes.rows
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal memuat daftar OLT: ${err.message}` });
  }
}

export async function addOlt(req: Request, res: Response) {
  const {
    name, brand, model, ip_address, ssh_port, telnet_port, protocol,
    username, password, enable_password, snmp_port, snmp_community,
    total_pon_ports, linked_node_id
  } = req.body;

  if (!name || !ip_address || !username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Nama OLT, IP Address, Username, dan Password wajib diisi!'
    });
  }

  const oltId = `olt-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

  try {
    await pool.query(`
      INSERT INTO olts (
        id, name, brand, model, ip_address, ssh_port, telnet_port, protocol,
        username, password, enable_password, snmp_port, snmp_community,
        total_pon_ports, linked_node_id, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'online', NOW())
    `, [
      oltId,
      name.trim(),
      (brand || 'zte').toLowerCase().trim(),
      (model || 'C320').trim(),
      ip_address.trim(),
      parseInt(ssh_port) || 22,
      parseInt(telnet_port) || 23,
      protocol || 'ssh',
      username.trim(),
      password,
      enable_password || null,
      parseInt(snmp_port) || 161,
      snmp_community || 'public',
      parseInt(total_pon_ports) || 8,
      linked_node_id || null
    ]);

    res.json({
      success: true,
      message: `Perangkat OLT "${name}" berhasil ditambahkan!`,
      oltId
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal menambah OLT: ${err.message}` });
  }
}

export async function editOlt(req: Request, res: Response) {
  const { id } = req.params;
  const {
    name, brand, model, ip_address, ssh_port, telnet_port, protocol,
    username, password, enable_password, snmp_port, snmp_community,
    total_pon_ports, linked_node_id
  } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM olts WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'OLT tidak ditemukan.' });
    }

    const cur = existing.rows[0];
    const newPass = password ? password : cur.password;
    const newEnablePass = enable_password !== undefined ? enable_password : cur.enable_password;

    await pool.query(`
      UPDATE olts
      SET name = $1, brand = $2, model = $3, ip_address = $4,
          ssh_port = $5, telnet_port = $6, protocol = $7, username = $8,
          password = $9, enable_password = $10, snmp_port = $11, snmp_community = $12,
          total_pon_ports = $13, linked_node_id = $14
      WHERE id = $15
    `, [
      name ? name.trim() : cur.name,
      brand ? brand.toLowerCase().trim() : cur.brand,
      model !== undefined ? model : cur.model,
      ip_address ? ip_address.trim() : cur.ip_address,
      ssh_port ? parseInt(ssh_port) : cur.ssh_port,
      telnet_port ? parseInt(telnet_port) : cur.telnet_port,
      protocol || cur.protocol,
      username ? username.trim() : cur.username,
      newPass,
      newEnablePass,
      snmp_port ? parseInt(snmp_port) : cur.snmp_port,
      snmp_community || cur.snmp_community,
      total_pon_ports ? parseInt(total_pon_ports) : cur.total_pon_ports,
      linked_node_id !== undefined ? linked_node_id : cur.linked_node_id,
      id
    ]);

    res.json({
      success: true,
      message: `Data OLT "${name || cur.name}" berhasil diperbarui!`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal mengedit OLT: ${err.message}` });
  }
}

export async function deleteOlt(req: Request, res: Response) {
  const { id } = req.params;
  try {
    await pool.query('UPDATE customers SET olt_id = NULL WHERE olt_id = $1', [id]);
    const result = await pool.query('DELETE FROM olts WHERE id = $1 RETURNING name', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'OLT tidak ditemukan.' });
    }
    res.json({
      success: true,
      message: `OLT "${result.rows[0].name}" berhasil dihapus!`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal menghapus OLT: ${err.message}` });
  }
}

export async function testOlt(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const r = await pool.query('SELECT * FROM olts WHERE id = $1', [id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'OLT tidak ditemukan.' });
    }
    const olt: OltRecord = r.rows[0];

    const testResult = await testOltConnection(olt);

    const newStatus = testResult.success ? 'online' : 'offline';
    await pool.query('UPDATE olts SET status = $1, last_checked_at = NOW() WHERE id = $2', [newStatus, id]);

    res.json({
      ...testResult,
      status: newStatus
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Uji koneksi gagal: ${err.message}` });
  }
}

export async function linkOltToNode(req: Request, res: Response) {
  const { id } = req.params;
  const { node_id } = req.body;

  try {
    await pool.query('UPDATE olts SET linked_node_id = $1 WHERE id = $2', [node_id || null, id]);
    res.json({
      success: true,
      message: node_id ? 'OLT berhasil ditautkan ke Node Peta FTTH!' : 'Tautan OLT ke Node Peta berhasil dilepas.'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getOltOnus(req: Request, res: Response) {
  const { id } = req.params;
  const ponPort = req.query.pon_port || '1';

  try {
    const r = await pool.query('SELECT * FROM olts WHERE id = $1', [id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'OLT tidak ditemukan.' });
    }
    const olt: OltRecord = r.rows[0];

    // Ambil daftar ONU live dari OLT via SSH
    const liveOnus = await fetchOltOnuList(olt, String(ponPort));

    // Ambil pelanggan yang terdaftar di database untuk OLT ini & port ini
    const custRes = await pool.query(`
      SELECT id, name, customer_code, pppoe_username, sn_onu, pon_port, onu_id, address
      FROM customers
      WHERE olt_id = $1
    `, [id]);

    const custMapBySn = new Map<string, any>();
    const custMapByOnuId = new Map<string, any>();
    custRes.rows.forEach(c => {
      if (c.sn_onu) custMapBySn.set(c.sn_onu.toLowerCase().trim(), c);
      if (c.pon_port && c.onu_id) custMapByOnuId.set(`${c.pon_port}:${c.onu_id}`, c);
    });

    const enrichedOnus = liveOnus.map(onu => {
      const matchedCust = (onu.sn && custMapBySn.get(onu.sn.toLowerCase())) ||
                          custMapByOnuId.get(`${onu.pon_port}:${onu.onu_id}`);
      return {
        ...onu,
        customer_id: matchedCust?.id || null,
        customer_name: matchedCust?.name || null,
        customer_code: matchedCust?.customer_code || null,
        pppoe_username: matchedCust?.pppoe_username || null
      };
    });

    res.json({
      success: true,
      olt_name: olt.name,
      brand: olt.brand,
      pon_port: ponPort,
      total_onus: enrichedOnus.length,
      onus: enrichedOnus
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal membaca ONU dari OLT: ${err.message}` });
  }
}

export async function getOnuOptical(req: Request, res: Response) {
  const { id } = req.params;
  const { pon_port, onu_id } = req.query;

  if (!pon_port || !onu_id) {
    return res.status(400).json({ success: false, message: 'Parameter pon_port dan onu_id wajib diisi!' });
  }

  try {
    const r = await pool.query('SELECT * FROM olts WHERE id = $1', [id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'OLT tidak ditemukan.' });
    }
    const olt: OltRecord = r.rows[0];

    const reading = await fetchOnuOpticalPower(olt, String(pon_port), parseInt(String(onu_id)));

    res.json({
      success: true,
      olt_id: id,
      pon_port,
      onu_id,
      reading
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal mengambil redaman: ${err.message}` });
  }
}

export async function rebootOnuAction(req: Request, res: Response) {
  const { id } = req.params;
  const { pon_port, onu_id } = req.body;

  if (!pon_port || onu_id === undefined) {
    return res.status(400).json({ success: false, message: 'pon_port dan onu_id wajib diisi!' });
  }

  try {
    const r = await pool.query('SELECT * FROM olts WHERE id = $1', [id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'OLT tidak ditemukan.' });
    }
    const olt: OltRecord = r.rows[0];

    const result = await rebootOltOnu(olt, ponPortString(pon_port), parseInt(onu_id));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal me-reboot ONU: ${err.message}` });
  }
}

export async function getUnconfiguredOnusAction(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const r = await pool.query('SELECT * FROM olts WHERE id = $1', [id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'OLT tidak ditemukan.' });
    }
    const olt: OltRecord = r.rows[0];

    const uncfgList = await scanUnconfiguredOnus(olt);

    res.json({
      success: true,
      olt_name: olt.name,
      brand: olt.brand,
      unconfigured_onus: uncfgList
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

function ponPortString(val: any): string {
  return String(val);
}
