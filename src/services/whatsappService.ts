/**
 * WhatsApp Gateway Dispatcher Service for ArbillPay System
 * Supports Direct Background System Dispatch (Fonnte / WABlas / Custom WA Gateway)
 * AND Fallback 1-Click WhatsApp App / Web Link
 */

export interface SendWAMessageParams {
  phone: string;
  message: string;
  gatewayToken?: string;
  gatewayUrl?: string;
}

export async function sendWhatsAppMessageDirect(params: SendWAMessageParams): Promise<{ success: boolean; mode: 'gateway' | 'click_to_send'; message?: string }> {
  const { phone, message, gatewayToken, gatewayUrl } = params;
  if (!phone) return { success: false, mode: 'click_to_send', message: 'Nomor telepon kosong' };

  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '62' + cleanPhone.slice(1);
  }

  // 1. If Direct WA Gateway Token is configured in Settings ➔ Direct Background System Dispatch!
  if (gatewayToken && gatewayToken.trim()) {
    try {
      const url = gatewayUrl || 'https://api.fonnte.com/send';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': gatewayToken.trim(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target: cleanPhone,
          message: message
        })
      });

      if (response.ok) {
        return { success: true, mode: 'gateway', message: '✅ Pesan WA berhasil dikirim otomatis oleh sistem!' };
      }
    } catch (err: any) {
      console.warn('WA Gateway API failed, falling back to 1-Click WhatsApp:', err);
    }
  }

  // 2. Fallback 1-Click WhatsApp Direct Dispatch
  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank');
  return { success: true, mode: 'click_to_send', message: '💬 Membuka WhatsApp 1-Klik...' };
}
