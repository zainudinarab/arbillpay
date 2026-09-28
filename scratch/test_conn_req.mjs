import crypto from 'crypto';

async function main() {
  const url = 'http://192.168.201.216:58000';
  const res1 = await fetch(url);
  console.log('Res 1:', res1.status, res1.headers.get('www-authenticate'));
  const authHeader = res1.headers.get('www-authenticate');
  if (authHeader && authHeader.startsWith('Digest')) {
    const realm = authHeader.match(/realm="([^"]+)"/)?.[1];
    const nonce = authHeader.match(/nonce="([^"]+)"/)?.[1];
    const qop = authHeader.match(/qop="([^"]+)"/)?.[1];
    const cnonce = crypto.randomBytes(8).toString('hex');
    const nc = '00000001';
    const uri = '/';
    const ha1 = crypto.createHash('md5').update(`acs:${realm}:acsadmin12345`).digest('hex');
    const ha2 = crypto.createHash('md5').update(`GET:${uri}`).digest('hex');
    const response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex');
    const digestHeader = `Digest username="acs", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
    const res2 = await fetch(url, { headers: { 'Authorization': digestHeader } });
    console.log('Res 2 (Authorized):', res2.status);
  }
}

main().catch(console.error);
