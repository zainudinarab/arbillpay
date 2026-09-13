import { Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../config/db.js';
import { getAllVouchers, generateRandomCode, deleteBatchVouchers } from '../models/voucherModel.js';
import { RouterOSAPI } from 'node-routeros';
import { getFirestore } from '../config/firebase.js';
import { isoToMikrotikTime } from './mikrotikController.js';

export async function listVouchers(req: Request, res: Response) {
  try {
    const vouchers = await getAllVouchers();
    res.json({ success: true, vouchers });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function generateBatchVouchers(req: Request, res: Response) {
  const { router_id, router_profile_id, count, code_length, code_prefix, char_type } = req.body;

  if (!router_id || !router_profile_id || !count) {
    return res.status(400).json({ success: false, message: 'Router, Profile Hotspot, dan Jumlah Voucher wajib diisi.' });
  }

  const numCount = Math.min(Math.max(parseInt(count) || 1, 1), 200);
  const len = parseInt(code_length) || 6;
  const prefix = code_prefix?.trim() || '';
  const cType = char_type || 'lower';

  try {
    const rRes = await pool.query('SELECT * FROM routers WHERE id = $1', [router_id]);
    if (rRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Router Mikrotik tidak ditemukan.' });
    }
    const router = rRes.rows[0];

    const pRes = await pool.query(`
      SELECT rp.*, p.uptime_limit, p.validity_iso 
      FROM router_profiles rp 
      LEFT JOIN packages p ON rp.package_id = p.id 
      WHERE rp.id = $1
    `, [router_profile_id]);
    if (pRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profile Mikrotik tidak ditemukan.' });
    }
    const profile = pRes.rows[0];
    const formattedUptime = profile.uptime_limit ? isoToMikrotikTime(profile.uptime_limit) : '';

    const batchId = `vc-batch-${Date.now().toString(36)}`;
    const createdVouchers: Array<{ id: string; code: string; password: string }> = [];

    let livePushSuccess = false;
    let livePushNote = '';
    let conn: any = null;

    try {
      conn = new RouterOSAPI({
        host: router.ip_address,
        port: router.api_port || 8728,
        user: router.username || 'admin',
        password: router.password || '',
        timeout: 8
      });
      await conn.connect();
      livePushSuccess = true;
    } catch (e: any) {
      livePushNote = ` (Catatan Router: ${e.message})`;
    }

    const now = new Date();
    const batchDate = `${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}.${String(now.getFullYear()).slice(-2)}`;

    for (let i = 0; i < numCount; i++) {
      const vId = `vc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const vCode = generateRandomCode(len, cType, prefix);
      const vPass = vCode;
      const vComment = `vc-${vCode}-${batchDate}-arbil|${profile.name}`;

      await pool.query(`
        INSERT INTO hotspot_vouchers (id, batch_id, router_id, router_profile_id, code, password, status, comment)
        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
      `, [vId, batchId, router_id, router_profile_id, vCode, vPass, vComment]);

      if (livePushSuccess && conn) {
        try {
          const hsUserParams = [
            `=name=${vCode}`,
            `=password=${vPass}`,
            `=profile=${profile.name}`,
            `=comment=${vComment}`
          ];
          if (formattedUptime) {
            hsUserParams.push(`=limit-uptime=${formattedUptime}`);
          }
          await conn.write('/ip/hotspot/user/add', hsUserParams);
        } catch (err) {}
      }

      createdVouchers.push({ id: vId, code: vCode, password: vPass });
    }

    if (conn) {
      try { conn.close(); } catch (e) {}
    }

    res.json({
      success: true,
      message: `⚡ Berhasil membuat ${numCount} Voucher Hotspot untuk Router "${router.name}" dengan Profile "${profile.name}"!${livePushNote}`,
      batch_id: batchId,
      count: numCount,
      vouchers: createdVouchers
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function removeBatchVouchers(req: Request, res: Response) {
  const { batch_id } = req.params;

  try {
    const deletedCount = await deleteBatchVouchers(batch_id);
    res.json({
      success: true,
      message: `Berhasil menghapus ${deletedCount} voucher dalam batch ini.`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Daftar Voucher Tersedia untuk Pelanggan (publik)
 * Mengembalikan:
 * 1. Pre-generated Stock Vouchers (Stok Terbatas / Promo Diskon)
 * 2. Instant On-Demand Profiles (Selalu Ready / Generated On-the-Fly)
 */
export async function listAvailableVouchers(req: Request, res: Response) {
  // Helper to fetch from Cloud Firestore
  const fetchFromFirestore = async () => {
    const db = getFirestore();
    if (!db) return null;
    const [pkgSnap, vcSnap] = await Promise.all([
      db.collection('packages').get(),
      db.collection('hotspot_vouchers').get()
    ]);

    const packages: any[] = [];
    pkgSnap.forEach((doc: any) => {
      if (doc.id !== '_init') {
        const data = doc.data();
        if (!data.type || data.type === 'hotspot' || data.type === 'hotspot_voucher') {
          packages.push({ id: doc.id, ...data });
        }
      }
    });

    const activeVouchers: any[] = [];
    vcSnap.forEach((doc: any) => {
      if (doc.id !== '_init') {
        const data = doc.data();
        if (data.status === 'active' && !data.sold_to) {
          activeVouchers.push({ id: doc.id, ...data });
        }
      }
    });

    const ondemand = packages.map((p: any) => ({
      profile_id: p.id,
      profile_name: p.name,
      package_name: p.name,
      price: Number(p.price) || 5000,
      rate_limit: p.speed_limit || '10 Mbps',
      validity_days: Number(p.validity_days || p.validity_value) || 1,
      validity_unit: p.validity_unit || 'day',
      validity_value: Number(p.validity_value) || 1,
      quota_mb: Number(p.quota_mb) || 0,
      router_id: p.router_id || 'rtr-cloud',
      router_name: p.router_name || 'Cloud Hotspot',
      stock: 999,
      mode: 'ondemand'
    }));

    return {
      success: true,
      pregenerated: activeVouchers,
      ondemand: ondemand,
      groups: ondemand
    };
  };

  if (process.env.DB_DRIVER === 'firebase') {
    try {
      const fbResult = await fetchFromFirestore();
      if (fbResult) return res.json(fbResult);
    } catch (fbErr: any) {
      console.warn('[VOUCHERS AVAILABLE] Firebase fallback notice:', fbErr.message);
    }
  }

  try {
    // 1. Profil dengan stok voucher pre-generated (Wajib terhubung ke Paket Aktif & Profil Aktif)
    const stockResult = await pool.query(`
      SELECT
        rp.id as profile_id,
        rp.name as profile_name,
        rp.rate_limit,
        r.id as router_id,
        r.name as router_name,
        COALESCE(r.dns_name, 'arab.net') as dns_name,
        COALESCE(r.dns_name, r.name, 'arab.net') as isp_name,
        COALESCE(p.name, rp.name) as package_name,
        COALESCE(p.price, 0)::int as price,
        COALESCE(p.validity_iso, 'P1D') as validity_iso,
        COALESCE(p.quota_mb, 0)::int as quota_mb,
        COUNT(v.id)::int as stock,
        'pregenerated' as mode
      FROM router_profiles rp
      LEFT JOIN routers r ON rp.router_id = r.id
      JOIN packages p ON rp.package_id = p.id
      JOIN hotspot_vouchers v ON v.router_profile_id = rp.id AND v.status = 'active' AND v.sold_to IS NULL
      WHERE rp.package_id IS NOT NULL
        AND COALESCE(rp.is_active, true) = true
        AND COALESCE(p.is_active, true) = true
      GROUP BY rp.id, rp.name, rp.rate_limit, r.id, r.name, r.dns_name, p.name, p.price, p.validity_iso, p.quota_mb
      ORDER BY COALESCE(p.price, 0) ASC
    `);

    // 2. Ambil router_profiles bertipe 'hotspot' yang SUDAH DIHUBUNGKAN KE PAKET (rp.package_id IS NOT NULL)
    // Serta wajib: Profil Aktif (is_active = true) dan Paket Aktif (is_active = true)
    const onDemandResult = await pool.query(`
      SELECT
        rp.id as profile_id,
        rp.name as profile_name,
        p.name as package_name,
        COALESCE(p.price, 5000)::int as price,
        COALESCE(rp.rate_limit, p.speed_limit, '10 Mbps') as rate_limit,
        COALESCE(p.validity_iso, 'P1D') as validity_iso,
        COALESCE(p.quota_mb, 0)::int as quota_mb,
        COALESCE(r.id, 'rtr-pusat-01') as router_id,
        COALESCE(r.name, 'Router Utama') as router_name,
        COALESCE(r.dns_name, 'arab.net') as dns_name,
        COALESCE(r.dns_name, r.name, 'arab.net') as isp_name,
        999 as stock,
        'ondemand' as mode
      FROM router_profiles rp
      JOIN packages p ON rp.package_id = p.id
      LEFT JOIN routers r ON rp.router_id = r.id
      WHERE rp.type = 'hotspot'
        AND rp.package_id IS NOT NULL
        AND COALESCE(rp.is_active, true) = true
        AND COALESCE(p.is_active, true) = true
        AND (p.type IS NULL OR p.type = 'hotspot_voucher' OR p.type = 'hotspot')
        AND p.type != 'hotspot_monthly'
        AND p.type != 'pppoe'
      ORDER BY p.price ASC
    `);

    // Gabungkan seluruh paket yang memiliki harga valid > 0
    const groupMap = new Map<string, any>();
    
    // Utamakan paket on-demand (murni dari router_profiles & packages yang di-link)
    onDemandResult.rows.forEach((item: any) => {
      if (Number(item.price) > 0) {
        groupMap.set(item.profile_id, item);
      }
    });

    // Tambahkan paket pregenerated jika ada
    stockResult.rows.forEach((item: any) => {
      if (Number(item.price) > 0) {
        groupMap.set(item.profile_id, item);
      }
    });

    const allGroups = Array.from(groupMap.values());

    res.json({
      success: true,
      pregenerated: stockResult.rows,
      ondemand: onDemandResult.rows,
      groups: allGroups.length > 0 ? allGroups : onDemandResult.rows
    });
  } catch (err: any) {
    console.warn('[VOUCHERS AVAILABLE] Postgres query error, attempting Cloud Firestore fallback:', err.message);
    try {
      const fbResult = await fetchFromFirestore();
      if (fbResult) return res.json(fbResult);
    } catch (_) {}
  }
}

/**
 * Beli / Klaim Voucher (Mendukung 2 Metode: Pre-generated Stock OR Instant On-Demand Generation)
 * Body: { profile_id, mode ('pregenerated' | 'ondemand'), buyer_name, buyer_phone, payment_method, amount }
 */
export async function buyVoucher(req: Request, res: Response) {
  const { profile_id, mode, buyer_name, buyer_phone, payment_method, arabpay_user_id, amount, skip_arabpay_deduction } = req.body;

  if (!profile_id) {
    return res.status(400).json({ success: false, message: 'Profile voucher wajib dipilih.' });
  }

  try {
    let voucherCode = '';
    let voucherPass = '';
    let voucherId = '';
    let batchId = 'vc-instant-buy';
    let isFromPreGenerated = false;
    let livePushSuccess = false;
    let livePushError = '';

    // Generate UUID invoice dan nomor invoice di awal agar bisa saling relasi
    const invoiceId = crypto.randomUUID();
    const now = new Date();
    const invoiceNumber = `INV-VC-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Date.now().toString(36).toUpperCase()}`;

    // METODE 1: Coba ambil dari stok Pre-Generated dulu (Pre-generated Stock / Diskon)
    if (mode !== 'ondemand') {
      const vRes = await pool.query(`
        SELECT id, code, password, batch_id, comment
        FROM hotspot_vouchers
        WHERE (router_profile_id = $1 OR router_profile_id IN (SELECT id FROM router_profiles WHERE package_id = $1))
          AND status = 'active' AND sold_to IS NULL
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `, [profile_id]);

      if (vRes.rows.length > 0) {
        const preVoucher = vRes.rows[0];
        voucherId = preVoucher.id;
        voucherCode = preVoucher.code;
        voucherPass = preVoucher.password;
        batchId = preVoucher.batch_id || 'vc-batch';
        isFromPreGenerated = true;

        // Mark pre-generated voucher as sold and link invoice
        await pool.query(`
          UPDATE hotspot_vouchers
          SET status = 'sold', sold_to = $1, sold_at = NOW(), invoice_id = $2, invoice_number = $3
          WHERE id = $4
        `, [buyer_phone || buyer_name || arabpay_user_id || 'pelanggan', invoiceId, invoiceNumber, preVoucher.id]);
      }
    }

    let targetProfileName = 'Voucher Hotspot';
    if (profile_id) {
      try {
        const prRes = await pool.query('SELECT name FROM router_profiles WHERE id = $1 OR package_id = $1 LIMIT 1', [profile_id]);
        if (prRes.rows.length > 0 && prRes.rows[0].name) {
          targetProfileName = prRes.rows[0].name;
        }
      } catch (_) {}
    }

    // METODE 2: Instant On-Demand Generation (Jika stok pre-generated kosong / mode on-demand)
    if (!isFromPreGenerated) {
      // Fetch profile & router info (matching either router_profile id or package_id)
      const pRes = await pool.query(`
        SELECT rp.id, rp.name as profile_name, rp.router_id, r.ip_address, r.api_port, r.username, r.password,
               p.uptime_limit, p.validity_iso
        FROM router_profiles rp
        JOIN routers r ON rp.router_id = r.id
        LEFT JOIN packages p ON rp.package_id = p.id
        WHERE rp.id = $1 OR rp.package_id = $1
        LIMIT 1
      `, [profile_id]);

      if (pRes.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Profile hotspot atau Router tidak ditemukan.' });
      }

      const routerProfile = pRes.rows[0];
      const formattedUptime = routerProfile.uptime_limit ? isoToMikrotikTime(routerProfile.uptime_limit) : '';
      const vId = `vc-instant-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      voucherId = vId;
      voucherCode = generateRandomCode(6, 'lower', 'vc');
      voucherPass = voucherCode;

      const nowStr = new Date().toISOString().split('T')[0];
      const vComment = `vc-${voucherCode}-${nowStr}-instant|${routerProfile.profile_name}`;

      // Push Live to Mikrotik Router via RouterOS API
      let conn: any = null;
      try {
        conn = new RouterOSAPI({
          host: routerProfile.ip_address,
          port: routerProfile.api_port || 8728,
          user: routerProfile.username || 'admin',
          password: routerProfile.password || '',
          timeout: 5
        });
        await conn.connect();
        const hsUserParams = [
          `=name=${voucherCode}`,
          `=password=${voucherPass}`,
          `=profile=${routerProfile.profile_name}`,
          `=comment=${vComment}`
        ];
        if (formattedUptime) {
          hsUserParams.push(`=limit-uptime=${formattedUptime}`);
        }
        await conn.write('/ip/hotspot/user/add', hsUserParams);
        conn.close();
        livePushSuccess = true;
      } catch (e: any) {
        livePushError = e.message;
        console.warn(`[Voucher Buy] Failed to push on-demand voucher to Mikrotik ${routerProfile.ip_address}:`, e.message);
        if (conn) try { conn.close(); } catch (_) {}
      }

      // Record newly generated on-demand voucher directly into DB as sold and link invoice
      await pool.query(`
        INSERT INTO hotspot_vouchers (
          id, batch_id, router_id, router_profile_id, code, password, status, comment, sold_to, sold_at, invoice_id, invoice_number, created_at
        ) VALUES (
          $1, 'vc-instant-ondemand', $2, $3, $4, $5, 'sold', $6, $7, NOW(), $8, $9, NOW()
        )
      `, [
        vId,
        routerProfile.router_id,
        profile_id,
        voucherCode,
        voucherPass,
        vComment,
        buyer_phone || buyer_name || arabpay_user_id || 'pelanggan',
        invoiceId,
        invoiceNumber
      ]);
    }

    // 1. Live ArabPay E-Wallet Balance Deduction via S2S API (hanya jika belum dipotong di frontend)
    let remainingBalance: number | null = null;
    if (!skip_arabpay_deduction && payment_method && payment_method.toLowerCase().includes('arabpay')) {
      try {
        const packageName = targetProfileName || 'Voucher Hotspot';
        const { deductArabPayBalance } = await import('../services/arabpayService.js');
        const deductResult = await deductArabPayBalance({
          userId: arabpay_user_id || buyer_phone || buyer_name,
          amount: amount || 0,
          notes: `Pembelian ${packageName} (Kode: ${voucherCode})`,
          invoiceId: invoiceNumber
        });
        if (deductResult.remaining_balance !== undefined) {
          remainingBalance = deductResult.remaining_balance;
        }
      } catch (deductErr) {
        console.warn('ArabPay S2S Deduct Warning:', deductErr);
      }
    }

    // Resolve matched customer_id from customers table only if a valid customer record exists
    let matchedCustomerId: string | null = null;
    try {
      if (arabpay_user_id || buyer_phone) {
        const cRes = await pool.query(`
          SELECT id FROM customers 
          WHERE (user_id = $1 AND $1 IS NOT NULL AND $1 <> '')
             OR (phone_number = $2 AND $2 IS NOT NULL AND $2 <> '')
          LIMIT 1
        `, [arabpay_user_id || null, buyer_phone || null]);
        if (cRes.rows.length > 0) {
          matchedCustomerId = cRes.rows[0].id;
        }
      }
    } catch (_) {}

    // 2. Simpan invoice transaksi keuangan ke tabel invoices dengan relasi langsung ke voucher
    await pool.query(`
      INSERT INTO invoices (
        id, invoice_number, customer_id, user_id, customer_name, customer_phone, 
        connection_type, package_name, amount, total, status, issue_date, due_date, payment_method, notes, paid_at, voucher_id, voucher_code, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 
        'hotspot_voucher', $7, $8, $8, 'paid', CURRENT_DATE, CURRENT_DATE, $9, $10, NOW(), $11, $12, NOW()
      )
    `, [
      invoiceId,
      invoiceNumber,
      matchedCustomerId,
      arabpay_user_id || null,
      buyer_name || 'Pelanggan Hotspot',
      buyer_phone || '',
      targetProfileName || 'Voucher Hotspot',
      amount || 0,
      payment_method || 'ArabPay E-Wallet',
      `Pembelian Voucher Hotspot (${isFromPreGenerated ? 'Stok Diskon' : 'Instant On-Demand'}) - Kode: ${voucherCode}`,
      voucherId,
      voucherCode
    ]);

    res.json({
      success: true,
      message: `✅ Voucher berhasil ${isFromPreGenerated ? 'diambil dari stok' : 'dibuat instan'}! Gunakan kode di bawah untuk login ke WiFi Hotspot.${!isFromPreGenerated && !livePushSuccess ? ` (Perhatian MikroTik: ${livePushError})` : ''}`,
      voucher: {
        id: voucherId,
        code: voucherCode,
        password: voucherPass
      },
      mikrotik_synced: isFromPreGenerated ? true : livePushSuccess,
      mikrotik_error: livePushError || undefined,
      method: isFromPreGenerated ? 'Stok Terbatas (Diskon)' : 'Instant On-Demand',
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      remaining_balance: remainingBalance
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Mengambil daftar seluruh riwayat voucher yang telah dibeli oleh user langsung dari database PostgreSQL
 */
export async function listMyPurchasedVouchers(req: Request, res: Response) {
  const { user_id, phone } = req.query;
  const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, '') : '';
  const cleanUserId = user_id ? String(user_id).trim() : '';

  if (!cleanUserId && !cleanPhone) {
    return res.json({ success: true, vouchers: [] });
  }

  try {
    const result = await pool.query(`
      SELECT 
        v.id as voucher_id,
        v.code as username,
        v.password,
        v.status,
        COALESCE(v.sold_at, v.created_at) as date,
        v.sold_at,
        v.comment,
        COALESCE(v.invoice_id, i.id) as invoice_id,
        COALESCE(v.invoice_number, i.invoice_number, v.id) as invoice_number,
        COALESCE(rp.name, 'Voucher Hotspot') as profile_name,
        COALESCE(p.name, rp.name, 'Voucher Hotspot') as package_name,
        p.validity_iso,
        p.speed_limit as rate_limit,
        COALESCE(i.amount, p.price, 0)::int as price,
        COALESCE(i.payment_method, 'ArabPay E-Wallet') as payment_channel
      FROM hotspot_vouchers v
      LEFT JOIN router_profiles rp ON v.router_profile_id = rp.id
      LEFT JOIN packages p ON rp.package_id = p.id
      LEFT JOIN invoices i ON (v.invoice_id = i.id OR i.voucher_id = v.id OR (v.invoice_number IS NOT NULL AND i.invoice_number = v.invoice_number))
      WHERE (
        (v.sold_to IS NOT NULL AND (v.sold_to = $1 OR v.sold_to = $2 OR ($2 <> '' AND v.sold_to LIKE '%' || $2 || '%')))
        OR (i.customer_phone IS NOT NULL AND ($2 <> '' AND (i.customer_phone = $2 OR i.customer_phone LIKE '%' || $2 || '%')))
        OR (i.customer_id IS NOT NULL AND $1 <> '' AND i.customer_id = $1)
      )
      ORDER BY COALESCE(v.sold_at, v.created_at) DESC
      LIMIT 100
    `, [cleanUserId, cleanPhone]);

    const formatted = result.rows.map(row => ({
      id: row.invoice_number || row.voucher_id,
      voucher_id: row.voucher_id,
      invoice_id: row.invoice_id,
      invoice_number: row.invoice_number,
      date: row.date ? new Date(row.date).toLocaleString('id-ID') : new Date().toLocaleString('id-ID'),
      packageName: row.package_name || row.profile_name || 'Voucher Hotspot',
      price: Number(row.price || 0),
      username: row.username,
      password: row.password,
      status: row.status === 'sold' || row.status === 'active' ? 'SUCCESS' : row.status,
      paymentChannel: row.payment_channel
    }));

    res.json({ success: true, vouchers: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, vouchers: [] });
  }
}

/**
 * Helper untuk menambahkan durasi ISO-8601 ke objek Date
 */
export function addIsoDurationToDate(startDate: Date, isoStr?: string | null): Date {
  const result = new Date(startDate.getTime());
  if (!isoStr || typeof isoStr !== 'string') {
    result.setDate(result.getDate() + 1);
    return result;
  }
  const clean = isoStr.trim().toUpperCase();
  if (!clean.startsWith('P')) {
    result.setDate(result.getDate() + 1);
    return result;
  }

  const [datePart, timePart = ''] = clean.split('T');

  const years = datePart.match(/(\d+)Y/);
  if (years) result.setFullYear(result.getFullYear() + parseInt(years[1], 10));

  const months = datePart.match(/(\d+)M/);
  if (months) result.setMonth(result.getMonth() + parseInt(months[1], 10));

  const weeks = datePart.match(/(\d+)W/);
  if (weeks) result.setDate(result.getDate() + parseInt(weeks[1], 10) * 7);

  const days = datePart.match(/(\d+)D/);
  if (days) result.setDate(result.getDate() + parseInt(days[1], 10));

  const hours = timePart.match(/(\d+)H/);
  if (hours) result.setHours(result.getHours() + parseInt(hours[1], 10));

  const mins = timePart.match(/(\d+)M/);
  if (mins) result.setMinutes(result.getMinutes() + parseInt(mins[1], 10));

  const secs = timePart.match(/(\d+)S/);
  if (secs) result.setSeconds(result.getSeconds() + parseInt(secs[1], 10));

  return result;
}

/**
 * Webhook On-Login Pertama Kali dari MikroTik RouterOS
 * MikroTik RouterOS: /tool fetch url="http://<SERVER_IP>:3006/api/vouchers/first-login?code=$user&mac=$mac&ip=$address" mode=http keep-result=no;
 */
export async function handleVoucherFirstLogin(req: Request, res: Response) {
  const code = (req.query.code || req.body.code || '').toString().trim();
  const mac = (req.query.mac || req.body.mac || '').toString().trim();
  const ip = (req.query.ip || req.body.ip || '').toString().trim();
  const routerIdentity = (req.query.router || req.body.router || '').toString().trim();

  if (!code) {
    return res.status(400).json({
      success: false,
      message: 'Parameter "code" (username voucher) wajib disertakan.'
    });
  }

  console.log(`[VOUCHER FIRST-LOGIN WEBHOOK] Menerima sinyal aktif voucher: code=${code}, mac=${mac}, ip=${ip}, router=${routerIdentity}`);

  try {
    // 1. Cari voucher di database beserta konfigurasi paket & validity_iso-nya
    const vcRes = await pool.query(`
      SELECT v.*, rp.name as profile_name, rp.package_id, p.name as package_name, p.validity_iso, p.uptime_limit
      FROM hotspot_vouchers v
      LEFT JOIN router_profiles rp ON v.router_profile_id = rp.id
      LEFT JOIN packages p ON rp.package_id = p.id
      WHERE v.code = $1
      LIMIT 1
    `, [code]);

    if (vcRes.rows.length === 0) {
      console.warn(`[VOUCHER FIRST-LOGIN] Voucher ${code} tidak ditemukan di database Postgres.`);
      return res.status(404).json({
        success: false,
        message: `Voucher dengan kode "${code}" tidak ditemukan di database.`
      });
    }

    const voucher = vcRes.rows[0];

    // 2. Jika sudah pernah aktif sebelumnya, kembalikan konfirmasi tanpa menimpa waktu aktif awal
    if (voucher.first_login_at) {
      return res.json({
        success: true,
        message: `Voucher "${code}" sudah aktif sejak ${voucher.first_login_at}.`,
        voucher_id: voucher.id,
        first_login_at: voucher.first_login_at,
        expired_at: voucher.expired_at,
        already_active: true
      });
    }

    // 3. Hitung masa aktif dan tanggal expired berdasarkan validity_iso paket
    const now = new Date();
    const validityIso = voucher.validity_iso || 'P1D'; // Default 1 hari jika tidak diset
    const expiredAt = addIsoDurationToDate(now, validityIso);

    // 4. Update database PostgreSQL
    await pool.query(`
      UPDATE hotspot_vouchers
      SET status = 'used',
          first_login_at = $1,
          mac_address = $2,
          ip_address = $3,
          expired_at = $4
      WHERE id = $5
    `, [now, mac || null, ip || null, expiredAt, voucher.id]);

    // 5. Update Cloud Firestore jika menggunakan mode Firebase
    try {
      const db = getFirestore();
      if (db) {
        await db.collection('hotspot_vouchers').doc(voucher.id).set({
          status: 'used',
          first_login_at: now.toISOString(),
          mac_address: mac || null,
          ip_address: ip || null,
          expired_at: expiredAt.toISOString()
        }, { merge: true });
      }
    } catch (fbErr: any) {
      console.warn('[VOUCHER FIRST-LOGIN] Firebase sync notice:', fbErr.message);
    }

    console.log(`✅ [VOUCHER FIRST-LOGIN] Voucher ${code} BERHASIL DIAKTIFKAN! Aktif: ${now.toISOString()} | Expired: ${expiredAt.toISOString()} | MAC: ${mac || '-'}`);

    return res.json({
      success: true,
      message: `⚡ Voucher "${code}" berhasil diaktifkan untuk pertama kali!`,
      voucher_id: voucher.id,
      code: code,
      mac_address: mac || null,
      ip_address: ip || null,
      first_login_at: now.toISOString(),
      expired_at: expiredAt.toISOString(),
      package_name: voucher.package_name || voucher.profile_name || 'Voucher Hotspot'
    });
  } catch (err: any) {
    console.error(`[VOUCHER FIRST-LOGIN ERROR] Gagal memproses first-login voucher ${code}:`, err.message);
    return res.status(500).json({
      success: false,
      message: `Terjadi kesalahan di server: ${err.message}`
    });
  }
}

