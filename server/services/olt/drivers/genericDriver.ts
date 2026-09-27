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
 * Driver Fallback Generik untuk OLT merek lain yang belum memiliki driver khusus
 */
export class GenericDriver implements IOltDriver {
  getCapabilities(): OltCapabilities {
    return {
      brandName: 'Generic OLT',
      family: 'generic',
      canReadOpticalPower: true,
      canReadTemperature: false,
      canReadVoltage: false,
      canConfigureWanMode: false,
      canConfigureWifiSsid: false,
      canControlCatv: false,
      canRemoteReboot: true,
      canScanUnconfigured: false,
      snmpTelemetrySupported: false,
      snmpReadTemperature: false,
      snmpReadVoltage: false,
      snmpReadTrafficBytes: false
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
        message: `Port ${port} pada IP ${olt.ip_address} tidak dapat dijangkau.`
      };
    }

    try {
      const output = await executeOltSshCommands(olt, ['show version'], 10000, 'terminal length 0\n');
      return {
        success: true,
        message: `Koneksi SSH ke OLT ${olt.name} Berhasil!`,
        system_info: output.slice(0, 300).trim(),
        ping_time_ms: Date.now() - start
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal login SSH: ${err.message}`
      };
    }
  }

  async fetchOnuList(olt: OltRecord, ponPort: string | number): Promise<OnuInfo[]> {
    const commands = [`show onu status ${ponPort}`];
    const raw = await executeOltSshCommands(olt, commands, 12000, 'terminal length 0\n');
    const onuList: OnuInfo[] = [];

    const lines = raw.split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
        const onuId = parseInt(parts[0]);
        const sn = parts.find(p => /^[A-Z0-9]{12,16}$/i.test(p)) || `ONU_${onuId}`;
        onuList.push({
          pon_port: ponPort,
          onu_id: onuId,
          sn: sn,
          status: line.toLowerCase().includes('online') ? 'online' : 'offline'
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
    const commands = [`show pon power attenuation ${ponPort}:${onuId}`];
    const raw = await executeOltSshCommands(olt, commands, 12000, 'terminal length 0\n');

    let rxPower: number | null = null;
    let txPower: number | null = null;

    const rxMatch = raw.match(/Rx\s*(?:optical)?\s*power\s*[:=]?\s*([-\d\.]+)/i);
    if (rxMatch && !isNaN(parseFloat(rxMatch[1]))) rxPower = parseFloat(rxMatch[1]);

    const txMatch = raw.match(/Tx\s*(?:optical)?\s*power\s*[:=]?\s*([-\d\.]+)/i);
    if (txMatch && !isNaN(parseFloat(txMatch[1]))) txPower = parseFloat(txMatch[1]);

    return {
      rx_power_dbm: rxPower,
      tx_power_dbm: txPower,
      olt_rx_power_dbm: null,
      raw_output: raw.trim()
    };
  }

  async rebootOnu(
    olt: OltRecord, 
    ponPort: string | number, 
    onuId: number
  ): Promise<{ success: boolean; message: string }> {
    const commands = [`reboot onu ${ponPort} ${onuId}`];
    try {
      await executeOltSshCommands(olt, commands, 10000, 'terminal length 0\n');
      return {
        success: true,
        message: `Perintah reboot berhasil dikirim ke ONU #${onuId}.`
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal reboot ONU: ${err.message}`
      };
    }
  }

  async scanUnconfigured(
    _olt: OltRecord, 
    _ponPort?: string | number
  ): Promise<UnconfiguredOnu[]> {
    return [];
  }

  async registerOnu(
    _olt: OltRecord, 
    params: RegisterOnuParams
  ): Promise<{ success: boolean; message: string; raw_output?: string }> {
    return {
      success: false,
      message: `Driver generik tidak mendukung registrasi otomatis untuk model ini.`
    };
  }

  async deleteOnu(
    _olt: OltRecord, 
    _ponPort: string | number, 
    _onuId: number
  ): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message: `Driver generik tidak mendukung penghapusan otomatis.`
    };
  }

  async enableSnmp(
    _olt: OltRecord, 
    _community = 'public'
  ): Promise<{ success: boolean; message: string; raw_output?: string }> {
    return {
      success: false,
      message: `Silakan aktifkan SNMP secara manual melalui CLI atau Web GUI perangkat OLT Anda.`
    };
  }
}
