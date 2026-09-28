import http from 'http';

const cleanDefaultScript = `const now = Date.now();
const daily = Date.now(86400000); 
const hourly = Date.now(3600000);
const minutes = Date.now(60000);

const merk = declare('DeviceID.Manufacturer', {value: 1}).value[0];
declare('DeviceID.ProductClass', {path: daily, value: daily});

// 1. Telemetri Optik (Redaman Laser RX & TX Power)
declare('VirtualParameters.RXPower', {path: minutes, value: minutes});
declare('InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.RXPower', {path: minutes, value: minutes});
declare('InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.TXPower', {path: minutes, value: minutes});
declare('InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower', {path: minutes, value: minutes});
declare('InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TXPower', {path: minutes, value: minutes});
declare('InternetGatewayDevice.WANDevice.1.WANDSLInterfaceConfig.Stats.RxPower', {path: minutes, value: minutes});

// 2. Info Perangkat Dasar
declare('InternetGatewayDevice.DeviceInfo.HardwareVersion', {path: daily, value: daily});
declare('InternetGatewayDevice.DeviceInfo.SoftwareVersion', {path: daily, value: daily});
declare('InternetGatewayDevice.DeviceInfo.UpTime', {path: minutes, value: minutes});

if (merk !== 'MikroTik') {
  // 3. Informasi WLAN (Multi-SSID 1 s/d 4)
  declare('InternetGatewayDevice.LANDevice.1.WLANConfiguration.*.SSID', {path: hourly, value: hourly});
  declare('InternetGatewayDevice.LANDevice.1.WLANConfiguration.*.Enable', {path: hourly, value: hourly});
  declare('InternetGatewayDevice.LANDevice.1.WLANConfiguration.*.BeaconType', {path: hourly, value: hourly});
  declare('InternetGatewayDevice.LANDevice.1.WLANConfiguration.*.Channel', {path: hourly, value: hourly});
  declare('InternetGatewayDevice.LANDevice.1.WLANConfiguration.*.TotalAssociations', {path: minutes, value: minutes});

  // Client Wi-Fi yang sedang tersambung
  declare('InternetGatewayDevice.LANDevice.1.WLANConfiguration.*.AssociatedDevice.*.AssociatedDeviceIPAddress', {path: minutes, value: minutes});
  declare('InternetGatewayDevice.LANDevice.1.WLANConfiguration.*.AssociatedDevice.*.AssociatedDeviceMACAddress', {path: minutes, value: minutes});

  // Host LAN / Wi-Fi
  declare('InternetGatewayDevice.LANDevice.*.Hosts.Host.*.HostName', {path: minutes, value: minutes});
  declare('InternetGatewayDevice.LANDevice.*.Hosts.Host.*.IPAddress', {path: minutes, value: minutes});
  declare('InternetGatewayDevice.LANDevice.*.Hosts.Host.*.MACAddress', {path: minutes, value: minutes});

  // 4. Informasi WAN (PPPoE, Bridge, IPoE / TR-069)
  declare('InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Name', {path: hourly, value: hourly});
  declare('InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Enable', {path: hourly, value: hourly});
  declare('InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username', {path: hourly, value: hourly});
  declare('InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ExternalIPAddress', {path: minutes, value: minutes});
  declare('InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ConnectionStatus', {path: minutes, value: minutes});
  declare('InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Uptime', {path: minutes, value: minutes});

  declare('InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.Name', {path: hourly, value: hourly});
  declare('InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.Enable', {path: hourly, value: hourly});
  declare('InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.ExternalIPAddress', {path: minutes, value: minutes});
}
`;

function putProvision(name, script) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '192.168.201.238',
      port: 7557,
      path: `/provisions/${encodeURIComponent(name)}`,
      method: 'PUT',
      auth: 'admin:admin',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(script)
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.write(script);
    req.end();
  });
}

async function run() {
  console.log('Mengupdate skrip provision "default" di GenieACS...');
  const res = await putProvision('default', cleanDefaultScript);
  console.log('Hasil update:', res);
}

run();
