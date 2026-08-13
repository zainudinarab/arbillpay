import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

export const getSetupStatus = async (req: Request, res: Response) => {
  try {
    const clientId = process.env.ARABPAY_CLIENT_ID;
    const clientSecret = process.env.ARABPAY_CLIENT_SECRET;
    const ownerUserId = process.env.ARABPAY_OWNER_USER_ID;

    // Check if installed (has valid client ID & Secret)
    const isInstalled = !!(clientId && clientSecret && clientId !== 'AP_YOUR_CLIENT_ID_HERE' && !clientId.includes('YOUR_CLIENT_ID'));

    return res.json({
      installed: isInstalled,
      client_id: clientId || '',
      owner_user_id: ownerUserId || '',
      owner_phone: process.env.ARABPAY_OWNER_PHONE || '',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const verifyArabPay = async (req: Request, res: Response) => {
  try {
    const { client_id, client_secret, panel_url } = req.body;
    if (!client_id || !client_secret) {
      return res.status(400).json({ error: 'Client ID dan Client Secret wajib diisi' });
    }

    const arabpayBaseUrl = (panel_url || process.env.ARABPAY_PANEL_URL || 'https://arabpay.my.id').replace(/\/$/, '');
    
    // Fetch Client Info from ArabPay Server
    const checkUrl = `${arabpayBaseUrl}/api/v1/oauth/client-info?client_id=${encodeURIComponent(client_id.trim())}`;
    const arabpayRes = await fetch(checkUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!arabpayRes.ok) {
      const errText = await arabpayRes.text();
      return res.status(400).json({
        valid: false,
        error: `Gagal memverifikasi ke ArabPay Server (${arabpayRes.status}): ${errText || 'Client ID tidak ditemukan'}`
      });
    }

    const clientData = await arabpayRes.json();

    return res.json({
      valid: true,
      client_id: clientData.client_id || client_id,
      client_name: clientData.client_name || 'Merchant Client',
      owner_user_id: clientData.user_id || clientData.owner_user_id || '019f74af9fcdWDgDxM8g',
      owner_phone: clientData.owner_phone || '',
      owner_name: clientData.owner_name || '',
    });
  } catch (err: any) {
    console.error('[SETUP VERIFY ERROR]', err);
    return res.status(500).json({
      valid: false,
      error: `Koneksi ke ArabPay Server gagal: ${err.message}`
    });
  }
};

export const saveSetupConfig = async (req: Request, res: Response) => {
  try {
    const { client_id, client_secret, panel_url, business_name, owner_name, owner_phone, owner_user_id } = req.body;

    if (!client_id || !client_secret) {
      return res.status(400).json({ error: 'Client ID dan Client Secret wajib diisi' });
    }

    // Set runtime environment variables
    process.env.ARABPAY_CLIENT_ID = client_id;
    process.env.ARABPAY_CLIENT_SECRET = client_secret;
    process.env.VITE_ARABPAY_CLIENT_ID = client_id;
    process.env.VITE_ARABPAY_CLIENT_SECRET = client_secret;
    if (panel_url) process.env.ARABPAY_PANEL_URL = panel_url;
    if (owner_user_id) process.env.ARABPAY_OWNER_USER_ID = owner_user_id;
    if (owner_phone) process.env.ARABPAY_OWNER_PHONE = owner_phone;
    if (business_name) process.env.BUSINESS_NAME = business_name;

    // Update .env file on disk if exists
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');

      const updateEnvKey = (key: string, val: string) => {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}=${val}`);
        } else {
          envContent += `\n${key}=${val}`;
        }
      };

      updateEnvKey('ARABPAY_CLIENT_ID', client_id);
      updateEnvKey('ARABPAY_CLIENT_SECRET', client_secret);
      updateEnvKey('VITE_ARABPAY_CLIENT_ID', client_id);
      updateEnvKey('VITE_ARABPAY_CLIENT_SECRET', client_secret);
      if (panel_url) updateEnvKey('ARABPAY_PANEL_URL', panel_url);
      if (owner_user_id) updateEnvKey('ARABPAY_OWNER_USER_ID', owner_user_id);
      if (owner_phone) updateEnvKey('ARABPAY_OWNER_PHONE', owner_phone);
      if (business_name) updateEnvKey('BUSINESS_NAME', business_name);

      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log('✅ [SETUP WIZARD] Updated .env configuration on disk successfully');
    }

    return res.json({
      success: true,
      message: 'Konfigurasi setup ArabPay berhasil disimpan!'
    });
  } catch (err: any) {
    console.error('[SETUP SAVE ERROR]', err);
    return res.status(500).json({ error: err.message });
  }
};
