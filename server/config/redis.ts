import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisHost = process.env.REDIS_HOST || '30.30.2.53';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;
const redisDb = parseInt(process.env.REDIS_DB || '0', 10);

let redisClient: Redis | null = null;
let isConnected = false;

try {
  redisClient = new Redis({
    host: redisHost,
    port: redisPort,
    password: redisPassword || undefined,
    db: redisDb,
    connectTimeout: 5000,
    maxRetriesPerRequest: 2,
    retryStrategy(times) {
      // Reconnect with exponential backoff, max 10s
      const delay = Math.min(times * 500, 10000);
      return delay;
    },
    lazyConnect: true
  });

  redisClient.on('connect', () => {
    isConnected = true;
    console.log(`⚡ [REDIS] Terhubung ke Redis Server (${redisHost}:${redisPort}, DB: ${redisDb})`);
  });

  redisClient.on('ready', () => {
    isConnected = true;
  });

  redisClient.on('error', (err) => {
    isConnected = false;
    console.warn(`⚠️ [REDIS NOTICE] Tidak dapat terhubung ke Redis (${redisHost}:${redisPort}): ${err.message}. Sistem fallback ke mode Direct MikroTik.`);
  });

  redisClient.on('close', () => {
    isConnected = false;
  });

  // Attempt non-blocking connection
  redisClient.connect().catch(() => {});
} catch (e: any) {
  console.warn('[REDIS INIT ERROR]', e.message);
}

export function isRedisReady(): boolean {
  return isConnected && redisClient !== null && redisClient.status === 'ready';
}

export async function redisGet<T = any>(key: string): Promise<T | null> {
  if (!isRedisReady() || !redisClient) return null;
  try {
    const raw = await redisClient.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err: any) {
    console.warn(`[REDIS GET ERROR] Key: ${key}:`, err.message);
    return null;
  }
}

export async function redisSet(key: string, value: any, ttlSeconds: number = 60): Promise<boolean> {
  if (!isRedisReady() || !redisClient) return false;
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await redisClient.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await redisClient.set(key, serialized);
    }
    return true;
  } catch (err: any) {
    console.warn(`[REDIS SET ERROR] Key: ${key}:`, err.message);
    return false;
  }
}

export async function redisDel(key: string): Promise<boolean> {
  if (!isRedisReady() || !redisClient) return false;
  try {
    await redisClient.del(key);
    return true;
  } catch (err: any) {
    console.warn(`[REDIS DEL ERROR] Key: ${key}:`, err.message);
    return false;
  }
}

export async function redisDelPattern(pattern: string): Promise<number> {
  if (!isRedisReady() || !redisClient) return 0;
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      return await redisClient.del(...keys);
    }
    return 0;
  } catch (err: any) {
    console.warn(`[REDIS DEL PATTERN ERROR] Pattern: ${pattern}:`, err.message);
    return 0;
  }
}

export default redisClient;
