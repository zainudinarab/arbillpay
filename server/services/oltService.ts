/**
 * OLT Service Facade
 * 
 * Modul ini mendelegasikan perintah ke Driver OLT masing-masing merek
 * (HSAirPo / VSOL, ZTE, Huawei, Generic) melalui Adapter / Strategy Pattern.
 */

import { getOltDriver, getAllOltDriverCapabilities } from './olt/driverFactory.js';
import type { 
  OltRecord, 
  OnuInfo, 
  OnuOpticalReading, 
  RegisterOnuParams, 
  UnconfiguredOnu,
  OltCapabilities,
  SnmpOnuTelemetry 
} from './olt/types.js';
import { executeOltSshCommands } from './olt/baseSshDriver.js';

// Re-export tipe untuk modul lain
export type { 
  OltRecord, 
  OnuInfo, 
  OnuOpticalReading, 
  RegisterOnuParams, 
  UnconfiguredOnu,
  OltCapabilities,
  SnmpOnuTelemetry 
};
export { 
  getOltDriver,
  getAllOltDriverCapabilities,
  executeOltSshCommands
};

/**
 * 1. Tes Koneksi Port & SSH ke OLT
 */
export async function testOltConnection(olt: OltRecord) {
  const driver = getOltDriver(olt.brand);
  return driver.testConnection(olt);
}

/**
 * 2. Cek Redaman Optik (Optical Power) ONU secara Realtime
 */
export async function fetchOnuOpticalPower(
  olt: OltRecord,
  ponPort: string | number,
  onuId: number
): Promise<OnuOpticalReading> {
  const driver = getOltDriver(olt.brand);
  return driver.fetchOpticalPower(olt, ponPort, onuId);
}

/**
 * 3. Ambil Daftar ONU pada Port PON Tertentu
 */
export async function fetchOltOnuList(
  olt: OltRecord,
  ponPort: string | number
): Promise<OnuInfo[]> {
  const driver = getOltDriver(olt.brand);
  return driver.fetchOnuList(olt, ponPort);
}

/**
 * 4. Kirim Perintah Reboot ke ONU
 */
export async function rebootOltOnu(
  olt: OltRecord,
  ponPort: string | number,
  onuId: number
) {
  const driver = getOltDriver(olt.brand);
  return driver.rebootOnu(olt, ponPort, onuId);
}

/**
 * 5. Pindai ONU yang Belum Terdaftar (Unconfigured / Unauth / Autofind)
 */
export async function scanUnconfiguredOnus(
  olt: OltRecord,
  ponPort?: string | number
): Promise<UnconfiguredOnu[]> {
  const driver = getOltDriver(olt.brand);
  return driver.scanUnconfigured(olt, ponPort);
}

/**
 * 6. Registrasi ONU Baru ke OLT via CLI
 */
export async function registerOltOnuCLI(
  olt: OltRecord,
  params: RegisterOnuParams
) {
  const driver = getOltDriver(olt.brand);
  return driver.registerOnu(olt, params);
}

/**
 * 7. Hapus / Deregister ONU dari OLT via CLI
 */
export async function deleteOltOnuCLI(
  olt: OltRecord,
  ponPort: string | number,
  onuId: number
) {
  const driver = getOltDriver(olt.brand);
  return driver.deleteOnu(olt, ponPort, onuId);
}

/**
 * 8. Aktifkan Service SNMP Agent pada OLT via SSH CLI
 */
export async function enableOltSnmpCLI(
  olt: OltRecord,
  community = 'public'
) {
  const driver = getOltDriver(olt.brand);
  return driver.enableSnmp(olt, community);
}

/**
 * 9. Tarik Telemetri Optik, Suhu, Voltase & Kuota Trafik Massal via SNMP sesuai Merek Driver
 */
export async function fetchOltSnmpTelemetry(
  olt: OltRecord,
  ponPort: string | number
): Promise<SnmpOnuTelemetry[]> {
  const driver = getOltDriver(olt.brand);
  if (driver.fetchSnmpTelemetry) {
    return driver.fetchSnmpTelemetry(olt, ponPort);
  }
  return [];
}

