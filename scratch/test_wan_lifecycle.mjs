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

  console.log('Sending deleteObject for WANConnectionDevice.6...');
  const delRes = await fetch(`${cleanUrl}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=4000`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'deleteObject',
      objectName: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.6'
    })
  });
  console.log('Delete status:', delRes.status);

  console.log('Triggering ONT connection request with Digest Auth...');
  const connStatus = await sendDigestConnReq('http://192.168.201.216:58000');
  console.log('ONT Conn Req response:', connStatus);

  // Wait 2s for ONT to inform GenieACS
  await new Promise(r => setTimeout(r, 2000));

  // Refresh
  const refRes = await fetch(`${cleanUrl}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=4000`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'refreshObject',
      objectName: 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice'
    })
  });
  console.log('Refresh status:', refRes.status);
  await sendDigestConnReq('http://192.168.201.216:58000');
}

main().catch(console.error);
