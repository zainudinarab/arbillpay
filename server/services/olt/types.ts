export interface OltCapabilities {
  brandName: string;
  family: string;
  canReadOpticalPower: boolean;        // Pembacaan daya optik (Rx / Tx dBm)
  canReadTemperature: boolean;         // Pembacaan sensor suhu chipset ONU (°C)
  canReadVoltage: boolean;             // Pembacaan tegangan voltase internal (V)
  canConfigureWanMode: boolean;        // Mengubah mode WAN ONU (Bridge / PPPoE / DHCP) via OMCI
  canConfigureWifiSsid: boolean;       // Mengubah nama SSID / Password WiFi dari OLT
  canControlCatv: boolean;             // Kontrol port TV kabel / RF (CATV On/Off)
  canRemoteReboot: boolean;            // Restart ONU dari jarak jauh via CLI/OMCI
  // SNMP Telemetry Monitoring
  snmpTelemetrySupported: boolean;     // Dukungan telemetri massal super cepat via SNMP
  snmpReadTemperature?: boolean;       // Sensor suhu via SNMP
  snmpReadVoltage?: boolean;           // Tegangan voltase via SNMP
  snmpReadTrafficBytes?: boolean;      // Akumulasi kuota trafik via SNMP IF-MIB
  snmpEnterpriseOid?: string;          // OID Enterprise vendor (cth: 37950 untuk VSOL/HSAirPo)
}

export interface OltRecord {
  id: string;
  name: string;
  brand: 'zte' | 'huawei' | 'vsol' | 'hsairpo' | 'hsgq' | 'bdcom' | 'fiberhome' | 'generic' | string;
  model?: string;
  ip_address: string;
  ssh_port?: number;
  telnet_port?: number;
  protocol?: 'ssh' | 'telnet';
  username: string;
  password?: string;
  enable_password?: string;
  snmp_port?: number;
  snmp_community?: string;
  total_pon_ports?: number;
  linked_node_id?: string | null;
  status?: string;
}

export interface OnuOpticalReading {
  rx_power_dbm: number | null;     // Optical power received by ONU from OLT
  tx_power_dbm: number | null;     // Optical power transmitted by ONU laser
  olt_rx_power_dbm: number | null; // Optical power received by OLT laser from ONU
  voltage_v?: number | null;
  bias_current_ma?: number | null;
  temperature_c?: number | null;
  raw_output?: string;
}

export interface OnuInfo {
  pon_port: string | number;
  onu_id: number;
  sn: string;
  status: 'online' | 'offline' | 'los' | 'dying-gasp' | 'unknown';
  distance_m?: number | null;
  rx_power_dbm?: number | null;
  tx_power_dbm?: number | null;
  voltage_v?: number | null;
  bias_current_ma?: number | null;
  temperature_c?: number | null;
  last_down_cause?: string | null;
  profile_name?: string | null;
  customer_name?: string | null;
  customer_id?: string | null;
}

export interface RegisterOnuParams {
  pon_port: string | number;
  onu_id?: number;
  sn: string;
  name?: string;
  line_profile?: string;
  srv_profile?: string;
  wan_mode?: 'bridge' | 'pppoe' | 'dhcp';
  pppoe_username?: string;
  pppoe_password?: string;
  vlan_id?: number;
}

export interface UnconfiguredOnu {
  pon_port: string | number;
  sn: string;
  vendor_id?: string;
  discovered_at?: string;
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

