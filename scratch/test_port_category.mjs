import snmp from 'net-snmp';

async function testPorts() {
  const session = snmp.createSession('192.168.8.200', 'public', {
    port: 161,
    version: snmp.Version2c,
    timeout: 3000
  });

  const ifMap = new Map();

  session.subtree('1.3.6.1.2.1.2.2.1.2', (vbs) => {
    for (const vb of vbs) {
      if (!snmp.isVarbindError(vb)) {
        const idx = parseInt(vb.oid.split('.').pop() || '0', 10);
        const cur = ifMap.get(idx) || { name: '', status: 'DOWN' };
        cur.name = vb.value.toString();
        ifMap.set(idx, cur);
      }
    }
  }, () => {
    session.subtree('1.3.6.1.2.1.2.2.1.8', (vbs) => {
      for (const vb of vbs) {
        if (!snmp.isVarbindError(vb)) {
          const idx = parseInt(vb.oid.split('.').pop() || '0', 10);
          const cur = ifMap.get(idx) || { name: '', status: 'DOWN' };
          cur.status = vb.value === 1 ? 'UP' : 'DOWN';
          ifMap.set(idx, cur);
        }
      }
    }, () => {
      session.close();
      const ponPorts = [];
      const uplinkPorts = [];

      for (const [, item] of ifMap.entries()) {
        const n = (item.name || '').toUpperCase();
        if (n.startsWith('GPON0/') || n.startsWith('EPON0/') || n.startsWith('PON')) {
          ponPorts.push({ name: item.name, status: item.status });
        } else if (n.startsWith('GE0/') || n.startsWith('XGE0/') || n.startsWith('ETH') || n.startsWith('GIGA')) {
          uplinkPorts.push({ name: item.name, status: item.status });
        }
      }

      console.log('PON:', ponPorts);
      console.log('Uplink / LAN:', uplinkPorts);
    });
  });
}

testPorts();
