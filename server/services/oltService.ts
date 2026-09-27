import { Client } from 'ssh2';
import net from 'net';

export interface OltRecord {
  id: string;
  name: string;
  brand: 'zte' | 'huawei' | 'vsol' | 'hsgq' | 'bdcom' | 'fiberhome' | 'generic';
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

/**
 * Eksekusi Perintah CLI ke OLT via SSH dengan handling pty shell & pagination
 */
export async function executeOltSshCommands(
  olt: OltRecord,
  commands: string[],
  timeoutMs = 15000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    let isFinished = false;

    const timer = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        try { conn.end(); } catch (_) {}
        resolve(output || 'SSH session timeout.');
      }
    }, timeoutMs);

    conn.on('ready', () => {
      conn.shell({ term: 'vt100', cols: 200, rows: 50 }, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          isFinished = true;
          conn.end();
          return reject(err);
        }

        stream.on('close', () => {
          clearTimeout(timer);
          if (!isFinished) {
            isFinished = true;
            conn.end();
            resolve(output);
          }
        });

        let commandsSent = false;
        let enableSent = false;
        let loggedIn = false;

        const sendCommands = () => {
          if (commandsSent) return;
          commandsSent = true;

          let initPagingCmd = '';
          if (olt.brand === 'zte') initPagingCmd = 'terminal length 0\n';
          else if (olt.brand === 'huawei') initPagingCmd = 'screen-length 0 temporary\n';
          else if (olt.brand === 'vsol' || olt.brand === 'hsgq') initPagingCmd = 'terminal length 0\n';

          const fullPayload = (initPagingCmd ? initPagingCmd : '') + commands.join('\n') + '\nexit\n';
          stream.write(fullPayload);

          setTimeout(() => {
            if (!isFinished) {
              isFinished = true;
              conn.end();
              resolve(output);
            }
          }, 3500);
        };

        stream.on('data', (data: Buffer) => {
          const chunk = data.toString('utf-8');
          output += chunk;

          // Handle prompt pagination (--More--, Press any key to continue, etc.)
          if (chunk.includes('--More--') || chunk.includes("More ( Press 'Q' to break )") || chunk.includes('---- More ----')) {
            stream.write(' ');
          }

          // Handle inner login prompt (HSAirPo / VSOL / C-Data console wrap)
          if (chunk.includes('Login:')) {
            stream.write(`${olt.username}\n`);
          } else if (chunk.includes('Password:')) {
            stream.write(`${olt.password || olt.enable_password || ''}\n`);
            loggedIn = true;
          } else if (loggedIn && chunk.includes('>') && !enableSent && !commandsSent) {
            enableSent = true;
            setTimeout(() => stream.write('enable\n'), 300);
          } else if (loggedIn && (chunk.includes('GPT1000V#') || chunk.includes('OLT#') || (chunk.includes('#') && !chunk.includes('####'))) && !commandsSent) {
            // Kita sudah berada di Privileged mode (#)! Kirim commands
            setTimeout(sendCommands, 400);
          }
        });

        // Fallback timer jika prompt tidak tertangkap regex
        setTimeout(() => {
          if (!commandsSent) {
            sendCommands();
          }
        }, 5000);
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timer);
      if (!isFinished) {
        isFinished = true;
        reject(err);
      }
    });

    conn.connect({
      host: olt.ip_address,
      port: olt.ssh_port || 22,
      username: olt.username,
      password: olt.password,
      readyTimeout: 10000,
      algorithms: {
        kex: [
          'diffie-hellman-group1-sha1',
          'diffie-hellman-group14-sha1',
          'diffie-hellman-group-exchange-sha1',
          'diffie-hellman-group-exchange-sha256',
          'ecdh-sha2-nistp256'
        ],
        cipher: [
          'aes128-ctr',
          'aes192-ctr',
          'aes256-ctr',
          'aes128-cbc',
          '3des-cbc',
          'aes256-cbc'
        ],
        serverHostKey: [
          'ssh-rsa',
          'ssh-dss',
          'ecdsa-sha2-nistp256'
        ]
      }
    });
  });
}

/**
 * 1. Tes Koneksi Port & SSH ke OLT
 */
export async function testOltConnection(olt: OltRecord): Promise<{
  success: boolean;
  message: string;
  system_info?: string;
  ping_time_ms?: number;
}> {
  const start = Date.now();

  const port = olt.ssh_port || (olt.protocol === 'telnet' ? 23 : 22);
  const isPortOpen = await new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(4000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, olt.ip_address);
  });

  if (!isPortOpen) {
    return {
      success: false,
      message: `Port ${port} pada IP ${olt.ip_address} tidak dapat dijangkau (Host unreachable / Port closed).`
    };
  }

  try {
    let testCmd = 'show version';
    if (olt.brand === 'huawei') testCmd = 'display version';
    else if (olt.brand === 'vsol' || olt.brand === 'hsgq') testCmd = 'show version';

    const output = await executeOltSshCommands(olt, [testCmd], 10000);
    const duration = Date.now() - start;

    return {
      success: true,
      message: `Koneksi SSH ke OLT ${olt.name} (${olt.brand.toUpperCase()}) Berhasil!`,
      system_info: output.slice(0, 300).trim(),
      ping_time_ms: duration
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Port SSH terbuka tetapi gagal login autentikasi: ${err.message}`
    };
  }
}

/**
 * 2. Cek Redaman Optik (Optical Power) ONU secara Realtime
 */
export async function fetchOnuOpticalPower(
  olt: OltRecord,
  ponPort: string | number,
  onuId: number
): Promise<OnuOpticalReading> {
  const brand = olt.brand || 'zte';
  let commands: string[] = [];

  if (brand === 'zte') {
    const targetIface = String(ponPort).includes('/') ? ponPort : `1/1/${ponPort}`;
    commands = [
      `show pon power attenuation gpon-onu_${targetIface}:${onuId}`,
      `show gpon optical-power-onu gpon-onu_${targetIface}:${onuId}`
    ];
  } else if (brand === 'huawei') {
    let slot = 1;
    let p = Number(ponPort) || 1;
    if (String(ponPort).includes('/')) {
      const parts = String(ponPort).split('/');
      slot = Number(parts[1]) || 1;
      p = Number(parts[2]) || 1;
    }
    commands = [
      `display ont optical-info 0/${slot} ${p} ${onuId}`
    ];
  } else if (brand === 'vsol' || brand === 'hsgq' || brand === 'bdcom') {
    const p = String(ponPort).replace(/^gpon[-_]olt_?/i, '').replace(/^0\//, '') || '1';
    commands = [
      'configure terminal',
      `interface gpon 0/${p}`,
      `show onu optical-info ${onuId}`,
      `show onu distance`,
      'end'
    ];
  } else {
    commands = [
      `show pon power attenuation ${ponPort}:${onuId}`
    ];
  }

  let raw = '';
  try {
    raw = await executeOltSshCommands(olt, commands, 12000);
  } catch (err: any) {
    return {
      rx_power_dbm: null,
      tx_power_dbm: null,
      olt_rx_power_dbm: null,
      raw_output: `SSH Error: ${err.message}`
    };
  }

  let rxPower: number | null = null;
  let txPower: number | null = null;
  let oltRxPower: number | null = null;
  let volt: number | null = null;
  let bias: number | null = null;
  let temp: number | null = null;

  // Generic / ZTE / Huawei match
  const rxMatch = raw.match(/(?:rx\s*(?:optical)?\s*power|rx\s*power|rx\s*optical\s*level)\s*[:=]?\s*([-\d\.]+)/i);
  if (rxMatch && !isNaN(parseFloat(rxMatch[1]))) {
    rxPower = parseFloat(rxMatch[1]);
  }

  const txMatch = raw.match(/(?:tx\s*(?:optical)?\s*power|tx\s*power|tx\s*optical\s*level)\s*[:=]?\s*([-\d\.]+)/i);
  if (txMatch && !isNaN(parseFloat(txMatch[1]))) {
    txPower = parseFloat(txMatch[1]);
  }

  const oltRxMatch = raw.match(/(?:olt\s*rx\s*(?:optical)?\s*power|olt\s*rx)\s*[:=]?\s*([-\d\.]+)/i);
  if (oltRxMatch && !isNaN(parseFloat(oltRxMatch[1]))) {
    oltRxPower = parseFloat(oltRxMatch[1]);
  }

  const voltMatch = raw.match(/(?:voltage|power\s*feed\s*voltage)\s*[:=]?\s*([-\d\.]+)/i);
  if (voltMatch && !isNaN(parseFloat(voltMatch[1]))) volt = parseFloat(voltMatch[1]);

  const biasMatch = raw.match(/(?:bias|laser\s*bias\s*current|txbias)\s*[:=]?\s*([-\d\.]+)/i);
  if (biasMatch && !isNaN(parseFloat(biasMatch[1]))) bias = parseFloat(biasMatch[1]);

  const tempMatch = raw.match(/temperature\s*[:=]?\s*([-\d\.]+)/i);
  if (tempMatch && !isNaN(parseFloat(tempMatch[1]))) temp = parseFloat(tempMatch[1]);

  return {
    rx_power_dbm: rxPower,
    tx_power_dbm: txPower,
    olt_rx_power_dbm: oltRxPower,
    voltage_v: volt,
    bias_current_ma: bias,
    temperature_c: temp,
    raw_output: raw.trim()
  };
}

/**
 * 3. Ambil Daftar ONU pada Port PON Tertentu
 */
export async function fetchOltOnuList(
  olt: OltRecord,
  ponPort: string | number
): Promise<OnuInfo[]> {
  const brand = olt.brand || 'zte';
  let commands: string[] = [];

  if (brand === 'zte') {
    const targetIface = String(ponPort).includes('/') ? ponPort : `1/1/${ponPort}`;
    commands = [
      `show gpon onu state gpon-olt_${targetIface}`,
      `show gpon onu baseinfo gpon-olt_${targetIface}`,
      `show gpon onu pon-optical-info gpon-olt_${targetIface}`
    ];
  } else if (brand === 'huawei') {
    let slot = 1;
    let p = Number(ponPort) || 1;
    if (String(ponPort).includes('/')) {
      const parts = String(ponPort).split('/');
      slot = Number(parts[1]) || 1;
      p = Number(parts[2]) || 1;
    }
    commands = [
      `display ont info 0/${slot} ${p} all`,
      `display ont optical-info 0/${slot} ${p} all`
    ];
  } else if (brand === 'vsol' || brand === 'hsgq') {
    const p = String(ponPort).replace(/^gpon[-_]olt_?/i, '').replace(/^0\//, '') || '1';
    commands = [
      'configure terminal',
      `interface gpon 0/${p}`,
      'show onu state',
      'show onu distance',
      'show onu optical-info',
      'end'
    ];
  } else {
    commands = [
      `show onu status ${ponPort}`
    ];
  }

  const raw = await executeOltSshCommands(olt, commands, 15000);
  const cleanRaw = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ' ').replace(/\r/g, '');
  const onuList: OnuInfo[] = [];

  // Parse distance map (e.g. onu 1 Distance: 138m)
  const distanceMap: Record<number, number> = {};
  const distMatches = cleanRaw.matchAll(/onu\s+(\d+)\s+Distance:\s*(\d+)m/gi);
  for (const dm of distMatches) {
    distanceMap[parseInt(dm[1])] = parseInt(dm[2]);
  }

  // Parse bulk optical telemetry map
  interface OpticalInfoParsed {
    rx_power: number | null;
    tx_power: number | null;
    voltage: number | null;
    bias_current: number | null;
    temp: number | null;
  }
  const opticalMap: Record<number, OpticalInfoParsed> = {};

  // 1. VSOL / HSGQ block format: "ONU ID: 1 ... Rx optical level: -20.92 ... Tx optical level: 2.38"
  const onuBlocks = cleanRaw.split(/ONU ID:\s*/i);
  for (let i = 1; i < onuBlocks.length; i++) {
    const block = onuBlocks[i];
    const idMatch = block.match(/^(\d+)/);
    if (!idMatch) continue;
    const onuId = parseInt(idMatch[1]);

    const rxM = block.match(/Rx optical level:\s*([-\d\.]+)/i);
    const txM = block.match(/Tx optical level:\s*([-\d\.]+)/i);
    const voltM = block.match(/Power feed voltage:\s*([-\d\.]+)/i);
    const biasM = block.match(/Laser bias current:\s*([-\d\.]+)/i);
    const tempM = block.match(/Temperature:\s*([-\d\.]+)/i);

    opticalMap[onuId] = {
      rx_power: rxM && !isNaN(parseFloat(rxM[1])) ? parseFloat(rxM[1]) : null,
      tx_power: txM && !isNaN(parseFloat(txM[1])) ? parseFloat(txM[1]) : null,
      voltage: voltM && !isNaN(parseFloat(voltM[1])) ? parseFloat(voltM[1]) : null,
      bias_current: biasM && !isNaN(parseFloat(biasM[1])) ? parseFloat(biasM[1]) : null,
      temp: tempM && !isNaN(parseFloat(tempM[1])) ? parseFloat(tempM[1]) : null,
    };
  }

  // 2. ZTE / Huawei tabular optical format fallback (e.g. gpon-onu_1/1/1:1 ... -20.5 ... 2.1)
  const optLineMatches = cleanRaw.matchAll(/(?:gpon-onu_\d+\/\d+\/\d+:|ont\s+optical-info\s+\d+\s+)(\d+)\s+([-\d\.]+)\s+([-\d\.]+)/gi);
  for (const om of optLineMatches) {
    const onuId = parseInt(om[1]);
    const rx = parseFloat(om[2]);
    const tx = parseFloat(om[3]);
    if (!opticalMap[onuId]) {
      opticalMap[onuId] = {
        rx_power: !isNaN(rx) ? rx : null,
        tx_power: !isNaN(tx) ? tx : null,
        voltage: null,
        bias_current: null,
        temp: null
      };
    }
  }

  const lines = cleanRaw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--') || trimmed.includes('OnuIndex') || trimmed.includes('Admin State')) {
      continue;
    }

    // VSOL / HSGQ Format: 1:1 enable enable working ZTEGc4a3583c
    const vsolMatch = trimmed.match(/(\d+):(\d+)\s+(?:enable|disable)\s+(?:enable|disable)\s+(working|offline|dyinggasp|los)\s+([A-Za-z0-9]+)/i);
    if (vsolMatch) {
      const port = vsolMatch[1];
      const onuId = parseInt(vsolMatch[2]);
      const phaseState = vsolMatch[3].toLowerCase();
      const sn = vsolMatch[4];

      let status: OnuInfo['status'] = 'offline';
      if (phaseState === 'working') status = 'online';
      else if (phaseState.includes('dying')) status = 'dying-gasp';
      else if (phaseState.includes('los')) status = 'los';

      const opt = opticalMap[onuId];
      onuList.push({
        pon_port: port,
        onu_id: onuId,
        sn,
        status,
        distance_m: distanceMap[onuId] ?? null,
        rx_power_dbm: opt?.rx_power ?? null,
        tx_power_dbm: opt?.tx_power ?? null,
        voltage_v: opt?.voltage ?? null,
        bias_current_ma: opt?.bias_current ?? null,
        temperature_c: opt?.temp ?? null
      });
      continue;
    }

    // ZTE Format: gpon-onu_1/1/1:3   enable  working  working
    const zteMatch = trimmed.match(/gpon-onu_(\d+\/\d+\/\d+):(\d+)\s+(\w+)\s+(\w+)\s+(\w+)/i);
    if (zteMatch) {
      const port = zteMatch[1];
      const onuId = parseInt(zteMatch[2]);
      const phaseState = zteMatch[5].toLowerCase();

      let status: OnuInfo['status'] = 'offline';
      if (phaseState === 'working') status = 'online';
      else if (phaseState === 'dyinggasp' || phaseState === 'dying-gasp') status = 'dying-gasp';
      else if (phaseState === 'los' || phaseState === 'offline') status = 'los';

      const opt = opticalMap[onuId];
      onuList.push({
        pon_port: port,
        onu_id: onuId,
        sn: `ZTE-ONU-${port}:${onuId}`,
        status,
        rx_power_dbm: opt?.rx_power ?? null,
        tx_power_dbm: opt?.tx_power ?? null,
        voltage_v: opt?.voltage ?? null,
        bias_current_ma: opt?.bias_current ?? null,
        temperature_c: opt?.temp ?? null
      });
      continue;
    }

    // Huawei Format: 0/1/1   3   48575443...   online
    const hwMatch = trimmed.match(/(\d+\/\d+\/\d+)\s+(\d+)\s+([A-Za-z0-9]+)\s+(\w+)/i);
    if (hwMatch) {
      const port = hwMatch[1];
      const onuId = parseInt(hwMatch[2]);
      const sn = hwMatch[3];
      const state = hwMatch[4].toLowerCase();

      let status: OnuInfo['status'] = 'offline';
      if (state.includes('online')) status = 'online';
      else if (state.includes('los')) status = 'los';
      else if (state.includes('dying')) status = 'dying-gasp';

      const opt = opticalMap[onuId];
      onuList.push({
        pon_port: port,
        onu_id: onuId,
        sn,
        status,
        rx_power_dbm: opt?.rx_power ?? null,
        tx_power_dbm: opt?.tx_power ?? null,
        voltage_v: opt?.voltage ?? null,
        bias_current_ma: opt?.bias_current ?? null,
        temperature_c: opt?.temp ?? null
      });
      continue;
    }
  }

  return onuList;
}

/**
 * 4. Restart / Reboot ONU via OLT Command
 */
export async function rebootOltOnu(
  olt: OltRecord,
  ponPort: string | number,
  onuId: number
): Promise<{ success: boolean; message: string; output: string }> {
  const brand = olt.brand || 'zte';
  let commands: string[] = [];

  if (brand === 'zte') {
    const targetIface = String(ponPort).includes('/') ? ponPort : `1/1/${ponPort}`;
    commands = [
      'configure terminal',
      `reset gpon-onu_${targetIface}:${onuId}`,
      'end'
    ];
  } else if (brand === 'huawei') {
    let slot = 1;
    let p = Number(ponPort) || 1;
    if (String(ponPort).includes('/')) {
      const parts = String(ponPort).split('/');
      slot = Number(parts[1]) || 1;
      p = Number(parts[2]) || 1;
    }
    commands = [
      `interface gpon 0/${slot}`,
      `ont reset ${p} ${onuId}`,
      'quit'
    ];
  } else if (brand === 'vsol' || brand === 'hsgq') {
    const p = String(ponPort).replace(/^gpon[-_]olt_?/i, '').replace(/^0\//, '') || '1';
    commands = [
      'configure terminal',
      `interface gpon 0/${p}`,
      `onu ${onuId} reboot`,
      'end'
    ];
  } else {
    commands = [
      `reset onu ${ponPort}:${onuId}`
    ];
  }

  try {
    const output = await executeOltSshCommands(olt, commands, 10000);
    return {
      success: true,
      message: `Perintah Reboot berhasil dikirimkan ke OLT ${olt.name} untuk ONU ${ponPort}:${onuId}!`,
      output: output.trim()
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal mengirim perintah reboot via SSH: ${err.message}`,
      output: ''
    };
  }
}

/**
 * 5. Scan Modem Baru Belum Di-register (Auto-Find / Unconfigured ONUs)
 */
export async function scanUnconfiguredOnus(
  olt: OltRecord
): Promise<{ pon_port: string; sn: string; model?: string; raw: string }[]> {
  const brand = olt.brand || 'zte';
  let commands: string[] = [];

  if (brand === 'zte') {
    commands = ['show gpon onu uncfg'];
  } else if (brand === 'huawei') {
    commands = ['display ont autofind all'];
  } else if (brand === 'vsol' || brand === 'hsgq') {
    commands = [
      'configure terminal',
      'interface gpon 0/1',
      'show onu auto-find',
      'end'
    ];
  } else {
    commands = ['show onu unregister', 'show pon unconfigured-onu'];
  }

  const raw = await executeOltSshCommands(olt, commands, 12000).catch(() => '');
  const uncfgList: { pon_port: string; sn: string; model?: string; raw: string }[] = [];

  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/gpon-olt_([^\s]+)\s+([A-Za-z0-9]{12,16})/i) ||
                  trimmed.match(/([^\s]+)\s+([A-Za-z0-9]{12,16})/i);
    if (match && !trimmed.toLowerCase().includes('serialnumber') && !trimmed.toLowerCase().includes('sn')) {
      uncfgList.push({
        pon_port: match[1],
        sn: match[2],
        raw: trimmed
      });
    }
  }

  return uncfgList;
}

/**
 * 6. Registrasi ONU Baru via CLI OLT
 */
export async function registerOltOnuCLI(
  olt: OltRecord,
  ponPort: string | number,
  onuId: number,
  sn: string,
  descName?: string,
  lineProfile = 'default',
  srvProfile = 'default'
): Promise<{ success: boolean; message: string; output: string }> {
  const brand = olt.brand || 'vsol';
  let commands: string[] = [];
  const safeName = (descName || `ONU_${onuId}`).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 32);

  if (brand === 'zte') {
    const targetIface = String(ponPort).includes('/') ? ponPort : `1/1/${ponPort}`;
    commands = [
      'configure terminal',
      `interface gpon-olt_${targetIface}`,
      `onu ${onuId} type ${lineProfile} sn ${sn}`,
      'exit',
      `interface gpon-onu_${targetIface}:${onuId}`,
      `name ${safeName}`,
      'end'
    ];
  } else if (brand === 'huawei') {
    let slot = 1;
    let p = Number(ponPort) || 1;
    if (String(ponPort).includes('/')) {
      const parts = String(ponPort).split('/');
      slot = Number(parts[1]) || 1;
      p = Number(parts[2]) || 1;
    }
    commands = [
      `interface gpon 0/${slot}`,
      `ont add ${p} ${onuId} sn-auth ${sn} omci ont-lineprofile-name ${lineProfile} ont-srvprofile-name ${srvProfile} desc "${safeName}"`,
      'quit'
    ];
  } else if (brand === 'vsol' || brand === 'hsgq') {
    const p = String(ponPort).replace(/^gpon[-_]olt_?/i, '').replace(/^0\//, '') || '1';
    commands = [
      'configure terminal',
      `interface gpon 0/${p}`,
      `onu add ${onuId} sn-auth ${sn} line-profile ${lineProfile} srv-profile ${srvProfile}`,
      `onu ${onuId} desc ${safeName}`,
      'end'
    ];
  } else {
    commands = [
      `onu add ${ponPort} ${onuId} sn ${sn}`
    ];
  }

  try {
    const output = await executeOltSshCommands(olt, commands, 12000);
    return {
      success: true,
      message: `Perintah registrasi ONU ID ${onuId} (SN: ${sn}) berhasil dikirim ke OLT!`,
      output
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal mengirim konfigurasi registrasi ONU via SSH: ${err.message}`,
      output: ''
    };
  }
}

/**
 * 7. Hapus / Deregister ONU dari OLT via CLI
 */
export async function deleteOltOnuCLI(
  olt: OltRecord,
  ponPort: string | number,
  onuId: number
): Promise<{ success: boolean; message: string; output: string }> {
  const brand = olt.brand || 'vsol';
  let commands: string[] = [];

  if (brand === 'zte') {
    const targetIface = String(ponPort).includes('/') ? ponPort : `1/1/${ponPort}`;
    commands = [
      'configure terminal',
      `interface gpon-olt_${targetIface}`,
      `no onu ${onuId}`,
      'end'
    ];
  } else if (brand === 'huawei') {
    let slot = 1;
    let p = Number(ponPort) || 1;
    if (String(ponPort).includes('/')) {
      const parts = String(ponPort).split('/');
      slot = Number(parts[1]) || 1;
      p = Number(parts[2]) || 1;
    }
    commands = [
      `interface gpon 0/${slot}`,
      `ont delete ${p} ${onuId}`,
      'quit'
    ];
  } else if (brand === 'vsol' || brand === 'hsgq') {
    const p = String(ponPort).replace(/^gpon[-_]olt_?/i, '').replace(/^0\//, '') || '1';
    commands = [
      'configure terminal',
      `interface gpon 0/${p}`,
      `no onu ${onuId}`,
      'end'
    ];
  } else {
    commands = [
      `no onu ${ponPort}:${onuId}`
    ];
  }

  try {
    const output = await executeOltSshCommands(olt, commands, 10000);
    return {
      success: true,
      message: `ONU ${ponPort}:${onuId} berhasil dihapus dari OLT!`,
      output
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal menghapus ONU via SSH: ${err.message}`,
      output: ''
    };
  }
}

/**
 * 8. Aktifkan Layanan SNMP pada OLT via SSH CLI
 */
export async function enableOltSnmpCLI(
  olt: OltRecord,
  community = 'public'
): Promise<{ success: boolean; message: string; output: string }> {
  const brand = olt.brand || 'vsol';
  let commands: string[] = [];

  if (brand === 'vsol' || brand === 'hsgq' || brand === 'bdcom') {
    commands = [
      'configure terminal',
      'snmp-server start',
      `snmp-server community ${community} ro`,
      'end',
      'write'
    ];
  } else if (brand === 'zte') {
    commands = [
      'configure terminal',
      'snmp-server server enable',
      `snmp-server community ${community} view AllView rw`,
      'end',
      'write'
    ];
  } else if (brand === 'huawei') {
    commands = [
      'system-view',
      'snmp-agent',
      'snmp-agent sys-info version v2c',
      `snmp-agent community read ${community}`,
      'return',
      'save'
    ];
  } else {
    commands = [
      `snmp-server community ${community} ro`,
      'write'
    ];
  }

  try {
    const output = await executeOltSshCommands(olt, commands, 12000);
    return {
      success: true,
      message: `SNMP berhasil diaktifkan pada OLT ${olt.name} dengan Community "${community}"!`,
      output
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal mengaktifkan SNMP via SSH: ${err.message}`,
      output: ''
    };
  }
}

