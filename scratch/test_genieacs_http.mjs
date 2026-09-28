async function testNBI() {
  try {
    const res = await fetch('http://192.168.201.238:7557/devices', {
      headers: {
        'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64')
      }
    });
    console.log('NBI /devices Status:', res.status);
    const text = await res.text();
    console.log('NBI /devices Response snippet:', text.slice(0, 300));
  } catch (e) {
    console.error('NBI Error:', e.message);
  }

  try {
    const res = await fetch('http://192.168.201.238:3000/login');
    console.log('UI /login Status:', res.status);
  } catch (e) {
    console.error('UI Error:', e.message);
  }
}

testNBI();
