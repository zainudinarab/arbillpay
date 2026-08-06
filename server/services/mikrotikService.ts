import net from 'net';
import { RouterOSAPI } from 'node-routeros';

export const testMikrotikConnection = async (host: string, port: number): Promise<{ success: boolean; message: string }> => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(4000);

    socket.on('connect', () => {
      socket.destroy();
      resolve({
        success: true,
        message: `⚡ Tes Socket API Berhasil! IP Router Mikrotik ${host}:${port} merespon koneksi API dengan lancar!`
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        success: false,
        message: `❌ Gagal terhubung ke Mikrotik IP ${host}:${port}: Connection Timeout (Waktu Habis). Pastikan IP/Port API Router (8728) aktif di IP -> Services Winbox.`
      });
    });

    socket.on('error', (err: any) => {
      socket.destroy();
      resolve({
        success: false,
        message: `❌ Gagal terhubung ke Mikrotik IP ${host}:${port}: ${err.message || 'Connection Refused'}`
      });
    });

    socket.connect(port, host);
  });
};

export const fetchRealMikrotikIdentity = async (host: string, port: number, user: string, pass: string) => {
  try {
    const conn = new RouterOSAPI({
      host: host,
      port: port,
      user: user || 'admin',
      password: pass || '',
      timeout: 6
    });

    await conn.connect();

    let identityName = '';
    try {
      const idRes: any = await conn.write('/system/identity/print');
      if (Array.isArray(idRes) && idRes.length > 0) {
        identityName = idRes[0].name || idRes[0]['system-identity'] || '';
      }
    } catch (e) {}

    let boardName = '';
    let version = '';
    try {
      const resRes: any = await conn.write('/system/resource/print');
      if (Array.isArray(resRes) && resRes.length > 0) {
        boardName = resRes[0]['board-name'] || resRes[0]['architecture-name'] || '';
        version = resRes[0].version ? `RouterOS v${resRes[0].version}` : '';
      }
    } catch (e) {}

    conn.close();
    return {
      connected: true,
      identity: identityName || `MikroTik-${host}`,
      board: boardName || 'MikroTik Hardware',
      version: version || 'RouterOS'
    };
  } catch (err: any) {
    return {
      connected: false,
      error: err.message || 'Gagal login autentikasi ke RouterOS API'
    };
  }
};
