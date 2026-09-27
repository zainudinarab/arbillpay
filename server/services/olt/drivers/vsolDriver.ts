import snmp from 'net-snmp';
import { IOltDriver } from '../IOltDriver.js';
import { 
  OltRecord, 
  OltCapabilities, 
  OnuInfo, 
  OnuOpticalReading, 
  RegisterOnuParams, 
  UnconfiguredOnu,
  SnmpOnuTelemetry
} from '../types.js';
import { checkTcpPortOpen, executeOltSshCommands } from '../baseSshDriver.js';

/**
 * Driver untuk keluarga OLT VSOL, HSAirPo, HSGQ, dan OEM V-Solution (V1600 Series)
 * Enterprise OID: 1.3.6.1.4.1.37950 (Guangzhou V-Solution)
 */
export class VsolDriver implements IOltDriver {
  getCapabilities(): OltCapabilities {
    return {
      brandName: 'HSAirPo / VSOL (V-Solution OEM)',
      family: 'vsol',
      canReadOpticalPower: true,
      canReadTemperature: true,
      canReadVoltage: true,
      canConfigureWanMode: true,
      canConfigureWifiSsid: false,
      canControlCatv: false,
      canRemoteReboot: true,
      canScanUnconfigured: true,
      snmpTelemetrySupported: true,
      snmpEnterpriseOid: '1.3.6.1.4.1.37950'
    };
  }

  async testConnection(olt: OltRecord): Promise<{
    success: boolean;
    message: string;
    system_info?: string;
    ping_time_ms?: number;
  }> {
    const start = Date.now();
    const port = olt.ssh_port || 22;
    const isPortOpen = await checkTcpPortOpen(olt.ip_address, port, 4000);

    if (!isPortOpen) {
      return {
        success: false,
        message: `Port ${port} pada IP ${olt.ip_address} tidak dapat dijangkau (Host unreachable / Port closed).`
      };
    }

    try {
      const output = await executeOltSshCommands(olt, ['show version'], 10000, 'terminal length 0\n');
      const duration = Date.now() - start;

      return {
        success: true,
        message: `Koneksi SSH ke OLT ${olt.name} (HSAirPo / VSOL) Berhasil!`,
        system_info: output.slice(0, 300).trim(),
        ping_time_ms: duration
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Port SSH terbuka tetapi gagal login autentikasi: ${err.message}`
      };
    }
  }

  async fetchOnuList(olt: OltRecord, ponPort: string | number): Promise<OnuInfo[]> {
    const p = String(ponPort).replace(/^gpon[-_]olt_?/i, '').replace(/^0\//, '') || '1';
    const commands = [
      'configure terminal',
      `interface gpon 0/${p}`,
      'show onu state',
      'show onu distance',
      'show onu optical-info',
      'end'
    ];

    const raw = await executeOltSshCommands(olt, commands, 15000, 'terminal length 0\n');
    const cleanRaw = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ' ').replace(/\r/g, '');
    const onuList: OnuInfo[] = [];

    // Parse jarak (e.g. onu 1 Distance: 138m)
    const distanceMap: Record<number, number> = {};
    const distMatches = cleanRaw.matchAll(/onu\s+(\d+)\s+Distance:\s*(\d+)m/gi);
    for (const dm of distMatches) {
      distanceMap[parseInt(dm[1])] = parseInt(dm[2]);
    }

    // Parse telemetri optik per-blok
    interface OpticalInfoParsed {
      rx_power: number | null;
      tx_power: number | null;
      voltage: number | null;
      bias_current: number | null;
      temp: number | null;
    }
    const opticalMap: Record<number, OpticalInfoParsed> = {};

    const onuBlocks = cleanRaw.split(/ONU ID:\s*/i);
    for (let i = 1; i < onuBlocks.length; i++) {
      const block = onuBlocks[i];
      const idMatch = block.match(/^(\d+)/);
      if (!idMatch) continue;
      const onuId = parseInt(idMatch[1]);

      const rxM = block.match(/Rx optical level:\s*([-\d\.]+)/i);
      const txM = block.match(/Tx optical level:\s*([-\d\.]+)/i);
      const voltM = block.match(/Power feed voltage:\s*([-\d\.]+)/i);
      const biasM = block.match(/Laser bias current:\s*([-\d\.]+)/i);
      const tempM = block.match(/Temperature:\s*([-\d\.]+)/i);

      opticalMap[onuId] = {
        rx_power: rxM && !isNaN(parseFloat(rxM[1])) ? parseFloat(rxM[1]) : null,
        tx_power: txM && !isNaN(parseFloat(txM[1])) ? parseFloat(txM[1]) : null,
        voltage: voltM && !isNaN(parseFloat(voltM[1])) ? parseFloat(voltM[1]) : null,
        bias_current: biasM && !isNaN(parseFloat(biasM[1])) ? parseFloat(biasM[1]) : null,
        temp: tempM && !isNaN(parseFloat(tempM[1])) ? parseFloat(tempM[1]) : null,
      };
    }

    // Parse tabel status ONU (e.g. 1 ZTEGc4a3583c ... online)
    const lines = cleanRaw.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
        const onuId = parseInt(parts[0]);
        let sn = '';
        let statusStr = '';

        for (let i = 1; i < parts.length; i++) {
          const pStr = parts[i];
          if (/^[A-Z0-9]{12,16}$/i.test(pStr) || pStr.includes('ZTEG') || pStr.includes('HWTC') || pStr.includes('ALCL') || pStr.includes('VSOL')) {
            sn = pStr;
          }
          if (['online', 'offline', 'los', 'power-down', 'dying-gasp'].includes(pStr.toLowerCase())) {
            statusStr = pStr.toLowerCase();
          }
        }

        if (sn || statusStr) {
          let statusNorm: 'online' | 'offline' | 'los' | 'dying-gasp' | 'unknown' = 'unknown';
          if (statusStr.includes('online')) statusNorm = 'online';
          else if (statusStr.includes('los')) statusNorm = 'los';
          else if (statusStr.includes('dying-gasp') || statusStr.includes('power-down')) statusNorm = 'dying-gasp';
          else if (statusStr.includes('offline')) statusNorm = 'offline';

          const opt = opticalMap[onuId];
          onuList.push({
            pon_port: p,
            onu_id: onuId,
            sn: sn || `ONU_${onuId}`,
            status: statusNorm,
            distance_m: distanceMap[onuId] ?? null,
            rx_power_dbm: opt ? opt.rx_power : null,
            tx_power_dbm: opt ? opt.tx_power : null,
            voltage_v: opt ? opt.voltage : null,
            bias_current_ma: opt ? opt.bias_current : null,
            temperature_c: opt ? opt.temp : null
          });
        }
      }
    }

    return onuList;
  }

  async fetchOpticalPower(
    olt: OltRecord, 
    ponPort: string | number, 
    onuId: number
  ): Promise<OnuOpticalReading> {
    const p = String(ponPort).replace(/^gpon[-_]olt_?/i, '').replace(/^0\//, '') || '1';
    const commands = [
      'configure terminal',
      `interface gpon 0/${p}`,
      `show onu optical-info ${onuId}`,
      `show onu distance`,
      'end'
    ];

    let raw = '';
    try {
      raw = await executeOltSshCommands(olt, commands, 12000, 'terminal length 0\n');
    } catch (err: any) {
      return {
        rx_power_dbm: null,
        tx_power_dbm: null,
        olt_rx_power_dbm: null,
        raw_output: `SSH Error: ${err.message}`
      };
    }

    let rxPower: number | null = null;
    let txPower: number | null = null;
    let volt: number | null = null;
    let bias: number | null = null;
    let temp: number | null = null;

    const rxMatch = raw.match(/Rx\s*(?:optical)?\s*(?:level|power)\s*[:=]?\s*([-\d\.]+)/i);
    if (rxMatch && !isNaN(parseFloat(rxMatch[1]))) rxPower = parseFloat(rxMatch[1]);

    const txMatch = raw.match(/Tx\s*(?:optical)?\s*(?:level|power)\s*[:=]?\s*([-\d\.]+)/i);
    if (txMatch && !isNaN(parseFloat(txMatch[1]))) txPower = parseFloat(txMatch[1]);

    const voltMatch = raw.match(/(?:voltage|power\s*feed\s*voltage)\s*[:=]?\s*([-\d\.]+)/i);
    if (voltMatch && !isNaN(parseFloat(voltMatch[1]))) volt = parseFloat(voltMatch[1]);

    const biasMatch = raw.match(/(?:bias|laser\s*bias\s*current|txbias)\s*[:=]?\s*([-\d\.]+)/i);
    if (biasMatch && !isNaN(parseFloat(biasMatch[1]))) bias = parseFloat(biasMatch[1]);

    const tempMatch = raw.match(/temperature\s*[:=]?\s*([-\d\.]+)/i);
    if (tempMatch && !isNaN(parseFloat(tempMatch[1]))) temp = parseFloat(tempMatch[1]);

    return {
      rx_power_dbm: rxPower,
      tx_power_dbm: txPower,
      olt_rx_power_dbm: null,
      voltage_v: volt,
      bias_current_ma: bias,
      temperature_c: temp,
      raw_output: raw.trim()
    };
  }

  async rebootOnu(
    olt: OltRecord, 
    ponPort: string | number, 
    onuId: number
  ): Promise<{ success: boolean; message: string }> {
    const p = String(ponPort).replace(/^gpon[-_]olt_?/i, '').replace(/^0\//, '') || '1';
    const commands = [
      'configure terminal',
      `interface gpon 0/${p}`,
      `onu reboot ${onuId}`,
      'end'
    ];

    try {
      const output = await executeOltSshCommands(olt, commands, 10000, 'terminal length 0\n');
      if (output.includes('Success') || output.includes('success') || !output.includes('Error')) {
        return {
          success: true,
          message: `Perintah reboot berhasil dikirim ke ONU #${onuId} pada Port 0/${p} (HSAirPo/VSOL).`
        };
      } else {
        return {
          success: false,
          message: `Gagal reboot ONU: ${output.slice(0, 150)}`
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal reboot ONU via SSH: ${err.message}`
      };
    }
  }

  async scanUnconfigured(
    olt: OltRecord, 
    ponPort?: string | number
  ): Promise<UnconfiguredOnu[]> {
    const p = ponPort ? String(ponPort).replace(/^gpon[-_]olt_?/i, '').replace(/^0\//, '') : '1';
    const commands = [
      'configure terminal',
      `interface gpon 0/${p}`,
      'show onu unauth',
      'end'
    ];

    try {
      const raw = await executeOltSshCommands(olt, commands, 12000, 'terminal length 0\n');
      const uncfgList: UnconfiguredOnu[] = [];
      const lines = raw.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        const snMatch = trimmed.match(/(?:SN|MAC|Unauth\s*ONU\s*\d+)?\s*([A-Z0-9]{12,16})/i);
        if (snMatch && !trimmed.toLowerCase().includes('command') && !trimmed.toLowerCase().includes('interface')) {
          const sn = snMatch[1];
          if (!uncfgList.find(x => x.sn === sn)) {
            uncfgList.push({
              pon_port: p,
              sn: sn,
              vendor_id: sn.slice(0, 4),
              discovered_at: new Date().toISOString()
            });
          }
        }
      }

      return uncfgList;
    } catch (_) {
      return [];
    }
  }

  async registerOnu(
    olt: OltRecord, 
    params: RegisterOnuParams
  ): Promise<{ success: boolean; message: string; raw_output?: string }> {
    const p = String(params.pon_port).replace(/^gpon[-_]olt_?/i, '').replace(/^0\//, '') || '1';
    const onuId = params.onu_id || 1;
    const commands = [
      'configure terminal',
      `interface gpon 0/${p}`,
      `onu add ${onuId} ${params.sn}`,
      params.name ? `onu ${onuId} description "${params.name}"` : '',
      'end',
      'write'
    ].filter(Boolean);

    try {
      const output = await executeOltSshCommands(olt, commands, 15000, 'terminal length 0\n');
      if (output.includes('Error') || output.includes('fail') || output.includes('Invalid')) {
        return {
          success: false,
          message: `OLT mengembalikan pesan error: ${output.slice(0, 200)}`,
          raw_output: output
        };
      }

      return {
        success: true,
        message: `ONU SN "${params.sn}" berhasil diregistrasikan sebagai ONU #${onuId} pada Port 0/${p} (HSAirPo/VSOL)!`,
        raw_output: output
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal mengeksekusi registrasi ONU: ${err.message}`
      };
    }
  }

  async deleteOnu(
    olt: OltRecord, 
    ponPort: string | number, 
    onuId: number
  ): Promise<{ success: boolean; message: string }> {
    const p = String(ponPort).replace(/^gpon[-_]olt_?/i, '').replace(/^0\//, '') || '1';
    const commands = [
      'configure terminal',
      `interface gpon 0/${p}`,
      `no onu ${onuId}`,
      'end',
      'write'
    ];

    try {
      const output = await executeOltSshCommands(olt, commands, 12000, 'terminal length 0\n');
      return {
        success: true,
        message: `ONU #${onuId} pada Port 0/${p} berhasil dihapus dari OLT HSAirPo/VSOL.`
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal menghapus ONU dari OLT: ${err.message}`
      };
    }
  }

  async enableSnmp(
    olt: OltRecord, 
    community = 'public'
  ): Promise<{ success: boolean; message: string; raw_output?: string }> {
    const commands = [
      'configure terminal',
      'snmp-server enable',
      `snmp-server community ${community} ro`,
      `snmp-server community ${community} rw`,
      'end',
      'write'
    ];

    try {
      const raw = await executeOltSshCommands(olt, commands, 12000, 'terminal length 0\n');
      return {
        success: true,
        message: `Service SNMP Agent dengan community "${community}" berhasil diaktifkan pada OLT HSAirPo/VSOL!`,
        raw_output: raw
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal mengaktifkan SNMP via SSH: ${err.message}`
      };
    }
  }

  async fetchSnmpTelemetry(
    olt: OltRecord,
    ponPort: string | number
  ): Promise<SnmpOnuTelemetry[]> {
    const session = snmp.createSession(olt.ip_address, olt.snmp_community || 'public', {
      port: Number(olt.snmp_port) || 161,
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
      // 1. Walk Optical Table in VSOL/HSAirPo Enterprise MIB (1.3.6.1.4.1.37950.1.1.6.1.1.3.1)
      const optVarbinds = await walkTree('1.3.6.1.4.1.37950.1.1.6.1.1.3.1');
      for (const vb of optVarbinds) {
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

      // 2. Walk ifDescr & traffic byte counters (IF-MIB)
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
}
