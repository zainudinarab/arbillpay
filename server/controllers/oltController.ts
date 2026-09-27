import { Request, Response } from 'express';
import { pool } from '../config/db.js';
import { 
  testOltConnection, 
  fetchOnuOpticalPower, 
  fetchOltOnuList, 
  rebootOltOnu, 
  scanUnconfiguredOnus,
  registerOltOnuCLI,
  deleteOltOnuCLI,
  OltRecord
} from '../services/oltService.js';
import { testSnmpConnection } from '../services/snmpService.js';

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

/**
 * Helper: Melakukan Sync OLT live ke database PostgreSQL (olt_onus)
 */
async function syncOltOnusInternal(oltId: string, ponPort = '1') {
  const r = await pool.query('SELECT * FROM olts WHERE id = $1', [oltId]);
  if (r.rows.length === 0) throw new Error('OLT tidak ditemukan.');
  const olt: OltRecord = r.rows[0];

  // 1. Ambil daftar ONU dari OLT via SSH
  const liveOnus = await fetchOltOnuList(olt, ponPort);

  // 2. Ambil pelanggan yang memiliki SN atau port/onu_id
  const custRes = await pool.query('SELECT id, name, customer_code, pppoe_username, sn_onu, olt_id, pon_port, onu_id FROM customers');
  const custMapBySn = new Map<string, any>();
  const custMapByOnuId = new Map<string, any>();
  custRes.rows.forEach(c => {
    if (c.sn_onu) custMapBySn.set(c.sn_onu.toLowerCase().trim(), c);
    if (c.olt_id === oltId && c.pon_port && c.onu_id) {
      custMapByOnuId.set(`${c.pon_port}:${c.onu_id}`, c);
    }
  });

  let matchedCount = 0;

  for (const onu of liveOnus) {
    const onuDbId = `${oltId}_${onu.pon_port}_${onu.onu_id}`;
    const matchedCust = (onu.sn && custMapBySn.get(onu.sn.toLowerCase())) ||
                        custMapByOnuId.get(`${onu.pon_port}:${onu.onu_id}`);

    const customerId = matchedCust ? matchedCust.id : null;
    if (customerId) matchedCount++;

    await pool.query(`
      INSERT INTO olt_onus (
        id, olt_id, pon_port, onu_id, sn, name, customer_id, status,
        distance_m, rx_power, tx_power, voltage, temp, bias_current, last_sync_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      ON CONFLICT (olt_id, pon_port, onu_id) DO UPDATE SET
        sn = EXCLUDED.sn,
        name = COALESCE(EXCLUDED.name, olt_onus.name),
        customer_id = COALESCE(EXCLUDED.customer_id, olt_onus.customer_id),
        status = EXCLUDED.status,
        distance_m = COALESCE(EXCLUDED.distance_m, olt_onus.distance_m),
        rx_power = COALESCE(EXCLUDED.rx_power, olt_onus.rx_power),
        tx_power = COALESCE(EXCLUDED.tx_power, olt_onus.tx_power),
        voltage = COALESCE(EXCLUDED.voltage, olt_onus.voltage),
        temp = COALESCE(EXCLUDED.temp, olt_onus.temp),
        bias_current = COALESCE(EXCLUDED.bias_current, olt_onus.bias_current),
        last_sync_at = NOW(),
        updated_at = NOW()
    `, [
      onuDbId,
      oltId,
      String(onu.pon_port),
      onu.onu_id,
      onu.sn,
      matchedCust?.name || `ONU_${onu.onu_id}`,
      customerId,
      onu.status,
      onu.distance_m ?? null,
      onu.rx_power_dbm ?? null,
      onu.tx_power_dbm ?? null,
      onu.voltage_v ?? null,
      onu.temperature_c ?? null,
      onu.bias_current_ma ?? null
    ]);

    // Jika matched dengan customer, update relasi OLT dan redaman optik pelanggan
    if (matchedCust) {
      const powerStr = onu.rx_power_dbm != null ? `${onu.rx_power_dbm} dBm` : null;
      await pool.query(`
        UPDATE customers 
        SET olt_id = COALESCE(olt_id, $1),
            pon_port = COALESCE(pon_port, $2),
            onu_id = COALESCE(onu_id, $3),
            sn_onu = COALESCE(sn_onu, $4),
            power_laser = COALESCE($5, power_laser)
        WHERE id = $6
      `, [oltId, String(onu.pon_port), onu.onu_id, onu.sn, powerStr, matchedCust.id]);
    }
  }

  return { total: liveOnus.length, matched: matchedCount };
}

export async function getOltOnus(req: Request, res: Response) {
  const { id } = req.params;
  const ponPort = String(req.query.pon_port || '1');
  const live = req.query.live === 'true';

  try {
    const r = await pool.query('SELECT * FROM olts WHERE id = $1', [id]);
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'OLT tidak ditemukan.' });
    }
    const olt: OltRecord = r.rows[0];

    // Jika live=true, jalankan sync SSH ke OLT
    if (live) {
      await syncOltOnusInternal(id, ponPort);
    }

    // Baca dari cache tabel PostgreSQL
    let dbResult = await pool.query(`
      SELECT 
        o.id, o.olt_id, o.pon_port, o.onu_id, o.sn, o.name, o.customer_id,
        o.status, o.distance_m, o.rx_power, o.tx_power, o.voltage, o.temp, o.bias_current,
        o.line_profile, o.srv_profile, o.last_sync_at,
        c.name as customer_name, c.customer_code, c.pppoe_username, c.phone_number,
        c.status as customer_status, c.address as customer_address
      FROM olt_onus o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.olt_id = $1 AND o.pon_port = $2
      ORDER BY o.onu_id ASC
    `, [id, ponPort]);

    // Jika cache masih kosong sama sekali untuk OLT ini, jalankan initial sync otomatis sekali
    if (dbResult.rows.length === 0 && !live) {
      const syncRes = await syncOltOnusInternal(id, ponPort).catch(() => null);
      if (syncRes && syncRes.total > 0) {
        dbResult = await pool.query(`
          SELECT 
            o.id, o.olt_id, o.pon_port, o.onu_id, o.sn, o.name, o.customer_id,
            o.status, o.distance_m, o.rx_power, o.tx_power, o.voltage, o.temp, o.bias_current,
            o.line_profile, o.srv_profile, o.last_sync_at,
            c.name as customer_name, c.customer_code, c.pppoe_username, c.phone_number,
            c.status as customer_status, c.address as customer_address
          FROM olt_onus o
          LEFT JOIN customers c ON o.customer_id = c.id
          WHERE o.olt_id = $1 AND o.pon_port = $2
          ORDER BY o.onu_id ASC
        `, [id, ponPort]);
      }
    }

    const formattedOnus = dbResult.rows.map((row: any) => ({
      ...row,
      rx_power: row.rx_power !== null && row.rx_power !== undefined ? parseFloat(row.rx_power) : null,
      tx_power: row.tx_power !== null && row.tx_power !== undefined ? parseFloat(row.tx_power) : null,
      voltage: row.voltage !== null && row.voltage !== undefined ? parseFloat(row.voltage) : null,
      temp: row.temp !== null && row.temp !== undefined ? parseFloat(row.temp) : null,
      bias_current: row.bias_current !== null && row.bias_current !== undefined ? parseFloat(row.bias_current) : null,
    }));

    res.json({
      success: true,
      olt_name: olt.name,
      brand: olt.brand,
      pon_port: ponPort,
      total_onus: formattedOnus.length,
      from_cache: !live,
      last_sync: dbResult.rows[0]?.last_sync_at || null,
      onus: formattedOnus
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal membaca ONU: ${err.message}` });
  }
}

export async function syncOltOnusAction(req: Request, res: Response) {
  const { id } = req.params;
  const ponPort = String(req.body.pon_port || req.query.pon_port || '1');

  try {
    const stats = await syncOltOnusInternal(id, ponPort);
    res.json({
      success: true,
      message: `Sinkronisasi OLT berhasil! Ditemukan ${stats.total} ONU (${stats.matched} terhubung ke data pelanggan).`,
      stats
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal sinkronisasi data OLT: ${err.message}` });
  }
}

export async function registerOltOnuAction(req: Request, res: Response) {
  const { id } = req.params;
  const { pon_port = '1', onu_id, sn, name, customer_id, line_profile = 'default', srv_profile = 'default' } = req.body;

  if (!sn || !sn.trim()) {
    return res.status(400).json({ success: false, message: 'Nomor Serial (SN) ONU wajib diisi!' });
  }

  const cleanSn = sn.trim();
  const cleanPort = String(pon_port).trim();

  try {
    const r = await pool.query('SELECT * FROM olts WHERE id = $1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'OLT tidak ditemukan.' });
    const olt: OltRecord = r.rows[0];

    // Alokasikan nomor ONU ID otomatis jika tidak diisi (1..128)
    let targetOnuId = onu_id ? parseInt(String(onu_id)) : 0;
    if (!targetOnuId) {
      const existing = await pool.query(
        'SELECT onu_id FROM olt_onus WHERE olt_id = $1 AND pon_port = $2 ORDER BY onu_id ASC',
        [id, cleanPort]
      );
      const usedIds = new Set(existing.rows.map((row: any) => row.onu_id));
      for (let i = 1; i <= 128; i++) {
        if (!usedIds.has(i)) {
          targetOnuId = i;
          break;
        }
      }
    }

    if (!targetOnuId) {
      return res.status(400).json({ success: false, message: 'Slot ONU pada port PON ini sudah penuh (1-128)!' });
    }

    // 1. Eksekusi perintah registrasi ke OLT via CLI
    const cliRes = await registerOltOnuCLI(
      olt,
      cleanPort,
      targetOnuId,
      cleanSn,
      name,
      line_profile,
      srv_profile
    );

    if (!cliRes.success) {
      return res.status(500).json(cliRes);
    }

    // 2. Simpan identitas ONU ke tabel olt_onus (PostgreSQL Cache)
    const onuDbId = `${id}_${cleanPort}_${targetOnuId}`;
    await pool.query(`
      INSERT INTO olt_onus (
        id, olt_id, pon_port, onu_id, sn, name, customer_id, status,
        line_profile, srv_profile, last_sync_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'online', $8, $9, NOW(), NOW())
      ON CONFLICT (olt_id, pon_port, onu_id) DO UPDATE SET
        sn = EXCLUDED.sn,
        name = EXCLUDED.name,
        customer_id = EXCLUDED.customer_id,
        status = EXCLUDED.status,
        last_sync_at = NOW(),
        updated_at = NOW()
    `, [
      onuDbId,
      id,
      cleanPort,
      targetOnuId,
      cleanSn,
      name || `ONU_${targetOnuId}`,
      customer_id || null,
      line_profile,
      srv_profile
    ]);

    // 3. Jika ditautkan ke pelanggan, update tabel customers
    if (customer_id) {
      await pool.query(`
        UPDATE customers
        SET olt_id = $1, pon_port = $2, onu_id = $3, sn_onu = $4
        WHERE id = $5
      `, [id, cleanPort, targetOnuId, cleanSn, customer_id]);
    }

    res.json({
      success: true,
      message: `ONU ID ${targetOnuId} (${cleanSn}) berhasil didaftarkan ke OLT ${olt.name}!`,
      onu_id: targetOnuId,
      pon_port: cleanPort,
      sn: cleanSn,
      cli_output: cliRes.output
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal mendaftarkan ONU: ${err.message}` });
  }
}

export async function deleteOltOnuAction(req: Request, res: Response) {
  const { id } = req.params;
  const { pon_port, onu_id } = req.body;

  try {
    const r = await pool.query('SELECT * FROM olts WHERE id = $1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'OLT tidak ditemukan.' });
    const olt: OltRecord = r.rows[0];

    // Kirim CLI delete ke OLT
    await deleteOltOnuCLI(olt, String(pon_port), parseInt(String(onu_id)));

    // Hapus dari database olt_onus
    await pool.query('DELETE FROM olt_onus WHERE olt_id = $1 AND pon_port = $2 AND onu_id = $3', [
      id, String(pon_port), parseInt(String(onu_id))
    ]);

    // Lepas relasi di pelanggan jika ada
    await pool.query('UPDATE customers SET olt_id = NULL, pon_port = NULL, onu_id = NULL WHERE olt_id = $1 AND pon_port = $2 AND onu_id = $3', [
      id, String(pon_port), parseInt(String(onu_id))
    ]);

    res.json({
      success: true,
      message: `ONU ${pon_port}:${onu_id} berhasil dihapus dari OLT dan database!`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal menghapus ONU: ${err.message}` });
  }
}

export async function linkCustomerToOnuAction(req: Request, res: Response) {
  const { id } = req.params;
  const { onu_db_id, customer_id } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM olt_onus WHERE id = $1', [onu_db_id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Data ONU tidak ditemukan di database.' });
    }
    const onu = existing.rows[0];

    // Jika customer_id kosong, unlink
    if (!customer_id) {
      await pool.query('UPDATE olt_onus SET customer_id = NULL WHERE id = $1', [onu_db_id]);
      if (onu.customer_id) {
        await pool.query('UPDATE customers SET olt_id = NULL, pon_port = NULL, onu_id = NULL WHERE id = $1', [onu.customer_id]);
      }
      return res.json({ success: true, message: 'Tautan pelanggan ke ONU berhasil dilepas.' });
    }

    // Link ke customer baru
    await pool.query('UPDATE olt_onus SET customer_id = $1 WHERE id = $2', [customer_id, onu_db_id]);
    await pool.query(`
      UPDATE customers 
      SET olt_id = $1, pon_port = $2, onu_id = $3, sn_onu = $4 
      WHERE id = $5
    `, [id, onu.pon_port, onu.onu_id, onu.sn, customer_id]);

    res.json({ success: true, message: 'Pelanggan berhasil ditautkan ke ONU ini!' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal menautkan pelanggan: ${err.message}` });
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

    // Cache pembacaan redaman optik ke database olt_onus
    if (reading.rx_power_dbm !== null) {
      await pool.query(`
        UPDATE olt_onus
        SET rx_power = $1, tx_power = $2, voltage = $3, temp = $4, bias_current = $5, last_sync_at = NOW()
        WHERE olt_id = $6 AND pon_port = $7 AND onu_id = $8
      `, [
        reading.rx_power_dbm,
        reading.tx_power_dbm,
        reading.voltage_v ?? null,
        reading.temperature_c ?? null,
        reading.bias_current_ma ?? null,
        id,
        String(pon_port),
        parseInt(String(onu_id))
      ]);

      // Juga perbarui laser power di tabel customers jika ada pelanggan tertaut
      await pool.query(`
        UPDATE customers
        SET power_laser = $1
        WHERE olt_id = $2 AND pon_port = $3 AND onu_id = $4
      `, [reading.rx_power_dbm, id, String(pon_port), parseInt(String(onu_id))]);
    }

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

    const result = await rebootOltOnu(olt, String(pon_port), parseInt(onu_id));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal me-reboot ONU: ${err.message}` });
  }
}

export async function testOltSnmpAction(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const r = await pool.query('SELECT * FROM olts WHERE id = $1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'OLT tidak ditemukan.' });
    const olt = r.rows[0];

    const result = await testSnmpConnection(
      olt.ip_address,
      olt.snmp_port || 161,
      olt.snmp_community || 'public',
      olt.snmp_version || 'v2c'
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal uji SNMP: ${err.message}` });
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
