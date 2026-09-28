import crypto from 'crypto';

export async function sendDigestConnReq(url, username = 'acs', password = 'acsadmin12345') {
  try {
    const res1 = await fetch(url);
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
      const res2 = await fetch(url, { headers: { 'Authorization': digestHeader } });
      return res2.status;
    }
    return res1.status;
  } catch (e) {
    console.error('Conn req error:', e.message);
    return null;
  }
}

async function main() {
  const deviceId = 'B4E46B-F609%20V9%2E0%20XPON-ZICG275ED25E';
  const cleanUrl = 'http://192.168.201.238:7557';
  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
    'Content-Type': 'application/json'
  };

  console.log('1. Adding WANConnectionDevice...');
  const addRes1 = await fetch(`${cleanUrl}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=4000`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'addObject',
      objectName: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice'
    })
  });
  console.log('Add WANConnectionDevice task:', addRes1.status);
  await sendDigestConnReq('http://192.168.201.216:58000');

  // Wait 1.5s
  await new Promise(r => setTimeout(r, 1500));

  // Check what index was created
  const devRes = await fetch(`${cleanUrl}/devices?query=%7B%22_id%22%3A%22B4E46B-F609%2520V9%252E0%2520XPON-ZICG275ED25E%22%7D`, { headers });
  const devData = await devRes.json();
  const wanDev = devData[0]?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice || {};
  const indexes = Object.keys(wanDev).filter(k => !k.startsWith('_')).map(Number).sort((a,b) => a-b);
  console.log('WAN indexes found:', indexes);
  const newIndex = indexes[indexes.length - 1];
  console.log('New WAN index:', newIndex);

  console.log(`2. Adding WANPPPConnection to WANConnectionDevice.${newIndex}...`);
  const addRes2 = await fetch(`${cleanUrl}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=4000`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'addObject',
      objectName: `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newIndex}.WANPPPConnection`
    })
  });
  console.log('Add WANPPPConnection task:', addRes2.status);
  await sendDigestConnReq('http://192.168.201.216:58000');

  // Wait 1.5s
  await new Promise(r => setTimeout(r, 1500));

  // Configure parameters for this new profile
  console.log(`3. Setting parameters for WANConnectionDevice.${newIndex}...`);
  const setRes = await fetch(`${cleanUrl}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=4000`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'setParameterValues',
      parameterValues: [
        [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newIndex}.X_CT-COM_WANGponLinkConfig.VLANIDMark`, '300', 'xsd:unsignedInt'],
        [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newIndex}.X_CT-COM_WANGponLinkConfig.Enable`, 'true', 'xsd:boolean'],
        [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newIndex}.WANPPPConnection.1.ConnectionType`, 'IP_Routed', 'xsd:string'],
        [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newIndex}.WANPPPConnection.1.X_CT-COM_ServiceList`, 'INTERNET', 'xsd:string'],
        [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newIndex}.WANPPPConnection.1.NATEnabled`, 'true', 'xsd:boolean'],
        [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newIndex}.WANPPPConnection.1.Username`, 'user_test@arbill', 'xsd:string']
      ]
    })
  });
  console.log('SetParameterValues status:', setRes.status);
  await sendDigestConnReq('http://192.168.201.216:58000');

  // Wait 1.5s
  await new Promise(r => setTimeout(r, 1500));

  // Refresh
  await fetch(`${cleanUrl}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=4000`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'refreshObject',
      objectName: `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newIndex}`
    })
  });
  await sendDigestConnReq('http://192.168.201.216:58000');
  console.log('Done!');
}

main().catch(console.error);
