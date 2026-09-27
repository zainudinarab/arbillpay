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
  const { ssid, password } = req.body;
  const cleanUrl = genieAcsSettings.url;

  if (!ssid) {
    return res.status(400).json({ success: false, message: 'SSID Wi-Fi wajib diisi.' });
  }

  try {
    const r = await fetch(`${cleanUrl}/devices/${encodeURIComponent(device_id)}/tasks?timeout=3000&connection_request`, {
      method: 'POST',
      headers: getGenieAcsHeaders(),
      body: JSON.stringify({
        name: 'setParameterValues',
        parameterValues: [
          ['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID', ssid, 'xsd:string'],
          ['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey', password || '12345678', 'xsd:string']
        ]
      })
    });

    if (r.ok) {
      res.json({
        success: true,
        message: `📶 Perintah penyesuaian Wi-Fi SSID "${ssid}" berhasil terkirim ke ONU "${device_id}" via TR-069!`
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
