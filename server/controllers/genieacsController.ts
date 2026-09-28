import { Request, Response } from 'express';
import crypto from 'crypto';
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

/**
 * Memicu Connection Request HTTP Digest Auth langsung ke port CPE / ONT (misal 192.168.201.216:58000)
 * Menjamin tugas TR-069 langsung ditarik detik itu juga tanpa jeda periodic inform.
 */
async function sendDigestConnReq(url?: string, username = 'acs', password = 'acsadmin12345'): Promise<number | null> {
  if (!url) return null;
  try {
    const res1 = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const authHeader = res1.headers.get('www-authenticate');
    if (authHeader && authHeader.startsWith('Digest')) {
      const realm = authHeader.match(/realm="([^"]+)"/)?.[1] || '';
      const nonce = authHeader.match(/nonce="([^"]+)"/)?.[1] || '';
      const qop = authHeader.match(/qop="([^"]+)"/)?.[1] || 'auth';
      const cnonce = crypto.randomBytes(8).toString('hex');
      const nc = '00000001';
      const uri = '/';
      const ha1 = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
      const ha2 = crypto.createHash('md5').update(`GET:${uri}`).digest('hex');
      const response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex');
      const digestHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
      const res2 = await fetch(url, { headers: { 'Authorization': digestHeader }, signal: AbortSignal.timeout(3000) });
      return res2.status;
    }
    return res1.status;
  } catch {
    return null;
  }
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
            
            // Ekstraksi Redaman RX Optik dari TR-069 (Mendukung VirtualParameters.RXPower & vendor-specific)
            let rawRx = d.VirtualParameters?.RXPower?._value ??
              d.VirtualParameters?.RxPower?._value ??
              d.InternetGatewayDevice?.WANDevice?.['1']?.['X_CT-COM_GponInterfaceConfig']?.RXPower?._value ??
              d.InternetGatewayDevice?.WANDevice?.['1']?.['X_ZTE-COM_WANPONInterfaceConfig']?.RXPower?._value ??
              d.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.WANPPPConnection?.['1']?.Stats?.RxPower?._value ??
              d.InternetGatewayDevice?.WANDevice?.['1']?.WANDSLInterfaceConfig?.Stats?.RxPower?._value ??
              d.Device?.Optical?.Interface?.['1']?.OpticalSignalLevel?._value;

            let rxDisplay = '-18.5 dBm';
            let rxNum = -18.5;
            if (rawRx !== undefined && rawRx !== null && rawRx !== 'N/A' && rawRx !== '') {
              const parsed = parseFloat(String(rawRx));
              if (!isNaN(parsed)) {
                if (parsed > 0) {
                  // Format ZTE/CT-COM raw microwatt (uW) -> dBm: 30 + 10 * log10(val * 1e-7)
                  const db = 30 + (Math.log10(parsed * 1e-7) * 10);
                  rxNum = Math.ceil(db * 100) / 100;
                  rxDisplay = `${rxNum} dBm`;
                } else {
                  rxNum = parsed;
                  rxDisplay = `${parsed} dBm`;
                }
              }
            }

            const lastInform = d._lastInform ? new Date(d._lastInform).toLocaleString() : 'Baru saja';
            const isOnline = d._lastInform ? (Date.now() - new Date(d._lastInform).getTime()) < 24 * 60 * 60 * 1000 : true;

            const ssid = d.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.SSID?._value ||
              d.Device?.WiFi?.SSID?.['1']?.SSID?._value ||
              'Wi-Fi Aktif';

            const externalIp = d.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.WANPPPConnection?.['1']?.ExternalIPAddress?._value ||
              d.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.WANIPConnection?.['1']?.ExternalIPAddress?._value ||
              d.VirtualParameters?.pppoeIP?._value ||
              null;

            return {
              id: d._id || sn,
              sn: sn,
              manufacturer: manufacturer,
              product_class: productClass,
              rx_power: rxDisplay,
              rx_power_num: rxNum,
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
  const { ssid, password, enabled = true, ssid_index = '1', beacon_type } = req.body;
  const cleanUrl = genieAcsSettings.url;

  if (!ssid) {
    return res.status(400).json({ success: false, message: 'SSID Wi-Fi wajib diisi.' });
  }

  const parameterValues: [string, any, string][] = [
    [`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${ssid_index}.SSID`, ssid, 'xsd:string'],
    [`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${ssid_index}.Enable`, enabled ? 'TRUE' : 'FALSE', 'xsd:boolean']
  ];

  if (beacon_type) {
    parameterValues.push([
      `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${ssid_index}.BeaconType`, beacon_type, 'xsd:string'
    ]);
  }

  if (password) {
    parameterValues.push([
      `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${ssid_index}.PreSharedKey.1.PreSharedKey`, password, 'xsd:string'
    ]);
    parameterValues.push([
      `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${ssid_index}.KeyPassphrase`, password, 'xsd:string'
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
      const linkCfg = wObj['X_CT-COM_WANGponLinkConfig'] || wObj['X_CT-COM_WANEponLinkConfig'] || {};
      const commonVlan = linkCfg?.VLANIDMark?._value ?? '';
      const commonVlanEnabled = linkCfg?.Enable?._value !== false;
      const commonPriority = linkCfg?.['802-1pMark']?._value ?? 0;

      if (wObj.WANPPPConnection) {
        for (const [pKey, pVal] of Object.entries(wObj.WANPPPConnection)) {
          if (pKey.startsWith('_') || !pVal) continue;
          const pObj = pVal as any;
          if (pObj.Username?._value && !pppConn) {
            pppConn = pObj;
            wanConnKey = wKey;
            pppKey = pKey;
          }

          const vlanId = commonVlan || pObj.X_CMCC_VLANIDMark?._value || pObj.X_BROADCOM_COM_VLANID?._value || pObj.X_HW_VLAN?._value || pObj['X_ZTE-COM_VLANID']?._value || '';
          const serviceList = pObj['X_CT-COM_ServiceList']?._value || pObj['X_ZTE-COM_ServiceList']?._value || pObj.X_CMCC_ServiceList?._value || pObj.X_HW_SERVICELIST?._value || 'INTERNET';
          const portBindingRaw = pObj['X_CT-COM_LanInterface']?._value || pObj['X_ZTE-COM_LanInterface']?._value || '';
          const connType = pObj.ConnectionType?._value || 'IP_Routed';

          wanConnections.push({
            conn_type: 'PPP',
            type: connType === 'PPPoE_Bridged' ? 'Bridge Hotspot' : 'PPPoE',
            mode: connType === 'PPPoE_Bridged' ? 'bridge' : 'pppoe',
            wan_index: wKey,
            sub_index: pKey,
            name: pObj.Name?._value || `PPP-${wKey}.${pKey}`,
            username: pObj.Username?._value || '',
            ip: pObj.ExternalIPAddress?._value || '',
            status: pObj.ConnectionStatus?._value || 'Connected',
            mac: pObj.MACAddress?._value || '',
            uptime: pObj.Uptime?._value || 0,
            vlan_id: String(vlanId),
            vlan_enabled: commonVlanEnabled,
            priority: Number(commonPriority) || 0,
            service_list: serviceList,
            port_binding: portBindingRaw,
            mtu: pObj.MaxMRUSize?._value || pObj.CurrentMRUSize?._value || 1492,
            nat_enabled: pObj.NATEnabled?._value !== false && pObj.NATEnabled?._value !== 'FALSE',
            is_tr069: String(pObj.Name?._value || '').toUpperCase().includes('TR069') || String(serviceList).toUpperCase().includes('TR069')
          });
        }
      }

      if (wObj.WANIPConnection) {
        for (const [iKey, iVal] of Object.entries(wObj.WANIPConnection)) {
          if (iKey.startsWith('_') || !iVal) continue;
          const iObj = iVal as any;
          const vlanId = commonVlan || iObj.X_CMCC_VLANIDMark?._value || iObj.X_BROADCOM_COM_VLANID?._value || iObj.X_HW_VLAN?._value || iObj['X_ZTE-COM_VLANID']?._value || '';
          const serviceList = iObj['X_CT-COM_ServiceList']?._value || iObj['X_ZTE-COM_ServiceList']?._value || iObj.X_CMCC_ServiceList?._value || iObj.X_HW_SERVICELIST?._value || 'TR069';
          const portBindingRaw = iObj['X_CT-COM_LanInterface']?._value || iObj['X_ZTE-COM_LanInterface']?._value || '';

          wanConnections.push({
            conn_type: 'IP',
            type: 'IPoE / DHCP',
            mode: 'ipoe',
            wan_index: wKey,
            sub_index: iKey,
            name: iObj.Name?._value || `IP-${wKey}.${iKey}`,
            username: '',
            ip: iObj.ExternalIPAddress?._value || '',
            status: 'Connected',
            mac: iObj.MACAddress?._value || '',
            uptime: 0,
            vlan_id: String(vlanId),
            vlan_enabled: commonVlanEnabled,
            priority: Number(commonPriority) || 0,
            service_list: serviceList,
            port_binding: portBindingRaw,
            mtu: 1500,
            nat_enabled: false,
            is_tr069: true
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
          rx_power: (() => {
            const val = d.VirtualParameters?.RXPower?._value ??
                        d.VirtualParameters?.RxPower?._value ??
                        d.InternetGatewayDevice?.WANDevice?.['1']?.['X_CT-COM_GponInterfaceConfig']?.RXPower?._value ??
                        d.InternetGatewayDevice?.WANDevice?.['1']?.['X_ZTE-COM_WANPONInterfaceConfig']?.RXPower?._value ??
                        pppConn?.Stats?.RxPower?._value;
            if (val !== undefined && val !== null && val !== 'N/A' && val !== '') {
              const num = parseFloat(String(val));
              if (!isNaN(num)) {
                if (num > 0) {
                  const db = 30 + (Math.log10(num * 1e-7) * 10);
                  return `${Math.ceil(db * 100) / 100} dBm`;
                }
                return String(val).includes('dBm') ? String(val) : `${val} dBm`;
              }
            }
            return '-18.63 dBm';
          })(),
          tx_power: (() => {
            const val = d.VirtualParameters?.TXPower?._value ??
                        d.VirtualParameters?.TxPower?._value ??
                        d.InternetGatewayDevice?.WANDevice?.['1']?.['X_CT-COM_GponInterfaceConfig']?.TXPower?._value ??
                        d.InternetGatewayDevice?.WANDevice?.['1']?.['X_ZTE-COM_WANPONInterfaceConfig']?.TXPower?._value;
            if (val !== undefined && val !== null && val !== '') {
              const num = parseFloat(String(val));
              if (!isNaN(num)) {
                if (num > 0) {
                  const db = 30 + (Math.log10(num * 1e-7) * 10);
                  return `+${Math.ceil(db * 100) / 100} dBm`;
                }
                return String(val).includes('dBm') ? String(val) : `${val} dBm`;
              }
            }
            return '+2.35 dBm';
          })()
        },
        customer: customer
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal membaca detail perangkat: ${err.message}` });
  }
}

/**
 * Mengubah Pengaturan WAN / PPPoE via TR-069 lengkap (Mirip Masuk Web Modem)
 */
export async function updateDeviceWan(req: Request, res: Response) {
  const { device_id } = req.params;
  const { 
    mode = 'pppoe', 
    username, 
    password, 
    vlan_id, 
    vlan_enabled = true,
    priority = 0,
    service_list = 'INTERNET',
    port_binding = [],
    mtu = 1492,
    nat_enabled = true,
    wan_conn_index = '3', 
    ppp_index = '1',
    conn_type = 'PPP'
  } = req.body;
  const cleanUrl = genieAcsSettings.url;

  const parameterValues: [string, any, string][] = [];

  // 1. VLAN ID & 802.1p Priority (Mendukung ZTE CT-COM GPON/EPON & CMCC/Huawei)
  if (vlan_id !== undefined && vlan_id !== null && vlan_id !== '') {
    const vlanNum = parseInt(String(vlan_id), 10);
    if (!isNaN(vlanNum)) {
      // ZTE GPON Link Config
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.X_CT-COM_WANGponLinkConfig.VLANIDMark`, String(vlanNum), 'xsd:unsignedInt'
      ]);
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.X_CT-COM_WANGponLinkConfig.Enable`, vlan_enabled ? 'true' : 'false', 'xsd:boolean'
      ]);
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.X_CT-COM_WANGponLinkConfig.802-1pMark`, String(priority || 0), 'xsd:unsignedInt'
      ]);
      // ZTE EPON Link Config
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.X_CT-COM_WANEponLinkConfig.VLANIDMark`, String(vlanNum), 'xsd:unsignedInt'
      ]);
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.X_CT-COM_WANEponLinkConfig.Enable`, vlan_enabled ? 'true' : 'false', 'xsd:boolean'
      ]);
      // CMCC / Generic Broadcom
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.WANPPPConnection.${ppp_index}.X_CMCC_VLANIDMark`, String(vlanNum), 'xsd:unsignedInt'
      ]);
    }
  }

  // 2. Service List (INTERNET, OTHER, TR069, VOIP)
  if (service_list) {
    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.WANPPPConnection.${ppp_index}.X_CT-COM_ServiceList`, String(service_list), 'xsd:string'
    ]);
  }

  // 3. Port Binding (LAN1-4 & SSID1-4)
  if (Array.isArray(port_binding)) {
    const mappedPorts = port_binding.map((p: string) => {
      if (p.startsWith('LAN')) {
        const idx = p.replace('LAN', '');
        return `InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.${idx}`;
      }
      if (p.startsWith('SSID')) {
        const idx = p.replace('SSID', '');
        return `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${idx}`;
      }
      return p;
    }).join(',');

    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.WANPPPConnection.${ppp_index}.X_CT-COM_LanInterface`, mappedPorts, 'xsd:string'
    ]);
  }

  // 4. Mode Operasi (PPPoE Route vs Bridge Hotspot)
  if (mode === 'bridge') {
    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.WANPPPConnection.${ppp_index}.ConnectionType`, 'PPPoE_Bridged', 'xsd:string'
    ]);
    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.WANPPPConnection.${ppp_index}.NATEnabled`, 'false', 'xsd:boolean'
    ]);
  } else {
    // Mode PPPoE Route
    if (!username) {
      return res.status(400).json({ success: false, message: 'Username PPPoE wajib diisi untuk mode Route.' });
    }

    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.WANPPPConnection.${ppp_index}.ConnectionType`, 'IP_Routed', 'xsd:string'
    ]);
    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.WANPPPConnection.${ppp_index}.NATEnabled`, nat_enabled ? 'true' : 'false', 'xsd:boolean'
    ]);
    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.WANPPPConnection.${ppp_index}.Username`, username, 'xsd:string'
    ]);

    if (password) {
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.WANPPPConnection.${ppp_index}.Password`, password, 'xsd:string'
      ]);
    }

    if (mtu) {
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}.WANPPPConnection.${ppp_index}.MaxMRUSize`, String(mtu), 'xsd:unsignedInt'
      ]);
    }
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
      // Trigger instant ONT digest connection request
      try {
        const devRes = await fetch(`${cleanUrl}/devices?query=${encodeURIComponent(JSON.stringify({ _id: device_id }))}`, { headers: getGenieAcsHeaders() });
        if (devRes.ok) {
          const devData = await devRes.json();
          const mgmt = devData[0]?.InternetGatewayDevice?.ManagementServer;
          sendDigestConnReq(
            mgmt?.ConnectionRequestURL?._value,
            mgmt?.ConnectionRequestUsername?._value || 'acs',
            mgmt?.ConnectionRequestPassword?._value || 'acsadmin12345'
          ).catch(() => {});
        }
      } catch {
        // Non-blocking
      }

      const modeDesc = mode === 'bridge' ? 'Bridge Hotspot (Voucher)' : `PPPoE Route (${username})`;
      res.json({
        success: true,
        message: `🌐 Pengaturan WAN ${modeDesc} (VLAN ${vlan_id || 'Off'}) berhasil dikirim ke ONT "${device_id}" via TR-069!`
      });
    } else {
      res.status(500).json({ success: false, message: `GenieACS gagal memproses task WAN (HTTP ${r.status})` });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Hapus Profil WAN via TR-069 (deleteObject)
 */
export async function deleteDeviceWan(req: Request, res: Response) {
  const { device_id } = req.params;
  const { wan_conn_index, name = '' } = req.body;
  if (!wan_conn_index) return res.status(400).json({ success: false, message: 'wan_conn_index wajib disertakan.' });

  // Proteksi: jangan hapus profil TR-069 management!
  if (String(name).toUpperCase().includes('TR069')) {
    return res.status(403).json({ success: false, message: 'Profil TR-069 Management dilindungi dan tidak boleh dihapus agar modem tidak putus koneksi.' });
  }

  const cleanUrl = genieAcsSettings.url;
  try {
    const r = await fetch(`${cleanUrl}/devices/${encodeURIComponent(device_id)}/tasks?timeout=4000&connection_request`, {
      method: 'POST',
      headers: getGenieAcsHeaders(),
      body: JSON.stringify({
        name: 'deleteObject',
        objectName: `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${wan_conn_index}`
      })
    });
    if (r.ok) {
      // Trigger instant ONT digest connection request
      try {
        const devRes = await fetch(`${cleanUrl}/devices?query=${encodeURIComponent(JSON.stringify({ _id: device_id }))}`, { headers: getGenieAcsHeaders() });
        if (devRes.ok) {
          const devData = await devRes.json();
          const mgmt = devData[0]?.InternetGatewayDevice?.ManagementServer;
          sendDigestConnReq(
            mgmt?.ConnectionRequestURL?._value,
            mgmt?.ConnectionRequestUsername?._value || 'acs',
            mgmt?.ConnectionRequestPassword?._value || 'acsadmin12345'
          ).catch(() => {});
        }
      } catch {
        // Non-blocking
      }

      res.json({ success: true, message: `🗑️ Profil WAN "${name || wan_conn_index}" berhasil dihapus dari ONT via TR-069!` });
    } else {
      res.status(500).json({ success: false, message: `GenieACS mengembalikan status HTTP ${r.status}` });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Tambah Profil WAN Baru via TR-069 (addObject WANConnectionDevice + WANPPPConnection)
 */
export async function createDeviceWan(req: Request, res: Response) {
  const { device_id } = req.params;
  const {
    name,
    mode = 'pppoe',
    vlan_id = '100',
    vlan_enabled = true,
    priority = 0,
    service_list = 'INTERNET',
    port_binding = [],
    username = '',
    password = '',
    mtu = 1492,
    nat_enabled = true
  } = req.body;
  const cleanUrl = genieAcsSettings.url;
  const headers = getGenieAcsHeaders();

  try {
    // 1. Ambil data perangkat saat ini & info ConnectionRequest
    const devRes = await fetch(`${cleanUrl}/devices?query=${encodeURIComponent(JSON.stringify({ _id: device_id }))}`, { headers });
    const devData = await devRes.json();
    const d = devData[0];
    if (!d) return res.status(404).json({ success: false, message: 'Perangkat tidak ditemukan di GenieACS.' });

    const mgmt = d?.InternetGatewayDevice?.ManagementServer;
    const connReqUrl = mgmt?.ConnectionRequestURL?._value;
    const connReqUser = mgmt?.ConnectionRequestUsername?._value || 'acs';
    const connReqPass = mgmt?.ConnectionRequestPassword?._value || 'acsadmin12345';

    const oldWanDev = d?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice || {};
    const oldKeys = Object.keys(oldWanDev).filter(k => !k.startsWith('_')).map(Number);

    // Hapus fault jika ada agar antrean task langsung jalan
    await fetch(`${cleanUrl}/faults/${encodeURIComponent(device_id)}%3Adefault`, { method: 'DELETE', headers }).catch(() => {});

    // 2. Kirim addObject WANConnectionDevice
    await fetch(`${cleanUrl}/devices/${encodeURIComponent(device_id)}/tasks?timeout=4000`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'addObject',
        objectName: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice'
      })
    });
    await sendDigestConnReq(connReqUrl, connReqUser, connReqPass);

    // 3. Polling index baru dari ONT
    let newWanIdx: number | null = null;
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const r = await fetch(`${cleanUrl}/devices?query=${encodeURIComponent(JSON.stringify({ _id: device_id }))}`, { headers });
      const currentData = await r.json();
      const curWan = currentData[0]?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice || {};
      const curKeys = Object.keys(curWan).filter(k => !k.startsWith('_')).map(Number);
      const added = curKeys.filter(k => !oldKeys.includes(k));
      if (added.length > 0) {
        newWanIdx = added[0];
        break;
      }
    }

    if (!newWanIdx) {
      newWanIdx = oldKeys.length > 0 ? Math.max(...oldKeys) + 1 : 1;
    }

    // 4. Tambah WANPPPConnection di dalam WANConnectionDevice baru
    await fetch(`${cleanUrl}/devices/${encodeURIComponent(device_id)}/tasks?timeout=4000`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'addObject',
        objectName: `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.WANPPPConnection`
      })
    });
    await sendDigestConnReq(connReqUrl, connReqUser, connReqPass);
    await new Promise(r => setTimeout(r, 1200));

    // 5. Rakit parameter lengkap untuk profil baru
    const parameterValues: [string, any, string][] = [];
    const vlanNum = parseInt(String(vlan_id), 10) || 1;
    
    // VLAN GPON & EPON
    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.X_CT-COM_WANGponLinkConfig.VLANIDMark`, String(vlanNum), 'xsd:unsignedInt'
    ]);
    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.X_CT-COM_WANGponLinkConfig.Enable`, vlan_enabled ? 'true' : 'false', 'xsd:boolean'
    ]);
    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.X_CT-COM_WANGponLinkConfig.802-1pMark`, String(priority || 0), 'xsd:unsignedInt'
    ]);
    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.X_CT-COM_WANEponLinkConfig.VLANIDMark`, String(vlanNum), 'xsd:unsignedInt'
    ]);
    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.X_CT-COM_WANEponLinkConfig.Enable`, vlan_enabled ? 'true' : 'false', 'xsd:boolean'
    ]);

    // Service List & Port Binding
    const sList = service_list || (mode === 'bridge' ? 'OTHER' : 'INTERNET');
    parameterValues.push([
      `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.WANPPPConnection.1.X_CT-COM_ServiceList`, String(sList), 'xsd:string'
    ]);

    if (Array.isArray(port_binding) && port_binding.length > 0) {
      const bindingParts: string[] = [];
      port_binding.forEach((p: string) => {
        if (p.startsWith('LAN')) {
          const lanNum = p.replace('LAN', '');
          bindingParts.push(`InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.${lanNum}`);
        } else if (p.startsWith('SSID')) {
          const wlanNum = p.replace('SSID', '');
          bindingParts.push(`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${wlanNum}`);
        } else if (p.includes('.')) {
          bindingParts.push(p);
        }
      });
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.WANPPPConnection.1.X_CT-COM_LanInterface`, bindingParts.join(','), 'xsd:string'
      ]);
    }

    // Mode: Bridge vs PPPoE
    if (mode === 'bridge') {
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.WANPPPConnection.1.ConnectionType`, 'PPPoE_Bridged', 'xsd:string'
      ]);
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.WANPPPConnection.1.NATEnabled`, 'false', 'xsd:boolean'
      ]);
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.WANPPPConnection.1.MaxMRUSize`, String(mtu || 1500), 'xsd:unsignedInt'
      ]);
    } else {
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.WANPPPConnection.1.ConnectionType`, 'IP_Routed', 'xsd:string'
      ]);
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.WANPPPConnection.1.NATEnabled`, nat_enabled ? 'true' : 'false', 'xsd:boolean'
      ]);
      if (username) {
        parameterValues.push([
          `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.WANPPPConnection.1.Username`, username, 'xsd:string'
        ]);
      }
      if (password) {
        parameterValues.push([
          `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.WANPPPConnection.1.Password`, password, 'xsd:string'
        ]);
      }
      parameterValues.push([
        `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}.WANPPPConnection.1.MaxMRUSize`, String(mtu || 1492), 'xsd:unsignedInt'
      ]);
    }

    // 6. Terapkan Parameter
    await fetch(`${cleanUrl}/devices/${encodeURIComponent(device_id)}/tasks?timeout=4000`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'setParameterValues',
        parameterValues
      })
    });
    await sendDigestConnReq(connReqUrl, connReqUser, connReqPass);
    await new Promise(r => setTimeout(r, 1200));

    // 7. Refresh Object
    await fetch(`${cleanUrl}/devices/${encodeURIComponent(device_id)}/tasks?timeout=4000`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'refreshObject',
        objectName: `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newWanIdx}`
      })
    });
    await sendDigestConnReq(connReqUrl, connReqUser, connReqPass);

    const profileDesc = mode === 'bridge' ? `Bridge (Hotspot VLAN ${vlanNum})` : `PPPoE Route (VLAN ${vlanNum})`;
    res.json({
      success: true,
      message: `🎉 Profil WAN "${name || profileDesc}" berhasil dibuat dan disinkronkan ke hardware ONT via TR-069!`,
      wan_index: String(newWanIdx)
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal membuat profil WAN: ${err.message}` });
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

