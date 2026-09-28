async function main() {
  const script = `// Robust Multi-Vendor Serial Number Extractor
let snVal = "";
let d1 = declare("DeviceID.SerialNumber", {value: Date.now()});
let d2 = declare("InternetGatewayDevice.DeviceInfo.SerialNumber", {value: Date.now()});

if (d1.value && d1.value[0]) {
  snVal = String(d1.value[0]);
} else if (d2.value && d2.value[0]) {
  snVal = String(d2.value[0]);
}

// Convert 8-char hex vendor prefix if needed (e.g. 5A544547 -> ZTEG, 48575443 -> HWTC)
let hexToText = (hex) => {
  let text = "";
  for (let i = 0; i < hex.length; i += 2) {
    let charCode = parseInt(hex.substr(i, 2), 16);
    if (!isNaN(charCode) && charCode >= 32 && charCode <= 126) {
      text += String.fromCharCode(charCode);
    } else {
      return null;
    }
  }
  return text;
};

let finalSn = snVal;
if (snVal && snVal.length >= 12 && /^[0-9A-Fa-f]+$/.test(snVal)) {
  let prefix = hexToText(snVal.substr(0, 8));
  if (prefix && (prefix === "ZTEG" || prefix === "HWTC" || prefix === "FHTT" || prefix === "ALCL" || prefix === "VSOL" || prefix === "BDCM" || prefix === "CDAT")) {
    finalSn = prefix + snVal.substr(8);
  }
}

return {writable: false, value: [finalSn || "UNKNOWN", "xsd:string"]};
`;

  const res = await fetch('http://30.30.2.53:7557/virtual_parameters/getSerialNumber', {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: script
  });
  console.log('Update getSerialNumber VP status:', res.status);
}

main().catch(console.error);
