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

/**
 * Helper pembentuk format comment voucher MikroTik & database
 * Format wajib: vc-YYYY-MM-DD 23:59:59-N|<penanda>|<id>|<nama_profil>
 * Contoh Mandiri: vc-2026-09-13 23:59:59-N|mandiri|019f74af9fcdWDgDxM8g|Paket 1 hari
 * Contoh Admin:   vc-2026-09-13 23:59:59-N|admin|adm-super|Paket 1 hari
 */
export function buildVoucherComment(options: {
  source: 'admin' | 'mandiri';
  creatorId?: string | null;
  profileName?: string | null;
  customDate?: Date;
}): string {
  const date = options.customDate || new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const sourceTag = options.source === 'mandiri' ? 'mandiri' : 'admin';
  const idTag = (options.creatorId || (options.source === 'mandiri' ? 'user' : 'admin')).toString().replace(/\|/g, '').trim();
  const profileTag = (options.profileName || 'Hotspot').toString().replace(/\|/g, '').trim();

  return `vc-${dateStr} 23:59:59-N|${sourceTag}|${idTag}|${profileTag}`;
}

export async function generateBatchVouchers(req: Request, res: Response) {
  const { router_id, router_profile_id, count, code_length, code_prefix, char_type, admin_id } = req.body;

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

    const creatorAdminId = admin_id || (req as any).user?.id || (req as any).user?.username || 'admin';
    const vComment = buildVoucherComment({
      source: 'admin',
      creatorId: creatorAdminId,
      profileName: profile.name
    });

    for (let i = 0; i < numCount; i++) {
      const vId = `vc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const vCode = generateRandomCode(len, cType, prefix);
      const vPass = vCode;

      let itemSynced = false;
      let itemError: string | null = null;

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
          itemSynced = true;
        } catch (err: any) {
          itemError = err.message;
        }
      } else {
        itemError = livePushNote ? livePushNote.replace(/^ \(Catatan Router: /, '').replace(/\)$/, '') : 'Router MikroTik offline';
      }

      await pool.query(`
        INSERT INTO hotspot_vouchers (
          id, batch_id, router_id, router_profile_id, code, password, status, comment, is_synced, last_synced_at, sync_error
        ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10)
      `, [vId, batchId, router_id, router_profile_id, vCode, vPass, vComment, itemSynced, itemSynced ? new Date() : null, itemError]);

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
      validity_iso: p.validity_iso || '',
      uptime_limit: p.uptime_limit || '',
      validity_days: Number(p.validity_days || p.validity_value) || 1,
      validity_unit: p.validity_unit || 'day',
      validity_value: Number(p.validity_value) || 1,
      shared_users: Number(p.shared_users) || 1,
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
        p.id as package_id,
        COALESCE(rp.rate_limit, p.speed_limit, '10 Mbps') as rate_limit,
        r.id as router_id,
        r.name as router_name,
        COALESCE(r.dns_name, 'arab.net') as dns_name,
        COALESCE(r.hotspot_ip, '10.0.0.1') as hotspot_ip,
        COALESCE(r.dns_name, r.name, 'arab.net') as isp_name,
        COALESCE(p.name, rp.name) as package_name,
        COALESCE(p.price, 0)::int as price,
        COALESCE(p.validity_iso, 'P1D') as validity_iso,
        COALESCE(p.quota_mb, 0)::int as quota_mb,
        COALESCE(p.shared_users, 1)::int as shared_users,
        COALESCE(p.uptime_limit, '') as uptime_limit,
        COUNT(v.id)::int as stock,
        'pregenerated' as mode
      FROM router_profiles rp
      LEFT JOIN routers r ON rp.router_id = r.id
      JOIN packages p ON rp.package_id = p.id
      JOIN hotspot_vouchers v ON v.router_profile_id = rp.id AND v.status = 'active' AND v.sold_to IS NULL
      WHERE rp.package_id IS NOT NULL
        AND COALESCE(rp.is_active, true) = true
        AND COALESCE(p.is_active, true) = true
      GROUP BY rp.id, rp.name, p.id, rp.rate_limit, p.speed_limit, r.id, r.name, r.dns_name, r.hotspot_ip, p.name, p.price, p.validity_iso, p.quota_mb, p.shared_users, p.uptime_limit
      ORDER BY COALESCE(p.price, 0) ASC
    `);

    // 2. Ambil router_profiles bertipe 'hotspot' yang SUDAH DIHUBUNGKAN KE PAKET (rp.package_id IS NOT NULL)
    // Serta wajib: Profil Aktif (is_active = true) dan Paket Aktif (is_active = true)
    const onDemandResult = await pool.query(`
      SELECT
        rp.id as profile_id,
        rp.name as profile_name,
        p.id as package_id,
        p.name as package_name,
        COALESCE(p.price, 5000)::int as price,
        COALESCE(rp.rate_limit, p.speed_limit, '10 Mbps') as rate_limit,
        COALESCE(p.validity_iso, 'P1D') as validity_iso,
        COALESCE(p.quota_mb, 0)::int as quota_mb,
        COALESCE(p.shared_users, 1)::int as shared_users,
        COALESCE(p.uptime_limit, '') as uptime_limit,
        COALESCE(r.id, 'rtr-pusat-01') as router_id,
        COALESCE(r.name, 'Router Utama') as router_name,
        COALESCE(r.dns_name, 'arab.net') as dns_name,
        COALESCE(r.hotspot_ip, '10.0.0.1') as hotspot_ip,
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

    // 3. Ambil seluruh kampanye Flash Sale yang sedang aktif & belum habis kuotanya
    const fsResult = await pool.query(`
      SELECT 
        fs.*,
        r.name as router_name,
        r.hotspot_ip,
        r.dns_name
      FROM flash_sales fs
      LEFT JOIN routers r ON fs.router_id = r.id
      WHERE fs.is_active = true 
        AND fs.end_time > NOW()
        AND (fs.start_time IS NULL OR fs.start_time <= NOW())
        AND fs.quota_sold < fs.quota_limit
      ORDER BY fs.created_at DESC
    `).catch(() => ({ rows: [] }));
    const activeFlashSales = fsResult.rows || [];

    // Helper untuk mencocokkan Flash Sale ke paket
    const attachFlashSaleInfo = (item: any) => {
      const matchedFs = activeFlashSales.find((fs: any) => {
        // Cek kecocokan router jika flash sale mengunci router tertentu
        if (fs.router_id && item.router_id && fs.router_id !== item.router_id) {
          return false;
        }

        const matchId = fs.target_package_id && (
          fs.target_package_id === item.profile_id || 
          fs.target_package_id === item.package_id
        );

        const matchName = fs.target_package_name && (
          fs.target_package_name.trim().toLowerCase() === (item.package_name || '').trim().toLowerCase() ||
          fs.target_package_name.trim().toLowerCase() === (item.profile_name || '').trim().toLowerCase()
        );

        return Boolean(matchId || matchName);
      });

      if (matchedFs) {
        const origPrice = Number(matchedFs.original_price) || Number(item.price);
        const promoPrice = Number(matchedFs.promo_price);
        const discountPercent = origPrice > promoPrice && origPrice > 0 
          ? Math.max(1, Math.round(((origPrice - promoPrice) / origPrice) * 100)) 
          : 0;
        const remainingSec = Math.max(0, Math.floor((new Date(matchedFs.end_time).getTime() - Date.now()) / 1000));
        const limit = Number(matchedFs.quota_limit) || 50;
        const sold = Number(matchedFs.quota_sold) || 0;

        return {
          ...item,
          is_flash_sale: true,
          original_price: origPrice,
          promo_price: promoPrice,
          effective_price: promoPrice,
          flash_sale: {
            id: matchedFs.id,
            title: matchedFs.title,
            subtitle: matchedFs.subtitle,
            badge_label: matchedFs.badge_label || 'FLASH SALE',
            discount_text: matchedFs.discount_text || (discountPercent > 0 ? `HEMAT ${discountPercent}%` : 'PROMO SPESIAL'),
            discount_percent: discountPercent,
            original_price: origPrice,
            promo_price: promoPrice,
            quota_limit: limit,
            quota_sold: sold,
            quota_remaining: Math.max(0, limit - sold),
            end_time: matchedFs.end_time,
            seconds_remaining: remainingSec,
            button_text: matchedFs.button_text || 'Beli Promo Flash Sale'
          }
        };
      }

      return {
        ...item,
        is_flash_sale: false,
        effective_price: Number(item.price),
        flash_sale: null
      };
    };

    // Gabungkan seluruh paket yang memiliki harga valid > 0
    const groupMap = new Map<string, any>();
    
    // Utamakan paket on-demand (murni dari router_profiles & packages yang di-link)
    onDemandResult.rows.forEach((rawItem: any) => {
      if (Number(rawItem.price) > 0) {
        const item = attachFlashSaleInfo(rawItem);
        groupMap.set(item.profile_id, item);
      }
    });

    // Tambahkan paket pregenerated jika ada
    stockResult.rows.forEach((rawItem: any) => {
      if (Number(rawItem.price) > 0) {
        const item = attachFlashSaleInfo(rawItem);
        groupMap.set(item.profile_id, item);
      }
    });

    const allGroups = Array.from(groupMap.values());

    res.json({
      success: true,
      has_flash_sale: activeFlashSales.length > 0,
      flash_sales_count: activeFlashSales.length,
      flash_sales: activeFlashSales.map((fs: any) => {
        const orig = Number(fs.original_price) || 0;
        const promo = Number(fs.promo_price) || 0;
        const limit = Number(fs.quota_limit) || 50;
        const sold = Number(fs.quota_sold) || 0;
        const remainingSec = Math.max(0, Math.floor((new Date(fs.end_time).getTime() - Date.now()) / 1000));
        const cleanDiscount = (fs.discount_text || '').replace(/Rp\s*Rp/gi, 'Rp');
        return {
          id: fs.id,
          title: fs.title,
          subtitle: fs.subtitle,
          badge_label: fs.badge_label || 'FLASH SALE',
          discount_text: cleanDiscount,
          target_package_id: fs.target_package_id,
          target_package_name: fs.target_package_name,
          original_price: orig,
          promo_price: promo,
          quota_limit: limit,
          quota_sold: sold,
          quota_remaining: Math.max(0, limit - sold),
          end_time: fs.end_time,
          seconds_remaining: remainingSec
        };
      }),
      pregenerated: stockResult.rows.map(attachFlashSaleInfo),
      ondemand: onDemandResult.rows.map(attachFlashSaleInfo),
      packages: allGroups.length > 0 ? allGroups : onDemandResult.rows.map(attachFlashSaleInfo),
      groups: allGroups.length > 0 ? allGroups : onDemandResult.rows.map(attachFlashSaleInfo)
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
  const { profile_id, mode, buyer_name, buyer_phone, payment_method, arabpay_user_id, amount, skip_arabpay_deduction, is_flash_sale, flash_sale_id } = req.body;

  if (!profile_id) {
    return res.status(400).json({ success: false, message: 'Profile voucher wajib dipilih.' });
  }

  try {
    let finalAmount = Number(amount || 0);
    let matchedFlashSaleId: string | null = null;
    let flashSaleTitle: string = 'FLASH SALE PROMO';

    // ==================== VALIDASI FLASH SALE (KUOTA & BATASAN 1 VOUCHER PER USER) ====================
    // Hanya validasi jika pembelian explicitly mengklaim promo flash sale (is_flash_sale = true dan ada flash_sale_id)
    if (is_flash_sale && flash_sale_id) {
      try {
        let fsRow: any = null;
        const fsRes = await pool.query('SELECT * FROM flash_sales WHERE id = $1', [flash_sale_id]);
        if (fsRes.rows.length > 0) fsRow = fsRes.rows[0];

        if (fsRow) {
          if (!fsRow.is_active) {
            return res.status(400).json({ success: false, message: 'Promo Flash Sale saat ini sedang tidak aktif.' });
          }
          if (fsRow.end_time && new Date(fsRow.end_time).getTime() < Date.now()) {
            return res.status(400).json({ success: false, message: 'Periode promo Flash Sale telah berakhir.' });
          }
          if (fsRow.quota_limit && (fsRow.quota_sold || 0) >= fsRow.quota_limit) {
            return res.status(400).json({ success: false, message: 'Kuota voucher promo Flash Sale telah habis terjual. Silakan beli dengan tarif reguler.' });
          }

          const maxPerUser = Number(fsRow.max_per_user || 1);
          const userPhone = buyer_phone ? String(buyer_phone).replace(/[^0-9]/g, '') : '';
          const userId = arabpay_user_id ? String(arabpay_user_id).trim() : '';

          if (userPhone || userId) {
            const checkPrior = await pool.query(`
              SELECT COUNT(*)::int as cnt
              FROM invoices
              WHERE flash_sale_id = $1
                AND (
                  (customer_phone IS NOT NULL AND $2 <> '' AND (customer_phone = $2 OR customer_phone LIKE '%' || $2 || '%'))
                  OR (user_id IS NOT NULL AND $3 <> '' AND user_id = $3)
                )
            `, [fsRow.id, userPhone, userId]);

            if ((checkPrior.rows[0]?.cnt || 0) >= maxPerUser) {
              return res.status(400).json({
                success: false,
                message: `⚠️ Batasan promo: Setiap akun hanya boleh membeli maksimal ${maxPerUser} voucher promo pada "${fsRow.title}". Kuota promo akun Anda sudah digunakan. Anda tetap dapat membeli paket ini dengan harga normal.`
              });
            }
          }

          if (fsRow.promo_price && Number(fsRow.promo_price) > 0) {
            finalAmount = Number(fsRow.promo_price);
          }
          matchedFlashSaleId = fsRow.id;
          flashSaleTitle = fsRow.title || 'FLASH SALE';
        }
      } catch (e: any) {
        console.warn('Flash sale validation warning:', e?.message);
      }
    }

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

    let targetProfileName = 'Voucher Hotspot';
    if (profile_id) {
      try {
        const prRes = await pool.query('SELECT name FROM router_profiles WHERE id = $1 OR package_id = $1 LIMIT 1', [profile_id]);
        if (prRes.rows.length > 0 && prRes.rows[0].name) {
          targetProfileName = prRes.rows[0].name;
        }
      } catch (_) {}
    }

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

        const customerUserId = arabpay_user_id || buyer_phone || buyer_name || 'user';
        const updatedComment = buildVoucherComment({
          source: 'mandiri',
          creatorId: customerUserId,
          profileName: targetProfileName
        });

        // Mark pre-generated voucher as sold and link invoice with updated comment
        await pool.query(`
          UPDATE hotspot_vouchers
          SET status = 'sold', sold_to = $1, sold_at = NOW(), invoice_id = $2, invoice_number = $3, comment = $4
          WHERE id = $5
        `, [buyer_phone || buyer_name || arabpay_user_id || 'pelanggan', invoiceId, invoiceNumber, updatedComment, preVoucher.id]);

        let preSynced = false;
        let preSyncErr = null;
        try {
          const rRes = await pool.query(`
            SELECT r.ip_address, r.api_port, r.username, r.password
            FROM hotspot_vouchers hv
            JOIN routers r ON hv.router_id = r.id
            WHERE hv.id = $1
          `, [preVoucher.id]);
          if (rRes.rows.length > 0) {
            const rInfo = rRes.rows[0];
            const rConn = new RouterOSAPI({
              host: rInfo.ip_address,
              port: rInfo.api_port || 8728,
              user: rInfo.username || 'admin',
              password: rInfo.password || '',
              timeout: 4
            });
            await rConn.connect();
            const hsUsers = await rConn.write('/ip/hotspot/user/print', [`?name=${voucherCode}`]);
            if (hsUsers && hsUsers.length > 0) {
              await rConn.write('/ip/hotspot/user/set', [`=.id=${hsUsers[0]['.id']}`, `=comment=${updatedComment}`]);
              preSynced = true;
            } else {
              await rConn.write('/ip/hotspot/user/add', [
                `=name=${voucherCode}`,
                `=password=${voucherPass}`,
                `=profile=${targetProfileName}`,
                `=comment=${updatedComment}`
              ]);
              preSynced = true;
            }
            rConn.close();
          }
        } catch (e: any) {
          preSyncErr = e.message;
        }

        // Mark pre-generated voucher as sold and link invoice with updated comment & sync status
        await pool.query(`
          UPDATE hotspot_vouchers
          SET status = 'sold', sold_to = $1, sold_at = NOW(), invoice_id = $2, invoice_number = $3, comment = $4,
              is_synced = $5, last_synced_at = NOW(), sync_error = $6
          WHERE id = $7
        `, [buyer_phone || buyer_name || arabpay_user_id || 'pelanggan', invoiceId, invoiceNumber, updatedComment, preSynced, preSyncErr, preVoucher.id]);
      }
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

      const customerUserId = arabpay_user_id || buyer_phone || buyer_name || 'user';
      const vComment = buildVoucherComment({
        source: 'mandiri',
        creatorId: customerUserId,
        profileName: routerProfile.profile_name
      });

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
          id, batch_id, router_id, router_profile_id, code, password, status, comment, sold_to, sold_at, invoice_id, invoice_number, is_synced, last_synced_at, sync_error, created_at
        ) VALUES (
          $1, 'vc-instant-ondemand', $2, $3, $4, $5, 'sold', $6, $7, NOW(), $8, $9, $10, $11, $12, NOW()
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
        invoiceNumber,
        livePushSuccess,
        livePushSuccess ? new Date() : null,
        livePushSuccess ? null : (livePushError || 'Koneksi ke MikroTik gagal')
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
          amount: finalAmount || 0,
          notes: is_flash_sale ? `Pembelian ⚡ FLASH SALE ${packageName} (Kode: ${voucherCode})` : `Pembelian ${packageName} (Kode: ${voucherCode})`,
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
        connection_type, package_name, amount, total, status, issue_date, due_date, payment_method, notes, paid_at, voucher_id, voucher_code, flash_sale_id, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 
        'hotspot_voucher', $7, $8, $8, 'paid', CURRENT_DATE, CURRENT_DATE, $9, $10, NOW(), $11, $12, $13, NOW()
      )
    `, [
      invoiceId,
      invoiceNumber,
      matchedCustomerId,
      arabpay_user_id || null,
      buyer_name || 'Pelanggan Hotspot',
      buyer_phone || '',
      targetProfileName || 'Voucher Hotspot',
      finalAmount || 0,
      payment_method || 'ArabPay E-Wallet',
      (is_flash_sale || matchedFlashSaleId)
        ? `Pembelian Voucher Hotspot (⚡ ${flashSaleTitle}) - Kode: ${voucherCode}`
        : `Pembelian Voucher Hotspot (${isFromPreGenerated ? 'Stok Diskon' : 'Instant On-Demand'}) - Kode: ${voucherCode}`,
      voucherId,
      voucherCode,
      matchedFlashSaleId
    ]);

    // Tambah kuota terjual di tabel flash_sales hanya jika transaksi invoice berhasil disimpan
    if (matchedFlashSaleId) {
      try {
        await pool.query('UPDATE flash_sales SET quota_sold = quota_sold + 1, updated_at = NOW() WHERE id = $1', [matchedFlashSaleId]);
      } catch (fsUpErr) {
        console.warn('Gagal menambah quota_sold flash sale:', fsUpErr);
      }
    }

    // Cari hotspot_ip dan dns_name router terkait
    let targetHotspotIp = '10.0.0.1';
    let targetDnsName = 'arab.net';
    try {
      const rInfo = await pool.query(`
        SELECT COALESCE(r.hotspot_ip, '10.0.0.1') as hotspot_ip, COALESCE(r.dns_name, 'arab.net') as dns_name
        FROM router_profiles rp
        JOIN routers r ON rp.router_id = r.id
        WHERE rp.id = $1 OR rp.package_id = $1
        LIMIT 1
      `, [profile_id]);
      if (rInfo.rows.length > 0) {
        targetHotspotIp = rInfo.rows[0].hotspot_ip || '10.0.0.1';
        targetDnsName = rInfo.rows[0].dns_name || 'arab.net';
      }
    } catch (_) {}

    res.json({
      success: true,
      message: `✅ Voucher berhasil ${isFromPreGenerated ? 'diambil dari stok' : 'dibuat instan'}! Gunakan kode di bawah untuk login ke WiFi Hotspot.${!isFromPreGenerated && !livePushSuccess ? ` (Perhatian MikroTik: ${livePushError})` : ''}`,
      voucher: {
        id: voucherId,
        code: voucherCode,
        password: voucherPass,
        hotspot_ip: targetHotspotIp,
        dns_name: targetDnsName
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
        v.first_login_at,
        v.expired_at,
        COALESCE(v.sold_at, v.created_at) as date,
        v.sold_at,
        v.comment,
        COALESCE(v.invoice_id, i.id) as invoice_id,
        COALESCE(v.invoice_number, i.invoice_number, v.id) as invoice_number,
        COALESCE(rp.name, 'Voucher Hotspot') as profile_name,
        COALESCE(p.name, rp.name, 'Voucher Hotspot') as package_name,
        p.validity_iso,
        p.speed_limit as rate_limit,
        COALESCE(r.hotspot_ip, '10.0.0.1') as hotspot_ip,
        COALESCE(r.dns_name, 'arab.net') as dns_name,
        COALESCE(i.amount, p.price, 0)::int as price,
        COALESCE(i.payment_method, 'ArabPay E-Wallet') as payment_channel,
        i.notes as invoice_notes,
        i.flash_sale_id
      FROM hotspot_vouchers v
      LEFT JOIN router_profiles rp ON v.router_profile_id = rp.id
      LEFT JOIN routers r ON (v.router_id = r.id OR rp.router_id = r.id)
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

    const formatted = result.rows.map(row => {
      const isUsed = row.status === 'used' || row.status === 'expired' || Boolean(row.expired_at && new Date(row.expired_at).getTime() < Date.now());
      return {
        id: row.invoice_number || row.voucher_id,
        voucher_id: row.voucher_id,
        invoice_id: row.invoice_id,
        invoice_number: row.invoice_number,
        date: row.date ? new Date(row.date).toLocaleString('id-ID') : new Date().toLocaleString('id-ID'),
        packageName: row.package_name || row.profile_name || 'Voucher Hotspot',
        price: Number(row.price || 0),
        username: row.username,
        password: row.password,
        hotspot_ip: row.hotspot_ip || '10.0.0.1',
        dns_name: row.dns_name || 'arab.net',
        status: isUsed ? 'used' : (row.status === 'sold' || row.status === 'active' ? 'active' : row.status),
        raw_status: row.status,
        is_used: isUsed,
        first_login_at: row.first_login_at,
        expired_at: row.expired_at,
        paymentChannel: row.payment_channel,
        flash_sale_id: row.flash_sale_id || null,
        is_flash_sale: Boolean(row.flash_sale_id || (row.invoice_notes && String(row.invoice_notes).toUpperCase().includes('FLASH SALE')) || (row.comment && String(row.comment).toUpperCase().includes('FLASH SALE')))
      };
    });

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

/**
 * Sinkronisasi Ulang Voucher Aktif ke Router MikroTik
 * Hanya voucher aktif:
 * - Belum terpakai (status = 'active')
 * - Terjual belum login (status = 'sold')
 * - Sudah terpakai namun belum expired (status = 'used' AND (expired_at IS NULL OR expired_at > NOW()))
 * Memastikan tidak menyinkronkan voucher yang sudah kedaluwarsa.
 */
export async function syncVouchersToMikrotik(req: Request, res: Response) {
  const { voucher_id, router_id } = req.body;

  try {
    let query = `
      SELECT v.id, v.code, v.password, v.comment, v.status, v.is_synced, v.expired_at,
             r.id as router_id, r.name as router_name, r.ip_address, r.api_port, r.username, r.password as router_password,
             COALESCE(rp.name, 'default') as profile_name, p.uptime_limit
      FROM hotspot_vouchers v
      JOIN routers r ON v.router_id = r.id
      LEFT JOIN router_profiles rp ON v.router_profile_id = rp.id
      LEFT JOIN packages p ON rp.package_id = p.id
      WHERE (
        v.status = 'active'
        OR v.status = 'sold'
        OR (v.status = 'used' AND (v.expired_at IS NULL OR v.expired_at > NOW()))
      )
      AND (v.expired_at IS NULL OR v.expired_at > NOW())
    `;
    const params: any[] = [];

    if (voucher_id) {
      params.push(voucher_id);
      query += ` AND v.id = $${params.length}`;
    } else if (router_id) {
      params.push(router_id);
      query += ` AND v.router_id = $${params.length}`;
    }

    query += ` ORDER BY v.created_at DESC`;

    const vRes = await pool.query(query, params);
    const vouchersToSync = vRes.rows;

    if (vouchersToSync.length === 0) {
      return res.json({
        success: true,
        message: 'Tidak ada voucher aktif yang perlu disinkronkan ke MikroTik.',
        synced_count: 0,
        failed_count: 0
      });
    }

    // Kelompokkan voucher per router agar hemat koneksi API
    const routerGroups = new Map<string, any[]>();
    vouchersToSync.forEach((v: any) => {
      const rId = v.router_id;
      if (!routerGroups.has(rId)) {
        routerGroups.set(rId, []);
      }
      routerGroups.get(rId)!.push(v);
    });

    let totalSynced = 0;
    let totalFailed = 0;
    const results: any[] = [];

    for (const [rId, items] of routerGroups.entries()) {
      const routerInfo = items[0];
      let conn: any = null;

      try {
        conn = new RouterOSAPI({
          host: routerInfo.ip_address,
          port: routerInfo.api_port || 8728,
          user: routerInfo.username || 'admin',
          password: routerInfo.router_password || '',
          timeout: 8
        });
        await conn.connect();

        // Ambil daftar user yang sudah ada di router MikroTik
        const existingUsers = await conn.write('/ip/hotspot/user/print');
        const userMap = new Map<string, any>();
        if (Array.isArray(existingUsers)) {
          existingUsers.forEach((u: any) => {
            if (u.name) userMap.set(u.name, u);
          });
        }

        for (const item of items) {
          try {
            const formattedUptime = item.uptime_limit ? isoToMikrotikTime(item.uptime_limit) : '';
            const existingUser = userMap.get(item.code);

            if (!existingUser) {
              // User belum ada di MikroTik -> Buat baru (/ip/hotspot/user/add)
              const addParams = [
                `=name=${item.code}`,
                `=password=${item.password}`,
                `=profile=${item.profile_name}`,
                `=comment=${item.comment || ''}`
              ];
              if (formattedUptime) {
                addParams.push(`=limit-uptime=${formattedUptime}`);
              }
              await conn.write('/ip/hotspot/user/add', addParams);
            } else {
              // User sudah ada -> Update comment & profile (/ip/hotspot/user/set)
              await conn.write('/ip/hotspot/user/set', [
                `=.id=${existingUser['.id']}`,
                `=profile=${item.profile_name}`,
                `=comment=${item.comment || ''}`
              ]);
            }

            // Update database menjadi is_synced = true
            await pool.query(`
              UPDATE hotspot_vouchers
              SET is_synced = true, last_synced_at = NOW(), sync_error = NULL
              WHERE id = $1
            `, [item.id]);

            totalSynced++;
            results.push({ id: item.id, code: item.code, success: true });
          } catch (itemErr: any) {
            totalFailed++;
            await pool.query(`
              UPDATE hotspot_vouchers
              SET is_synced = false, sync_error = $1
              WHERE id = $2
            `, [itemErr.message, item.id]);
            results.push({ id: item.id, code: item.code, success: false, error: itemErr.message });
          }
        }

        conn.close();
      } catch (routerErr: any) {
        if (conn) try { conn.close(); } catch (_) {}
        for (const item of items) {
          totalFailed++;
          await pool.query(`
            UPDATE hotspot_vouchers
            SET is_synced = false, sync_error = $1
            WHERE id = $2
          `, [`Router tidak terjangkau: ${routerErr.message}`, item.id]);
          results.push({ id: item.id, code: item.code, success: false, error: routerErr.message });
        }
      }
    }

    res.json({
      success: true,
      message: `⚡ Proses sinkronisasi selesai: ${totalSynced} voucher aktif berhasil terhubung ke MikroTik${totalFailed > 0 ? `, ${totalFailed} gagal` : ''}.`,
      synced_count: totalSynced,
      failed_count: totalFailed,
      details: results
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal proses sinkronisasi: ${err.message}` });
  }
}

/**
 * Pengecekan Real-Time Kondisi Voucher di MikroTik Langsung
 * Mengambil data /ip/hotspot/user/print dari router MikroTik secara live,
 * membandingkan dengan voucher aktif di PostgreSQL,
 * meng-update status is_synced jika ada ketidaksesuaian,
 * dan mengembalikan statistik real serta daftar voucher yang hilang/belum ada di MikroTik.
 */
export async function inspectMikrotikStatus(req: Request, res: Response) {
  const { router_id } = req.body;

  try {
    let query = `
      SELECT v.id, v.code, v.password, v.comment, v.status, v.is_synced, v.expired_at,
             r.id as router_id, r.name as router_name, r.ip_address, r.api_port, r.username, r.password as router_password,
             COALESCE(rp.name, 'default') as profile_name, COALESCE(p.price, 0) as package_price
      FROM hotspot_vouchers v
      JOIN routers r ON v.router_id = r.id
      LEFT JOIN router_profiles rp ON v.router_profile_id = rp.id
      LEFT JOIN packages p ON rp.package_id = p.id
      WHERE (
        v.status = 'active'
        OR v.status = 'sold'
        OR (v.status = 'used' AND (v.expired_at IS NULL OR v.expired_at > NOW()))
      )
      AND (v.expired_at IS NULL OR v.expired_at > NOW())
    `;
    const params: any[] = [];

    if (router_id && router_id !== 'all') {
      params.push(router_id);
      query += ` AND v.router_id = $${params.length}`;
    }

    query += ` ORDER BY v.created_at DESC`;

    const vRes = await pool.query(query, params);
    const activeVouchers = vRes.rows;

    // Kelompokkan voucher per router
    const routerGroups = new Map<string, any[]>();
    activeVouchers.forEach((v: any) => {
      const rId = v.router_id;
      if (!routerGroups.has(rId)) {
        routerGroups.set(rId, []);
      }
      routerGroups.get(rId)!.push(v);
    });

    let targetRouters: any[] = [];
    if (router_id && router_id !== 'all') {
      const rRes = await pool.query(`SELECT id, name, ip_address, api_port, username, password FROM routers WHERE id = $1`, [router_id]);
      if (rRes.rows.length > 0) targetRouters = rRes.rows;
    } else {
      const rRes = await pool.query(`SELECT id, name, ip_address, api_port, username, password FROM routers ORDER BY name ASC`);
      targetRouters = rRes.rows;
    }

    let totalActiveDb = activeVouchers.length;
    let foundInMikrotik = 0;
    let missingInMikrotik = 0;
    const missingVouchers: any[] = [];
    const routersStatus: any[] = [];

    for (const r of targetRouters) {
      const items = routerGroups.get(r.id) || [];
      let conn: any = null;
      let routerFound = 0;
      let routerMissing = 0;

      try {
        conn = new RouterOSAPI({
          host: r.ip_address,
          port: r.api_port || 8728,
          user: r.username || 'admin',
          password: r.password || '',
          timeout: 6
        });
        await conn.connect();

        // Ambil semua username hotspot di router
        const existingUsers = await conn.write('/ip/hotspot/user/print');
        const userSet = new Set<string>();
        if (Array.isArray(existingUsers)) {
          existingUsers.forEach((u: any) => {
            if (u.name) userSet.add(u.name);
          });
        }

        conn.close();

        for (const item of items) {
          if (userSet.has(item.code)) {
            routerFound++;
            foundInMikrotik++;
            if (!item.is_synced) {
              await pool.query(`UPDATE hotspot_vouchers SET is_synced = true, last_synced_at = NOW(), sync_error = NULL WHERE id = $1`, [item.id]);
            }
          } else {
            routerMissing++;
            missingInMikrotik++;
            missingVouchers.push({
              id: item.id,
              code: item.code,
              router_id: item.router_id,
              router_name: item.router_name,
              profile_name: item.profile_name,
              package_price: Number(item.package_price) || 0,
              status: item.status
            });
            if (item.is_synced) {
              await pool.query(`UPDATE hotspot_vouchers SET is_synced = false, sync_error = 'Hilang dari MikroTik' WHERE id = $1`, [item.id]);
            }
          }
        }

        routersStatus.push({
          router_id: r.id,
          router_name: r.name,
          ip_address: r.ip_address,
          status: 'online',
          total_active: items.length,
          found: routerFound,
          missing: routerMissing,
          total_users_in_mikrotik: userSet.size
        });
      } catch (err: any) {
        if (conn) try { conn.close(); } catch (_) {}
        routersStatus.push({
          router_id: r.id,
          router_name: r.name,
          ip_address: r.ip_address,
          status: 'offline',
          error: err.message,
          total_active: items.length,
          found: 0,
          missing: items.length
        });
        missingInMikrotik += items.length;
        items.forEach((item: any) => {
          missingVouchers.push({
            id: item.id,
            code: item.code,
            router_id: item.router_id,
            router_name: item.router_name,
            profile_name: item.profile_name,
            package_price: Number(item.package_price) || 0,
            status: item.status,
            error: `Router offline: ${err.message}`
          });
        });
      }
    }

    res.json({
      success: true,
      total_active_db: totalActiveDb,
      found_in_mikrotik: foundInMikrotik,
      missing_in_mikrotik: missingInMikrotik,
      missing_vouchers: missingVouchers,
      routers_status: routersStatus
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal memeriksa status MikroTik: ${err.message}` });
  }
}

/**
 * Mengambil daftar pembeli voucher promo Flash Sale langsung dari database PostgreSQL
 * beserta status pemakaian login di router MikroTik
 */
export async function getFlashSaleBuyers(req: Request, res: Response) {
  try {
    const result = await pool.query(`
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
      LEFT JOIN hotspot_vouchers v ON (
        i.voucher_id = v.id 
        OR (i.voucher_code IS NOT NULL AND i.voucher_code <> '' AND v.code = i.voucher_code) 
        OR i.invoice_number = v.invoice_number
      )
      LEFT JOIN routers r ON v.router_id = r.id
      WHERE i.flash_sale_id IS NOT NULL
      ORDER BY COALESCE(i.paid_at, i.created_at) DESC
    `);

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
        amount: Number(row.amount) || 0,
        payment_method: row.payment_method,
        payment_status: row.payment_status,
        purchased_at: row.purchased_at ? new Date(row.purchased_at).toLocaleString('id-ID') : '-',
        voucher_code: row.voucher_code,
        voucher_password: row.voucher_password || row.voucher_code,
        usage_status: usageStatus,
        usage_label: usageLabel,
        first_login_at: row.first_login_at ? new Date(row.first_login_at).toLocaleString('id-ID') : null,
        mac_address: row.mac_address || null,
        ip_address: row.ip_address || null,
        expired_at: row.expired_at ? new Date(row.expired_at).toLocaleString('id-ID') : null,
        router_name: row.router_name || 'Router MikroTik',
        hotspot_ip: row.hotspot_ip || '10.0.0.1',
        dns_name: row.dns_name || 'arab.net'
      };
    });

    const totalBuyers = buyers.length;
    const usedCount = buyers.filter(b => b.usage_status === 'active' || b.usage_status === 'expired').length;
    const unusedCount = totalBuyers - usedCount;
    const totalRevenue = buyers.reduce((sum, b) => sum + b.amount, 0);

    // Sync quota_sold back to customer_portal_config if out of sync
    try {
      const cfgRes = await pool.query(`SELECT value FROM system_settings WHERE key = 'customer_portal_config'`);
      if (cfgRes.rows.length > 0) {
        const portalConfig = JSON.parse(cfgRes.rows[0].value);
        if (portalConfig.flash_sale && portalConfig.flash_sale.quota_sold !== totalBuyers) {
          portalConfig.flash_sale.quota_sold = totalBuyers;
          await pool.query(
            `UPDATE system_settings SET value = $1, updated_at = NOW() WHERE key = 'customer_portal_config'`,
            [JSON.stringify(portalConfig)]
          );
        }
      }
    } catch (_) {}

    res.json({
      success: true,
      total_buyers: totalBuyers,
      used_count: usedCount,
      unused_count: unusedCount,
      total_revenue: totalRevenue,
      buyers
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Gagal memuat pembeli flash sale: ${err.message}`, buyers: [] });
  }
}



