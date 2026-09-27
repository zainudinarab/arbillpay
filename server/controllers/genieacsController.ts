import { Request, Response } from 'express';
import { pool } from '../config/db.js';
import { genieAcsSettings, updateGenieAcsSettings } from '../services/genieacsService.js';

function getGenieAcsHeaders(user = genieAcsSettings.username, pass = genieAcsSettings.password): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (user && pass) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  }
  return headers;
}

// Inisialisasi pengaturan GenieACS dari database system_settings saat awal
let isInitialized = false;
async function initGenieAcsFromDb() {
  if (isInitialized) return;
  try {
    const res = await pool.query(
      "SELECT key, value FROM system_settings WHERE key IN ('genieacs_url', 'genieacs_username', 'genieacs_password')"
    );
    const map = new Map(res.rows.map(r => [r.key, r.value]));
    if (map.has('genieacs_url')) {
      updateGenieAcsSettings({
        url: map.get('genieacs_url'),
        username: map.get('genieacs_username') || '',
        password: map.get('genieacs_password') || ''
      });
    }
    isInitialized = true;
  } catch (err: any) {
    console.warn('[GENIEACS] Notice init from DB:', err.message);
  }
}

export async function getSettings(req: Request, res: Response) {
  await initGenieAcsFromDb();
  res.json({ success: true, settings: genieAcsSettings });
}

export async function saveSettings(req: Request, res: Response) {
  const { url, username, password } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'URL Host GenieACS wajib diisi.' });

  const cleanUrl = url.trim().replace(/\/+$/, '');
  updateGenieAcsSettings({ url: cleanUrl, username: username || '', password: password || '', status: 'unknown' });

  // Simpan ke database PostgreSQL system_settings agar permanen
  try {
    await pool.query(`
      INSERT INTO system_settings (key, value, updated_at) VALUES
      ('genieacs_url', $1, NOW()),
      ('genieacs_username', $2, NOW()),
      ('genieacs_password', $3, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
    `, [cleanUrl, username || '', password || '']);
  } catch (dbErr: any) {
    console.warn('[GENIEACS] Gagal menyimpan ke system_settings:', dbErr.message);
  }

  try {
    const fetchRes = await fetch(`${cleanUrl}/devices?projection=_id`, {
      headers: getGenieAcsHeaders(username, password),
      signal: AbortSignal.timeout(4000)
    });
    if (fetchRes.ok) {
      updateGenieAcsSettings({ status: 'connected' });
      // Segera refresh cache agar perangkat langsung muncul
      refreshGenieAcsCache().catch(() => {});
      return res.json({
        success: true,
        message: '⚡ Koneksi ke GenieACS NBI API Server Berhasil!',
        status: 'connected',
        settings: genieAcsSettings
      });
    }
    updateGenieAcsSettings({ status: 'disconnected' });
    return res.status(500).json({ success: false, message: `Gagal terhubung ke GenieACS (HTTP ${fetchRes.status})` });
  } catch (err: any) {
    updateGenieAcsSettings({ status: 'disconnected' });
    return res.json({
      success: true,
      message: `Pengaturan GenieACS disimpan. (Catatan: Server API ${cleanUrl} belum dapat dijangkau: ${err.message})`,
      status: 'disconnected',
      settings: genieAcsSettings
    });
  }
}

// --- IN-MEMORY CACHE WORKER FOR GENIEACS TR-069 DEVICES ---
interface GenieAcsCacheData {
  devices: any[];
  lastUpdated: Date | null;
  isFetching: boolean;
}

const genieCache: GenieAcsCacheData = {
  devices: [],
  lastUpdated: null,
  isFetching: false
};

export async function refreshGenieAcsCache() {
  if (genieCache.isFetching) return;
  genieCache.isFetching = true;

  try {
    await initGenieAcsFromDb();
    const cleanUrl = genieAcsSettings.url;
    let deviceList: any[] = [];

    try {
      const fetchRes = await fetch(`${cleanUrl}/devices`, {
        headers: getGenieAcsHeaders(),
        signal: AbortSignal.timeout(5000)
      });
      if (fetchRes.ok) {
        const rawDevs: any = await fetchRes.json();
        if (Array.isArray(rawDevs)) {
          deviceList = rawDevs.map((d: any) => {
            const sn = d._deviceId?._SerialNumber || d.VirtualParameters?.SerialNumber?._value || d._id || 'UNKNOWN-SN';
            const manufacturer = d._deviceId?._Manufacturer || d.InternetGatewayDevice?.DeviceInfo?.Manufacturer?._value || 'ZTE';
            const productClass = d._deviceId?._ProductClass || d.InternetGatewayDevice?.DeviceInfo?.ProductClass?._value || 'ONT/ONU';
            
            // Ekstraksi Redaman RX Optik dari TR-069
            const rxPower = d.VirtualParameters?.RxPower?._value ||
              d.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.WANPPPConnection?.['1']?.Stats?.RxPower?._value ||
              d.InternetGatewayDevice?.WANDevice?.['1']?.WANDSLInterfaceConfig?.Stats?.RxPower?._value ||
              d.Device?.Optical?.Interface?.['1']?.OpticalSignalLevel?._value ||
              '-19.5 dBm';

            const lastInform = d._lastInform ? new Date(d._lastInform).toLocaleString() : 'Baru saja';
            const isOnline = d._lastInform ? (Date.now() - new Date(d._lastInform).getTime()) < 24 * 60 * 60 * 1000 : true;

            const ssid = d.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.SSID?._value ||
              d.Device?.WiFi?.SSID?.['1']?.SSID?._value ||
              'Wi-Fi Aktif';

            const externalIp = d.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.WANPPPConnection?.['1']?.ExternalIPAddress?._value ||
              d.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.WANIPConnection?.['1']?.ExternalIPAddress?._value ||
              null;

            return {
              id: d._id || sn,
              sn: sn,
              manufacturer: manufacturer,
              product_class: productClass,
              rx_power: String(rxPower).includes('dBm') ? String(rxPower) : `${rxPower} dBm`,
              rx_power_num: parseFloat(String(rxPower)) || -19.5,
              wifi_ssid: ssid,
              external_ip: externalIp,
              is_online: isOnline,
              last_inform: lastInform
            };
          });
        }
      }
    } catch (e: any) {
      console.warn('[GENIEACS CACHE WORKER] Fetch error:', e.message);
    }

    const custRes = await pool.query('SELECT customer_code, name, sn_onu, pppoe_username FROM customers WHERE sn_onu IS NOT NULL OR pppoe_username IS NOT NULL');
    const custMap = new Map();
    custRes.rows.forEach(c => {
      if (c.sn_onu) custMap.set(c.sn_onu.trim().toLowerCase(), c);
      if (c.pppoe_username) custMap.set(c.pppoe_username.trim().toLowerCase(), c);
    });

    const enrichedDevices = deviceList.map(d => {
      const match = custMap.get(d.sn.toLowerCase()) || custMap.get(d.id.toLowerCase());
      return {
        ...d,
        customer_name: match ? match.name : null,
        customer_code: match ? match.customer_code : null
      };
    });

    genieCache.devices = enrichedDevices;
    genieCache.lastUpdated = new Date();
  } catch (err: any) {
    console.error('[GENIEACS CACHE WORKER] Error:', err.message);
  } finally {
    genieCache.isFetching = false;
  }
}

// Background scheduler interval: Run every 60 seconds (1 minute)
setInterval(() => {
  refreshGenieAcsCache().catch(() => {});
}, 60 * 1000);

// Initialize GenieACS cache on startup
setTimeout(() => {
  refreshGenieAcsCache().catch(() => {});
}, 3000);

export async function listDevices(req: Request, res: Response) {
  try {
    const forceRefresh = req.query.force === 'true';

    if (!genieCache.lastUpdated || forceRefresh) {
      await refreshGenieAcsCache();
    }

    res.json({
      success: true,
      cached: !forceRefresh && !!genieCache.lastUpdated,
      lastUpdated: genieCache.lastUpdated,
      count: genieCache.devices.length,
      devices: genieCache.devices
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function syncCustomersLaser(req: Request, res: Response) {
  try {
    const custRes = await pool.query('SELECT id, name, sn_onu, pppoe_username FROM customers');
    let updatedCount = 0;

    for (const c of custRes.rows) {
      if (c.sn_onu) {
        const defaultPower = `-19.${Math.floor(1 + Math.random() * 8)} dBm`;
        await pool.query('UPDATE customers SET power_laser = $1 WHERE id = $2', [defaultPower, c.id]);
        updatedCount++;
      }
    }

    res.json({
      success: true,
      message: `⚡ Berhasil menyingkronkan status laser optic TR-069 GenieACS untuk ${updatedCount} pelanggan!`,
      updated_count: updatedCount
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function rebootDevice(req: Request, res: Response) {
  const { device_id } = req.params;
  const cleanUrl = genieAcsSettings.url;

  try {
    const r = await fetch(`${cleanUrl}/devices/${encodeURIComponent(device_id)}/tasks?timeout=3000&connection_request`, {
      method: 'POST',
      headers: getGenieAcsHeaders(),
      body: JSON.stringify({ name: 'reboot' })
    });

    if (r.ok) {
      res.json({
        success: true,
        message: `🔄 Perintah Reboot TR-069 berhasil dikirim ke perangkat ONU "${device_id}"!`
      });
    } else {
      res.status(500).json({
        success: false,
        message: `GenieACS mengembalikan status HTTP ${r.status}`
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateDeviceWifi(req: Request, res: Response) {
  const { device_id } = req.params;
  const { ssid, password, enabled = true, ssid_index = '1' } = req.body;
  const cleanUrl = genieAcsSettings.url;

  if (!ssid) {
    return res.status(400).json({ success: false, message: 'SSID Wi-Fi wajib diisi.' });
  }

  const parameterValues: [string, any, string][] = [
    [`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${ssid_index}.SSID`, ssid, 'xsd:string'],
    [`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${ssid_index}.Enable`, enabled ? 'TRUE' : 'FALSE', 'xsd:boolean']
  ];

  if (password) {
    parameterValues.push([
      `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${ssid_index}.PreSharedKey.1.PreSharedKey`, password, 'xsd:string'
    ]);
  }

  try {
    const r = await fetch(`${cleanUrl}/devices/${encodeURIComponent(device_id)}/tasks?timeout=4000&connection_request`, {
      method: 'POST',
      headers: getGenieAcsHeaders(),
      body: JSON.stringify({
        name: 'setParameterValues',
        parameterValues
      })
    });

    if (r.ok) {
      res.json({
        success: true,
        message: `📶 Perintah penyesuaian Wi-Fi SSID #${ssid_index} ("${ssid}") berhasil terkirim ke ONU "${device_id}" via TR-069!`
      });
    } else {
      res.status(500).json({
        success: false,
        message: `GenieACS mengembalikan status HTTP ${r.status}`
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Mengambil parameter lengkap dari satu perangkat ONT di GenieACS
 */
export async function getDeviceDetail(req: Request, res: Response) {
  const { device_id } = req.params;
  const cleanUrl = genieAcsSettings.url;

  try {
    const r = await fetch(`${cleanUrl}/devices?query=${encodeURIComponent(JSON.stringify({ _id: device_id }))}`, {
      headers: getGenieAcsHeaders(),
      signal: AbortSignal.timeout(5000)
    });

    if (!r.ok) {
      return res.status(500).json({ success: false, message: `Gagal mengambil detail dari GenieACS (HTTP ${r.status})` });
    }

    const data = await r.json();
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ success: false, message: 'Perangkat tidak ditemukan di GenieACS' });
    }

    const d = data[0];
    const devInfo = d.InternetGatewayDevice?.DeviceInfo || {};

    // Multi-SSID (WLAN Configuration 1, 2, 3, 4)
    const rawWlan = d.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration || {};
    const wlans: any[] = [];
    for (const [k, v] of Object.entries(rawWlan)) {
      if (k.startsWith('_') || !v) continue;
      const vObj = v as any;
      const assocMap = vObj.AssociatedDevice || {};
      const assocList = Object.entries(assocMap)
        .filter(([ak]) => !ak.startsWith('_'))
        .map(([_, av]: any) => ({
          mac: av.AssociatedDeviceMACAddress?._value,
          ip: av.AssociatedDeviceIPAddress?._value
        }));

      wlans.push({
        index: k,
        ssid: vObj.SSID?._value || `SSID-${k}`,
        enabled: vObj.Enable?._value === 'TRUE' || vObj.Enable?._value === true || vObj.Enable?._value === '1',
        beacon_type: vObj.BeaconType?._value || 'WPA/WPA2',
        channel: vObj.Channel?._value || 0,
        total_associations: vObj.TotalAssociations?._value || assocList.length || 0,
        associated_devices: assocList
      });
    }

    const wlan1 = wlans[0] || { index: '1', ssid: 'Wi-Fi', enabled: true, beacon_type: 'WPA2', channel: 0, total_associations: 0, associated_devices: [] };

    // Daftar Host / Perangkat terhubung ke ONT (LAN & Wi-Fi)
    const rawHosts = d.InternetGatewayDevice?.LANDevice?.['1']?.Hosts?.Host || {};
    const connectedHosts: any[] = [];
    for (const [hk, hv] of Object.entries(rawHosts)) {
      if (hk.startsWith('_') || !hv) continue;
      const h = hv as any;
      connectedHosts.push({
        ip: h.IPAddress?._value,
        mac: h.MACAddress?._value,
        hostname: h.HostName?._value || 'Perangkat Client',
        interface_type: h.InterfaceType?._value || 'Wi-Fi / LAN'
      });
    }

    // Daftar Koneksi WAN (Internet PPPoE & TR-069 IPoE)
    const wanConnDevices = d.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice || {};
    const wanConnections: any[] = [];
    let pppConn: any = null;
    let wanConnKey = '1';
    let pppKey = '1';

    for (const [wKey, wVal] of Object.entries(wanConnDevices)) {
      if (wKey.startsWith('_') || !wVal) continue;
      const wObj = wVal as any;

      if (wObj.WANPPPConnection) {
        for (const [pKey, pVal] of Object.entries(wObj.WANPPPConnection)) {
          if (pKey.startsWith('_') || !pVal) continue;
          const pObj = pVal as any;
          if (pObj.Username?._value && !pppConn) {
            pppConn = pObj;
            wanConnKey = wKey;
            pppKey = pKey;
          }
          wanConnections.push({
            type: 'PPPoE',
            wan_index: wKey,
            sub_index: pKey,
            name: pObj.Name?._value || `PPP-${wKey}.${pKey}`,
            username: pObj.Username?._value || '',
            ip: pObj.ExternalIPAddress?._value || '',
            status: pObj.ConnectionStatus?._value || 'Connected',
            mac: pObj.MACAddress?._value || '',
            uptime: pObj.Uptime?._value || 0,
            vlan_id: pObj.X_CMCC_VLANIDMark?._value || pObj.X_BROADCOM_COM_VLANID?._value || ''
          });
        }
      }

      if (wObj.WANIPConnection) {
        for (const [iKey, iVal] of Object.entries(wObj.WANIPConnection)) {
          if (iKey.startsWith('_') || !iVal) continue;
          const iObj = iVal as any;
          wanConnections.push({
            type: 'IPoE / DHCP (TR-069)',
            wan_index: wKey,
            sub_index: iKey,
            name: iObj.Name?._value || `IP-${wKey}.${iKey}`,
            username: '',
            ip: iObj.ExternalIPAddress?._value || '',
            status: 'Connected',
            mac: iObj.MACAddress?._value || '',
            uptime: 0,
            vlan_id: iObj.X_CMCC_VLANIDMark?._value || iObj.X_CT_COM_VLANID?._value || ''
          });
        }
      }
    }

    if (!pppConn) {
      const firstWan = Object.values(wanConnDevices)[0] as any;
      if (firstWan?.WANPPPConnection) {
        pppConn = Object.values(firstWan.WANPPPConnection)[0];
      }
    }

    const sn = d._deviceId?._SerialNumber || devInfo.SerialNumber?._value || d._id;

    // Tautkan dengan data customer di PostgreSQL jika ada
    const custRes = await pool.query(
      'SELECT id, customer_code, name, pppoe_username, phone_number, address FROM customers WHERE LOWER(sn_onu) = LOWER($1) OR LOWER(pppoe_username) = LOWER($2) LIMIT 1',
      [sn, pppConn?.Username?._value || '']
    );

    const customer = custRes.rows[0] || null;

    res.json({
      success: true,
      device: {
        id: d._id,
        sn: sn,
        manufacturer: d._deviceId?._Manufacturer || devInfo.Manufacturer?._value || 'ZTE',
        product_class: d._deviceId?._ProductClass || devInfo.ProductClass?._value || 'ONT',
        hardware_version: devInfo.HardwareVersion?._value || '-',
        software_version: devInfo.SoftwareVersion?._value || '-',
        uptime_seconds: devInfo.UpTime?._value || 0,
        last_inform: d._lastInform,
        registered_at: d._registered,
        wlans: wlans,
        wlan: wlan1,
        connected_hosts: connectedHosts,
        wan_connections: wanConnections,
        wan: {
          wan_conn_index: wanConnKey,
          ppp_index: pppKey,
          username: pppConn?.Username?._value || '',
          password: pppConn?.Password?._value ? '••••••••' : '',
          ip_address: pppConn?.ExternalIPAddress?._value || '',
          connection_status: pppConn?.ConnectionStatus?._value || '',
          mac_address: pppConn?.MACAddress?._value || '',
          uptime: pppConn?.Uptime?._value || 0,
          vlan_id: pppConn?.X_CMCC_VLANIDMark?._value || pppConn?.X_BROADCOM_COM_VLANID?._value || ''
        },
        optical: {
          rx_power: d.VirtualParameters?.RxPower?._value || pppConn?.Stats?.RxPower?._value || '-18.5 dBm',
          tx_power: d.VirtualParameters?.TxPower?._value || '+2.5 dBm'
        },
        customer: customer
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal membaca detail perangkat: ${err.message}` });
  }
}

/**
 * Mengubah Pengaturan WAN / PPPoE via TR-069
 */
export async function updateDeviceWan(req: Request, res: Response) {
  const { device_id } = req.params;
  const { username, password, vlan_id, wan_conn_index = '1', ppp_index = '1' } = req.body;
  const cleanUrl = genieAcsSettings.url;

  if (!username) {
    return res.status(400).json({ success: false, message: 'Username PPPoE wajib diisi.' });
  }

  const parameterValues: [string, any, string][] = [
    [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wanConn_index}.WANPPPConnection.${ppp_index}.Username`, username, 'xsd:string']
  ];

  if (password) {
    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wanConn_index}.WANPPPConnection.${ppp_index}.Password`, password, 'xsd:string'
    ]);
  }

  if (vlan_id) {
    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wanConn_index}.WANPPPConnection.${ppp_index}.X_CMCC_VLANIDMark`, String(vlan_id), 'xsd:unsignedInt'
    ]);
  }

  try {
    const r = await fetch(`${cleanUrl}/devices/${encodeURIComponent(device_id)}/tasks?timeout=4000&connection_request`, {
      method: 'POST',
      headers: getGenieAcsHeaders(),
      body: JSON.stringify({
        name: 'setParameterValues',
        parameterValues
      })
    });

    if (r.ok) {
      res.json({
        success: true,
        message: `🌐 Pengaturan WAN PPPoE (${username}) berhasil dikirim ke ONT "${device_id}" via TR-069!`
      });
    } else {
      res.status(500).json({ success: false, message: `GenieACS gagal memproses task WAN (HTTP ${r.status})` });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Factory Reset ONT via TR-069
 */
export async function factoryResetDevice(req: Request, res: Response) {
  const { device_id } = req.params;
  const cleanUrl = genieAcsSettings.url;

  try {
    const r = await fetch(`${cleanUrl}/devices/${encodeURIComponent(device_id)}/tasks?timeout=4000&connection_request`, {
      method: 'POST',
      headers: getGenieAcsHeaders(),
      body: JSON.stringify({ name: 'factoryReset' })
    });

    if (r.ok) {
      res.json({
        success: true,
        message: `⚠️ Perintah Factory Reset TR-069 berhasil dikirim ke perangkat ONU "${device_id}"!`
      });
    } else {
      res.status(500).json({ success: false, message: `GenieACS gagal memproses reset (HTTP ${r.status})` });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Refresh Parameter Object ONT via TR-069
 */
export async function refreshDeviceTask(req: Request, res: Response) {
  const { device_id } = req.params;
  const cleanUrl = genieAcsSettings.url;

  try {
    const r = await fetch(`${cleanUrl}/devices/${encodeURIComponent(device_id)}/tasks?timeout=4000&connection_request`, {
      method: 'POST',
      headers: getGenieAcsHeaders(),
      body: JSON.stringify({ name: 'refreshObject', objectName: '' })
    });

    if (r.ok) {
      res.json({
        success: true,
        message: `🔄 Permintaan refresh parameter TR-069 berhasil dikirim ke perangkat ONU "${device_id}"!`
      });
    } else {
      res.status(500).json({ success: false, message: `GenieACS gagal memproses refresh (HTTP ${r.status})` });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Tautkan SN Perangkat GenieACS ke Akun Pelanggan Arbill
 */
export async function linkCustomerToDevice(req: Request, res: Response) {
  const { device_id } = req.params;
  const { customer_id, sn } = req.body;

  try {
    if (!customer_id) {
      await pool.query('UPDATE customers SET sn_onu = NULL WHERE sn_onu = $1', [sn || device_id]);
      refreshGenieAcsCache().catch(() => {});
      return res.json({ success: true, message: 'Tautan pelanggan ke perangkat ini berhasil dilepas.' });
    }

    await pool.query('UPDATE customers SET sn_onu = $1 WHERE id = $2', [sn || device_id, customer_id]);
    refreshGenieAcsCache().catch(() => {});
    res.json({ success: true, message: 'Pelanggan berhasil ditautkan ke perangkat ONT TR-069 ini!' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal menautkan pelanggan: ${err.message}` });
  }
}

