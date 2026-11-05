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
