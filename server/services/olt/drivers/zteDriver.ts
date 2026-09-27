import { IOltDriver } from '../IOltDriver.js';
import { 
  OltRecord, 
  OltCapabilities, 
  OnuInfo, 
  OnuOpticalReading, 
  RegisterOnuParams, 
  UnconfiguredOnu 
} from '../types.js';
import { checkTcpPortOpen, executeOltSshCommands } from '../baseSshDriver.js';

/**
 * Driver untuk keluarga OLT ZTE (C300, C320, C220 Series)
 * Enterprise OID: 1.3.6.1.4.1.3902 (ZTE Corporation)
 */
export class ZteDriver implements IOltDriver {
  getCapabilities(): OltCapabilities {
    return {
      brandName: 'ZTE (C300 / C320 / C220)',
      family: 'zte',
      canReadOpticalPower: true,
      canReadTemperature: true,
      canReadVoltage: true,
      canConfigureWanMode: true,   // Mendukung pergantian WAN IP / Bridge via OMCI profile
      canConfigureWifiSsid: true,  // Mendukung pengaturan WiFi SSID/Password via OMCI
      canControlCatv: true,        // Mendukung port TV kabel (CATV On/Off)
      canRemoteReboot: true,
      canScanUnconfigured: true,
      snmpTelemetrySupported: true,
      snmpEnterpriseOid: '1.3.6.1.4.1.3902'
    };
  }

  private normalizePort(ponPort: string | number): string {
    const pStr = String(ponPort);
    if (pStr.includes('/')) return pStr;
    return `1/1/${pStr}`;
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
        message: `Koneksi SSH ke OLT ${olt.name} (ZTE) Berhasil!`,
        system_info: output.slice(0, 300).trim(),
        ping_time_ms: duration
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Port SSH terbuka tetapi gagal login ZTE: ${err.message}`
      };
    }
  }

  async fetchOnuList(olt: OltRecord, ponPort: string | number): Promise<OnuInfo[]> {
    const iface = this.normalizePort(ponPort);
    const commands = [
      `show gpon onu state gpon-olt_${iface}`,
      `show gpon onu baseinfo gpon-olt_${iface}`,
      `show gpon onu pon-optical-info gpon-olt_${iface}`
    ];

    const raw = await executeOltSshCommands(olt, commands, 15000, 'terminal length 0\n');
    const cleanRaw = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ' ').replace(/\r/g, '');
    const onuList: OnuInfo[] = [];

    // Parse optical info ZTE (e.g. gpon-onu_1/1/1:1 ... -20.5 ... 2.1)
    const opticalMap: Record<number, { rx: number | null; tx: number | null }> = {};
    const optMatches = cleanRaw.matchAll(/gpon-onu_\d+\/\d+\/\d+:(\d+)\s+([-\d\.]+)\s+([-\d\.]+)/gi);
    for (const om of optMatches) {
      const onuId = parseInt(om[1]);
      opticalMap[onuId] = {
        rx: parseFloat(om[2]) || null,
        tx: parseFloat(om[3]) || null
      };
    }

    // Parse tabel ONU state ZTE (e.g. gpon-onu_1/1/1:1   ZTEGc4a3583c   enable   ready   working)
    const lines = cleanRaw.split('\n');
    for (const line of lines) {
      const match = line.match(/gpon-onu_\d+\/\d+\/\d+:(\d+)\s+([A-Z0-9]{12,16})?\s*([a-zA-Z0-9\-_]+)?/i);
      if (match) {
        const onuId = parseInt(match[1]);
        const sn = match[2] || `ONU_${onuId}`;
        const rawState = (match[3] || '').toLowerCase();

        let statusNorm: 'online' | 'offline' | 'los' | 'dying-gasp' | 'unknown' = 'unknown';
        if (rawState.includes('working') || rawState.includes('online') || rawState.includes('ready')) statusNorm = 'online';
        else if (rawState.includes('los')) statusNorm = 'los';
        else if (rawState.includes('dying') || rawState.includes('power')) statusNorm = 'dying-gasp';
        else if (rawState.includes('offline') || rawState.includes('logging')) statusNorm = 'offline';

        const opt = opticalMap[onuId];
        onuList.push({
          pon_port: iface,
          onu_id: onuId,
          sn: sn,
          status: statusNorm,
          rx_power_dbm: opt ? opt.rx : null,
          tx_power_dbm: opt ? opt.tx : null
        });
      }
    }

    return onuList;
  }

  async fetchOpticalPower(
    olt: OltRecord, 
    ponPort: string | number, 
    onuId: number
  ): Promise<OnuOpticalReading> {
    const iface = this.normalizePort(ponPort);
    const commands = [
      `show pon power attenuation gpon-onu_${iface}:${onuId}`,
      `show gpon optical-power-onu gpon-onu_${iface}:${onuId}`
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
    let oltRxPower: number | null = null;

    const rxMatch = raw.match(/(?:rx\s*(?:optical)?\s*power|rx\s*power|rx\s*optical\s*level)\s*[:=]?\s*([-\d\.]+)/i);
    if (rxMatch && !isNaN(parseFloat(rxMatch[1]))) rxPower = parseFloat(rxMatch[1]);

    const txMatch = raw.match(/(?:tx\s*(?:optical)?\s*power|tx\s*power|tx\s*optical\s*level)\s*[:=]?\s*([-\d\.]+)/i);
    if (txMatch && !isNaN(parseFloat(txMatch[1]))) txPower = parseFloat(txMatch[1]);

    const oltRxMatch = raw.match(/(?:olt\s*rx\s*(?:optical)?\s*power|olt\s*rx)\s*[:=]?\s*([-\d\.]+)/i);
    if (oltRxMatch && !isNaN(parseFloat(oltRxMatch[1]))) oltRxPower = parseFloat(oltRxMatch[1]);

    return {
      rx_power_dbm: rxPower,
      tx_power_dbm: txPower,
      olt_rx_power_dbm: oltRxPower,
      raw_output: raw.trim()
    };
  }

  async rebootOnu(
    olt: OltRecord, 
    ponPort: string | number, 
    onuId: number
  ): Promise<{ success: boolean; message: string }> {
    const iface = this.normalizePort(ponPort);
    const commands = [
      `reset gpon-onu gpon-onu_${iface}:${onuId}`
    ];

    try {
      const output = await executeOltSshCommands(olt, commands, 10000, 'terminal length 0\n');
      return {
        success: true,
        message: `Perintah reset/reboot berhasil dikirim ke ONU #${onuId} pada Port ${iface} (ZTE).`
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal reboot ONU ZTE via SSH: ${err.message}`
      };
    }
  }

  async scanUnconfigured(
    olt: OltRecord, 
    ponPort?: string | number
  ): Promise<UnconfiguredOnu[]> {
    const commands = ['show gpon onu uncfg'];
    try {
      const raw = await executeOltSshCommands(olt, commands, 12000, 'terminal length 0\n');
      const uncfgList: UnconfiguredOnu[] = [];
      const lines = raw.split('\n');

      for (const line of lines) {
        const match = line.match(/(?:gpon-olt_(\d+\/\d+\/\d+))?\s+([A-Z0-9]{12,16})/i);
        if (match && !line.toLowerCase().includes('command') && !line.toLowerCase().includes('interface')) {
          const port = match[1] || '1/1/1';
          const sn = match[2];
          if (!uncfgList.find(x => x.sn === sn)) {
            uncfgList.push({
              pon_port: port,
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
    const iface = this.normalizePort(params.pon_port);
    const onuId = params.onu_id || 1;
    const lineProf = params.line_profile || 'default';
    const srvProf = params.srv_profile || 'default';

    const commands = [
      'configure terminal',
      `interface gpon-olt_${iface}`,
      `onu ${onuId} type ${lineProf} sn ${params.sn}`,
      params.name ? `onu ${onuId} description "${params.name}"` : '',
      'exit',
      `interface gpon-onu_${iface}:${onuId}`,
      `tcont 1 profile ${srvProf}`,
      'exit',
      'write'
    ].filter(Boolean);

    try {
      const output = await executeOltSshCommands(olt, commands, 15000, 'terminal length 0\n');
      return {
        success: true,
        message: `ONU SN "${params.sn}" berhasil diregistrasikan ke OLT ZTE pada Port ${iface}:${onuId}!`,
        raw_output: output
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal mengeksekusi registrasi ONU ZTE: ${err.message}`
      };
    }
  }

  async deleteOnu(
    olt: OltRecord, 
    ponPort: string | number, 
    onuId: number
  ): Promise<{ success: boolean; message: string }> {
    const iface = this.normalizePort(ponPort);
    const commands = [
      'configure terminal',
      `interface gpon-olt_${iface}`,
      `no onu ${onuId}`,
      'exit',
      'write'
    ];

    try {
      await executeOltSshCommands(olt, commands, 12000, 'terminal length 0\n');
      return {
        success: true,
        message: `ONU #${onuId} pada Port ${iface} berhasil dihapus dari OLT ZTE.`
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal menghapus ONU ZTE: ${err.message}`
      };
    }
  }

  async enableSnmp(
    olt: OltRecord, 
    community = 'public'
  ): Promise<{ success: boolean; message: string; raw_output?: string }> {
    const commands = [
      'configure terminal',
      `snmp-server community ${community} view AllView rw`,
      'write'
    ];

    try {
      const raw = await executeOltSshCommands(olt, commands, 12000, 'terminal length 0\n');
      return {
        success: true,
        message: `SNMP Community "${community}" berhasil dikonfigurasi pada OLT ZTE!`,
        raw_output: raw
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal mengonfigurasi SNMP ZTE: ${err.message}`
      };
    }
  }
}
