async function listDevices() {
  const res = await fetch('http://192.168.201.238:7557/devices', {
    headers: {
      'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64')
    }
  });
  const devices = await res.json();
  console.log(`Total Devices in GenieACS: ${devices.length}`);
  for (const d of devices) {
    console.log({
      id: d._id,
      productClass: d._deviceId?._ProductClass,
      manufacturer: d._deviceId?._Manufacturer,
      serialNumber: d._deviceId?._SerialNumber,
      lastInform: d._lastInform,
      ip: d.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.WANPPPConnection?.['1']?.ExternalIPAddress?._value ||
          d.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.WANIPConnection?.['1']?.ExternalIPAddress?._value
    });
  }
}

listDevices();
