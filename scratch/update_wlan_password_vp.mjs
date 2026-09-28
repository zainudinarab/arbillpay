async function main() {
  const script = `// WLAN PW Supercharged
let m = "";
if (args[1].value) {
  m = args[1].value[0];
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey", null, {value: m});
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase", null, {value: m});
} else {
  let v1 = declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey", {value: Date.now()});
  let v2 = declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase", {value: Date.now()});

  if (v1.value && v1.value[0]) {
    m = v1.value[0];
  } else if (v2.value && v2.value[0]) {
    m = v2.value[0];
  }
}
return {writable: true, value: [m, "xsd:string"]};
`;

  const res = await fetch('http://30.30.2.53:7557/virtual_parameters/WlanPassword', {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: script
  });
  console.log('Update WlanPassword status:', res.status);
}

main().catch(console.error);
