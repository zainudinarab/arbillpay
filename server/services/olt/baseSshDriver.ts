import { Client } from 'ssh2';
import net from 'net';
import { OltRecord } from './types.js';

/**
 * Utilitas untuk menguji apakah port TCP (SSH / Telnet) terbuka pada target OLT
 */
export async function checkTcpPortOpen(host: string, port: number, timeoutMs = 4000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
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
    socket.connect(port, host);
  });
}

/**
 * Eksekusi Perintah CLI ke OLT via SSH dengan handling pty shell & pagination
 */
export async function executeOltSshCommands(
  olt: OltRecord,
  commands: string[],
  timeoutMs = 15000,
  initialPagingCmd = 'terminal length 0\n'
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

          // Nonaktifkan paging agar output panjang tidak terhenti di "--More--"
          if (initialPagingCmd) {
            stream.write(initialPagingCmd);
          }

          commands.forEach((cmd, idx) => {
            setTimeout(() => {
              stream.write(`${cmd}\n`);
            }, (idx + 1) * 300);
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
            }, 2000);
          }, (commands.length + 1) * 350 + 1000);
        };

        stream.on('data', (data: Buffer) => {
          const chunk = data.toString('utf-8');
          output += chunk;

          // Deteksi prompt enable bila OLT meminta enable password
          if (!enableSent && /Password:/i.test(chunk) && !loggedIn) {
            enableSent = true;
            if (olt.enable_password) {
              stream.write(`${olt.enable_password}\n`);
            }
          }

          // Otomatis tekan spasi bila muncul "--More--" pagination
          if (/--\s*More\s*--/i.test(chunk)) {
            stream.write(' ');
          }

          // Deteksi prompt CLI aktif (cth: #, >, $)
          if (/[>#\$]\s*$/.test(chunk.trim()) || chunk.includes('OLT#') || chunk.includes('ZXAN#') || chunk.includes('MA5608T#') || chunk.includes('OLT(config)#')) {
            loggedIn = true;
            if (!commandsSent) {
              sendCommands();
            }
          }
        });

        // Fallback jika prompt tidak terdeteksi dalam 1.2 detik
        setTimeout(() => {
          if (!commandsSent) {
            sendCommands();
          }
        }, 1200);
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
