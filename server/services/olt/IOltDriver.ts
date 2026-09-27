import { 
  OltRecord, 
  OltCapabilities, 
  OnuInfo, 
  OnuOpticalReading, 
  RegisterOnuParams, 
  UnconfiguredOnu 
} from './types.js';

export interface IOltDriver {
  /**
   * Mengembalikan profil kapabilitas & fitur yang didukung oleh OLT ini
   */
  getCapabilities(): OltCapabilities;

  /**
   * Tes konektivitas port (SSH/Telnet) dan autentikasi login ke OLT
   */
  testConnection(olt: OltRecord): Promise<{
    success: boolean;
    message: string;
    system_info?: string;
    ping_time_ms?: number;
  }>;

  /**
   * Mengambil daftar ONU yang aktif/terdaftar pada port PON tertentu
   */
  fetchOnuList(olt: OltRecord, ponPort: string | number): Promise<OnuInfo[]>;

  /**
   * Membaca daya redaman optik (Rx/Tx dBm) satu ONU secara realtime
   */
  fetchOpticalPower(
    olt: OltRecord, 
    ponPort: string | number, 
    onuId: number
  ): Promise<OnuOpticalReading>;

  /**
   * Mengirim perintah restart / reboot ke ONU
   */
  rebootOnu(
    olt: OltRecord, 
    ponPort: string | number, 
    onuId: number
  ): Promise<{ success: boolean; message: string }>;

  /**
   * Memindai ONU baru yang tersambung di jaringan optik tapi belum teregistrasi
   */
  scanUnconfigured(
    olt: OltRecord, 
    ponPort?: string | number
  ): Promise<UnconfiguredOnu[]>;

  /**
   * Mendaftarkan ONU baru ke OLT via CLI
   */
  registerOnu(
    olt: OltRecord, 
    params: RegisterOnuParams
  ): Promise<{ success: boolean; message: string; raw_output?: string }>;

  /**
   * Menghapus / Deregistrasi ONU dari port OLT
   */
  deleteOnu(
    olt: OltRecord, 
    ponPort: string | number, 
    onuId: number
  ): Promise<{ success: boolean; message: string }>;

  /**
   * Mengaktifkan service SNMP agent pada OLT via CLI
   */
  enableSnmp(
    olt: OltRecord, 
    community?: string
  ): Promise<{ success: boolean; message: string; raw_output?: string }>;

  /**
   * (Opsional) Mengubah mode WAN ONU (Bridge / PPPoE / DHCP) via OMCI jika didukung
   */
  configureWanMode?(
    olt: OltRecord,
    ponPort: string | number,
    onuId: number,
    params: {
      mode: 'bridge' | 'pppoe' | 'dhcp';
      vlan?: number;
      username?: string;
      password?: string;
    }
  ): Promise<{ success: boolean; message: string }>;
}
