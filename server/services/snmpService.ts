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
