import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db.js';

/**
 * Middleware: Verify API Secret from Request Headers
 * Accepts:
 *   - Header: `X-Arbill-Secret: arb_sec_...`
 *   - Header: `Authorization: Bearer arb_sec_...`
 */
export async function verifyApiSecretMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers['authorization'];
    const secretHeader = req.headers['x-arbill-secret'];

    let providedSecret = '';
    if (typeof secretHeader === 'string' && secretHeader.trim()) {
      providedSecret = secretHeader.trim();
    } else if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      providedSecret = authHeader.substring(7).trim();
    }

    if (!providedSecret) {
      return res.status(401).json({
        success: false,
        message: 'Akses ditolak: API Secret tidak ditemukan. Sertakan header X-Arbill-Secret atau Authorization: Bearer <token>.'
      });
    }

    if (!pool) {
      return res.status(500).json({ success: false, message: 'Database connection not ready' });
    }

    const result = await pool.query(
      "SELECT value FROM system_settings WHERE key = 'arbill_chat_api_secret' LIMIT 1"
    );

    if (result.rows.length === 0 || !result.rows[0].value) {
      return res.status(400).json({
        success: false,
        message: 'API Secret belum dibuat di Arbill. Buka menu Pengaturan > API Secret di Arbill untuk membuat secret baru.'
      });
    }

    const storedSecret = result.rows[0].value;
    if (providedSecret !== storedSecret) {
      return res.status(401).json({
        success: false,
        message: 'Akses ditolak: API Secret salah atau tidak cocok.'
      });
    }

    // Secret is valid!
    next();
  } catch (err: any) {
    console.error('[INTEGRATION AUTH ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/integration/ping
 * Handshake endpoint to test connection between Arbill-Chat and ArbillBaru
 */
export async function pingIntegration(req: Request, res: Response) {
  try {
    let businessName = 'Arbill ISP & Billing';
    if (pool) {
      const bRes = await pool.query("SELECT value FROM system_settings WHERE key = 'business_name' LIMIT 1");
      if (bRes.rows.length > 0 && bRes.rows[0].value) {
        businessName = bRes.rows[0].value;
      }
    }

    return res.json({
      success: true,
      status: 'connected',
      message: 'Koneksi API Secret valid. ArbillBaru siap menerima permintaan dari Arbill-Chat / AI.',
      app: 'ArbillBaru',
      version: '2.0',
      business_name: businessName,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/integration/invoices
 * Look up invoices for a customer
 * Query params:
 *   - query: string (phone / customer_code / username / invoice_number)
 *   - phone: string
 *   - invoice_number: string
 *   - status: 'paid' | 'pending' | 'all'
 */
export async function getInvoicesIntegration(req: Request, res: Response) {
  try {
    const query = (req.query.query as string || req.query.q as string || '').trim();
    const phone = (req.query.phone as string || '').trim();
    const invoiceNumber = (req.query.invoice_number as string || '').trim();
    const status = (req.query.status as string || '').trim();

    if (!query && !phone && !invoiceNumber) {
      return res.status(400).json({
        success: false,
        message: 'Parameter pencarian wajib diisi (contoh: ?query=08123456789 atau ?phone=08123456789 atau ?invoice_number=INV-...)'
      });
    }

    const params: any[] = [];
    const whereClauses: string[] = [];

    // Filter by invoice number directly if requested
    if (invoiceNumber) {
      params.push(`%${invoiceNumber}%`);
      whereClauses.push(`i.invoice_number ILIKE $${params.length}`);
    }

    // Filter by phone or general search term
    const searchTerm = query || phone;
    if (searchTerm) {
      const cleanPhone = searchTerm.replace(/[^0-9]/g, '');
      let corePhone = cleanPhone;
      if (corePhone.startsWith('62') && corePhone.length >= 10) {
        corePhone = corePhone.slice(2);
      } else if (corePhone.startsWith('0') && corePhone.length >= 9) {
        corePhone = corePhone.slice(1);
      }

      if (cleanPhone.length >= 4) {
        params.push(`%${corePhone}%`);
        params.push(`%${cleanPhone}%`);
        params.push(`%${searchTerm}%`);
        whereClauses.push(`(
          i.customer_phone LIKE $${params.length - 2} OR 
          c.phone_number LIKE $${params.length - 2} OR 
          i.customer_phone LIKE $${params.length - 1} OR 
          c.phone_number LIKE $${params.length - 1} OR 
          c.customer_code ILIKE $${params.length} OR 
          c.pppoe_username ILIKE $${params.length} OR 
          c.name ILIKE $${params.length} OR
          i.customer_name ILIKE $${params.length} OR
          i.invoice_number ILIKE $${params.length}
        )`);
      } else {
        params.push(`%${searchTerm}%`);
        whereClauses.push(`(
          c.customer_code ILIKE $${params.length} OR 
          c.pppoe_username ILIKE $${params.length} OR 
          c.name ILIKE $${params.length} OR
          i.customer_name ILIKE $${params.length} OR
          i.invoice_number ILIKE $${params.length}
        )`);
      }
    }

    if (status && status !== 'all') {
      params.push(status);
      whereClauses.push(`i.status = $${params.length}`);
    }

    const sql = `
      SELECT 
        i.id,
        i.invoice_number,
        i.status,
        i.amount,
        i.total,
        i.issue_date,
        i.due_date,
        i.paid_at,
        i.payment_method,
        i.connection_type,
        i.notes,
        c.id as customer_id,
        c.name as customer_name,
        c.customer_code,
        c.phone_number as customer_phone,
        c.pppoe_username,
        c.address as customer_address,
        p.name as package_name,
        p.price as package_price,
        p.speed_limit
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN packages p ON c.package_id = p.id
      ${whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''}
      ORDER BY i.created_at DESC
      LIMIT 20
    `;

    const result = await pool.query(sql, params);
    const invoices = result.rows;

    // Build intelligent summary for AI Bot
    let summary = '';
    const unpaidList = invoices.filter(inv => inv.status !== 'paid');
    const paidList = invoices.filter(inv => inv.status === 'paid');

    if (invoices.length === 0) {
      summary = `Tidak ditemukan tagihan untuk pencarian "${searchTerm || invoiceNumber}".`;
    } else {
      const custName = invoices[0].customer_name || invoices[0].customer_name_real || 'Pelanggan';
      if (unpaidList.length > 0) {
        const latestUnpaid = unpaidList[0];
        const dueDateStr = latestUnpaid.due_date ? new Date(latestUnpaid.due_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
        summary = `Pelanggan ${custName} memiliki ${unpaidList.length} tagihan BELUM LUNAS. Tagihan terbaru no ${latestUnpaid.invoice_number} senilai Rp ${Number(latestUnpaid.total || latestUnpaid.amount).toLocaleString('id-ID')} dengan batas jatuh tempo ${dueDateStr}.`;
      } else {
        const latestPaid = paidList[0];
        const paidDateStr = latestPaid.paid_at ? new Date(latestPaid.paid_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
        summary = `Pelanggan ${custName} SUDAH LUNAS. Tagihan terakhir (${latestPaid.invoice_number}) senilai Rp ${Number(latestPaid.total || latestPaid.amount).toLocaleString('id-ID')} telah dibayar pada ${paidDateStr}.`;
      }
    }

    return res.json({
      success: true,
      found: invoices.length > 0,
      total_found: invoices.length,
      unpaid_count: unpaidList.length,
      summary: summary,
      invoices: invoices.map(inv => ({
        invoice_number: inv.invoice_number,
        status: inv.status,
        is_paid: inv.status === 'paid',
        amount: Number(inv.amount || 0),
        total: Number(inv.total || inv.amount || 0),
        due_date: inv.due_date,
        paid_at: inv.paid_at,
        payment_method: inv.payment_method,
        package_name: inv.package_name,
        customer: {
          name: inv.customer_name,
          phone: inv.customer_phone,
          customer_code: inv.customer_code,
          username: inv.pppoe_username,
          address: inv.customer_address
        }
      }))
    });
  } catch (err: any) {
    console.error('[INTEGRATION INVOICES ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/integration/customer
 * Look up customer status (profile, active package, expiry date, router online status)
 * Query params:
 *   - query: string (phone / username / customer_code / name)
 */
export async function getCustomerIntegration(req: Request, res: Response) {
  try {
    const query = (req.query.query as string || req.query.q as string || req.query.phone as string || '').trim();

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Parameter pencarian pelanggan wajib diisi (contoh: ?query=08123456789 atau username)'
      });
    }

    const cleanPhone = query.replace(/[^0-9]/g, '');
    let corePhone = cleanPhone;
    if (corePhone.startsWith('62') && corePhone.length >= 10) {
      corePhone = corePhone.slice(2);
    } else if (corePhone.startsWith('0') && corePhone.length >= 9) {
      corePhone = corePhone.slice(1);
    }

    const params: any[] = [];
    let whereClause = '';

    if (cleanPhone.length >= 4) {
      params.push(`%${corePhone}%`);
      params.push(`%${cleanPhone}%`);
      params.push(`%${query}%`);
      whereClause = `(c.phone_number LIKE $1 OR c.phone_number LIKE $2 OR c.customer_code ILIKE $3 OR c.pppoe_username ILIKE $3 OR c.name ILIKE $3)`;
    } else {
      params.push(`%${query}%`);
      whereClause = `(c.customer_code ILIKE $1 OR c.pppoe_username ILIKE $1 OR c.name ILIKE $1)`;
    }

    const sql = `
      SELECT 
        c.id,
        c.name,
        c.customer_code,
        c.phone_number,
        c.address,
        c.connection_type,
        c.pppoe_username,
        c.static_ip,
        c.installation_date,
        c.expired_at,
        c.grace_until,
        c.status as customer_status,
        p.name as package_name,
        p.price as package_price,
        p.speed_limit,
        r.name as router_name,
        r.ip_address as router_ip
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      LEFT JOIN routers r ON c.router_id = r.id
      WHERE ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT 5
    `;

    const result = await pool.query(sql, params);
    const customers = result.rows;

    if (customers.length === 0) {
      return res.json({
        success: true,
        found: false,
        summary: `Pelanggan dengan kata kunci "${query}" tidak ditemukan di database.`,
        customers: []
      });
    }

    const c = customers[0];
    const isExpired = c.expired_at ? new Date(c.expired_at).getTime() < Date.now() : false;
    const expiryStr = c.expired_at ? new Date(c.expired_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Tidak ada batas waktu';

    const summary = `Pelanggan: ${c.name} (${c.customer_code || '-'}), Paket: ${c.package_name || 'Standar'} (${c.speed_limit || '-'}), Status Layanan: ${isExpired ? 'KADALUARSA / ISOLIR' : 'AKTIF'}, Masa Aktif hingga: ${expiryStr}.`;

    return res.json({
      success: true,
      found: true,
      total_found: customers.length,
      summary: summary,
      customer: {
        id: c.id,
        name: c.name,
        customer_code: c.customer_code,
        phone_number: c.phone_number,
        address: c.address,
        connection_type: c.connection_type,
        username: c.pppoe_username,
        package_name: c.package_name,
        package_price: Number(c.package_price || 0),
        speed_limit: c.speed_limit,
        expired_at: c.expired_at,
        is_expired: isExpired,
        status: c.customer_status,
        router_name: c.router_name
      }
    });
  } catch (err: any) {
    console.error('[INTEGRATION CUSTOMER ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/integration/packages
 * List active internet packages
 */
export async function getPackagesIntegration(req: Request, res: Response) {
  try {
    const result = await pool.query(`
      SELECT id, name, type, price, speed_limit, validity_iso, is_active
      FROM packages
      WHERE is_active = true
      ORDER BY price ASC
    `);

    const packages = result.rows.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      price: Number(p.price || 0),
      price_formatted: `Rp ${Number(p.price || 0).toLocaleString('id-ID')}`,
      speed_limit: p.speed_limit,
      validity: p.validity_iso
    }));

    return res.json({
      success: true,
      total: packages.length,
      packages: packages
    });
  } catch (err: any) {
    console.error('[INTEGRATION PACKAGES ERROR]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
