import { pool } from '../config/db.js';
import { getRedisClient } from '../config/redis.js';
import { fetchRouterInterfacesSnmp } from './snmpService.js';
import { RouterOSAPI } from 'node-routeros';

export interface TrafficSample {
  t: number;           // Timestamp (ms)
  rx_mbps: number;     // Speed RX in Mbps
  tx_mbps: number;     // Speed TX in Mbps
  rx_bytes: string;    // Raw RX bytes
  tx_bytes: string;    // Raw TX bytes
  source: 'snmp' | 'api';
}

/**
 * Worker Sampling Trafik 1-Menitan ke Redis
 * Mengambil data bandwidth dari setiap router (via SNMP atau MikroTik API)
 * dan menyimpannya ke antrean Redis ring-buffer.
 */
export async function sampleAllRoutersTraffic(): Promise<void> {
  const redis = getRedisClient();
  let routers: any[] = [];

  try {
    const res = await pool.query(`
      SELECT id, name, ip_address, api_port, username, password,
             COALESCE(traffic_sampling_enabled, true) as traffic_sampling_enabled,
             COALESCE(snmp_enabled, false) as snmp_enabled,
             COALESCE(snmp_port, 161) as snmp_port,
             COALESCE(snmp_community, 'public') as snmp_community,
             COALESCE(snmp_version, 'v2c') as snmp_version,
             snmp_username, snmp_auth_proto, snmp_auth_pass, snmp_priv_proto, snmp_priv_pass
      FROM routers
      WHERE status = 'online' AND COALESCE(traffic_sampling_enabled, true) = true
    `);
    routers = res.rows || [];
  } catch (err: any) {
    console.warn('[TRAFFIC SAMPLER] Gagal mengambil daftar router:', err.message);
    return;
  }

  if (routers.length === 0) return;

  const now = Date.now();

  for (const rtr of routers) {
    try {
      // Ambil metadata interface yang terdaftar & aktif dimonitor dari PostgreSQL
      const ifaceMetaRes = await pool.query(`
        SELECT id, name, is_monitored, last_rx_bytes, last_tx_bytes, last_polled_at, linked_node_id, interface_type
        FROM router_interfaces
        WHERE router_id = $1 AND is_monitored = true
      `, [rtr.id]);

      const monitoredMap = new Map<string, any>();
      ifaceMetaRes.rows.forEach(row => monitoredMap.set(row.name, row));

      let interfaceReadings: { name: string; rxByte: bigint; txByte: bigint; running: boolean }[] = [];
      let collectorType: 'snmp' | 'api' = 'api';

      // 1. Jika SNMP aktif, utamakan SNMP 64-bit
      if (rtr.snmp_enabled) {
        try {
          const snmpData = await fetchRouterInterfacesSnmp(
            rtr.ip_address,
            rtr.snmp_port,
            rtr.snmp_community,
            rtr.snmp_version,
            {
              username: rtr.snmp_username,
              authProto: rtr.snmp_auth_proto,
              authPass: rtr.snmp_auth_pass,
              privProto: rtr.snmp_priv_proto,
              privPass: rtr.snmp_priv_pass
            }
          );
          if (snmpData && snmpData.length > 0) {
            interfaceReadings = snmpData;
            collectorType = 'snmp';
          }
        } catch (snmpErr: any) {
          console.warn(`[TRAFFIC SAMPLER] SNMP router ${rtr.name} gagal, fallback ke API:`, snmpErr.message);
        }
      }

      // 2. Fallback / default ke MikroTik API (hanya minta rx-byte & tx-byte, super cepat)
      if (interfaceReadings.length === 0) {
        let conn: any = null;
        try {
          conn = new RouterOSAPI({
            host: rtr.ip_address,
            port: rtr.api_port || 8728,
            user: rtr.username || 'admin',
            password: rtr.password || '',
            timeout: 5
          });
          await conn.connect();
          const apiList = await conn.write('/interface/print', [
            '=.proplist=name,rx-byte,tx-byte,running,disabled'
          ]);
          if (Array.isArray(apiList)) {
            interfaceReadings = apiList.map((item: any) => ({
              name: item.name,
              rxByte: BigInt(item['rx-byte'] || 0),
              txByte: BigInt(item['tx-byte'] || 0),
              running: item.running === 'true' || item.running === true
            }));
            collectorType = 'api';
          }
        } catch (apiErr: any) {
          // Lewati router ini jika offline
          continue;
        } finally {
          if (conn) {
            try { await conn.close(); } catch (_) {}
          }
        }
      }

      // 3. Hitung kecepatan per interface & masukkan ke Redis
      for (const reading of interfaceReadings) {
        const prev = monitoredMap.get(reading.name);
        let rxMbps = 0;
        let txMbps = 0;

        if (prev && prev.last_polled_at) {
          const deltaSec = Math.max(1, Math.round((now - new Date(prev.last_polled_at).getTime()) / 1000));
          if (deltaSec < 600) { // Hanya hitung jika jeda wajar < 10 menit
            const prevRx = BigInt(prev.last_rx_bytes || 0);
            const prevTx = BigInt(prev.last_tx_bytes || 0);

            const deltaRx = reading.rxByte >= prevRx ? reading.rxByte - prevRx : reading.rxByte;
            const deltaTx = reading.txByte >= prevTx ? reading.txByte - prevTx : reading.txByte;

            rxMbps = Number(((Number(deltaRx) * 8) / (deltaSec * 1_000_000)).toFixed(2));
            txMbps = Number(((Number(deltaTx) * 8) / (deltaSec * 1_000_000)).toFixed(2));
          }
        }

        // Update database router_interfaces (last_rx_bytes, last_tx_bytes, last_polled_at)
        pool.query(`
          INSERT INTO router_interfaces (id, router_id, name, is_monitored, last_rx_bytes, last_tx_bytes, last_polled_at)
          VALUES ($1, $2, $3, true, $4, $5, NOW())
          ON CONFLICT (id) DO UPDATE
          SET last_rx_bytes = EXCLUDED.last_rx_bytes,
              last_tx_bytes = EXCLUDED.last_tx_bytes,
              last_polled_at = NOW()
        `, [
          `${rtr.id}_${reading.name}`,
          rtr.id,
          reading.name,
          reading.rxByte.toString(),
          reading.txByte.toString()
        ]).catch(() => {});

        // Simpan sample ke Redis jika Redis tersedia
        if (redis) {
          const sample: TrafficSample = {
            t: now,
            rx_mbps: rxMbps,
            tx_mbps: txMbps,
            rx_bytes: reading.rxByte.toString(),
            tx_bytes: reading.txByte.toString(),
            source: collectorType
          };

          const redisListKey = `traffic:samples:${rtr.id}:${reading.name}`;
          const liveKey = `traffic:live:${rtr.id}:${reading.name}`;

          // Simpan snapshot live (1ms read)
          redis.set(liveKey, JSON.stringify(sample), 'EX', 120).catch(() => {});

          // Tambah ke list buffer 30-menit (simpan hingga 70 sample terakhir @ 30s)
          redis.rpush(redisListKey, JSON.stringify(sample)).catch(() => {});
          redis.ltrim(redisListKey, -70, -1).catch(() => {});
          redis.expire(redisListKey, 3600).catch(() => {});
        }
      }
    } catch (rtrLoopErr: any) {
      console.warn(`[TRAFFIC SAMPLER] Error sampling router ${rtr.name}:`, rtrLoopErr.message);
    }
  }
}

/**
 * Rollup 30-Menit: Mengambil seluruh sample dari Redis,
 * menghitung True Average, True Peak, dan total GB,
 * lalu menyimpannya ke tabel PostgreSQL interface_traffic_logs & ftth_traffic_history.
 */
export async function rollupTrafficToPostgres(): Promise<number> {
  const redis = getRedisClient();
  let totalSaved = 0;

  try {
    const ifaceRes = await pool.query(`
      SELECT ri.id, ri.router_id, ri.name as interface_name, ri.interface_type, ri.linked_node_id,
             r.name as router_name
      FROM router_interfaces ri
      JOIN routers r ON ri.router_id = r.id
      WHERE ri.is_monitored = true
    `);

    const interfaces = ifaceRes.rows || [];
    if (interfaces.length === 0) return 0;

    for (const iface of interfaces) {
      const redisListKey = `traffic:samples:${iface.router_id}:${iface.interface_name}`;
      let samples: TrafficSample[] = [];

      if (redis) {
        try {
          const rawSamples = await redis.lrange(redisListKey, 0, -1);
          if (Array.isArray(rawSamples) && rawSamples.length > 0) {
            samples = rawSamples.map(s => {
              try { return JSON.parse(s); } catch (_) { return null; }
            }).filter(Boolean);
          }
        } catch (_) {}
      }

      let avgRxMbps = 0;
      let avgTxMbps = 0;
      let peakRxMbps = 0;
      let peakTxMbps = 0;
      let deltaRxBytes = BigInt(0);
      let deltaTxBytes = BigInt(0);

      if (samples.length > 0) {
        // Hitung rata-rata dan peak sesungguhnya dari sample 1-menitan
        let sumRx = 0;
        let sumTx = 0;

        for (const s of samples) {
          sumRx += s.rx_mbps;
          sumTx += s.tx_mbps;
          if (s.rx_mbps > peakRxMbps) peakRxMbps = s.rx_mbps;
          if (s.tx_mbps > peakTxMbps) peakTxMbps = s.tx_mbps;
        }

        avgRxMbps = Number((sumRx / samples.length).toFixed(2));
        avgTxMbps = Number((sumTx / samples.length).toFixed(2));

        // Hitung selisih byte dari sample pertama ke sample terakhir
        const first = samples[0];
        const last = samples[samples.length - 1];
        if (first && last) {
          const bIn1 = BigInt(first.rx_bytes || 0);
          const bIn2 = BigInt(last.rx_bytes || 0);
          const bOut1 = BigInt(first.tx_bytes || 0);
          const bOut2 = BigInt(last.tx_bytes || 0);

          deltaRxBytes = bIn2 >= bIn1 ? bIn2 - bIn1 : bIn2;
          deltaTxBytes = bOut2 >= bOut1 ? bOut2 - bOut1 : bOut2;
        }
      }

      // Simpan ke PostgreSQL interface_traffic_logs
      await pool.query(`
        INSERT INTO interface_traffic_logs (
          interface_id, router_id, interface_name, interface_type, linked_node_id,
          avg_rx_mbps, avg_tx_mbps, peak_rx_mbps, peak_tx_mbps,
          delta_rx_bytes, delta_tx_bytes, interval_seconds, recorded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1800, NOW())
      `, [
        iface.id,
        iface.router_id,
        iface.interface_name,
        iface.interface_type || 'ether',
        iface.linked_node_id || null,
        avgRxMbps,
        avgTxMbps,
        peakRxMbps,
        peakTxMbps,
        deltaRxBytes.toString(),
        deltaTxBytes.toString()
      ]);

      // Jika interface ini dihubungkan ke FTTH Node (ODP / ODC / Splitter), update juga ftth_traffic_history
      if (iface.linked_node_id) {
        await pool.query(`
          INSERT INTO ftth_traffic_history (
            node_id, avg_download_mbps, peak_download_mbps, avg_upload_mbps, peak_upload_mbps,
            total_bytes, active_clients, interval_minutes, recorded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 1, 30, NOW())
        `, [
          iface.linked_node_id,
          avgRxMbps,
          peakRxMbps,
          avgTxMbps,
          peakTxMbps,
          (deltaRxBytes + deltaTxBytes).toString()
        ]).catch(() => {});
      }

      totalSaved++;

      // Hapus data yang sudah diproses dari Redis agar fresh untuk 30 menit ke depan
      if (redis) {
        redis.del(redisListKey).catch(() => {});
      }
    }

    // Auto-purge data > 90 hari agar database PostgreSQL tetap ramping & cepat
    await pool.query(`DELETE FROM interface_traffic_logs WHERE recorded_at < NOW() - INTERVAL '90 days'`).catch(() => {});
    await pool.query(`DELETE FROM ftth_traffic_history WHERE recorded_at < NOW() - INTERVAL '90 days'`).catch(() => {});

    console.log(`📊 [TRAFFIC ROLLUP] Berhasil merangkum 30-menit true avg & peak untuk ${totalSaved} interface.`);
  } catch (err: any) {
    console.error('[TRAFFIC ROLLUP] Error rollup ke PostgreSQL:', err.message);
  }

  return totalSaved;
}

/**
 * Mengambil histori sample 1-menitan terbaru langsung dari Redis (untuk grafik UI instan)
 */
export async function getRecentInterfaceSamples(routerId: string, interfaceName: string): Promise<TrafficSample[]> {
  const redis = getRedisClient();
  if (!redis) return [];

  try {
    const redisListKey = `traffic:samples:${routerId}:${interfaceName}`;
    const raw = await redis.lrange(redisListKey, 0, -1);
    if (!Array.isArray(raw)) return [];
    return raw.map(s => {
      try { return JSON.parse(s); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (err) {
    return [];
  }
}

/**
 * Menjalankan Background Worker:
 * 1. Setiap 1 Menit: Polling sampling cepat (SNMP / API) -> Simpan ke Redis.
 * 2. Setiap 30 Menit: Rollup komputasi True Average, Peak, dan Kuota -> Simpan ke PostgreSQL.
 */
let isSamplingRunning = false;
let isRollupRunning = false;

export function startTrafficSamplingWorker() {
  console.log('🚀 [TRAFFIC WORKER] Memulai Scheduler High-Precision Traffic Sampling (Sistem Hybrid: 30 Detik Background)...');

  // 1. Sampling tiap 30 Detik (Sistem Hybrid: Akurat, Cepat, Beban Ringan)
  setInterval(async () => {
    if (isSamplingRunning) return;
    isSamplingRunning = true;
    try {
      await sampleAllRoutersTraffic();
    } catch (e: any) {
      console.warn('[TRAFFIC WORKER] Sampling error:', e.message);
    } finally {
      isSamplingRunning = false;
    }
  }, 30 * 1000);

  // 2. Rollup tiap 30 Menit (1800 detik)
  setInterval(async () => {
    if (isRollupRunning) return;
    isRollupRunning = true;
    try {
      await rollupTrafficToPostgres();
    } catch (e: any) {
      console.warn('[TRAFFIC WORKER] Rollup error:', e.message);
    } finally {
      isRollupRunning = false;
    }
  }, 30 * 60 * 1000);

  // Eksekusi sampling pertama kali setelah 5 detik server start
  setTimeout(() => {
    sampleAllRoutersTraffic().catch(() => {});
  }, 5000);
}
