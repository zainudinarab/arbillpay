import { sendDigestConnReq } from './test_wan_lifecycle.mjs';

async function main() {
  const deviceId = 'B4E46B-F609%20V9%2E0%20XPON-ZICG275ED25E';
  const cleanUrl = 'http://30.30.2.53:7557';

  console.log('Sending refreshObject to Docker GenieACS...');
  const r = await fetch(`${cleanUrl}/devices/${encodeURIComponent(deviceId)}/tasks?timeout=4000`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'refreshObject',
      objectName: ''
    })
  });
  console.log('Task status:', r.status);

  console.log('Triggering Connection Request to ONT...');
  const cr = await sendDigestConnReq('http://192.168.201.216:58000');
  console.log('Connection Request response:', cr);
}

main().catch(console.error);
