import { pool } from '../config/db.js';

export function generateInvoiceNumber() {
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const uniqueStr = Date.now().toString(36).toUpperCase().slice(-3) + Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${dateStr}-${uniqueStr}`;
}

export async function getInvoices(filters: { customer_id?: string; connection_type?: string; status?: string }) {
  let queryStr = `
    SELECT i.*, 
           c.name as customer_name_real, c.customer_code, c.phone_number as customer_phone_real, c.pppoe_username,
           p.name as current_package_name, p.price as current_package_price
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN packages p ON c.package_id = p.id
  `;
  const params: any[] = [];
  const whereClauses: string[] = [];

  if (filters.customer_id) {
    params.push(filters.customer_id);
    whereClauses.push(`i.customer_id = $${params.length}`);
  }
  if (filters.connection_type) {
    params.push(filters.connection_type);
    whereClauses.push(`i.connection_type = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    whereClauses.push(`i.status = $${params.length}`);
  }

  if (whereClauses.length > 0) {
    queryStr += ' WHERE ' + whereClauses.join(' AND ');
  }

  queryStr += ' ORDER BY i.created_at DESC';

  const result = await pool.query(queryStr, params);
  return result.rows;
}

export async function runAutoBillingJob(daysBeforeDue: number = 5) {
  try {
    console.log(`[AUTO-BILLING JOB] Scan harian pelanggan langganan (PPPoE & Hotspot Member) mendekati tanggal expired (H-${daysBeforeDue})...`);
    
    const scanRes = await pool.query(`
      SELECT c.*, p.name as package_name, p.price as package_price
      FROM customers c
      JOIN packages p ON c.package_id = p.id
      WHERE c.expired_at IS NOT NULL 
        AND c.expired_at <= (CURRENT_DATE + ($1 || ' days')::INTERVAL)
        AND (
          c.connection_type = 'pppoe' 
          OR (
            c.connection_type = 'hotspot' 
            AND COALESCE(p.type, 'subscription') != 'voucher'
          )
        )
    `, [daysBeforeDue]);

    let generatedCount = 0;

    for (const c of scanRes.rows) {
      const checkRes = await pool.query(`
        SELECT id FROM invoices 
        WHERE customer_id = $1 AND status = 'pending'
      `, [c.id]);

      if (checkRes.rows.length === 0) {
        const invId = `inv-auto-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        const invNum = generateInvoiceNumber();
        const amount = Number(c.package_price) || 0;
        const dueDate = c.expired_at 
          ? new Date(c.expired_at).toISOString().split('T')[0]
          : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        await pool.query(`
          INSERT INTO invoices (
            id, invoice_number, customer_id, customer_name, client_name, customer_phone, 
            connection_type, package_name, amount, total, status, issue_date, due_date, notes
          ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $8, 'pending', CURRENT_DATE, $9, $10)
        `, [
          invId, invNum, c.id, c.name, c.phone_number || null, 
          c.connection_type || 'pppoe', c.package_name, amount, dueDate, `Auto-Billing System H-${daysBeforeDue}`
        ]);

        generatedCount++;
      }
    }

    console.log(`[AUTO-BILLING JOB] Scan selesai: Berhasil membuat ${generatedCount} tagihan otomatis baru.`);
    return generatedCount;
  } catch (err: any) {
    console.error('[AUTO-BILLING JOB ERROR]:', err.message);
    return 0;
  }
}
