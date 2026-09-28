import crypto from 'crypto';

export async function sendDigestConnReq(url, username = 'acs', password = 'acsadmin12345') {
  if (!url) return null;
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
    console.error('sendDigestConnReq error:', e.message);
    return null;
  }
}

async function testCreate() {
  const deviceId = 'B4E46B-F609%20V9%2E0%20XPON-ZICG275ED25E';
  const cleanUrl = 'http://192.168.201.238:7557';
  const headers = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
    'Content-Type': 'application/json'
  };

  // 1. Get current device state
  const devRes = await fetch(`${cleanUrl}/devices?query=%7B%22_id%22%3A%22B4E46B-F609%2520V9%252E0%2520XPON-ZICG275ED25E%22%7D`, { headers });
  const devData = await devRes.json();
  const d = devData[0];
  const mgmt = d?.InternetGatewayDevice?.ManagementServer;
  const connReqUrl = mgmt?.ConnectionRequestURL?._value;
  const connReqUser = mgmt?.ConnectionRequestUsername?._value || 'acs';
  const connReqPass = mgmt?.ConnectionRequestPassword?._value || 'acsadmin12345';
  
  const oldWanDev = d?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice || {};
  const oldKeys = Object.keys(oldWanDev).filter(k => !k.startsWith('_')).map(Number);
  console.log('Old WAN keys:', oldKeys);

  // Clear any existing fault
  await fetch(`${cleanUrl}/faults/${encodeURIComponent(deviceId)}%3Adefault`, { method: 'DELETE', headers }).catch(() => {});

  // 2. Add WANConnectionDevice
  console.log('Sending addObject for WANConnectionDevice...');
  await fetch(`${cleanUrl}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=4000`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'addObject',
      objectName: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice'
    })
  });
  await sendDigestConnReq(connReqUrl, connReqUser, connReqPass);

  // Poll for new key (up to 5 seconds)
  let newKey = null;
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const r = await fetch(`${cleanUrl}/devices?query=%7B%22_id%22%3A%22B4E46B-F609%2520V9%252E0%2520XPON-ZICG275ED25E%22%7D`, { headers });
    const currentData = await r.json();
    const curWan = currentData[0]?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice || {};
    const curKeys = Object.keys(curWan).filter(k => !k.startsWith('_')).map(Number);
    const added = curKeys.filter(k => !oldKeys.includes(k));
    if (added.length > 0) {
      newKey = added[0];
      break;
    }
  }

  console.log('Detected newly created WANConnectionDevice key:', newKey);
  if (!newKey) {
    console.error('Failed to detect new WANConnectionDevice key!');
    return;
  }

  // 3. Add WANPPPConnection inside newKey
  console.log(`Adding WANPPPConnection to WANConnectionDevice.${newKey}...`);
  await fetch(`${cleanUrl}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=4000`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'addObject',
      objectName: `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newKey}.WANPPPConnection`
    })
  });
  await sendDigestConnReq(connReqUrl, connReqUser, connReqPass);

  // Wait 1.5s
  await new Promise(r => setTimeout(r, 1500));

  // 4. Set parameters for new WAN profile (Bridge Mode Hotspot VLAN 50)
  console.log(`Configuring WAN parameters for instance ${newKey}...`);
  await fetch(`${cleanUrl}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=4000`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'setParameterValues',
      parameterValues: [
        [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newKey}.X_CT-COM_WANGponLinkConfig.VLANIDMark`, '50', 'xsd:unsignedInt'],
        [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newKey}.X_CT-COM_WANGponLinkConfig.Enable`, 'true', 'xsd:boolean'],
        [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newKey}.X_CT-COM_WANGponLinkConfig.802-1pMark`, '0', 'xsd:unsignedInt'],
        [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newKey}.WANPPPConnection.1.ConnectionType`, 'PPPoE_Bridged', 'xsd:string'],
        [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newKey}.WANPPPConnection.1.X_CT-COM_ServiceList`, 'OTHER', 'xsd:string'],
        [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newKey}.WANPPPConnection.1.NATEnabled`, 'false', 'xsd:boolean'],
        [`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newKey}.WANPPPConnection.1.X_CT-COM_LanInterface`, 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.3', 'xsd:string']
      ]
    })
  });
  await sendDigestConnReq(connReqUrl, connReqUser, connReqPass);

  // Wait 1.5s
  await new Promise(r => setTimeout(r, 1500));

  // 5. Refresh
  await fetch(`${cleanUrl}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=4000`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'refreshObject',
      objectName: `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${newKey}`
    })
  });
  await sendDigestConnReq(connReqUrl, connReqUser, connReqPass);
  console.log('Finished creation pipeline!');
}

testCreate().catch(console.error);
