import net from 'net';

const ip = '192.168.201.238';
const ports = [3000, 7557, 80, 8080, 7547, 7567, 22];

for (const port of ports) {
  const socket = new net.Socket();
  socket.setTimeout(2000);
  socket.on('connect', () => {
    console.log(`Port ${port} is OPEN on ${ip}`);
    socket.destroy();
  });
  socket.on('timeout', () => {
    console.log(`Port ${port} TIMEOUT on ${ip}`);
    socket.destroy();
  });
  socket.on('error', (err) => {
    console.log(`Port ${port} CLOSED: ${err.message}`);
  });
  socket.connect(port, ip);
}
