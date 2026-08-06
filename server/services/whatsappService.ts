export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  }
  return cleaned;
}

export async function sendWhatsAppMessage(toPhone: string, message: string): Promise<{ success: boolean; message: string; data?: any }> {
  const provider = (process.env.WA_PROVIDER || 'waha').toLowerCase();
  const gatewayUrl = (process.env.WA_GATEWAY_URL || 'http://localhost:3000').replace(/\/$/, '');
  const apiKey = process.env.WA_API_KEY || '';
  const session = process.env.WA_SESSION || 'default';
  
  const formattedPhone = formatPhoneNumber(toPhone);
  if (!formattedPhone) {
    return { success: false, message: 'Nomor WhatsApp tidak valid atau kosong.' };
  }

  try {
    if (provider === 'waha') {
      // WAHA (WhatsApp HTTP API)
      const res = await fetch(`${gatewayUrl}/api/sendText`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'X-Api-Key': apiKey } : {})
        },
        body: JSON.stringify({
          session,
          chatId: `${formattedPhone}@c.us`,
          text: message
        })
      });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, message: res.ok ? 'Pesan WAHA terkirim' : (data.message || 'Gagal WAHA'), data };

    } else if (provider === 'gowa') {
      // GoWA (Golang WhatsApp API)
      const res = await fetch(`${gatewayUrl}/send/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          phone: formattedPhone,
          message: message
        })
      });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, message: res.ok ? 'Pesan GoWA terkirim' : (data.message || 'Gagal GoWA'), data };

    } else if (provider === 'wuzapi') {
      // WuzAPI (Baileys Golang HTTP API)
      const res = await fetch(`${gatewayUrl}/chat/send/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Token': apiKey } : {})
        },
        body: JSON.stringify({
          Phone: formattedPhone,
          Body: message
        })
      });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, message: res.ok ? 'Pesan WuzAPI terkirim' : (data.message || 'Gagal WuzAPI'), data };

    } else {
      // Generic / Fonnte / Wablas / Custom Webhook
      const res = await fetch(`${gatewayUrl}/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': apiKey } : {})
        },
        body: JSON.stringify({
          target: formattedPhone,
          phone: formattedPhone,
          message: message
        })
      });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, message: res.ok ? 'Pesan WA terkirim' : 'Gagal kirim WA', data };
    }
  } catch (err: any) {
    console.warn(`WhatsApp Gateway Send Warning [${provider}]:`, err.message);
    return { success: false, message: `Gagal koneksi ke WA Gateway (${provider}): ${err.message}` };
  }
}

export async function sendInvoicePaymentLinkWA(params: {
  customerName: string;
  phone: string;
  invoiceNumber: string;
  amount: number;
  paymentUrl: string;
  dueDate?: string;
}) {
  const formattedAmount = `Rp ${Number(params.amount || 0).toLocaleString('id-ID')}`;
  const text = `Halo Yth. *${params.customerName}*,\n\n` +
    `Berikut adalah tagihan internet Anda dari *Arbill*:\n` +
    `• *No. Tagihan*: ${params.invoiceNumber}\n` +
    `• *Total Tagihan*: ${formattedAmount}\n` +
    (params.dueDate ? `• *Jatuh Tempo*: ${params.dueDate}\n\n` : '\n') +
    `Silakan klik tautan di bawah ini untuk membayar via *ArabPay / QRIS* (1-Click Langsung Lunas & Otomatis Aktif):\n` +
    `👉 ${params.paymentUrl}\n\n` +
    `Terima kasih! 🙏`;

  return sendWhatsAppMessage(params.phone, text);
}
