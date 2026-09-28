import { pool } from '../server/config/db.js';

async function run() {
  const res = await pool.query(
    "UPDATE olts SET total_pon_ports = 1, model = 'V1600GS' WHERE id = 'olt-mujo62fi-2t64' RETURNING id, name, brand, model, total_pon_ports"
  );
  console.log('Result:', res.rows);
  await pool.end();
}

run();
