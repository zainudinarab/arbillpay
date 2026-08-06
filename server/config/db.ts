import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || '30.30.0.175',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'q7R$9x!wM#2pL*zY',
  database: process.env.DB_NAME || 'arbil_db',
});
