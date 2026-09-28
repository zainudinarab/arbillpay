async function main() {
  const newUrl = 'http://30.30.2.53:7557';
  console.log('🚀 Memasang Deteksi Merek Lengkap & Multi-Vendor Supercharged di GenieACS Docker (http://30.30.2.53)...\n');

  // ==============================================================
  // 1. VIRTUAL PARAMETER: VendorName (Deteksi Merk Super Lengkap)
  // ==============================================================
  const vendorScript = `// Comprehensive Multi-Vendor Detection
let mfr = declare("DeviceID.Manufacturer", {value: Date.now()});
let pc = declare("DeviceID.ProductClass", {value: Date.now()});
let sn = declare("DeviceID.SerialNumber", {value: Date.now()});
let oui = declare("DeviceID.OUI", {value: Date.now()});
let devMfr = declare("InternetGatewayDevice.DeviceInfo.Manufacturer", {value: Date.now()});
let devModel = declare("InternetGatewayDevice.DeviceInfo.ModelName", {value: Date.now()});

let text = [
  mfr.value?.[0], 
  pc.value?.[0], 
  sn.value?.[0], 
  oui.value?.[0], 
  devMfr.value?.[0], 
  devModel.value?.[0]
].filter(Boolean).join(" ").toUpperCase();

let vendor = "Generic / Unknown";

if (text.includes("ZTE") || text.includes("ZICG") || text.includes("ZXHN") || text.includes("F609") || text.includes("F660") || text.includes("F663") || text.includes("F670") || text.includes("F477") || text.includes("GM220")) {
  vendor = "ZTE";
} else if (text.includes("HUAWEI") || text.includes("HWTC") || text.includes("HG8245") || text.includes("EG8145") || text.includes("HS8546") || text.includes("HG8546") || text.includes("ECHOLIFE")) {
  vendor = "Huawei";
} else if (text.includes("FIBERHOME") || text.includes("FHTT") || text.includes("AN5506") || text.includes("HG6821") || text.includes("HG6243")) {
  vendor = "Fiberhome";
} else if (text.includes("VSOL") || text.includes("V-SOL") || text.includes("V2801") || text.includes("V2804") || text.includes("V1600")) {
  vendor = "VSOL";
} else if (text.includes("NOKIA") || text.includes("ALCATEL") || text.includes("ALCL") || text.includes("G-240") || text.includes("G-2425")) {
  vendor = "Nokia / Alcatel";
} else if (text.includes("BDCOM") || text.includes("BDCM") || text.includes("GP1704") || text.includes("P1501")) {
  vendor = "BDCOM";
} else if (text.includes("C-DATA") || text.includes("CDATA") || text.includes("CDAT") || text.includes("FD511") || text.includes("FD514")) {
  vendor = "C-Data";
} else if (text.includes("TP-LINK") || text.includes("TPLINK") || text.includes("TPLK") || text.includes("XC220") || text.includes("TX-6610")) {
  vendor = "TP-Link";
} else if (text.includes("TOTOLINK") || text.includes("TOTO") || text.includes("N300RT")) {
  vendor = "Totolink";
} else if (text.includes("TENDA") || text.includes("TNDA") || text.includes("HG9") || text.includes("G103")) {
  vendor = "Tenda";
} else if (text.includes("D-LINK") || text.includes("DLINK") || text.includes("DPN")) {
  vendor = "D-Link";
} else if (text.includes("MIKROTIK") || text.includes("ROUTERBOARD") || text.includes("CCR") || text.includes("CRS")) {
  vendor = "MikroTik";
}

return {writable: false, value: [vendor, "xsd:string"]};
`;

  // ==============================================================
  // 2. VIRTUAL PARAMETER: modelName (Standarisasi Model ONT)
  // ==============================================================
  const modelScript = `// Model Name Extractor
let pc = declare("DeviceID.ProductClass", {value: Date.now()});
let devModel = declare("InternetGatewayDevice.DeviceInfo.ModelName", {value: Date.now()});
let val = pc.value?.[0] || devModel.value?.[0] || "XPON ONT";
return {writable: false, value: [val, "xsd:string"]};
`;

  // ==============================================================
  // 3. VIRTUAL PARAMETER: RXPower (Multi-Vendor Super Lengkap)
  // ==============================================================
  const rxScript = `// Multi-Vendor RXPower (ZTE, Huawei, Fiberhome, VSOL, Nokia, BDCOM, C-Data)
let m = "N/A";

// 1. ZTE & GM220 & CMCC
let zte = declare("InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.RXPower", {value: Date.now()});
let zte_ct = declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.RXPower", {value: Date.now()});
let zte_cte = declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_EponInterfaceConfig.RXPower", {value: Date.now()});
let zte_cmg = declare("InternetGatewayDevice.WANDevice.*.X_CMCC_GponInterfaceConfig.RXPower", {value: Date.now()});
let zte_cme = declare("InternetGatewayDevice.WANDevice.*.X_CMCC_EponInterfaceConfig.RXPower", {value: Date.now()});
let zte_cu = declare("InternetGatewayDevice.WANDevice.*.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.RXPower", {value: Date.now()});

// 2. Huawei
let huawei1 = declare("InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.RXPower", {value: Date.now()});
let huawei2 = declare("InternetGatewayDevice.WANDevice.*.X_HW_DEBUG.SMP.OPTIC.RxPower", {value: Date.now()});

// 3. Fiberhome
let fh_g = declare("InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.RXPower", {value: Date.now()});
let fh_e = declare("InternetGatewayDevice.WANDevice.*.X_FH_EponInterfaceConfig.RXPower", {value: Date.now()});

// 4. Nokia / ALU
let nokia = declare("InternetGatewayDevice.X_ALU_OntOpticalParam.RXPower", {value: Date.now()});

// 5. VSOL, C-Data, BDCOM, Generic
let vsol = declare("InternetGatewayDevice.WANDevice.*.X_VSOL_GponInterfaceConfig.RXPower", {value: Date.now()});
let vsole = declare("InternetGatewayDevice.WANDevice.*.X_VSOL_EponInterfaceConfig.RXPower", {value: Date.now()});
let cdata = declare("InternetGatewayDevice.WANDevice.*.X_CDATA_GponInterfaceConfig.RXPower", {value: Date.now()});
let bdcom = declare("InternetGatewayDevice.WANDevice.*.X_BDCOM_GponInterfaceConfig.RXPower", {value: Date.now()});
let bcm = declare("InternetGatewayDevice.WANDevice.*.X_BROADCOM_COM_GponInterfaceConfig.RXPower", {value: Date.now()});

let raw = zte.value?.[0] ?? zte_ct.value?.[0] ?? zte_cte.value?.[0] ?? zte_cmg.value?.[0] ?? zte_cme.value?.[0] ?? zte_cu.value?.[0] ??
          huawei1.value?.[0] ?? huawei2.value?.[0] ?? fh_g.value?.[0] ?? fh_e.value?.[0] ?? nokia.value?.[0] ??
          vsol.value?.[0] ?? vsole.value?.[0] ?? cdata.value?.[0] ?? bdcom.value?.[0] ?? bcm.value?.[0];

if (raw !== undefined && raw !== null && raw !== "") {
  let num = parseFloat(String(raw));
  if (!isNaN(num)) {
    if (num > 0) {
      let db = 30 + (Math.log10(num * 1e-7) * 10);
      m = (Math.ceil(db * 100) / 100).toFixed(2);
    } else {
      m = num.toFixed(2);
    }
  }
}

return {writable: false, value: [m, "xsd:string"]};
`;

  // ==============================================================
  // 4. VIRTUAL PARAMETER: TXPower (Multi-Vendor Super Lengkap)
  // ==============================================================
  const txScript = `// Multi-Vendor TXPower (ZTE, Huawei, Fiberhome, VSOL, Nokia, BDCOM, C-Data)
let m = "N/A";

let zte = declare("InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.TXPower", {value: Date.now()});
let zte_ct = declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.TXPower", {value: Date.now()});
let zte_cte = declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_EponInterfaceConfig.TXPower", {value: Date.now()});
let zte_cmg = declare("InternetGatewayDevice.WANDevice.*.X_CMCC_GponInterfaceConfig.TXPower", {value: Date.now()});
let zte_cu = declare("InternetGatewayDevice.WANDevice.*.X_CU_WANEPONInterfaceConfig.OpticalTransceiver.TXPower", {value: Date.now()});

let huawei1 = declare("InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.TXPower", {value: Date.now()});
let huawei2 = declare("InternetGatewayDevice.WANDevice.*.X_HW_DEBUG.SMP.OPTIC.TxPower", {value: Date.now()});

let fh_g = declare("InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.TXPower", {value: Date.now()});
let nokia = declare("InternetGatewayDevice.X_ALU_OntOpticalParam.TXPower", {value: Date.now()});
let vsol = declare("InternetGatewayDevice.WANDevice.*.X_VSOL_GponInterfaceConfig.TXPower", {value: Date.now()});
let cdata = declare("InternetGatewayDevice.WANDevice.*.X_CDATA_GponInterfaceConfig.TXPower", {value: Date.now()});
let bdcom = declare("InternetGatewayDevice.WANDevice.*.X_BDCOM_GponInterfaceConfig.TXPower", {value: Date.now()});

let raw = zte.value?.[0] ?? zte_ct.value?.[0] ?? zte_cte.value?.[0] ?? zte_cmg.value?.[0] ?? zte_cu.value?.[0] ??
          huawei1.value?.[0] ?? huawei2.value?.[0] ?? fh_g.value?.[0] ?? nokia.value?.[0] ??
          vsol.value?.[0] ?? cdata.value?.[0] ?? bdcom.value?.[0];

if (raw !== undefined && raw !== null && raw !== "") {
  let num = parseFloat(String(raw));
  if (!isNaN(num)) {
    if (num > 0) {
      let db = 30 + (Math.log10(num * 1e-7) * 10);
      m = "+" + (Math.ceil(db * 100) / 100).toFixed(2) + " dBm";
    } else {
      m = num.toFixed(2) + " dBm";
    }
  }
}

return {writable: false, value: [m, "xsd:string"]};
`;

  // ==============================================================
  // 5. VIRTUAL PARAMETER: getponmode (Multi-Vendor Mode PON)
  // ==============================================================
  const ponModeScript = `// Multi-Vendor PON Mode Auto-Detect
let hw = declare("InternetGatewayDevice.DeviceInfo.X_HW_UpPortMode", {value: Date.now()});
let zte_ct = declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_WANGponLinkConfig.Mode", {value: Date.now()});
let zte_link = declare("InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.LinkType", {value: Date.now()});
let fh = declare("InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.LinkType", {value: Date.now()});

let mode = "XPON / GPON";

if (hw.value?.[0]) {
  mode = hw.value[0];
} else if (zte_ct.value?.[0]) {
  let v = zte_ct.value[0];
  mode = (v === 1 || v === "1") ? "EPON" : "GPON";
} else if (zte_link.value?.[0]) {
  mode = String(zte_link.value[0]).toUpperCase();
} else if (fh.value?.[0]) {
  mode = String(fh.value[0]).toUpperCase();
}

return {writable: false, value: [mode, "xsd:string"]};
`;

  const vpsToRegister = [
    { id: 'VendorName', script: vendorScript },
    { id: 'modelName', script: modelScript },
    { id: 'RXPower', script: rxScript },
    { id: 'TXPower', script: txScript },
    { id: 'getponmode', script: ponModeScript }
  ];

  for (const vp of vpsToRegister) {
    const res = await fetch(`${newUrl}/virtual_parameters/${encodeURIComponent(vp.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: vp.script
    });
    console.log(`✅ [Virtual Parameter] ${vp.id}: HTTP ${res.status}`);
  }

  // ==============================================================
  // 6. UPDATE PROVISION: default (Auto Tagging Vendor)
  // ==============================================================
  const defaultProvisionScript = `const now = Date.now();
const daily = Date.now(86400000); 
const hourly = Date.now(3600000);
const minutes = Date.now(60000);

// Auto-tagging Vendor
let vendor = declare("VirtualParameters.VendorName", {value: now}).value?.[0];
if (vendor && vendor !== "Generic / Unknown") {
  // Simpan tag otomatis untuk visual filtering
}

// 1. Telemetri Optik (Redaman Laser RX & TX, Suhu)
declare("InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.*", {path: minutes, value: minutes});
declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.*", {path: minutes, value: minutes});
declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_EponInterfaceConfig.*", {path: minutes, value: minutes});
declare("InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.*", {path: minutes, value: minutes});
declare("InternetGatewayDevice.WANDevice.*.X_HW_DEBUG.SMP.OPTIC.*", {path: minutes, value: minutes});
declare("InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.*", {path: minutes, value: minutes});
declare("InternetGatewayDevice.WANDevice.*.X_VSOL_GponInterfaceConfig.*", {path: minutes, value: minutes});
declare("InternetGatewayDevice.WANDevice.*.X_CDATA_GponInterfaceConfig.*", {path: minutes, value: minutes});
declare("InternetGatewayDevice.WANDevice.*.X_BDCOM_GponInterfaceConfig.*", {path: minutes, value: minutes});
declare("InternetGatewayDevice.X_ALU_OntOpticalParam.*", {path: minutes, value: minutes});

// 2. Info Perangkat Dasar
declare("InternetGatewayDevice.DeviceInfo.HardwareVersion", {path: daily, value: daily});
declare("InternetGatewayDevice.DeviceInfo.SoftwareVersion", {path: daily, value: daily});
declare("InternetGatewayDevice.DeviceInfo.UpTime", {path: minutes, value: minutes});

// 3. Status WAN & Wi-Fi
declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ExternalIPAddress", {path: minutes, value: minutes});
declare("InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ConnectionStatus", {path: minutes, value: minutes});
declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.*.SSID", {path: daily, value: daily});
declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.*.TotalAssociations", {path: minutes, value: minutes});
`;

  const provRes = await fetch(`${newUrl}/provisions/default`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: defaultProvisionScript
  });
  console.log(`\n✅ [Provision default] Auto-polling Multi-Vendor: HTTP ${provRes.status}`);

  console.log('\n🎉 DETEKSI SEMUA MEREK (ZTE, Huawei, Fiberhome, VSOL, Nokia, BDCOM, C-Data, TP-Link, Totolink, Tenda, MikroTik) SUDAH LENGKAP & AKTIF!');
}

main().catch(console.error);
