import { Request, Response } from 'express';
import { pool } from '../config/db.js';
import { getInvoices, generateInvoiceNumber, runAutoBillingJob } from '../models/invoiceModel.js';
import { createArabPayPaymentOrder } from '../services/arabpayService.js';
import { sendInvoicePaymentLinkWA } from '../services/whatsappService.js';

export async function listInvoices(req: Request, res: Response) {
  const { customer_id, connection_type, status } = req.query;

  try {
    const invoices = await getInvoices({
      customer_id: customer_id as string,
      connection_type: connection_type as string,
      status: status as string
    });
    res.json({ success: true, invoices });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function createManualInvoice(req: Request, res: Response) {
  const { customer_id, notes } = req.body;

  if (!customer_id) {
    return res.status(400).json({ success: false, message: 'ID Pelanggan (customer_id) wajib diisi.' });
  }

  try {
    const custRes = await pool.query(`
      SELECT c.*, p.name as package_name, p.price as package_price, p.validity_days
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      WHERE c.id = $1
    `, [customer_id]);

    if (custRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Data pelanggan tidak ditemukan.' });
    }

    const c = custRes.rows[0];

    // Syarat 1: Harus ada Tanggal Jatuh Tempo (expired_at)
    if (!c.expired_at) {
      return res.status(400).json({ 
        success: false, 
        message: `❌ Gagal: Pelanggan "${c.name}" belum memiliki Tanggal Jatuh Tempo (expired_at). Tagihan hanya dapat diterbitkan untuk pelanggan yang memiliki tanggal jatuh tempo.` 
      });
    }

    // Syarat 2: Hotspot Voucher eceran / harian TIDAK PERLU dibuatkan tagihan
    if (c.connection_type === 'hotspot' && (c.is_voucher || (c.package_name && c.package_name.toLowerCase().includes('voucher')))) {
      return res.status(400).json({ 
        success: false, 
        message: `❌ Gagal: Pelanggan Hotspot Voucher eceran ("${c.name}") tidak perlu dibuatkan tagihan bulanan.` 
      });
    }

    // Syarat 3: Jika pelanggan masih terbayar lunas jauh di masa depan (> 10 hari ke depan), cegah pembuatan tagihan ganda
    const expDate = new Date(c.expired_at);
    const tenDaysFromNow = new Date();
    tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);

    if (expDate > tenDaysFromNow) {
      const formattedExp = expDate.toISOString().split('T')[0];
      return res.status(400).json({
        success: false,
        message: `⚠️ Pelanggan "${c.name}" masih terbayar lunas hingga ${formattedExp}. Tagihan baru tidak perlu diterbitkan sekarang.`
      });
    }

    const pendingCheck = await pool.query(`
      SELECT * FROM invoices 
      WHERE customer_id = $1 AND status = 'pending' 
      ORDER BY created_at DESC LIMIT 1
    `, [customer_id]);

    if (pendingCheck.rows.length > 0) {
      const existingInv = pendingCheck.rows[0];
      return res.json({
        success: true,
        is_existing: true,
        message: `⚠️ Pelanggan "${c.name}" sudah memiliki Tagihan Belum Lunas (${existingInv.invoice_number}) senilai Rp ${Number(existingInv.amount || 0).toLocaleString('id-ID')}.`,
        invoice: existingInv
      });
    }

    const invId = `inv-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const invNum = generateInvoiceNumber();
    const pkgName = c.package_name || 'Paket Internet';
    const amount = Number(c.package_price) || 0;
    const connType = c.connection_type || 'pppoe';

    const dueDate = new Date(c.expired_at).toISOString().split('T')[0];

    const result = await pool.query(`
      INSERT INTO invoices (
        id, invoice_number, customer_id, customer_name, client_name, customer_phone, 
        connection_type, package_name, amount, total, status, issue_date, due_date, notes
      ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $8, 'pending', CURRENT_DATE, $9, $10)
      RETURNING *
    `, [
      invId, invNum, c.id, c.name, c.phone_number || null, 
      connType, pkgName, amount, dueDate, notes || `Tagihan Manual ${pkgName}`
    ]);

    res.json({
      success: true,
      message: `🧾 Tagihan Manual (${invNum}) senilai Rp ${amount.toLocaleString('id-ID')} berhasil dibuat untuk ${c.name}!`,
      invoice: result.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function createBatchInvoices(req: Request, res: Response) {
  const { connection_type } = req.body;

  try {
    let queryStr = `
      SELECT c.*, COALESCE(p.name, 'Paket Internet') as package_name, COALESCE(p.price, 0) as package_price
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      WHERE (c.status = 'active' OR c.status = 'isolated' OR c.status IS NULL)
        AND c.expired_at IS NOT NULL
        AND c.expired_at <= (CURRENT_DATE + INTERVAL '10 days')
        AND (
          c.connection_type = 'pppoe' 
          OR (
            c.connection_type = 'hotspot' 
            AND COALESCE(p.type, 'subscription') != 'voucher'
          )
        )
    `;
    const params: any[] = [];

    if (connection_type && connection_type !== 'all') {
      params.push(connection_type);
      queryStr += ` AND (c.connection_type = $1 OR (c.connection_type IS NULL AND $1 = 'pppoe'))`;
    }

    const custsRes = await pool.query(queryStr, params);
    let createdCount = 0;
    const createdInvoices: any[] = [];

    for (const c of custsRes.rows) {
      const existingCheck = await pool.query(`
        SELECT id FROM invoices 
        WHERE customer_id = $1 AND status = 'pending'
      `, [c.id]);

      if (existingCheck.rows.length === 0) {
        const invId = `inv-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        const invNum = generateInvoiceNumber();
        const amount = Number(c.package_price) || 0;
        const dueDate = c.expired_at 
          ? new Date(c.expired_at).toISOString().split('T')[0]
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const invRes = await pool.query(`
          INSERT INTO invoices (
            id, invoice_number, customer_id, customer_name, client_name, customer_phone, 
            connection_type, package_name, amount, total, status, issue_date, due_date, notes
          ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $8, 'pending', CURRENT_DATE, $9, $10)
          RETURNING *
        `, [
          invId, invNum, c.id, c.name, c.phone_number || null, 
          c.connection_type || 'pppoe', c.package_name, amount, dueDate, `Tagihan Masal ${c.package_name}`
        ]);

        createdCount++;
        createdInvoices.push(invRes.rows[0]);
      }
    }

    res.json({
      success: true,
      message: `⚡ Berhasil membuat ${createdCount} Tagihan Masal baru untuk pelanggan ${connection_type === 'hotspot' ? 'Hotspot' : connection_type === 'pppoe' ? 'PPPoE' : 'Seluruh Pelanggan'}!`,
      count: createdCount,
      invoices: createdInvoices
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function triggerAutoGenerate(req: Request, res: Response) {
  const { days_before_due } = req.body;
  const days = parseInt(days_before_due) || 5;

  try {
    const count = await runAutoBillingJob(days);
    res.json({
      success: true,
      message: `🤖 Auto-Billing Scan Selesai! Berhasil membuat ${count} tagihan otomatis baru untuk pelanggan yang mendekati jatuh tempo (H-${days}).`,
      count
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function payInvoice(req: Request, res: Response) {
  const { id } = req.params;
  const { payment_method } = req.body;

  try {
    const invRes = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (invRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tagihan tidak ditemukan.' });
    }
    const inv = invRes.rows[0];

    await pool.query(`
      UPDATE invoices 
      SET status = 'paid', paid_at = CURRENT_TIMESTAMP, payment_method = $1 
      WHERE id = $2
    `, [payment_method || 'Tunai/Kasir', id]);

    if (inv.customer_id) {
      const custRes = await pool.query(`
        SELECT c.*, p.validity_days, p.grace_period_days 
        FROM customers c 
        LEFT JOIN packages p ON c.package_id = p.id 
        WHERE c.id = $1
      `, [inv.customer_id]);

      if (custRes.rows.length > 0) {
        const c = custRes.rows[0];
        const vDays = c.validity_days || 30;
        const gDays = c.grace_period_days || 5;

        const baseDate = (c.expired_at && new Date(c.expired_at) > new Date()) 
          ? new Date(c.expired_at) 
          : new Date();

        const newExpDate = new Date(baseDate);
        newExpDate.setDate(newExpDate.getDate() + vDays);

        const newGraceDate = new Date(newExpDate);
        newGraceDate.setDate(newGraceDate.getDate() + gDays);

        await pool.query(`
          UPDATE customers 
          SET expired_at = $1, grace_until = $2, status = 'active' 
          WHERE id = $3
        `, [newExpDate.toISOString().split('T')[0], newGraceDate.toISOString().split('T')[0], c.id]);

        // Automatically clean up any duplicate / premature pending invoices for this customer
        await pool.query(`
          DELETE FROM invoices 
          WHERE customer_id = $1 
            AND status = 'pending' 
            AND id != $2
        `, [c.id, inv.id]);
      }
    }

    res.json({
      success: true,
      message: `🎉 Tagihan ${inv.invoice_number} berhasil DILUNASI! Masa aktif pelanggan otomatis diperpanjang.`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function createArabPayInvoiceOrder(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const invRes = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (invRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tagihan tidak ditemukan.' });
    }

    const inv = invRes.rows[0];
    if (inv.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Tagihan ini sudah lunas sebelumnya.' });
    }

    const paymentResult = await createArabPayPaymentOrder({
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      amount: Number(inv.total || inv.amount || 0),
      customerName: inv.customer_name || inv.client_name || 'Pelanggan',
      customerPhone: inv.customer_phone || undefined,
      notes: inv.notes || `Tagihan ${inv.package_name || 'Internet'} (${inv.invoice_number})`
    });

    res.json({
      success: true,
      message: '💳 Tautan Pembayaran ArabPay & QRIS Berhasil Dibuat!',
      invoice: inv,
      ...paymentResult
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function handleArabPayCallback(req: Request, res: Response) {
  const { external_id, invoice_number, status, payment_method, paid_at } = req.body;

  try {
    const targetId = external_id || invoice_number;
    if (!targetId) {
      return res.status(400).json({ success: false, message: 'ID transaksi atau nomor tagihan tidak valid.' });
    }

    const isPaidStatus = status === 'paid' || status === 'PAID' || status === 'COMPLETED' || status === 'SUCCESS' || status === 'SETTLED';
    if (!isPaidStatus) {
      return res.json({ success: true, message: `Status pembayaran ArabPay (${status}) dicatat.` });
    }

    const invRes = await pool.query('SELECT * FROM invoices WHERE id = $1 OR invoice_number = $2', [targetId, targetId]);
    if (invRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tagihan tidak ditemukan di database.' });
    }

    const inv = invRes.rows[0];
    if (inv.status === 'paid') {
      return res.json({ success: true, message: `Tagihan ${inv.invoice_number} sudah berstatus lunas sebelumnya.` });
    }

    const payMethod = payment_method || 'ArabPay QRIS / E-Wallet Gateway';

    // 1. Update Invoice status
    await pool.query(`
      UPDATE invoices 
      SET status = 'paid', payment_method = $1, paid_at = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [payMethod, inv.id]);

    // 2. Extend customer validity & auto-un-suspend
    if (inv.customer_id) {
      const custRes = await pool.query(`
        SELECT c.*, p.validity_days, p.grace_period_days 
        FROM customers c 
        LEFT JOIN packages p ON c.package_id = p.id 
        WHERE c.id = $1
      `, [inv.customer_id]);

      if (custRes.rows.length > 0) {
        const c = custRes.rows[0];
        const vDays = c.validity_days || 30;
        const gDays = c.grace_period_days || 5;

        const baseDate = (c.expired_at && new Date(c.expired_at) > new Date()) 
          ? new Date(c.expired_at) 
          : new Date();

        const newExpDate = new Date(baseDate);
        newExpDate.setDate(newExpDate.getDate() + vDays);

        const newGraceDate = new Date(newExpDate);
        newGraceDate.setDate(newGraceDate.getDate() + gDays);

        await pool.query(`
          UPDATE customers 
          SET expired_at = $1, grace_until = $2, status = 'active' 
          WHERE id = $3
        `, [newExpDate.toISOString().split('T')[0], newGraceDate.toISOString().split('T')[0], c.id]);
      }
    }

    res.json({
      success: true,
      message: `🎉 Callback Webhook ArabPay Berhasil: Tagihan ${inv.invoice_number} telah DILUNASI!`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function sendInvoiceWhatsApp(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const invRes = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (invRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tagihan tidak ditemukan.' });
    }

    const inv = invRes.rows[0];
    const phone = inv.customer_phone;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Pelanggan tidak memiliki nomor telepon / WhatsApp.' });
    }

    const paymentResult = await createArabPayPaymentOrder({
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      amount: Number(inv.total || inv.amount || 0),
      customerName: inv.customer_name || inv.client_name || 'Pelanggan',
      customerPhone: phone,
      notes: inv.notes || `Tagihan ${inv.package_name || 'Internet'} (${inv.invoice_number})`
    });

    const waResult = await sendInvoicePaymentLinkWA({
      customerName: inv.customer_name || inv.client_name || 'Pelanggan',
      phone: phone,
      invoiceNumber: inv.invoice_number,
      amount: Number(inv.total || inv.amount || 0),
      paymentUrl: paymentResult.payment_url,
      dueDate: inv.due_date ? new Date(inv.due_date).toLocaleDateString('id-ID') : undefined
    });

    if (waResult.success) {
      res.json({
        success: true,
        message: `📱 Pesan WhatsApp & Tautan Bayar ArabPay berhasil dikirim ke ${phone}!`,
        payment_url: paymentResult.payment_url,
        wa_result: waResult
      });
    } else {
      res.status(500).json({
        success: false,
        message: `❌ Gagal mengirim WhatsApp: ${waResult.message}`,
        payment_url: paymentResult.payment_url
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Create S2S Checkout (Matching arbiljs onCreateCheckout)
 */
export async function createCheckout(req: Request, res: Response) {
  try {
    const { createS2SCheckout } = await import('../services/arabpayService.js');
    const result = await createS2SCheckout(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Pay with 6-Digit PIN (Matching arbiljs onPayWithPin)
 * Token JWT diambil dari: body > cookie > database
 */
export async function payWithPin(req: Request, res: Response) {
  try {
    const { payCheckoutWithPin } = await import('../services/arabpayService.js');
    const { checkout_id, pin, user_id, token_jwt } = req.body;

    // Cari token_jwt dari berbagai sumber (prioritas: body > cookie > database)
    let resolvedToken = token_jwt || '';

    // Coba dari cookie arabpay_token
    if (!resolvedToken && req.cookies?.arabpay_token) {
      resolvedToken = req.cookies.arabpay_token;
    }

    // Coba dari database berdasarkan user_id
    if (!resolvedToken && user_id) {
      try {
        const userRow = await pool.query(
          `SELECT arabpay_token FROM users WHERE id = $1 OR arabpay_user_id = $1 LIMIT 1`,
          [user_id]
        );
        if (userRow.rows.length > 0 && userRow.rows[0].arabpay_token) {
          resolvedToken = userRow.rows[0].arabpay_token;
        }
      } catch (dbErr: any) {
        console.warn('[payWithPin] Gagal ambil token dari DB:', dbErr.message);
      }
    }

    if (!resolvedToken) {
      return res.status(400).json({
        success: false,
        error: 'Token sesi ArabPay tidak ditemukan. Silakan login ulang dengan ArabPay.'
      });
    }

    const result = await payCheckoutWithPin({
      checkout_id,
      pin,
      token_jwt: resolvedToken,
      user_id
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Check Checkout Status (Matching arbiljs onCheckCheckoutStatus)
 */
export async function getCheckoutStatus(req: Request, res: Response) {
  try {
    const { checkCheckoutStatus } = await import('../services/arabpayService.js');
    const result = await checkCheckoutStatus(req.params.id || (req.query.id as string) || '');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function deleteInvoice(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM invoices WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tagihan tidak ditemukan.' });
    }
    return res.json({ success: true, message: 'Invoice tagihan berhasil dihapus.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}



