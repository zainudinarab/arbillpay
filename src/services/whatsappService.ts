/**
 * WhatsApp Multi-Engine Gateway Dispatcher Service for ArbillPay System
 * Supports Direct Background System Dispatch for GoWA, WAHA, WuzAPI, and Fonnte
 * AND Fallback 1-Click WhatsApp App / Web Link
 */

import { getNotificationGatewaySettingsFromFirestore } from './firebaseService';

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

  // 1. Fetch saved gateway configuration
  let config: any = null;
  try {
    const res = await getNotificationGatewaySettingsFromFirestore();
    if (res.success && res.config) {
      config = res.config;
    }
  } catch (err) {}

  const activeEngine = config?.activeEngine || 'gowa';

  if (activeEngine !== 'disabled') {
    let targetUrl = gatewayUrl || '';
    let token = gatewayToken || '';
    let headers: any = { 'Content-Type': 'application/json' };
    let body: any = {};

    // 🟢 A. GoWA Engine Config
    if (activeEngine === 'gowa') {
      targetUrl = config?.gowa?.url || gatewayUrl || 'http://localhost:3000/api/send';
      token = config?.gowa?.token || gatewayToken || '';
      headers['Authorization'] = token;
      headers['X-API-KEY'] = token;
      body = {
        target: cleanPhone,
        phone: cleanPhone,
        message: message
      };
    }
    // 🔵 B. WAHA Engine Config
    else if (activeEngine === 'waha') {
      targetUrl = config?.waha?.url || gatewayUrl || 'http://localhost:3000/api/sendText';
      token = config?.waha?.token || gatewayToken || '';
      const session = config?.waha?.session || 'default';
      if (token) headers['X-Api-Key'] = token;
      body = {
        chatId: `${cleanPhone}@c.us`,
        session: session,
        text: message
      };
    }
    // 🟠 C. WuzAPI Engine Config
    else if (activeEngine === 'wuzapi') {
      targetUrl = config?.wuzapi?.url || gatewayUrl || 'http://localhost:8080/chat/send/text';
      token = config?.wuzapi?.token || gatewayToken || '';
      if (token) headers['token'] = token;
      body = {
        Phone: cleanPhone,
        Body: message
      };
    }
    // 🟣 D. Fonnte Engine Config
    else {
      targetUrl = config?.fonnte?.url || gatewayUrl || 'https://api.fonnte.com/send';
      token = config?.fonnte?.token || gatewayToken || '';
      if (token) headers['Authorization'] = token;
      body = {
        target: cleanPhone,
        message: message
      };
    }

    // Execute HTTP POST if Token / URL is configured
    if (targetUrl && (token || activeEngine === 'gowa' || activeEngine === 'waha')) {
      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body)
        });

        if (response.ok) {
          return {
            success: true,
            mode: 'gateway',
            message: `✅ Pesan WA berhasil dikirim otomatis oleh Engine ${activeEngine.toUpperCase()}!`
          };
        }
      } catch (err: any) {
        console.warn(`WA Gateway API (${activeEngine}) failed, falling back to 1-Click WhatsApp:`, err);
      }
    }
  }

  // 2. Fallback 1-Click WhatsApp Direct Dispatch
  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank');
  return { success: true, mode: 'click_to_send', message: '💬 Membuka WhatsApp 1-Klik...' };
}
