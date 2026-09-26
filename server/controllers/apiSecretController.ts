import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../config/db.js';

export async function getApiSecretStatus(req: Request, res: Response) {
  try {
    let apiSecret: string | null = null;
    let createdAt: string | null = null;
    let businessName: string = 'Arbill ISP';

    if (pool) {
      const result = await pool.query(
        "SELECT key, value FROM system_settings WHERE key IN ('arbill_chat_api_secret', 'arbill_chat_api_secret_created_at', 'business_name')"
      );
      for (const row of result.rows) {
        if (row.key === 'arbill_chat_api_secret') apiSecret = row.value;
        if (row.key === 'arbill_chat_api_secret_created_at') createdAt = row.value;
        if (row.key === 'business_name') businessName = row.value;
      }
    }

    // Default server URL based on current request host
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3006';
    const serverUrl = `${protocol}://${host}`;

    return res.json({
      success: true,
      has_secret: !!apiSecret,
      api_secret: apiSecret,
      created_at: createdAt,
      business_name: businessName,
      server_url: serverUrl,
      endpoints: {
        ping: `${serverUrl}/api/integration/ping`,
        invoices: `${serverUrl}/api/integration/invoices`,
        customer: `${serverUrl}/api/integration/customer`,
        packages: `${serverUrl}/api/integration/packages`,
      }
    });
  } catch (err: any) {
    console.error('[API SECRET STATUS ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function generateApiSecret(req: Request, res: Response) {
  try {
    if (!pool) {
      return res.status(500).json({ success: false, message: 'Database connection not ready' });
    }

    // Generate random 48-character secure hex secret: arb_sec_<hex>
    const randomHex = crypto.randomBytes(24).toString('hex');
    const newSecret = `arb_sec_${randomHex}`;
    const nowIso = new Date().toISOString();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Save api secret and created_at
    await pool.query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('arbill_chat_api_secret', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [newSecret]);

    await pool.query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('arbill_chat_api_secret_created_at', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [nowIso]);

    console.log('🔑 [API SECRET] Generated new API Secret successfully');

    return res.json({
      success: true,
      message: 'API Secret berhasil dibuat dan disimpan.',
      api_secret: newSecret,
      created_at: nowIso
    });
  } catch (err: any) {
    console.error('[GENERATE API SECRET ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function deleteApiSecret(req: Request, res: Response) {
  try {
    if (!pool) {
      return res.status(500).json({ success: false, message: 'Database connection not ready' });
    }

    await pool.query("DELETE FROM system_settings WHERE key IN ('arbill_chat_api_secret', 'arbill_chat_api_secret_created_at')");
    console.log('🗑️ [API SECRET] API Secret revoked and deleted');

    return res.json({
      success: true,
      message: 'API Secret berhasil dicabut/dihapus.'
    });
  } catch (err: any) {
    console.error('[DELETE API SECRET ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
