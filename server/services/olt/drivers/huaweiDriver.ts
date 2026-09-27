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
 * Driver untuk keluarga OLT Huawei SmartAX (MA5608T, MA5680T, MA5800 Series)
 * Enterprise OID: 1.3.6.1.4.1.2011 (Huawei Technologies)
 */
export class HuaweiDriver implements IOltDriver {
  getCapabilities(): OltCapabilities {
    return {
      brandName: 'Huawei (SmartAX MA5608T / MA5680T / MA5800)',
      family: 'huawei',
      canReadOpticalPower: true,
      canReadTemperature: false,
      canReadVoltage: false,
      canConfigureWanMode: true,    // Sangat powerful via 'ont ipconfig' / 'ont wan-config'
      canConfigureWifiSsid: true,   // Mendukung ganti SSID/Password via OMCI
      canControlCatv: true,         // Mendukung 'ont port catv'
      canRemoteReboot: true,
      canScanUnconfigured: true,    // Autofind
      snmpTelemetrySupported: true,
      snmpEnterpriseOid: '1.3.6.1.4.1.2011'
    };
  }

  private parseSlotAndPort(ponPort: string | number): { slot: number; port: number } {
    const pStr = String(ponPort);
    if (pStr.includes('/')) {
      const parts = pStr.split('/');
      return {
        slot: parseInt(parts[1]) || 1,
        port: parseInt(parts[2]) || 1
      };
    }
    return { slot: 1, port: parseInt(pStr) || 1 };
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
      const output = await executeOltSshCommands(olt, ['display version'], 10000, 'screen-length 0 temporary\n');
      const duration = Date.now() - start;

      return {
        success: true,
        message: `Koneksi SSH ke OLT ${olt.name} (Huawei) Berhasil!`,
        system_info: output.slice(0, 300).trim(),
        ping_time_ms: duration
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Port SSH terbuka tetapi gagal login Huawei: ${err.message}`
      };
    }
  }

  async fetchOnuList(olt: OltRecord, ponPort: string | number): Promise<OnuInfo[]> {
    const { slot, port } = this.parseSlotAndPort(ponPort);
    const commands = [
      `display ont info 0/${slot} ${port} all`,
      `display ont optical-info 0/${slot} ${port} all`
    ];

    const raw = await executeOltSshCommands(olt, commands, 15000, 'screen-length 0 temporary\n');
    const cleanRaw = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ' ').replace(/\r/g, '');
    const onuList: OnuInfo[] = [];

    // Parse optical info Huawei
    const opticalMap: Record<number, { rx: number | null; tx: number | null }> = {};
    const optMatches = cleanRaw.matchAll(/(?:ont\s+optical-info\s+\d+\s+)(\d+)\s+([-\d\.]+)\s+([-\d\.]+)/gi);
    for (const om of optMatches) {
      const onuId = parseInt(om[1]);
      opticalMap[onuId] = {
        rx: parseFloat(om[2]) || null,
        tx: parseFloat(om[3]) || null
      };
    }

    // Parse baris ONT Huawei
    const lines = cleanRaw.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 4 && /^\d+$/.test(parts[0])) {
        const onuId = parseInt(parts[0]);
        let sn = '';
        let statusStr = '';

        for (let i = 1; i < parts.length; i++) {
          const pStr = parts[i];
          if (/^[A-Z0-9]{12,16}$/i.test(pStr) || pStr.includes('48575443') || pStr.includes('HWTC') || pStr.includes('ZTEG')) {
            sn = pStr;
          }
          if (['online', 'offline', 'initial', 'normal', 'fault'].includes(pStr.toLowerCase())) {
            statusStr = pStr.toLowerCase();
          }
        }

        if (sn || statusStr) {
          let statusNorm: 'online' | 'offline' | 'los' | 'dying-gasp' | 'unknown' = 'unknown';
          if (statusStr.includes('online') || statusStr.includes('normal')) statusNorm = 'online';
          else if (statusStr.includes('fault')) statusNorm = 'los';
          else if (statusStr.includes('offline') || statusStr.includes('initial')) statusNorm = 'offline';

          const opt = opticalMap[onuId];
          onuList.push({
            pon_port: `${slot}/${port}`,
            onu_id: onuId,
            sn: sn || `ONT_${onuId}`,
            status: statusNorm,
            rx_power_dbm: opt ? opt.rx : null,
            tx_power_dbm: opt ? opt.tx : null
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
    const { slot, port } = this.parseSlotAndPort(ponPort);
    const commands = [
      `display ont optical-info 0/${slot} ${port} ${onuId}`
    ];

    let raw = '';
    try {
      raw = await executeOltSshCommands(olt, commands, 12000, 'screen-length 0 temporary\n');
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

    const rxMatch = raw.match(/Rx\s*(?:optical)?\s*power\s*[:=]?\s*([-\d\.]+)/i);
    if (rxMatch && !isNaN(parseFloat(rxMatch[1]))) rxPower = parseFloat(rxMatch[1]);

    const txMatch = raw.match(/Tx\s*(?:optical)?\s*power\s*[:=]?\s*([-\d\.]+)/i);
    if (txMatch && !isNaN(parseFloat(txMatch[1]))) txPower = parseFloat(txMatch[1]);

    const oltRxMatch = raw.match(/OLT\s*Rx\s*(?:optical)?\s*power\s*[:=]?\s*([-\d\.]+)/i);
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
    const { slot, port } = this.parseSlotAndPort(ponPort);
    const commands = [
      'config',
      `interface gpon 0/${slot}`,
      `ont reset ${port} ${onuId}`,
      'quit'
    ];

    try {
      await executeOltSshCommands(olt, commands, 10000, 'screen-length 0 temporary\n');
      return {
        success: true,
        message: `Perintah ont reset berhasil dikirim ke ONT #${onuId} pada Port 0/${slot}/${port} (Huawei).`
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal reboot ONT Huawei via SSH: ${err.message}`
      };
    }
  }

  async scanUnconfigured(
    olt: OltRecord, 
    ponPort?: string | number
  ): Promise<UnconfiguredOnu[]> {
    const commands = ['display ont autofind all'];
    try {
      const raw = await executeOltSshCommands(olt, commands, 12000, 'screen-length 0 temporary\n');
      const uncfgList: UnconfiguredOnu[] = [];
      const lines = raw.split('\n');

      for (const line of lines) {
        const match = line.match(/(?:F\/S\/P|Port)\s*:\s*0\/(\d+)\/(\d+).*?SN\s*:\s*([A-Z0-9]{12,16})/i);
        if (match) {
          const p = `${match[1]}/${match[2]}`;
          const sn = match[3];
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
    const { slot, port } = this.parseSlotAndPort(params.pon_port);
    const onuId = params.onu_id || 1;
    const lineProf = params.line_profile || 'default';
    const srvProf = params.srv_profile || 'default';

    const commands = [
      'config',
      `interface gpon 0/${slot}`,
      `ont add ${port} ${onuId} sn-auth "${params.sn}" omci ont-lineprofile-name "${lineProf}" ont-srvprofile-name "${srvProf}" desc "${params.name || 'ONT_' + onuId}"`,
      'quit',
      'save'
    ];

    try {
      const output = await executeOltSshCommands(olt, commands, 15000, 'screen-length 0 temporary\n');
      return {
        success: true,
        message: `ONT SN "${params.sn}" berhasil diregistrasikan ke OLT Huawei pada Port 0/${slot}/${port} ID #${onuId}!`,
        raw_output: output
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal mengeksekusi registrasi ONT Huawei: ${err.message}`
      };
    }
  }

  async deleteOnu(
    olt: OltRecord, 
    ponPort: string | number, 
    onuId: number
  ): Promise<{ success: boolean; message: string }> {
    const { slot, port } = this.parseSlotAndPort(ponPort);
    const commands = [
      'config',
      `interface gpon 0/${slot}`,
      `ont delete ${port} ${onuId}`,
      'quit',
      'save'
    ];

    try {
      await executeOltSshCommands(olt, commands, 12000, 'screen-length 0 temporary\n');
      return {
        success: true,
        message: `ONT #${onuId} pada Port 0/${slot}/${port} berhasil dihapus dari OLT Huawei.`
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal menghapus ONT Huawei: ${err.message}`
      };
    }
  }

  async enableSnmp(
    olt: OltRecord, 
    community = 'public'
  ): Promise<{ success: boolean; message: string; raw_output?: string }> {
    const commands = [
      'config',
      `snmp-agent community write ${community}`,
      `snmp-agent sys-info version all`,
      'quit',
      'save'
    ];

    try {
      const raw = await executeOltSshCommands(olt, commands, 12000, 'screen-length 0 temporary\n');
      return {
        success: true,
        message: `SNMP Community "${community}" berhasil dikonfigurasi pada OLT Huawei!`,
        raw_output: raw
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal mengonfigurasi SNMP Huawei: ${err.message}`
      };
    }
  }
}
