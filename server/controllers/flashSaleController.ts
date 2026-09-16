import { Request, Response } from 'express';
import { pool } from '../config/db.js';

export interface FlashSaleRow {
  id: string;
  title: string;
  subtitle: string;
  badge_label: string;
  discount_text: string;
  router_id: string | null;
  target_package_id: string | null;
  target_package_name: string | null;
  original_price: number;
  promo_price: number;
  quota_limit: number;
  quota_sold: number;
  max_per_user: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  button_text: string;
  created_at: string;
  updated_at: string;
}

/**
 * Mendapatkan daftar seluruh kampanye Flash Sale
 * Query param `active_only=true` untuk Customer Portal (hanya yang aktif dan belum expired)
 */
export async function listFlashSales(req: Request, res: Response) {
  try {
    const { active_only } = req.query;

    let query = `
      SELECT 
        fs.*,
        r.name as router_name,
        r.hotspot_ip,
        r.dns_name
      FROM flash_sales fs
      LEFT JOIN routers r ON fs.router_id = r.id
    `;
    const params: any[] = [];

    if (active_only === 'true') {
      query += ` WHERE fs.is_active = true AND fs.end_time > NOW()`;
    }

    query += ` ORDER BY fs.created_at DESC`;

    const result = await pool.query(query, params);

    const items = result.rows.map((row: any) => {
      const orig = Number(row.original_price) || 0;
      const promo = Number(row.promo_price) || 0;
      const limit = Number(row.quota_limit) || 50;
      const sold = Number(row.quota_sold) || 0;
      const isExpired = row.end_time ? new Date(row.end_time).getTime() < Date.now() : false;
      const isSoldOut = sold >= limit;
      const discountPercent = orig > promo && orig > 0 ? Math.max(1, Math.round(((orig - promo) / orig) * 100)) : 0;

      return {
        ...row,
        original_price: orig,
        promo_price: promo,
        quota_limit: limit,
        quota_sold: sold,
        max_per_user: Number(row.max_per_user) || 1,
        remaining_quota: Math.max(0, limit - sold),
        is_expired: isExpired,
        is_sold_out: isSoldOut,
        discount_percent: discountPercent
      };
    });

    res.json({
      success: true,
      flash_sales: items,
      total: items.length
    });
  } catch (err: any) {
    console.error('Error listFlashSales:', err);
    res.status(500).json({ success: false, message: `Gagal memuat daftar Flash Sale: ${err.message}` });
  }
}

/**
 * Membuat paket/kampanye Flash Sale baru
 */
export async function createFlashSale(req: Request, res: Response) {
  try {
    const {
      title,
      subtitle,
      badge_label,
      discount_text,
      router_id,
      target_package_id,
      target_package_name,
      original_price,
      promo_price,
      quota_limit,
      max_per_user,
      end_time,
      is_active,
      button_text
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Judul promo Flash Sale wajib diisi.' });
    }

    const id = `fs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const orig = Math.max(0, Number(original_price) || 0);
    const promo = Math.max(0, Number(promo_price) || 0);
    const quota = Math.max(1, Number(quota_limit) || 50);
    const maxUser = Math.max(1, Number(max_per_user) || 1);
    const targetEnd = end_time ? new Date(end_time).toISOString() : new Date(Date.now() + 48 * 3600 * 1000).toISOString();

    const insertResult = await pool.query(`
      INSERT INTO flash_sales (
        id, title, subtitle, badge_label, discount_text,
        router_id, target_package_id, target_package_name,
        original_price, promo_price, quota_limit, quota_sold, max_per_user,
        end_time, is_active, button_text, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, 0, $12,
        $13, $14, $15, NOW(), NOW()
      )
      RETURNING *
    `, [
      id,
      title.trim(),
      (subtitle || 'Dapatkan voucher hotspot dengan harga spesial!').trim(),
      (badge_label || 'FLASH SALE').trim(),
      discount_text ? discount_text.trim() : null,
      router_id || null,
      target_package_id || null,
      target_package_name || null,
      orig,
      promo,
      quota,
      maxUser,
      targetEnd,
      is_active !== false,
      (button_text || 'Beli Promo Flash Sale').trim()
    ]);

    res.status(201).json({
      success: true,
      message: '⚡ Promo Flash Sale baru berhasil dibuat!',
      flash_sale: insertResult.rows[0]
    });
  } catch (err: any) {
    console.error('Error createFlashSale:', err);
    res.status(500).json({ success: false, message: `Gagal membuat Flash Sale: ${err.message}` });
  }
}

/**
 * Mengubah paket/kampanye Flash Sale
 */
export async function updateFlashSale(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const {
      title,
      subtitle,
      badge_label,
      discount_text,
      router_id,
      target_package_id,
      target_package_name,
      original_price,
      promo_price,
      quota_limit,
      quota_sold,
      max_per_user,
      end_time,
      is_active,
      button_text
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Judul promo Flash Sale wajib diisi.' });
    }

    const check = await pool.query('SELECT id FROM flash_sales WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Paket Flash Sale tidak ditemukan.' });
    }

    const orig = Math.max(0, Number(original_price) || 0);
    const promo = Math.max(0, Number(promo_price) || 0);
    const quota = Math.max(1, Number(quota_limit) || 50);
    const maxUser = Math.max(1, Number(max_per_user) || 1);
    const targetEnd = end_time ? new Date(end_time).toISOString() : new Date(Date.now() + 48 * 3600 * 1000).toISOString();

    let query = `
      UPDATE flash_sales SET
        title = $1,
        subtitle = $2,
        badge_label = $3,
        discount_text = $4,
        router_id = $5,
        target_package_id = $6,
        target_package_name = $7,
        original_price = $8,
        promo_price = $9,
        quota_limit = $10,
        max_per_user = $11,
        end_time = $12,
        is_active = $13,
        button_text = $14,
        updated_at = NOW()
    `;
    const params: any[] = [
      title.trim(),
      (subtitle || '').trim(),
      (badge_label || 'FLASH SALE').trim(),
      discount_text ? discount_text.trim() : null,
      router_id || null,
      target_package_id || null,
      target_package_name || null,
      orig,
      promo,
      quota,
      maxUser,
      targetEnd,
      is_active !== false,
      (button_text || 'Beli Promo Flash Sale').trim()
    ];

    if (quota_sold !== undefined) {
      params.push(Math.max(0, Number(quota_sold) || 0));
      query += `, quota_sold = $${params.length}`;
    }

    params.push(id);
    query += ` WHERE id = $${params.length} RETURNING *`;

    const updateResult = await pool.query(query, params);

    res.json({
      success: true,
      message: '✅ Promo Flash Sale berhasil diperbarui!',
      flash_sale: updateResult.rows[0]
    });
  } catch (err: any) {
    console.error('Error updateFlashSale:', err);
    res.status(500).json({ success: false, message: `Gagal memperbarui Flash Sale: ${err.message}` });
  }
}

/**
 * Menghapus paket/kampanye Flash Sale
 */
export async function deleteFlashSale(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM flash_sales WHERE id = $1 RETURNING id, title', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Paket Flash Sale tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `🗑️ Promo Flash Sale "${result.rows[0].title}" berhasil dihapus!`
    });
  } catch (err: any) {
    console.error('Error deleteFlashSale:', err);
    res.status(500).json({ success: false, message: `Gagal menghapus Flash Sale: ${err.message}` });
  }
}

/**
 * Mengaktifkan / Men-nonaktifkan status Flash Sale
 */
export async function toggleFlashSaleStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const result = await pool.query(`
      UPDATE flash_sales 
      SET is_active = COALESCE($1, NOT is_active), updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [is_active !== undefined ? is_active : null, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Paket Flash Sale tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: `Status promo berhasil diubah menjadi ${result.rows[0].is_active ? 'Aktif' : 'Nonaktif'}!`,
      flash_sale: result.rows[0]
    });
  } catch (err: any) {
    console.error('Error toggleFlashSaleStatus:', err);
    res.status(500).json({ success: false, message: `Gagal mengubah status: ${err.message}` });
  }
}

/**
 * Mereset jumlah kuota terjual (quota_sold) menjadi 0
 */
export async function resetFlashSaleQuota(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      UPDATE flash_sales
      SET quota_sold = 0, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Paket Flash Sale tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: '🔄 Kuota terjual berhasil di-reset kembali ke 0!',
      flash_sale: result.rows[0]
    });
  } catch (err: any) {
    console.error('Error resetFlashSaleQuota:', err);
    res.status(500).json({ success: false, message: `Gagal mereset kuota: ${err.message}` });
  }
}

/**
 * Mengambil daftar pembeli voucher promo Flash Sale (per kampanye atau seluruhnya)
 */
export async function getFlashSaleBuyersList(req: Request, res: Response) {
  try {
    const { flash_sale_id } = req.query;

    let query = `
      SELECT 
        i.id as invoice_id,
        i.invoice_number,
        COALESCE(i.customer_name, 'Pelanggan Hotspot') as customer_name,
        COALESCE(i.customer_phone, '') as customer_phone,
        i.user_id as arabpay_user_id,
        COALESCE(i.package_name, 'Voucher Flash Sale') as package_name,
        COALESCE(i.amount, 0)::int as amount,
        COALESCE(i.payment_method, 'ArabPay E-Wallet') as payment_method,
        i.status as payment_status,
        COALESCE(i.paid_at, i.created_at) as purchased_at,
        i.notes,
        i.flash_sale_id,
        fs.title as flash_sale_title,
        v.id as voucher_id,
        COALESCE(v.code, i.voucher_code, '') as voucher_code,
        COALESCE(v.password, '') as voucher_password,
        v.status as voucher_status,
        v.first_login_at,
        v.mac_address,
        v.ip_address,
        v.expired_at,
        r.name as router_name,
        r.hotspot_ip,
        r.dns_name
      FROM invoices i
      LEFT JOIN flash_sales fs ON i.flash_sale_id = fs.id
      LEFT JOIN hotspot_vouchers v ON (
        i.voucher_id = v.id 
        OR (i.voucher_code IS NOT NULL AND i.voucher_code <> '' AND v.code = i.voucher_code) 
        OR i.invoice_number = v.invoice_number
      )
      LEFT JOIN routers r ON (v.router_id = r.id OR fs.router_id = r.id)
      WHERE 
    `;

    const params: any[] = [];
    if (flash_sale_id && String(flash_sale_id).trim()) {
      params.push(String(flash_sale_id).trim());
      query += ` i.flash_sale_id = $1 `;
    } else {
      query += ` i.flash_sale_id IS NOT NULL `;
    }

    query += ` ORDER BY COALESCE(i.paid_at, i.created_at) DESC LIMIT 500`;

    const result = await pool.query(query, params);

    const buyers = result.rows.map(row => {
      const isUsed = Boolean(row.first_login_at || row.mac_address || row.voucher_status === 'used');
      const isExpired = row.expired_at ? new Date(row.expired_at).getTime() < Date.now() : false;
      let usageStatus = 'unused';
      let usageLabel = 'Belum Dipakai (Siap Login)';
      if (isUsed && !isExpired) {
        usageStatus = 'active';
        usageLabel = 'Sedang Digunakan di WiFi';
      } else if (isUsed && isExpired) {
        usageStatus = 'expired';
        usageLabel = 'Masa Aktif Habis (Selesai)';
      }

      return {
        invoice_id: row.invoice_id,
        invoice_number: row.invoice_number,
        customer_name: row.customer_name,
        customer_phone: row.customer_phone,
        arabpay_user_id: row.arabpay_user_id,
        package_name: row.package_name,
        amount: row.amount,
        payment_method: row.payment_method,
        payment_status: row.payment_status,
        purchased_at: row.purchased_at,
        flash_sale_id: row.flash_sale_id,
        flash_sale_title: row.flash_sale_title,
        voucher_id: row.voucher_id,
        voucher_code: row.voucher_code,
        voucher_password: row.voucher_password,
        usage_status: usageStatus,
        usage_label: usageLabel,
        first_login_at: row.first_login_at,
        mac_address: row.mac_address,
        ip_address: row.ip_address,
        expired_at: row.expired_at,
        router_name: row.router_name || 'Router MikroTik Utama',
        hotspot_ip: row.hotspot_ip || '10.0.0.1',
        dns_name: row.dns_name || 'arab.net'
      };
    });

    const usedCount = buyers.filter(b => b.usage_status === 'active' || b.usage_status === 'expired').length;
    const unusedCount = buyers.filter(b => b.usage_status === 'unused').length;
    const totalRevenue = buyers.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

    res.json({
      success: true,
      buyers: buyers,
      total_buyers: buyers.length,
      used_count: usedCount,
      unused_count: unusedCount,
      total_revenue: totalRevenue
    });
  } catch (err: any) {
    console.error('Error getFlashSaleBuyersList:', err);
    res.status(500).json({ success: false, message: `Gagal memuat pembeli flash sale: ${err.message}` });
  }
}
