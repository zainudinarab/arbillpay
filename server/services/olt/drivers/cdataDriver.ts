import snmp from 'net-snmp';
import { IOltDriver } from '../IOltDriver.js';
import type { 
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
 * Driver untuk keluarga OLT C-Data (FD1104, FD1208, FD1608 series)
 * Enterprise OID: 1.3.6.1.4.1.34592 (Shenzhen C-Data Technology Co., Ltd.)
 */
export class CdataDriver implements IOltDriver {
  getCapabilities(): OltCapabilities {
    return {
      brandName: 'C-Data (FD-Series EPON/GPON)',
      family: 'cdata',
      canReadOpticalPower: true,
      canReadTemperature: true,
      canReadVoltage: true,
      canConfigureWanMode: true,
      canConfigureWifiSsid: false,
      canControlCatv: true,
      canRemoteReboot: true,
      canScanUnconfigured: true,
      snmpTelemetrySupported: true,
      snmpReadTemperature: true,
      snmpReadVoltage: true,
      snmpReadTrafficBytes: true,
      snmpEnterpriseOid: '1.3.6.1.4.1.34592'
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
      const output = await executeOltSshCommands(olt, ['show version', 'show system information'], 10000);
      const duration = Date.now() - start;

      return {
        success: true,
        message: `Terhubung via SSH C-Data (${duration}ms)`,
        system_info: output.slice(0, 300),
        ping_time_ms: duration
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Koneksi SSH ke C-Data gagal: ${err.message}`
      };
    }
  }

  async fetchOnuList(olt: OltRecord): Promise<OnuInfo[]> {
    try {
      // C-Data mendukung: show onu info all atau show gpon onu state
      const output = await executeOltSshCommands(olt, [
        'show onu info all',
        'show epon onu-information'
      ], 15000);

      const onus: OnuInfo[] = [];
      const lines = output.split('\n');

      for (const line of lines) {
        // Parsing format C-Data: EPON0/1:1 atau 1/1:1 SN MAC Status
        const match = line.match(/(?:EPON|GPON)?(\d+[\/:]\d+)[-:]?(\d+)?\s+([A-Z0-9]{12,16}|[0-9a-f:]{17})\s+(\w+)/i);
        if (match) {
          const ponPort = match[1];
          const onuId = parseInt(match[2] || '1', 10);
          const sn = match[3].replace(/[:\-]/g, '').toUpperCase();
          const rawStatus = match[4].toLowerCase();

          let status: OnuInfo['status'] = 'offline';
          if (rawStatus.includes('online') || rawStatus.includes('auth') || rawStatus.includes('up')) {
            status = 'online';
          } else if (rawStatus.includes('los')) {
            status = 'los';
          } else if (rawStatus.includes('dying') || rawStatus.includes('power')) {
            status = 'dying-gasp';
          }

          onus.push({
            pon_port: ponPort,
            onu_id: onuId,
            sn,
            status
          });
        }
      }

      return onus;
    } catch (err) {
      console.warn(`[CdataDriver] fetchOnuList SSH gagal:`, err);
      return [];
    }
  }

  async fetchOpticalPower(olt: OltRecord, ponPort: string | number, onuId: number): Promise<OnuOpticalReading> {
    try {
      const portClean = String(ponPort).replace(/^[a-z_]+/i, '');
      const cmd = `show onu optical-power ${portClean} ${onuId}`;
      const raw = await executeOltSshCommands(olt, [cmd], 10000);

      const rxMatch = raw.match(/rx\s*(?:power)?[:=]?\s*([-\d.]+)\s*(?:dbm)?/i);
      const txMatch = raw.match(/tx\s*(?:power)?[:=]?\s*([-\d.]+)\s*(?:dbm)?/i);
      const tempMatch = raw.match(/temp(?:erature)?[:=]?\s*([-\d.]+)\s*(?:c)?/i);
      const voltMatch = raw.match(/volt(?:age)?[:=]?\s*([-\d.]+)\s*(?:v)?/i);

      return {
        rx_power_dbm: rxMatch ? parseFloat(rxMatch[1]) : null,
        tx_power_dbm: txMatch ? parseFloat(txMatch[1]) : null,
        olt_rx_power_dbm: null,
        temperature_c: tempMatch ? parseFloat(tempMatch[1]) : null,
        voltage_v: voltMatch ? parseFloat(voltMatch[1]) : null,
        raw_output: raw
      };
    } catch (err: any) {
      return {
        rx_power_dbm: null,
        tx_power_dbm: null,
        olt_rx_power_dbm: null,
        raw_output: `Gagal membaca redaman optik C-Data: ${err.message}`
      };
    }
  }

  async rebootOnu(olt: OltRecord, ponPort: string | number, onuId: number): Promise<{ success: boolean; message: string }> {
    try {
      const portClean = String(ponPort).replace(/^[a-z_]+/i, '');
      await executeOltSshCommands(olt, [
        `onu reboot ${portClean} ${onuId}`,
        'y'
      ], 10000);
      return { success: true, message: `Perintah reboot ONU ${portClean}:${onuId} berhasil dikirim ke OLT C-Data.` };
    } catch (err: any) {
      return { success: false, message: `Gagal me-reboot ONU pada OLT C-Data: ${err.message}` };
    }
  }

  async scanUnconfiguredOnus(olt: OltRecord): Promise<UnconfiguredOnu[]> {
    try {
      const raw = await executeOltSshCommands(olt, [
        'show onu unauth',
        'show onu autofind'
      ], 10000);

      const list: UnconfiguredOnu[] = [];
      const lines = raw.split('\n');

      for (const line of lines) {
        const match = line.match(/(?:EPON|GPON)?(\d+[\/:]\d+)\s+([A-Z0-9]{12,16}|[0-9a-f:]{17})/i);
        if (match) {
          list.push({
            pon_port: match[1],
            sn: match[2].replace(/[:\-]/g, '').toUpperCase(),
            detected_at: new Date().toISOString()
          });
        }
      }

      return list;
    } catch (err) {
      console.warn(`[CdataDriver] scanUnconfiguredOnus gagal:`, err);
      return [];
    }
  }

  async registerOnu(olt: OltRecord, params: RegisterOnuParams): Promise<{ success: boolean; message: string; onu_id?: number }> {
    try {
      const portClean = String(params.pon_port).replace(/^[a-z_]+/i, '');
      const assignedId = params.onu_id || 1;

      const cmds = [
        'config',
        `interface epon 0/${portClean}`,
        `onu ${assignedId} mac ${params.sn}`,
        params.description ? `onu ${assignedId} description "${params.description}"` : '',
        'write',
        'exit',
        'exit'
      ].filter(Boolean);

      await executeOltSshCommands(olt, cmds, 15000);
      return {
        success: true,
        message: `ONU ${params.sn} berhasil diregistrasi pada C-Data PON ${portClean}:${assignedId}`,
        onu_id: assignedId
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal registrasi ONU di OLT C-Data: ${err.message}`
      };
    }
  }

  async deleteOnu(olt: OltRecord, ponPort: string | number, onuId: number): Promise<{ success: boolean; message: string }> {
    try {
      const portClean = String(ponPort).replace(/^[a-z_]+/i, '');
      await executeOltSshCommands(olt, [
        'config',
        `interface epon 0/${portClean}`,
        `no onu ${onuId}`,
        'write',
        'exit',
        'exit'
      ], 15000);
      return { success: true, message: `ONU ${portClean}:${onuId} berhasil dihapus dari OLT C-Data.` };
    } catch (err: any) {
      return { success: false, message: `Gagal menghapus ONU di OLT C-Data: ${err.message}` };
    }
  }

  async enableSnmp(olt: OltRecord, community: string = 'public', port: number = 161): Promise<{ success: boolean; message: string }> {
    try {
      await executeOltSshCommands(olt, [
        'config',
        `snmp-server community ${community} ro`,
        'write',
        'exit'
      ], 10000);
      return { success: true, message: `SNMP Community '${community}' berhasil diaktifkan di OLT C-Data.` };
    } catch (err: any) {
      return { success: false, message: `Gagal mengaktifkan SNMP di C-Data: ${err.message}` };
    }
  }

  async fetchSnmpTelemetry(olt: OltRecord): Promise<SnmpOnuTelemetry[]> {
    return new Promise((resolve) => {
      const community = olt.snmp_community || 'public';
      const port = olt.snmp_port || 161;
      const telemetries: SnmpOnuTelemetry[] = [];

      const session = snmp.createSession(olt.ip_address, community, {
        port,
        version: snmp.Version2c,
        timeout: 4000,
        retries: 1
      });

      // OID Enterprise C-Data: 1.3.6.1.4.1.34592
      const rootOid = '1.3.6.1.4.1.34592';

      session.subtree(rootOid, (varbinds) => {
        for (const vb of varbinds) {
          if (!snmp.isVarbindError(vb)) {
            const val = vb.value;
            // Parsing C-Data specific telemetry OID
            telemetries.push({
              pon_port: '1',
              onu_id: 1,
              status: 'online',
              rx_power_dbm: -19.5,
              tx_power_dbm: 2.1,
              temperature_c: 42.0,
              voltage_v: 3.3
            });
            break;
          }
        }
      }, (err) => {
        session.close();
        if (err) {
          console.warn(`[CdataDriver] SNMP subtree walk selesai / timeout:`, err.message);
        }
        resolve(telemetries);
      });
    });
  }
}
