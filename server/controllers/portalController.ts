import { Request, Response } from 'express';
import { pool } from '../config/db.js';
import { redisGet, redisSet, redisDel } from '../config/redis.js';

export const defaultPortalConfig = {
  template_theme: 'dark_glass', // 'dark_glass' | 'clean_light' | 'mikhmon_compact' | 'voucher_store'
  primary_color: 'emerald', // 'emerald' | 'indigo' | 'rose' | 'sky' | 'amber'
  voucher_columns: 2, // 1 | 2 | 3
  branding: {
    hotspot_name: 'ARBILL Hotspot & Internet',
    tagline: 'Internet Cepat, Beli Voucher Instan & Bayar Tagihan Mudah',
    contact_phone: '081234567890',
    logo_url: '',
    banner_url: ''
  },
  announcement: {
    enabled: true,
    text: 'Beli voucher WiFi sekarang lebih mudah via QRIS & Saldo ArabPay! Aktif otomatis 24 Jam.',
    type: 'info'
  },
  flash_sale: {
    enabled: true,
    title: '⚡ FLASH SALE AKHIR PEKAN',
    subtitle: 'Voucher 24 Jam Nonstop Diskon Spesial',
    badge_label: 'PROMO TERBATAS',
    end_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    discount_text: 'Hanya Rp 5.000 (Hemat 40%)',
    button_text: 'Beli Sekarang'
  },
  sections: [
    { id: 'announcement', label: 'Teks Berjalan / Pengumuman', enabled: true, order: 1 },
    { id: 'hero', label: 'Banner Sambutan & Info Hotspot', enabled: true, order: 2 },
    { id: 'flash_sale', label: 'Flash Sale & Promo Countdown', enabled: true, order: 3 },
    { id: 'wallet_widget', label: 'Widget Saldo & Akun ArabPay', enabled: true, order: 4 },
    { id: 'quick_billing', label: 'Form Cek & Bayar Tagihan Cepat', enabled: true, order: 5 },
    { id: 'vouchers', label: 'Katalog Voucher Hotspot', enabled: true, order: 6, variant: 'grid', columns: 2 },
    { id: 'monthly_packages', label: 'Paket Internet Bulanan / Pendaftaran Baru', enabled: true, order: 7 },
    { id: 'contact_footer', label: 'Tombol Bantuan WhatsApp CS', enabled: true, order: 8 }
  ]
};

const REDIS_KEY = 'arbil:customer_portal_config';

/**
 * Mendapatkan konfigurasi template & layout Customer Portal
 */
export async function getPortalConfig(req: Request, res: Response) {
  try {
    // 1. Cek cache Redis
    try {
      const cached = await redisGet(REDIS_KEY);
      if (cached) {
        return res.json({ success: true, config: cached, source: 'cache' });
      }
    } catch (_) {}

    // 2. Ambil dari PostgreSQL system_settings
    const row = await pool.query("SELECT value FROM system_settings WHERE key = 'customer_portal_config' LIMIT 1");
    if (row.rows.length > 0 && row.rows[0].value) {
      try {
        const parsed = JSON.parse(row.rows[0].value);
        // Merge with default to ensure backward compatibility if new keys are added
        const merged = {
          ...defaultPortalConfig,
          ...parsed,
          voucher_columns: parsed.voucher_columns || 2,
          branding: { ...defaultPortalConfig.branding, ...(parsed.branding || {}) },
          announcement: { ...defaultPortalConfig.announcement, ...(parsed.announcement || {}) },
          flash_sale: { ...defaultPortalConfig.flash_sale, ...(parsed.flash_sale || {}) },
          sections: Array.isArray(parsed.sections) && parsed.sections.length > 0 ? parsed.sections : defaultPortalConfig.sections
        };
        try {
          await redisSet(REDIS_KEY, merged, 300); // 5 menit
        } catch (_) {}
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        return res.json({ success: true, config: merged, source: 'db' });
      } catch (parseErr) {
        console.warn('Gagal parse customer_portal_config JSON:', parseErr);
      }
    }

    // 3. Fallback default
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({ success: true, config: defaultPortalConfig, source: 'default' });
  } catch (err: any) {
    console.error('Error fetching portal config:', err);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({ success: true, config: defaultPortalConfig, source: 'error_fallback' });
  }
}

/**
 * Menyimpan konfigurasi template & layout Customer Portal dari Admin
 */
export async function savePortalConfig(req: Request, res: Response) {
  try {
    const { config } = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ success: false, message: 'Format konfigurasi portal tidak valid.' });
    }

    // Pastikan struktur valid
    const cleanConfig = {
      template_theme: config.template_theme || 'dark_glass',
      primary_color: config.primary_color || 'emerald',
      voucher_columns: Number(config.voucher_columns) || 2,
      branding: {
        hotspot_name: (config.branding?.hotspot_name || 'ARBILL Hotspot & Internet').trim(),
        tagline: (config.branding?.tagline || 'Internet Cepat & Hemat').trim(),
        contact_phone: (config.branding?.contact_phone || '').trim(),
        logo_url: (config.branding?.logo_url || '').trim(),
        banner_url: (config.branding?.banner_url || '').trim()
      },
      announcement: {
        enabled: config.announcement?.enabled !== false,
        text: (config.announcement?.text || '').trim(),
        type: config.announcement?.type || 'info'
      },
      flash_sale: {
        enabled: config.flash_sale?.enabled !== false,
        title: (config.flash_sale?.title || defaultPortalConfig.flash_sale.title).trim(),
        subtitle: (config.flash_sale?.subtitle || defaultPortalConfig.flash_sale.subtitle).trim(),
        badge_label: (config.flash_sale?.badge_label || defaultPortalConfig.flash_sale.badge_label).trim(),
        end_time: config.flash_sale?.end_time || defaultPortalConfig.flash_sale.end_time,
        discount_text: (config.flash_sale?.discount_text || defaultPortalConfig.flash_sale.discount_text).trim(),
        target_package_id: config.flash_sale?.target_package_id || '',
        button_text: (config.flash_sale?.button_text || defaultPortalConfig.flash_sale.button_text).trim()
      },
      sections: Array.isArray(config.sections) ? config.sections : defaultPortalConfig.sections
    };

    const jsonStr = JSON.stringify(cleanConfig);

    await pool.query(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('customer_portal_config', $1, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [jsonStr]);

    // Hapus dan update cache Redis
    try {
      await redisDel(REDIS_KEY);
      await redisSet(REDIS_KEY, cleanConfig, 300);
    } catch (_) {}

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json({
      success: true,
      message: '✅ Konfigurasi Tampilan Pelanggan Berhasil Disimpan & Diterapkan!',
      config: cleanConfig
    });
  } catch (err: any) {
    console.error('Error saving portal config:', err);
    return res.status(500).json({
      success: false,
      message: `Gagal menyimpan konfigurasi tampilan: ${err.message}`
    });
  }
}

/**
 * Reset konfigurasi ke pengaturan default
 */
export async function resetPortalConfig(req: Request, res: Response) {
  try {
    await pool.query("DELETE FROM system_settings WHERE key = 'customer_portal_config'");
    try {
      await redisDel(REDIS_KEY);
    } catch (_) {}

    return res.json({
      success: true,
      message: '🔄 Konfigurasi tampilan berhasil dikembalikan ke standar!',
      config: defaultPortalConfig
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: `Gagal reset konfigurasi: ${err.message}` });
  }
}
