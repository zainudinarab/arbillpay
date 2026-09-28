import snmp from 'net-snmp';

const session = snmp.createSession('192.168.8.200', 'public', {
  port: 161,
  version: snmp.Version2c,
  timeout: 3000
});

// Walk ifDescr (1.3.6.1.2.1.2.2.1.2) and ifOperStatus (1.3.6.1.2.1.2.2.1.8)
const interfaces = new Map();

session.subtree('1.3.6.1.2.1.2.2.1.2', (varbinds) => {
  for (const vb of varbinds) {
    if (!snmp.isVarbindError(vb)) {
      const idx = vb.oid.split('.').pop();
      if (!interfaces.has(idx)) interfaces.set(idx, {});
      interfaces.get(idx).name = vb.value.toString();
    }
  }
}, (err) => {
  if (err) console.error('Error ifDescr:', err);
  session.subtree('1.3.6.1.2.1.2.2.1.8', (varbinds) => {
    for (const vb of varbinds) {
      if (!snmp.isVarbindError(vb)) {
        const idx = vb.oid.split('.').pop();
        if (interfaces.has(idx)) {
          interfaces.get(idx).status = vb.value === 1 ? 'UP' : 'DOWN';
        }
      }
    }
  }, (err2) => {
    session.close();
    console.log('OLT Interfaces:');
    for (const [idx, data] of interfaces.entries()) {
      console.log(`Index ${idx}: ${data.name} => ${data.status}`);
    }
  });
});
