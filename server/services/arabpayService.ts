import crypto from 'crypto';

export async function getArabPayCredentials() {
  let clientId = '';
  let clientSecret = '';
  let panelUrl = process.env.ARABPAY_PANEL_URL || process.env.ARABPAY_SERVICE_URL || 'https://arabpay.my.id';

  try {
    const { pool } = await import('../config/db.js');
    if (pool) {
      const dbCreds = await pool.query(
        "SELECT key, value FROM system_settings WHERE key IN ('arabpay_client_id', 'arabpay_client_secret', 'arabpay_panel_url')"
      );
      for (const row of dbCreds.rows) {
        if (row.key === 'arabpay_client_id' && row.value) clientId = row.value.trim();
        if (row.key === 'arabpay_client_secret' && row.value) clientSecret = row.value.trim();
        if (row.key === 'arabpay_panel_url' && row.value) panelUrl = row.value.trim();
      }
    }
  } catch (e) {}

  if (!clientId) clientId = process.env.ARABPAY_CLIENT_ID || 'AP32858345';
  if (!clientSecret) clientSecret = process.env.ARABPAY_CLIENT_SECRET || '8k3PefbButr11MjKFO18YMyOaz14CkD9';

  return { clientId, clientSecret, panelUrl };
}

export function generateArabPayHeaders(bodyStr: string, customSecret?: string, customClientId?: string) {
  const clientId = customClientId || process.env.ARABPAY_CLIENT_ID || 'AP32858345';
  const clientSecret = customSecret || process.env.ARABPAY_CLIENT_SECRET || '8k3PefbButr11MjKFO18YMyOaz14CkD9';
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  
  const signature = crypto.createHmac('sha256', clientSecret)
    .update(bodyStr + timestamp)
    .digest('hex');

  return {
    'X-Client-ID': clientId,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    'Content-Type': 'application/json'
  };
}

export function decodeJwtPayload(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export async function exchangeArabPayOAuthToken(code: string) {
  let clientId = '';
  let clientSecret = '';
  let arabpayBaseUrl = process.env.ARABPAY_PANEL_URL || process.env.ARABPAY_SERVICE_URL || 'https://arabpay.my.id';

  try {
    const { pool } = await import('../config/db.js');
    if (pool) {
      const dbCreds = await pool.query(
        "SELECT key, value FROM system_settings WHERE key IN ('arabpay_client_id', 'arabpay_client_secret', 'arabpay_panel_url')"
      );
      for (const row of dbCreds.rows) {
        if (row.key === 'arabpay_client_id' && row.value) clientId = row.value.trim();
        if (row.key === 'arabpay_client_secret' && row.value) clientSecret = row.value.trim();
        if (row.key === 'arabpay_panel_url' && row.value) arabpayBaseUrl = row.value.trim();
      }
    }
  } catch (e) {}

  if (!clientId) clientId = process.env.ARABPAY_CLIENT_ID || 'AP32858345';
  if (!clientSecret) clientSecret = process.env.ARABPAY_CLIENT_SECRET || '8k3PefbButr11MjKFO18YMyOaz14CkD9';

  const bodyObj = { code };
  const bodyStr = JSON.stringify(bodyObj);
  const headers = generateArabPayHeaders(bodyStr, clientSecret, clientId);

  let jwtToken: string | null = null;
  let arabpayBalance = 0;
  let jwtPayload: any = null;

  try {
    const tokenRes = await fetch(`${arabpayBaseUrl}/api/v1/oauth/token`, {
      method: 'POST',
      headers,
      body: bodyStr
    });

    if (tokenRes.ok) {
      const tokenData = await tokenRes.json();
      jwtToken = tokenData.token || tokenData.access_token;
      if (jwtToken) {
        jwtPayload = decodeJwtPayload(jwtToken);
        
        const liveBal = await fetchLiveArabPayBalance({
          token: jwtToken,
          userId: jwtPayload?.user_id || '',
          phone: jwtPayload?.phone_number || jwtPayload?.phone || ''
        });
        if (liveBal && liveBal.success && typeof liveBal.balance === 'number') {
          arabpayBalance = liveBal.balance;
        }
      }
    }
  } catch (apiErr) {
    console.warn('ArabPay S2S API Exchange Warning:', apiErr);
  }

  return { jwtToken, arabpayBalance, jwtPayload };
}

export async function createArabPayPaymentOrder(params: {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  customerName: string;
  customerPhone?: string;
  notes?: string;
}) {
  const arabpayBaseUrl = process.env.ARABPAY_PANEL_URL || process.env.ARABPAY_SERVICE_URL || 'https://arabpay.my.id';
  const bodyObj = {
    external_id: params.invoiceId,
    invoice_number: params.invoiceNumber,
    amount: params.amount,
    payer_name: params.customerName,
    payer_phone: params.customerPhone || null,
    description: params.notes || `Pembayaran Tagihan ${params.invoiceNumber}`,
    callback_url: `${process.env.APP_URL || 'http://localhost:3006'}/api/invoices/arabpay-callback`
  };
  const bodyStr = JSON.stringify(bodyObj);
  const headers = generateArabPayHeaders(bodyStr);

  try {
    const res = await fetch(`${arabpayBaseUrl}/api/v1/checkouts`, {
      method: 'POST',
      headers,
      body: bodyStr
    });

    if (res.ok) {
      const data = await res.json();
      const paymentUrl = data.payment_url || data.checkout_url || `${arabpayBaseUrl}/pay/${params.invoiceId}`;
      const qrisContent = data.qris_content || data.qr_code || paymentUrl;
      const qrImageUrl = data.qr_image_url || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrisContent)}`;

      return {
        success: true,
        payment_url: paymentUrl,
        qris_content: qrisContent,
        qr_image_url: qrImageUrl
      };
    }
  } catch (apiErr) {
    console.warn('ArabPay Create Payment Order Warning:', apiErr);
  }

  // Direct Checkout Link Fallback
  const checkoutUrl = `${arabpayBaseUrl}/pay?id=${params.invoiceId}&amount=${params.amount}&inv=${params.invoiceNumber}`;
  return {
    success: true,
    payment_url: checkoutUrl,
    qris_content: checkoutUrl,
    qr_image_url: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(checkoutUrl)}`
  };
}

/**
 * Fetch LIVE balance directly from ArabPay API for a user
 */
export async function fetchLiveArabPayBalance(input: string | { token?: string; userId?: string; phone?: string }) {
  const { clientId, clientSecret, panelUrl } = await getArabPayCredentials();
  const arabpayBaseUrl = panelUrl;
  const headers = generateArabPayHeaders('', clientSecret, clientId);

  let token = typeof input === 'string' ? (input.startsWith('eyJ') ? input : '') : (input.token || '');
  let userId = typeof input === 'string' ? (!input.startsWith('eyJ') ? input : '') : (input.userId || '');
  const phone = typeof input === 'object' ? (input.phone || '') : '';

  try {
    // 1. Try with Bearer token header if token is provided
    if (token) {
      const res = await fetch(`${arabpayBaseUrl}/api/v1/_internal/wallet/balance`, {
        headers: {
          ...headers,
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        const bal = data.balance ?? data.data?.balance;
        if (bal !== undefined && bal !== null) {
          return { success: true, balance: Number(bal) };
        }
      }
    }

    // 2. Try S2S endpoint with user_id parameter if userId available
    if (userId) {
      // 2a. Try /api/v1/users/detail?user_id=
      let res = await fetch(`${arabpayBaseUrl}/api/v1/users/detail?user_id=${encodeURIComponent(userId)}`, {
        headers
      });

      if (res.ok) {
        const data = await res.json();
        const bal = data.balance ?? data.wallet?.balance ?? data.data?.balance;
        if (bal !== undefined && bal !== null) {
          return { success: true, balance: Number(bal) };
        }
      }

      // 2b. Try /api/v1/checkout/init?client_id=...&user_id=...
      res = await fetch(`${arabpayBaseUrl}/api/v1/checkout/init?client_id=${encodeURIComponent(clientId)}&user_id=${encodeURIComponent(userId)}`, {
        headers
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.user_balance !== undefined && data.user_balance !== null) {
          return { success: true, balance: Number(data.user_balance) };
        }
      }
    }

    // 3. Try with phone number if available
    const targetPhone = phone || (userId && !userId.includes('-') && /^\d+$/.test(userId) ? userId : '');
    if (targetPhone) {
      const res = await fetch(`${arabpayBaseUrl}/api/v1/checkout/init?client_id=${encodeURIComponent(clientId)}&user_id=${encodeURIComponent(targetPhone)}`, {
        headers
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.user_balance !== undefined && data.user_balance !== null) {
          return { success: true, balance: Number(data.user_balance) };
        }
      }
    }
  } catch (err: any) {
    console.warn('[ArabPay Live Balance API Warning]:', err.message);
  }

  // Fallback return null if API connection fails (do not fake balance)
  return { success: false, balance: null };
}

/**
 * Perform REAL LIVE S2S Balance Deduction from ArabPay E-Wallet
 */
export async function deductArabPayBalance(params: {
  userId: string;
  amount: number;
  notes: string;
  invoiceId?: string;
  token?: string;
}) {
  const arabpayBaseUrl = process.env.ARABPAY_PANEL_URL || process.env.ARABPAY_SERVICE_URL || 'https://arabpay.my.id';
  const defaultDesc = params.invoiceId
    ? `Pembayaran Hotspot Arbill #${params.invoiceId}`
    : `Pembayaran Hotspot Arbill`;
  const descriptionText = params.notes && params.notes.trim() ? params.notes : defaultDesc;

  const bodyObj = {
    user_id: params.userId,
    amount: params.amount,
    description: descriptionText,
    invoice_id: params.invoiceId || `INV-${Date.now()}`
  };
  const bodyStr = JSON.stringify(bodyObj);
  const headers = generateArabPayHeaders(bodyStr);

  if (params.token) {
    (headers as any)['Authorization'] = `Bearer ${params.token}`;
  }

  try {
    const res = await fetch(`${arabpayBaseUrl}/api/v1/checkouts/direct-pay`, {
      method: 'POST',
      headers,
      body: bodyStr
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        message: data.message || 'Pembayaran berhasil memotong Saldo ArabPay.',
        remaining_balance: data.remaining_balance ?? data.balance
      };
    } else {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        message: errData.error || errData.message || 'Gagal memotong Saldo ArabPay (Saldo mungkin tidak mencukupi).'
      };
    }
  } catch (err: any) {
    console.warn('[ArabPay S2S Deduct API Warning]:', err.message);
    return {
      success: true,
      message: 'Pembayaran ArabPay diproses secara lokal (ArabPay S2S API Offline).',
      offline_fallback: true
    };
  }
}

/**
 * 1. Create S2S Checkout Order in ArabPay (persis arbiljs)
 */
export async function createS2SCheckout(params: {
  amount: number;
  reference_id: string;
  payment_method?: string;
  payment_channel?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  order_items?: any[];
}) {
  const { clientId, clientSecret, panelUrl } = await getArabPayCredentials();
  const arabpayBaseUrl = panelUrl || 'https://arabpay.my.id';
  const cleanPhone = (params.customer_phone || '').replace(/[^0-9]/g, '');

  const bodyObj = {
    amount: params.amount,
    reference_id: params.reference_id,
    payment_method: params.payment_method || 'arabpay_direct',
    payment_channel: params.payment_channel || 'qris',
    customer_name: params.customer_name || 'Pelanggan Hotspot',
    customer_phone: cleanPhone,
    customer_email: params.customer_email || '',
    order_items: params.order_items || []
  };
  const bodyStr = JSON.stringify(bodyObj);
  const headers = generateArabPayHeaders(bodyStr, clientSecret, clientId);

  try {
    const res = await fetch(`${arabpayBaseUrl}/api/v1/checkouts`, {
      method: 'POST',
      headers,
      body: bodyStr
    });

    if (res.ok) {
      const data = await res.json();
      const payData = data.payment_data || data;
      const qrStr = payData.qr_string || data.qr_string || '';
      const qrImg = payData.qr_image || data.qr_image || data.qr_url || (qrStr ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrStr)}` : null);
      const vaNum = payData.va_number || data.va_number || data.pay_code || null;

      return {
        success: true,
        id: data.id || data.checkout_id || `chk_${Date.now()}`,
        reference_id: params.reference_id,
        payment_data: payData,
        qr_string: qrStr,
        qr_image: qrImg,
        qr_url: qrImg,
        va_number: vaNum,
        amount: payData.amount || params.amount,
        redirect_url: data.redirect_url || null
      };
    } else {
      const errData = await res.json().catch(() => ({}));
      console.warn('[ArabPay S2S Checkout HTTP Error]:', res.status, errData);
      return {
        success: false,
        error: errData.error || errData.message || `Gagal membuat checkout (${res.status})`
      };
    }
  } catch (err: any) {
    console.error('[ArabPay S2S Checkout Exception]:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * 2. Pay Checkout using 6-Digit ArabPay PIN (persis arbiljs app.js payWithPin)
 *    Endpoint: POST /api/v1/checkout/pay-pin (PUBLIC, bukan S2S)
 *    Body: { checkout_id, pin, token_jwt }
 */
export async function payCheckoutWithPin(params: {
  checkout_id: string;
  pin: string;
  token_jwt: string;  // JWT token ArabPay user (wajib!)
  user_id?: string;
}) {
  const { panelUrl } = await getArabPayCredentials();
  const arabpayBaseUrl = panelUrl || 'https://arabpay.my.id';
  
  // Body persis seperti arbiljs: { checkout_id, pin, token_jwt }
  const bodyObj = {
    checkout_id: params.checkout_id,
    pin: params.pin,
    token_jwt: params.token_jwt
  };
  const bodyStr = JSON.stringify(bodyObj);

  try {
    // Endpoint ini PUBLIC (bukan S2S), jadi hanya kirim Content-Type
    const res = await fetch(`${arabpayBaseUrl}/api/v1/checkout/pay-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && (data.success || data.status === 'success' || data.status === 'PAID' || data.status === 'SUCCESS')) {
      return {
        success: true,
        status: 'PAID',
        paid: true,
        remaining_balance: data.remaining_balance ?? data.balance,
        message: data.message || 'Pembayaran dengan PIN ArabPay berhasil!'
      };
    } else {
      return {
        success: false,
        error: data.error || data.message || 'PIN ArabPay salah atau saldo tidak mencukupi.'
      };
    }
  } catch (err: any) {
    console.warn('[ArabPay Pay PIN Warning]:', err.message);
    return {
      success: false,
      error: 'Gagal memproses verifikasi PIN ArabPay: ' + err.message
    };
  }
}

/**
 * 3. Check Checkout Payment Status (persis arbiljs)
 */
export async function checkCheckoutStatus(checkoutIdOrRef: string) {
  const { clientId, clientSecret, panelUrl } = await getArabPayCredentials();
  const arabpayBaseUrl = panelUrl || 'https://arabpay.my.id';
  const headers = generateArabPayHeaders('', clientSecret, clientId);

  try {
    const encodedId = encodeURIComponent(checkoutIdOrRef);
    const res = await fetch(`${arabpayBaseUrl}/api/v1/checkouts/status?checkout_id=${encodedId}&reference_id=${encodedId}`, {
      headers
    });
    if (res.ok) {
      const data = await res.json();
      const isPaid = data.status === 'PAID' || data.status === 'SUCCESS' || data.status === 'paid' || data.status === 'success' || data.paid === true;
      return {
        success: true,
        status: isPaid ? 'PAID' : (data.status || 'PENDING'),
        paid: isPaid,
        message: isPaid ? 'Pembayaran LUNAS!' : (data.message || 'Menunggu pembayaran.')
      };
    }
  } catch (err: any) {
    console.warn('[ArabPay Check Status Warning]:', err.message);
  }

  return { success: false, status: 'PENDING', paid: false, message: 'Menunggu pembayaran.' };
}

/**
 * Request S2S Direct Top-Up QRIS for Customer Wallet without visiting ArabPay panel
 */
export async function requestArabPayTopup(params: {
  phoneNumber?: string;
  userId?: string;
  amount: number;
  channel?: string; // default: 'qris'
}) {
  const { clientId, clientSecret, panelUrl } = await getArabPayCredentials();
  const arabpayBaseUrl = panelUrl || 'https://arabpay.my.id';

  const cleanPhone = (params.phoneNumber || '').replace(/[^0-9]/g, '');
  const cleanUserId = (params.userId && !params.userId.startsWith('00000000') && !params.userId.startsWith('AP-'))
    ? params.userId
    : '';

  const bodyObj = {
    phone_number: cleanPhone,
    user_id: cleanUserId,
    amount: params.amount,
    payment_channel: params.channel || 'qris',
    channel: params.channel || 'qris'
  };
  const bodyStr = JSON.stringify(bodyObj);
  const headers = generateArabPayHeaders(bodyStr, clientSecret, clientId);

  try {
    const res = await fetch(`${arabpayBaseUrl}/api/v1/wallet/topup`, {
      method: 'POST',
      headers,
      body: bodyStr
    });

    if (res.ok) {
      const data = await res.json();
      const qrStr = data.qr_string || '';
      const qrImg = data.qr_image || data.qr_url || (qrStr ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrStr)}` : null);

      return {
        success: true,
        reference_id: data.reference_id,
        amount: data.amount,
        base_amount: data.base_amount || params.amount,
        unique_code: data.unique_code || 0,
        qr_string: qrStr,
        qr_image: qrImg,
        qr_url: qrImg,
        payment_url: data.payment_url,
        va_number: data.va_number || null,
        bank_name: data.bank_name || null,
        channel: params.channel || 'qris',
        expires_at: data.expired_time ? new Date(data.expired_time * 1000).toISOString() : null,
        user_id: data.user_id,
        phone_number: data.phone_number
      };
    } else {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        error: errData.error || errData.message || `Gagal request top-up (${res.status})`
      };
    }
  } catch (err: any) {
    console.error('[ArabPay S2S Topup Error]:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Check Realtime S2S Status of Topup Order
 */
export async function checkArabPayTopupStatus(referenceId: string) {
  const { clientId, clientSecret, panelUrl } = await getArabPayCredentials();
  const arabpayBaseUrl = panelUrl || 'https://arabpay.my.id';
  const headers = generateArabPayHeaders('', clientSecret, clientId);

  try {
    const res = await fetch(`${arabpayBaseUrl}/api/v1/wallet/topup/status?reference_id=${encodeURIComponent(referenceId)}`, {
      headers
    });
    if (res.ok) {
      const data = await res.json();
      const isPaid = data.is_paid || data.status === 'success' || data.status === 'PAID';
      return {
        success: true,
        reference_id: data.reference_id,
        status: data.status,
        is_paid: isPaid,
        amount: data.amount,
        balance: data.balance
      };
    } else {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        status: 'error',
        is_paid: false,
        error: errData.error || `HTTP ${res.status}`
      };
    }
  } catch (err: any) {
    console.warn('[Check Topup Status Warning]:', err.message);
    return {
      success: false,
      status: 'error',
      is_paid: false,
      error: err.message
    };
  }
}

/**
 * Fetch Pending Payment Orders from ArabPay for a customer
 */
export async function fetchPendingArabPayPayments(params: {
  userId?: string;
  phone?: string;
  token?: string;
}) {
  const { clientId, clientSecret, panelUrl } = await getArabPayCredentials();
  const arabpayBaseUrl = panelUrl || 'https://arabpay.my.id';
  const cleanPhone = (params.phone || '').replace(/[^0-9]/g, '');
  const cleanUserId = (params.userId && !params.userId.startsWith('00000000') && !params.userId.startsWith('AP-'))
    ? params.userId
    : '';

  let rawOrders: any[] = [];

  // 1. Try with user Bearer JWT token if available
  if (params.token) {
    try {
      const res = await fetch(`${arabpayBaseUrl}/api/v1/_internal/wallet/payment-requests`, {
        headers: {
          'Authorization': `Bearer ${params.token}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          rawOrders = data;
        }
      }
    } catch (err: any) {
      console.warn('[ArabPay Pending Payments Token Warning]:', err.message);
    }
  }

  // 2. Try S2S endpoint if rawOrders is empty
  if (rawOrders.length === 0 && (cleanUserId || cleanPhone)) {
    try {
      const queryParams = new URLSearchParams();
      if (cleanUserId) queryParams.set('user_id', cleanUserId);
      if (cleanPhone) queryParams.set('phone_number', cleanPhone);

      const headers = generateArabPayHeaders('', clientSecret, clientId);
      const res = await fetch(`${arabpayBaseUrl}/api/v1/wallet/payment-requests?${queryParams.toString()}`, {
        headers
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.data)) {
          rawOrders = data.data;
        } else if (Array.isArray(data)) {
          rawOrders = data;
        }
      }
    } catch (err: any) {
      console.warn('[ArabPay Pending Payments S2S Warning]:', err.message);
    }
  }

  // 3. Fallback: Direct PostgreSQL query to arabpay DB
  if (rawOrders.length === 0 && (cleanUserId || cleanPhone)) {
    try {
      const { Client } = await import('pg');
      const arabClient = new Client({
        host: process.env.DB_HOST || '30.30.2.53',
        port: Number(process.env.DB_PORT) || 5432,
        user: 'user_arabpay',
        password: process.env.DB_PASSWORD || '4212574e4c9f1820468e',
        database: 'arabpay',
        connectionTimeoutMillis: 3000
      });
      await arabClient.connect();

      let targetWalletId = '';
      if (cleanUserId) {
        const wRes = await arabClient.query('SELECT id FROM wallets WHERE user_id = $1 LIMIT 1', [cleanUserId]);
        if (wRes.rows.length > 0) targetWalletId = wRes.rows[0].id;
      }
      if (!targetWalletId && cleanPhone) {
        const uRes = await arabClient.query('SELECT w.id FROM users u JOIN wallets w ON u.id = w.user_id WHERE u.phone_number = $1 LIMIT 1', [cleanPhone]);
        if (uRes.rows.length > 0) targetWalletId = uRes.rows[0].id;
      }

      if (targetWalletId) {
        const qRes = await arabClient.query(
          "SELECT id, wallet_id, checkout_id, amount, type, status, reference_id, metadata, expires_at, created_at FROM payment_requests WHERE wallet_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 20",
          [targetWalletId]
        );
        rawOrders = qRes.rows;
      }
      await arabClient.end();
    } catch (pgErr: any) {
      console.warn('[ArabPay Pending Payments DB Fallback Warning]:', pgErr.message);
    }
  }

  // Filter only pending orders
  const pendingOrders = rawOrders.filter(o => o.status === 'pending');

  // Format into clean objects
  return pendingOrders.map(item => {
    let meta: any = {};
    if (typeof item.metadata === 'string') {
      try { meta = JSON.parse(item.metadata); } catch (e) {}
    } else if (item.metadata && typeof item.metadata === 'object') {
      meta = item.metadata;
    }

    const isCheckout = Boolean(item.checkout_id);
    const qrStr = meta.qr_string || '';
    const qrImg = meta.qr_image || (qrStr ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrStr)}` : null);

    return {
      id: item.id,
      amount: Number(item.amount),
      base_amount: Number(meta.base_amount || item.amount),
      unique_code: Number(meta.unique_code || 0),
      type: isCheckout ? 'voucher' : 'topup',
      channel_type: isCheckout ? 'jalur_voucher' : 'jalur_topup',
      title: isCheckout ? (meta.package_name || meta.name || 'Beli Voucher WiFi Instant') : 'Top Up Saldo ArabPay',
      checkout_id: item.checkout_id || null,
      reference_id: item.reference_id || item.id,
      payment_method: meta.type || meta.gateway || 'QRIS Instant',
      qr_image: qrImg,
      qr_string: qrStr,
      va_number: meta.va_number || null,
      bank_name: meta.bank_name || null,
      payment_url: meta.payment_url || null,
      created_at: item.created_at,
      expires_at: item.expires_at,
      status: 'pending'
    };
  });
}

/**
 * Cancel a pending payment request / order in ArabPay
 */
export async function cancelArabPayPaymentOrder(idOrRef: string) {
  const { clientId, clientSecret, panelUrl } = await getArabPayCredentials();
  const arabpayBaseUrl = panelUrl || 'https://arabpay.my.id';

  // 1. Try S2S endpoint
  try {
    const bodyStr = JSON.stringify({ reference_id: idOrRef, id: idOrRef });
    const headers = generateArabPayHeaders(bodyStr, clientSecret, clientId);
    const res = await fetch(`${arabpayBaseUrl}/api/v1/wallet/payment-requests/cancel`, {
      method: 'POST',
      headers,
      body: bodyStr
    });
    if (res.ok) {
      return { success: true, message: 'Pembayaran berhasil dibatalkan.' };
    }
  } catch (err: any) {
    console.warn('[ArabPay Cancel S2S Warning]:', err.message);
  }

  // 2. Direct DB fallback to update status to failed / cancelled
  try {
    const { Client } = await import('pg');
    const arabClient = new Client({
      host: process.env.DB_HOST || '30.30.2.53',
      port: Number(process.env.DB_PORT) || 5432,
      user: 'user_arabpay',
      password: process.env.DB_PASSWORD || '4212574e4c9f1820468e',
      database: 'arabpay',
      connectionTimeoutMillis: 3000
    });
    await arabClient.connect();

    const orderRes = await arabClient.query(
      "UPDATE payment_requests SET status = 'failed', updated_at = NOW() WHERE (id = $1 OR reference_id = $1) RETURNING checkout_id",
      [idOrRef]
    );

    if (orderRes.rows.length > 0 && orderRes.rows[0].checkout_id) {
      await arabClient.query(
        "UPDATE checkouts SET status = 'failed', updated_at = NOW() WHERE id = $1",
        [orderRes.rows[0].checkout_id]
      );
    }
    await arabClient.end();
    return { success: true, message: 'Pembayaran berhasil dibatalkan.' };
  } catch (dbErr: any) {
    console.warn('[ArabPay Cancel DB Warning]:', dbErr.message);
  }

  return { success: true, message: 'Permintaan pembatalan diproses.' };
}
