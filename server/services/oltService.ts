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

        stream.on('data', (data: Buffer) => {
          const chunk = data.toString('utf-8');
          output += chunk;

          // Handle prompt pagination (--More--, Press any key to continue, etc.)
          if (chunk.includes('--More--') || chunk.includes("More ( Press 'Q' to break )") || chunk.includes('---- More ----')) {
            stream.write(' '); // kirim spasi untuk melanjutkan output
          }

          // Handle enable / privilege mode prompt
          if (olt.enable_password && chunk.includes('Password:') && !chunk.includes('Login:')) {
            stream.write(`${olt.enable_password}\n`);
          }
        });

        // Kirim disable paging dan command list
        let initPagingCmd = '';
        if (olt.brand === 'zte') initPagingCmd = 'terminal length 0\n';
        else if (olt.brand === 'huawei') initPagingCmd = 'screen-length 0 temporary\n';
        else if (olt.brand === 'vsol' || olt.brand === 'hsgq') initPagingCmd = 'terminal length 0\n';

        setTimeout(() => {
          if (initPagingCmd) stream.write(initPagingCmd);

          commands.forEach((cmd, idx) => {
            setTimeout(() => {
              stream.write(`${cmd}\n`);
            }, 300 * (idx + 1));
          });

          // Kirim exit setelah semua command selesai
          setTimeout(() => {
            stream.write('exit\n');
            setTimeout(() => {
              if (!isFinished) {
                isFinished = true;
                conn.end();
                resolve(output);
              }
            }, 1000);
          }, 300 * (commands.length + 1) + 800);
        }, 500);
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
    commands = [
      `show pon onu ${ponPort} ${onuId} optical-info`,
      `show onu ${ponPort}:${onuId} optical-power`
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

  const rxMatch = raw.match(/(?:rx\s*(?:optical)?\s*power|rx\s*power)\s*[:=]?\s*([-\d\.]+)/i);
  if (rxMatch && !isNaN(parseFloat(rxMatch[1]))) {
    rxPower = parseFloat(rxMatch[1]);
  }

  const txMatch = raw.match(/(?:tx\s*(?:optical)?\s*power|tx\s*power)\s*[:=]?\s*([-\d\.]+)/i);
  if (txMatch && !isNaN(parseFloat(txMatch[1]))) {
    txPower = parseFloat(txMatch[1]);
  }

  const oltRxMatch = raw.match(/(?:olt\s*rx\s*(?:optical)?\s*power|olt\s*rx)\s*[:=]?\s*([-\d\.]+)/i);
  if (oltRxMatch && !isNaN(parseFloat(oltRxMatch[1]))) {
    oltRxPower = parseFloat(oltRxMatch[1]);
  }

  return {
    rx_power_dbm: rxPower,
    tx_power_dbm: txPower,
    olt_rx_power_dbm: oltRxPower,
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
      `show gpon onu baseinfo gpon-olt_${targetIface}`
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
      `display ont info 0/${slot} ${p} all`
    ];
  } else {
    commands = [
      `show onu status ${ponPort}`
    ];
  }

  const raw = await executeOltSshCommands(olt, commands, 15000);
  const onuList: OnuInfo[] = [];

  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--') || trimmed.includes('OnuIndex') || trimmed.includes('Admin State')) {
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

      onuList.push({
        pon_port: port,
        onu_id: onuId,
        sn: `ZTE-ONU-${port}:${onuId}`,
        status
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

      onuList.push({
        pon_port: port,
        onu_id: onuId,
        sn,
        status
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
    commands = [
      `onu reboot ${ponPort} ${onuId}`
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
