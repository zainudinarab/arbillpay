import crypto from 'crypto';
import http from 'http';

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

http.get('http://192.168.201.216:58000', res => {
  const authHeader = res.headers['www-authenticate'];
  console.log('Auth header:', authHeader);
  if (!authHeader) return;
  
  const realm = (authHeader.match(/realm="([^"]+)"/) || [])[1] || 'cpe@zte.com';
  const nonce = (authHeader.match(/nonce="([^"]+)"/) || [])[1] || '';
  const qop = (authHeader.match(/qop="([^"]+)"/) || [])[1] || 'auth';
  const opaque = (authHeader.match(/opaque="([^"]+)"/) || [])[1] || '';
  
  const user = 'acs';
  const pass = 'acsadmin12345';
  const uri = '/';
  const method = 'GET';
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  
  const ha1 = md5(`${user}:${realm}:${pass}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
  
  const digest = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${nc}, cnonce="${cnonce}", response="${response}", opaque="${opaque}"`;
  
  http.get('http://192.168.201.216:58000', {
    headers: {
      'Authorization': digest
    }
  }, res2 => {
    console.log('Final Status with Digest Auth:', res2.statusCode);
  });
});
