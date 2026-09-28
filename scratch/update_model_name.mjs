async function main() {
  const script = `// Model Name Extractor
let m = declare("InternetGatewayDevice.DeviceInfo.ModelName", {value: Date.now()});
let pc = declare("DeviceID.ProductClass", {value: Date.now()});
let d = declare("InternetGatewayDevice.DeviceInfo.Description", {value: Date.now()});
let val = m.value?.[0] || pc.value?.[0] || d.value?.[0] || "XPON ONT";
return {writable: false, value: [val, "xsd:string"]};
`;

  const res = await fetch('http://30.30.2.53:7557/virtual_parameters/modelName', {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: script
  });
  console.log('Update modelName status:', res.status);
}

main().catch(console.error);
