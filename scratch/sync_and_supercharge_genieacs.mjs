async function main() {
  const oldUrl = 'http://192.168.201.238:7557';
  const newUrl = 'http://30.30.2.53:7557';
  const oldHeaders = {
    'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64'),
    'Content-Type': 'application/json'
  };

  console.log('🚀 Memulai Sinkronisasi Supercharged ke GenieACS Docker (http://30.30.2.53)...\n');

  // ==========================================
  // 1. SINKRONISASI & UPGRADE VIRTUAL PARAMETERS
  // ==========================================
  console.log('1. Mengunduh Virtual Parameters dari server lama...');
  const vpsRes = await fetch(`${oldUrl}/virtual_parameters`, { headers: oldHeaders });
  const oldVps = await vpsRes.json();
  console.log(`   Ditemukan ${oldVps.length} Virtual Parameters.`);

  const superchargedVps = [...oldVps];

  // TXPower (Optical Output Power)
  if (!superchargedVps.find(x => x._id === 'TXPower')) {
    superchargedVps.push({
      _id: 'TXPower',
      script: `// Supercharged TXPower
let m = "N/A";
let zte = declare("InternetGatewayDevice.WANDevice.*.X_ZTE-COM_WANPONInterfaceConfig.TXPower", {value: Date.now()});
let ct = declare("InternetGatewayDevice.WANDevice.*.X_CT-COM_GponInterfaceConfig.TXPower", {value: Date.now()});
let huawei = declare("InternetGatewayDevice.WANDevice.*.X_GponInterafceConfig.TXPower", {value: Date.now()});
let fiberhome = declare("InternetGatewayDevice.WANDevice.*.X_FH_GponInterfaceConfig.TXPower", {value: Date.now()});

let val = zte.value?.[0] ?? ct.value?.[0] ?? huawei.value?.[0] ?? fiberhome.value?.[0];
if (val !== undefined && val !== null && val !== "") {
  let num = parseFloat(String(val));
  if (!isNaN(num)) {
    if (num > 0) {
      let db = 30 + (Math.log10(num * 1e-7) * 10);
      m = "+" + (Math.ceil(db * 100) / 100) + " dBm";
    } else {
      m = String(val).includes("dBm") ? String(val) : String(val) + " dBm";
    }
  }
}
return {writable: false, value: [m, "xsd:string"]};`
    });
  }

  // WlanSSID (Shortcut membaca SSID Wi-Fi aktif)
  if (!superchargedVps.find(x => x._id === 'WlanSSID')) {
    superchargedVps.push({
      _id: 'WlanSSID',
      script: `// Supercharged WlanSSID
let ssid = declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", {value: Date.now()});
let val = ssid.value?.[0] || "Wi-Fi";
return {writable: false, value: [val, "xsd:string"]};`
    });
  }

  // rxStatus (Status Redaman: Bagus, Warning, Kritis)
  if (!superchargedVps.find(x => x._id === 'rxStatus')) {
    superchargedVps.push({
      _id: 'rxStatus',
      script: `// Optical Status Label
let rx = declare("VirtualParameters.RXPower", {value: Date.now()});
let val = parseFloat(rx.value?.[0]);
let status = "Unknown";
if (!isNaN(val)) {
  if (val >= -24 && val <= -10) status = "Bagus (Normal)";
  else if (val < -24 && val >= -27) status = "Warning (Redaman Kurang)";
  else if (val < -27) status = "Kritis (Drop/Tekuk)";
  else status = "Terlalu Tinggi";
}
return {writable: false, value: [status, "xsd:string"]};`
    });
  }

  console.log(`   Menyuntikkan total ${superchargedVps.length} Virtual Parameters ke Docker baru (Format Text/Plain)...`);
  let vpSuccess = 0;
  for (const vp of superchargedVps) {
    const putRes = await fetch(`${newUrl}/virtual_parameters/${encodeURIComponent(vp._id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: vp.script || ''
    });
    if (putRes.ok) {
      vpSuccess++;
      console.log(`   -> [VP OK] ${vp._id}`);
    } else {
      console.log(`   -> [VP GAGAL] ${vp._id}: HTTP ${putRes.status}`);
    }
  }

  // ==========================================
  // 2. SINKRONISASI PROVISIONS
  // ==========================================
  console.log('\n2. Mengunduh Provisions dari server lama...');
  const provRes = await fetch(`${oldUrl}/provisions`, { headers: oldHeaders });
  const oldProvisions = await provRes.json();
  console.log(`   Ditemukan ${oldProvisions.length} Provisions.`);

  let provSuccess = 0;
  for (const prov of oldProvisions) {
    let script = prov.script;
    if (prov._id === 'inform') {
      script = script.replace(/const url = "[^"]+";/, `const url = "http://30.30.2.53:7547";`);
    }
    const putRes = await fetch(`${newUrl}/provisions/${encodeURIComponent(prov._id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: script || ''
    });
    if (putRes.ok) {
      provSuccess++;
      console.log(`   -> [Provision OK] ${prov._id}`);
    } else {
      console.log(`   -> [Provision GAGAL] ${prov._id}: HTTP ${putRes.status}`);
    }
  }

  // ==========================================
  // 3. SINKRONISASI PRESETS
  // ==========================================
  console.log('\n3. Mengunduh Presets dari server lama...');
  const presRes = await fetch(`${oldUrl}/presets`, { headers: oldHeaders });
  const oldPresets = await presRes.json();
  console.log(`   Ditemukan ${oldPresets.length} Presets.`);

  let presSuccess = 0;
  for (const preset of oldPresets) {
    const putRes = await fetch(`${newUrl}/presets/${encodeURIComponent(preset._id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weight: preset.weight,
        channel: preset.channel,
        precondition: preset.precondition,
        configurations: preset.configurations
      })
    });
    if (putRes.ok) {
      presSuccess++;
      console.log(`   -> [Preset OK] ${preset._id}`);
    } else {
      console.log(`   -> [Preset GAGAL] ${preset._id}: HTTP ${putRes.status}`);
    }
  }

  console.log(`\n🎉 HASIL SINKRONISASI KE DOCKER (http://30.30.2.53):`);
  console.log(`   - Virtual Parameters: ${vpSuccess} / ${superchargedVps.length} Berhasil Disimpan`);
  console.log(`   - Provisions Script : ${provSuccess} / ${oldProvisions.length} Berhasil Disimpan`);
  console.log(`   - Presets Automation: ${presSuccess} / ${oldPresets.length} Berhasil Disimpan`);
}

main().catch(console.error);
