import { pool } from '../server/config/db.js';
import { fetchOltPortInterfacesSnmp } from '../server/services/snmpService.js';

async function main() {
  const r = await pool.query("SELECT * FROM olts WHERE id = 'olt-mujo62fi-2t64'");
  if (r.rows.length === 0) return;
  const olt = r.rows[0];

  const ports = await fetchOltPortInterfacesSnmp(olt.ip_address, olt.snmp_port || 161, olt.snmp_community || 'public');
  console.log('Fetched ports:', ports);

  await pool.query(
    'UPDATE olts SET uplink_status = $1, pon_status = $2, ports_summary = $3 WHERE id = $4',
    [ports.uplinkStatusSummary, ports.ponStatusSummary, JSON.stringify(ports), olt.id]
  );
  console.log('Updated OLT ports in database successfully!');
  await pool.end();
}

main();
