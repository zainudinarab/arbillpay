async function check() {
  const attempts = [
    { url: 'http://30.30.2.53:7557/config/cwmp.connectionRequestTimeout', method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({value: '10000'}) },
    { url: 'http://30.30.2.53:7557/config/' + encodeURIComponent('cwmp.connectionRequestTimeout'), method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({value: '10000'}) },
    { url: 'http://30.30.2.53:7557/config/cwmp.connectionRequestTimeout', method: 'PUT', headers: {'Content-Type': 'text/plain'}, body: '10000' },
    { url: 'http://30.30.2.53:7557/config', method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({_id: 'cwmp.connectionRequestTimeout', value: '10000'}) }
  ];

  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    const r = await fetch(a.url, { method: a.method, headers: a.headers, body: a.body });
    console.log(`Attempt ${i+1}: ${a.method} ${a.url} (${a.headers['Content-Type']}) -> ${r.status}`);
  }
}
check().catch(console.error);
