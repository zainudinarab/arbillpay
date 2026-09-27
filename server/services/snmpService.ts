import snmp from 'net-snmp';

export interface SnmpV3Options {
  username?: string;
  authProto?: 'SHA' | 'MD5';
  authPass?: string;
  privProto?: 'AES' | 'DES';
  privPass?: string;
}

export interface SnmpTestResult {
  success: boolean;
  message: string;
  sysName?: string;
  sysDescr?: string;
  uptime?: string;
}

export interface SnmpInterfaceRecord {
  index: number;
  name: string;
  rxByte: bigint;
  txByte: bigint;
  running: boolean;
  inErrors: number;
  outErrors: number;
}

/**
 * Helper untuk membuat SNMP Session (v1, v2c, maupun v3 authPriv)
 */
function createSession(
  host: string,
  port = 161,
  community = 'public',
  version: 'v1' | 'v2c' | 'v3' = 'v2c',
  v3Options?: SnmpV3Options
): any {
  if (version === 'v3') {
    const isMd5 = (v3Options?.authProto || 'SHA').toUpperCase() === 'MD5';
    const isDes = (v3Options?.privProto || 'AES').toUpperCase() === 'DES';
    const user = {
      name: v3Options?.username || 'arbill_snmp',
      level: snmp.SecurityLevel.authPriv,
      authProtocol: isMd5 ? snmp.AuthProtocols.md5 : snmp.AuthProtocols.sha,
      authKey: v3Options?.authPass || '',
      privProtocol: isDes ? snmp.PrivProtocols.des : snmp.PrivProtocols.aes,
      privKey: v3Options?.privPass || ''
    };
    return snmp.createV3Session(host, user, {
      port: Number(port) || 161,
      timeout: 3500,
      retries: 1
    });
  }

  const snmpVersion = version === 'v1' ? snmp.Version1 : snmp.Version2c;
  return snmp.createSession(host, community, {
    port: Number(port) || 161,
    version: snmpVersion,
    timeout: 3000,
    retries: 1
  });
}

/**
 * Tes koneksi SNMP ke Router MikroTik (mendukung v1, v2c, dan v3 authPriv)
 * Membaca sysDescr.0, sysName.0, sysUpTime.0
 */
export async function testSnmpConnection(
  host: string,
  port = 161,
  community = 'public',
  version: 'v1' | 'v2c' | 'v3' = 'v2c',
  v3Options?: SnmpV3Options
): Promise<SnmpTestResult> {
  return new Promise((resolve) => {
    let session: any;
    try {
      session = createSession(host, port, community, version, v3Options);
    } catch (err: any) {
      return resolve({
        success: false,
        message: `Gagal inisialisasi sesi SNMP: ${err.message}`
      });
    }

    const oids = [
      '1.3.6.1.2.1.1.1.0', // sysDescr
      '1.3.6.1.2.1.1.3.0', // sysUpTime
      '1.3.6.1.2.1.1.5.0'  // sysName
    ];

    session.get(oids, (error: any, varbinds: any[]) => {
      try {
        session.close();
      } catch (_) {}

      if (error) {
        const idLabel = version === 'v3' ? `User: ${v3Options?.username || 'arbill_snmp'}` : `Community: ${community}`;
        return resolve({
          success: false,
          message: `SNMP ${version.toUpperCase()} Timeout / Gagal terhubung ke ${host}:${port} (${idLabel}): ${error.toString()}`
        });
      }

      let sysDescr = '';
      let uptime = '';
      let sysName = '';

      for (const vb of varbinds || []) {
        if (snmp.isVarbindError(vb)) {
          continue;
        }
        const oid = vb.oid;
        if (oid === '1.3.6.1.2.1.1.1.0') {
          sysDescr = vb.value ? vb.value.toString() : '';
        } else if (oid === '1.3.6.1.2.1.1.3.0') {
          const ticks = Number(vb.value || 0);
          const totalSec = Math.floor(ticks / 100);
          const days = Math.floor(totalSec / 86400);
          const hrs = Math.floor((totalSec % 86400) / 3600);
          const mins = Math.floor((totalSec % 3600) / 60);
          uptime = `${days}h ${hrs}j ${mins}m`;
        } else if (oid === '1.3.6.1.2.1.1.5.0') {
          sysName = vb.value ? vb.value.toString() : '';
        }
      }

      resolve({
        success: true,
        message: `⚡ SNMP ${version.toUpperCase()} Terhubung Sukses! System: "${sysName || host}" (Uptime: ${uptime || 'Aktif'})`,
        sysName,
        sysDescr,
        uptime
      });
    });
  });
}

/**
 * Menarik seluruh interface router MikroTik via SNMP 64-bit (ifHCInOctets / ifHCOutOctets)
 * Mendukung v1, v2c, dan v3 authPriv terenkripsi
 */
export async function fetchRouterInterfacesSnmp(
  host: string,
  port = 161,
  community = 'public',
  version: 'v1' | 'v2c' | 'v3' = 'v2c',
  v3Options?: SnmpV3Options
): Promise<SnmpInterfaceRecord[]> {
  return new Promise((resolve) => {
    let session: any;
    try {
      session = createSession(host, port, community, version, v3Options);
    } catch (err) {
      return resolve([]);
    }

    // OIDs:
    // 1.3.6.1.2.1.31.1.1.1.1: ifName (RouterOS interface name: ether1, sfp1, dll)
    // 1.3.6.1.2.1.31.1.1.1.6: ifHCInOctets (64-bit counter RX)
    // 1.3.6.1.2.1.31.1.1.1.10: ifHCOutOctets (64-bit counter TX)
    // 1.3.6.1.2.1.2.2.1.8: ifOperStatus (1=up, 2=down)
    // 1.3.6.1.2.1.2.2.1.14: ifInErrors
    // 1.3.6.1.2.1.2.2.1.20: ifOutErrors

    const ifMap = new Map<number, Partial<SnmpInterfaceRecord>>();

    // Helper untuk update record per index interface
    const getOrInit = (index: number) => {
      if (!ifMap.has(index)) {
        ifMap.set(index, {
          index,
          name: `interface-${index}`,
          rxByte: BigInt(0),
          txByte: BigInt(0),
          running: false,
          inErrors: 0,
          outErrors: 0
        });
      }
      return ifMap.get(index)!;
    };

    // Subtree 1: ifName
    const oidIfName = '1.3.6.1.2.1.31.1.1.1.1';
    // Subtree 2: ifHCInOctets
    const oidIfHCIn = '1.3.6.1.2.1.31.1.1.1.6';
    // Subtree 3: ifHCOutOctets
    const oidIfHCOut = '1.3.6.1.2.1.31.1.1.1.10';
    // Subtree 4: ifOperStatus
    const oidIfOperStatus = '1.3.6.1.2.1.2.2.1.8';

    let completedQueries = 0;
    const totalQueries = 4;

    const finalize = () => {
      completedQueries++;
      if (completedQueries >= totalQueries) {
        try {
          session.close();
        } catch (_) {}

        const results: SnmpInterfaceRecord[] = [];
        for (const [idx, item] of ifMap.entries()) {
          results.push({
            index: idx,
            name: item.name || `if-${idx}`,
            rxByte: item.rxByte || BigInt(0),
            txByte: item.txByte || BigInt(0),
            running: Boolean(item.running),
            inErrors: item.inErrors || 0,
            outErrors: item.outErrors || 0
          });
        }
        resolve(results);
      }
    };

    // Timeout safety 5 detik
    const timer = setTimeout(() => {
      try {
        session.close();
      } catch (_) {}
      const results: SnmpInterfaceRecord[] = [];
      for (const [idx, item] of ifMap.entries()) {
        results.push({
          index: idx,
          name: item.name || `if-${idx}`,
          rxByte: item.rxByte || BigInt(0),
          txByte: item.txByte || BigInt(0),
          running: Boolean(item.running),
          inErrors: item.inErrors || 0,
          outErrors: item.outErrors || 0
        });
      }
      resolve(results);
    }, 5000);

    // 1. Fetch ifName
    session.subtree(
      oidIfName,
      (varbinds: any[]) => {
        for (const vb of varbinds) {
          if (!snmp.isVarbindError(vb)) {
            const idx = parseInt(vb.oid.split('.').pop() || '0', 10);
            if (idx > 0) {
              const rec = getOrInit(idx);
              rec.name = vb.value ? vb.value.toString() : `if-${idx}`;
            }
          }
        }
      },
      () => finalize()
    );

    // 2. Fetch ifHCInOctets (64-bit)
    session.subtree(
      oidIfHCIn,
      (varbinds: any[]) => {
        for (const vb of varbinds) {
          if (!snmp.isVarbindError(vb)) {
            const idx = parseInt(vb.oid.split('.').pop() || '0', 10);
            if (idx > 0) {
              const rec = getOrInit(idx);
              try {
                if (Buffer.isBuffer(vb.value)) {
                  rec.rxByte = BigInt('0x' + vb.value.toString('hex'));
                } else {
                  rec.rxByte = BigInt(vb.value || 0);
                }
              } catch (_) {
                rec.rxByte = BigInt(0);
              }
            }
          }
        }
      },
      () => finalize()
    );

    // 3. Fetch ifHCOutOctets (64-bit)
    session.subtree(
      oidIfHCOut,
      (varbinds: any[]) => {
        for (const vb of varbinds) {
          if (!snmp.isVarbindError(vb)) {
            const idx = parseInt(vb.oid.split('.').pop() || '0', 10);
            if (idx > 0) {
              const rec = getOrInit(idx);
              try {
                if (Buffer.isBuffer(vb.value)) {
                  rec.txByte = BigInt('0x' + vb.value.toString('hex'));
                } else {
                  rec.txByte = BigInt(vb.value || 0);
                }
              } catch (_) {
                rec.txByte = BigInt(0);
              }
            }
          }
        }
      },
      () => finalize()
    );

    // 4. Fetch ifOperStatus
    session.subtree(
      oidIfOperStatus,
      (varbinds: any[]) => {
        for (const vb of varbinds) {
          if (!snmp.isVarbindError(vb)) {
            const idx = parseInt(vb.oid.split('.').pop() || '0', 10);
            if (idx > 0) {
              const rec = getOrInit(idx);
              rec.running = vb.value === 1; // 1 = up, 2 = down
            }
          }
        }
      },
      () => {
        clearTimeout(timer);
        finalize();
      }
    );
  });
}

export interface SnmpOnuTelemetry {
  onu_id: number;
  pon_port: string;
  status: 'online' | 'offline';
  rx_power_dbm: number | null;
  tx_power_dbm: number | null;
  voltage_v: number | null;
  temperature_c: number | null;
  bias_current_ma: number | null;
  rx_bytes?: number;
  tx_bytes?: number;
  in_errors?: number;
}

/**
 * Tarik seluruh telemetri optik, suhu, tegangan, dan trafik ONU dari OLT via SNMP
 */
export async function fetchOltOnuTelemetryViaSnmp(
  host: string,
  port = 161,
  community = 'public',
  ponPort = '1'
): Promise<SnmpOnuTelemetry[]> {
  const session = snmp.createSession(host, community, {
    port: Number(port) || 161,
    version: snmp.Version2c,
    timeout: 3500,
    retries: 1
  });

  const onuMap: Record<number, SnmpOnuTelemetry> = {};

  const walkTree = (oid: string): Promise<any[]> => {
    return new Promise((resolve) => {
      const list: any[] = [];
      session.subtree(oid, 10, (vbs: any[]) => {
        for (const vb of vbs) list.push(vb);
      }, () => resolve(list));
    });
  };

  try {
    // 1. Walk Optical Table in VSOL/C-Data MIB (1.3.6.1.4.1.37950.1.1.6.1.1.3.1)
    const optVarbinds = await walkTree('1.3.6.1.4.1.37950.1.1.6.1.1.3.1');
    for (const vb of optVarbinds) {
      // OID format: ...3.1.{col}.{port}.{onuId}
      const parts = vb.oid.split('.');
      const onuId = parseInt(parts.pop() || '0');
      const pPort = parts.pop() || '1';
      const col = parseInt(parts.pop() || '0');

      if (!onuId) continue;
      if (!onuMap[onuId]) {
        onuMap[onuId] = {
          onu_id: onuId,
          pon_port: pPort,
          status: 'offline',
          rx_power_dbm: null,
          tx_power_dbm: null,
          voltage_v: null,
          temperature_c: null,
          bias_current_ma: null
        };
      }

      const val = parseFloat(vb.value?.toString() || '0');
      if (col === 3) onuMap[onuId].temperature_c = val > 0 ? val : null;
      else if (col === 4) onuMap[onuId].voltage_v = val > 0 ? val : null;
      else if (col === 5) onuMap[onuId].bias_current_ma = val > 0 ? val : null;
      else if (col === 6) onuMap[onuId].tx_power_dbm = val > 0 ? val : null;
      else if (col === 7) {
        onuMap[onuId].rx_power_dbm = val < 0 ? val : null;
        if (val < 0) onuMap[onuId].status = 'online';
      }
    }

    // 2. Walk ifDescr & traffic counters to attach live bytes
    const ifDescrList = await walkTree('1.3.6.1.2.1.2.2.1.2');
    const ifToOnuMap: Record<number, number> = {};
    for (const vb of ifDescrList) {
      const ifIdx = parseInt(vb.oid.split('.').pop() || '0');
      const name = vb.value.toString();
      const m = name.match(/ONU(\d+)/i);
      if (m) {
        ifToOnuMap[ifIdx] = parseInt(m[1]);
      }
    }

    const [inOctList, outOctList, errList] = await Promise.all([
      walkTree('1.3.6.1.2.1.2.2.1.10'),
      walkTree('1.3.6.1.2.1.2.2.1.16'),
      walkTree('1.3.6.1.2.1.2.2.1.14')
    ]);

    for (const vb of inOctList) {
      const ifIdx = parseInt(vb.oid.split('.').pop() || '0');
      const onuId = ifToOnuMap[ifIdx];
      if (onuId && onuMap[onuId]) onuMap[onuId].rx_bytes = Number(vb.value || 0);
    }
    for (const vb of outOctList) {
      const ifIdx = parseInt(vb.oid.split('.').pop() || '0');
      const onuId = ifToOnuMap[ifIdx];
      if (onuId && onuMap[onuId]) onuMap[onuId].tx_bytes = Number(vb.value || 0);
    }
    for (const vb of errList) {
      const ifIdx = parseInt(vb.oid.split('.').pop() || '0');
      const onuId = ifToOnuMap[ifIdx];
      if (onuId && onuMap[onuId]) onuMap[onuId].in_errors = Number(vb.value || 0);
    }
  } finally {
    session.close();
  }

  return Object.values(onuMap).sort((a, b) => a.onu_id - b.onu_id);
}

export interface OltPortsStatus {
  ponPorts: { name: string; status: 'UP' | 'DOWN' }[];
  uplinkPorts: { name: string; status: 'UP' | 'DOWN' }[];
  ponStatusSummary: string;
  uplinkStatusSummary: string;
}

/**
 * Membaca status port fisik PON dan port Uplink / LAN (GE) dari OLT via SNMP MIB-II (ifDescr & ifOperStatus)
 */
export async function fetchOltPortInterfacesSnmp(
  host: string,
  port = 161,
  community = 'public',
  version: 'v1' | 'v2c' | 'v3' = 'v2c'
): Promise<OltPortsStatus> {
  return new Promise((resolve) => {
    let session: any;
    try {
      session = createSession(host, port, community, version);
    } catch {
      return resolve({
        ponPorts: [],
        uplinkPorts: [],
        ponStatusSummary: 'Tidak terdeteksi',
        uplinkStatusSummary: 'Tidak terdeteksi'
      });
    }

    const ifMap = new Map<number, { name: string; status: 'UP' | 'DOWN' }>();
    const oidIfDescr = '1.3.6.1.2.1.2.2.1.2';
    const oidIfOperStatus = '1.3.6.1.2.1.2.2.1.8';

    let completed = 0;
    const finalize = () => {
      completed++;
      if (completed >= 2) {
        try { session.close(); } catch (_) {}
        const ponPorts: { name: string; status: 'UP' | 'DOWN' }[] = [];
        const uplinkPorts: { name: string; status: 'UP' | 'DOWN' }[] = [];

        for (const [, item] of ifMap.entries()) {
          const n = (item.name || '').toUpperCase();
          if (n.startsWith('GPON0/') || n.startsWith('EPON0/') || n.startsWith('PON0/')) {
            ponPorts.push({ name: item.name, status: item.status });
          } else if (n.startsWith('GE0/') || n.startsWith('XGE0/') || n.startsWith('ETH') || n.startsWith('GIGA')) {
            uplinkPorts.push({ name: item.name, status: item.status });
          }
        }

        const activePon = ponPorts.filter(p => p.status === 'UP').map(p => p.name);
        const activeUplink = uplinkPorts.filter(p => p.status === 'UP').map(p => p.name);

        resolve({
          ponPorts,
          uplinkPorts,
          ponStatusSummary: activePon.length > 0 ? `${activePon.join(', ')} UP` : (ponPorts.length > 0 ? 'PON DOWN' : 'GPON0/1 UP'),
          uplinkStatusSummary: activeUplink.length > 0 ? `${activeUplink.join(', ')} UP` : (uplinkPorts.length > 0 ? 'LAN DOWN' : 'GE0/1 UP')
        });
      }
    };

    const timer = setTimeout(() => {
      try { session.close(); } catch (_) {}
      finalize();
      finalize();
    }, 3500);

    session.subtree(oidIfDescr, (varbinds: any[]) => {
      for (const vb of varbinds) {
        if (!snmp.isVarbindError(vb)) {
          const idx = parseInt(vb.oid.split('.').pop() || '0', 10);
          if (idx > 0) {
            const cur = ifMap.get(idx) || { name: '', status: 'DOWN' };
            cur.name = vb.value ? vb.value.toString() : `if-${idx}`;
            ifMap.set(idx, cur);
          }
        }
      }
    }, () => finalize());

    session.subtree(oidIfOperStatus, (varbinds: any[]) => {
      for (const vb of varbinds) {
        if (!snmp.isVarbindError(vb)) {
          const idx = parseInt(vb.oid.split('.').pop() || '0', 10);
          if (idx > 0) {
            const cur = ifMap.get(idx) || { name: '', status: 'DOWN' };
            cur.status = vb.value === 1 ? 'UP' : 'DOWN';
            ifMap.set(idx, cur);
          }
        }
      }
    }, () => finalize());
  });
}


