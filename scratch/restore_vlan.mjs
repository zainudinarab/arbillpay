import { sendDigestConnReq } from './test_wan_lifecycle.mjs';

async function main() {
  const deviceId = 'B4E46B-F609%20V9%2E0%20XPON-ZICG275ED25E';
  const cleanUrl = 'http://192.168.201.238:7557';
  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
    'Content-Type': 'application/json'
  };

  // 1. Delete accidental WANPPPConnection.1 on WANConnectionDevice.5
  await fetch(`${cleanUrl}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=4000`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'deleteObject',
      objectName: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.5.WANPPPConnection.1'
    })
  });

  // 2. Restore VLAN 1011 on WANConnectionDevice.5
  await fetch(`${cleanUrl}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=4000`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'setParameterValues',
      parameterValues: [
        ['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.5.X_CT-COM_WANGponLinkConfig.VLANIDMark', '1011', 'xsd:unsignedInt']
      ]
    })
  });

  // 3. Trigger Conn Req
  await sendDigestConnReq('http://192.168.201.216:58000');
  console.log('Restored!');
}

main().catch(console.error);
