import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || '30.30.2.53',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'user_arbil',
  password: process.env.DB_PASSWORD || '4212574e4c9f1820468e',
  database: process.env.DB_NAME || 'arbill',
  max: 20, // max connection pool for fast concurrent queries
  idleTimeoutMillis: 30000, // close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // return an error after 5 seconds if connection cannot be established
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

// Resilient pool error handling to prevent unhandled process exit
pool.on('error', (err) => {
  console.error('⚠️ [POSTGRES POOL NOTICE] Idle client error encountered:', err.message);
});

