import { Router } from 'express';
import { getPortalConfig, savePortalConfig, resetPortalConfig } from '../controllers/portalController.js';
import { 
  requestArabPayTopup, 
  checkArabPayTopupStatus, 
  fetchPendingArabPayPayments, 
  cancelArabPayPaymentOrder 
} from '../services/arabpayService.js';
import { pool } from '../config/db.js';

const router = Router();

router.get('/portal-config', getPortalConfig);
router.post('/portal-config', savePortalConfig);
router.post('/portal-config/reset', resetPortalConfig);

router.post('/topup', async (req, res) => {
  try {
    const { phone_number, user_id, amount, channel } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Nominal topup wajib diisi' });
    }
    const result = await requestArabPayTopup({
      phoneNumber: phone_number,
      userId: user_id,
      amount: Number(amount),
      channel: channel || 'qris'
    });
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/topup-status', async (req, res) => {
  try {
    const reference_id = (req.query.reference_id as string) || (req.query.ref as string);
    if (!reference_id) {
      return res.status(400).json({ success: false, error: 'reference_id is required' });
    }
    const result = await checkArabPayTopupStatus(reference_id);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/topup-status', async (req, res) => {
  try {
    const reference_id = req.body.reference_id || req.body.ref || (req.query.reference_id as string);
    if (!reference_id) {
      return res.status(400).json({ success: false, error: 'reference_id is required' });
    }
    const result = await checkArabPayTopupStatus(reference_id);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * ⚡ GET /api/portal/pending-payments
 * Mengambil semua transaksi pending yang belum dibayar:
 * 1. Jalur Top Up Saldo ArabPay (pending di ArabPay)
 * 2. Jalur Beli Voucher / Tagihan Internet (pending di ArabPay checkouts / Arbill invoices)
 */
router.get('/pending-payments', async (req, res) => {
  try {
    const userId = (req.query.user_id as string) || '';
    const phone = (req.query.phone_number as string) || (req.query.phone as string) || '';
    const token = (req.headers.authorization?.replace(/^Bearer\s+/i, '') as string) || (req.query.token as string) || '';

    // 1. Ambil data pending dari ArabPay (baik Topup maupun Checkout)
    const arabpayOrders = await fetchPendingArabPayPayments({
      userId,
      phone,
      token
    });

    // 2. Ambil data pending invoices dari database Arbill (jika ada tagihan internet manual / pppoe)
    let arbillInvoices: any[] = [];
    if (pool && (phone || userId)) {
      try {
        const invRes = await pool.query(`
          SELECT id, invoice_number, customer_name, customer_phone, package_name, amount, total, status, payment_method, notes, created_at, due_date
          FROM invoices
          WHERE (customer_phone = $1 OR user_id = $2)
            AND status IN ('pending', 'unpaid')
          ORDER BY created_at DESC LIMIT 10
        `, [phone || '__NONE__', userId || '__NONE__']);
        arbillInvoices = invRes.rows;
      } catch (dbErr: any) {
        console.warn('[Pending Payments DB Warning]:', dbErr.message);
      }
    }

    // 3. Gabungkan dan deduplikasi data
    const combined: any[] = [...arabpayOrders];

    for (const inv of arbillInvoices) {
      // Cek apakah invoice ini sudah terwakili di arabpayOrders lewat checkout_id atau reference_id
      const exists = combined.some(o => 
        o.reference_id === inv.invoice_number || 
        o.id === inv.id || 
        (inv.notes && inv.notes.includes(o.reference_id))
      );

      if (!exists) {
        combined.push({
          id: inv.id,
          amount: Number(inv.total || inv.amount || 0),
          base_amount: Number(inv.amount || 0),
          unique_code: 0,
          type: 'invoice',
          channel_type: 'jalur_tagihan',
          title: inv.package_name ? `Tagihan Internet ${inv.package_name}` : `Tagihan Internet #${inv.invoice_number}`,
          checkout_id: null,
          reference_id: inv.invoice_number,
          payment_method: inv.payment_method || 'Online Payment',
          qr_image: null,
          qr_string: '',
          va_number: null,
          bank_name: null,
          payment_url: null,
          created_at: inv.created_at,
          expires_at: inv.due_date || null,
          status: 'pending'
        });
      }
    }

    const totalAmount = combined.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

    return res.json({
      success: true,
      count: combined.length,
      total_amount: totalAmount,
      pending_payments: combined
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, pending_payments: [] });
  }
});

/**
 * ⚡ POST /api/portal/pending-payments/cancel
 * Membatalkan transaksi pending (Top Up / Beli Voucher / Tagihan)
 */
router.post('/pending-payments/cancel', async (req, res) => {
  try {
    const { id, reference_id, checkout_id, type } = req.body;
    const targetId = reference_id || id || checkout_id;

    if (!targetId) {
      return res.status(400).json({ success: false, error: 'id atau reference_id wajib disertakan.' });
    }

    // 1. Batalkan di ArabPay (Top Up atau Checkout)
    await cancelArabPayPaymentOrder(targetId);

    // 2. Batalkan di Arbill PostgreSQL invoices jika ada
    if (pool) {
      try {
        await pool.query(
          "UPDATE invoices SET status = 'cancelled' WHERE id = $1 OR invoice_number = $1",
          [targetId]
        );
      } catch (dbErr: any) {
        console.warn('[Cancel Invoice DB Warning]:', dbErr.message);
      }
    }

    return res.json({
      success: true,
      message: 'Pembayaran pending berhasil dibatalkan.'
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
