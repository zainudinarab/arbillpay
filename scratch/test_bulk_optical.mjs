import { pool } from '../server/config/db.js';
import { executeOltSshCommands } from '../server/services/oltService.js';

async function main() {
  const r = await pool.query('SELECT * FROM olts WHERE id = $1', ['olt-mujo62fi-2t64']);
  const olt = r.rows[0];

  const cmds = [
    'configure terminal',
    'interface gpon 0/1',
    'show onu optical-info ?',
    'show onu optical-info',
    'end'
  ];

  try {
    const raw = await executeOltSshCommands(olt, cmds, 15000);
    console.log('--- OUTPUT ---');
    console.log(raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ''));
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
