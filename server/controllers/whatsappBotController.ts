import { Request, Response } from 'express';
import { RouterOSAPI } from 'node-routeros';
import { pool } from '../config/db.js';
import { sendWhatsAppMessage, formatPhoneNumber } from '../services/whatsappService.js';
import { sendTelegramMessage } from '../services/telegramAlertService.js';

interface BusinessInfo {
  name: string;
  phone: string;
  portalUrl: string;
}

async function getBusinessInfo(): Promise<BusinessInfo> {
  let name = 'Arbill Network';
  let phone = '08123456789';
  let portalUrl = process.env.BILLING_SERVER_URL || 'https://arbill.arabpay.my.id';

  try {
    const res = await pool.query("SELECT value FROM system_settings WHERE key = 'business_profile' LIMIT 1");
    if (res.rows.length > 0 && res.rows[0].value) {
      const parsed = typeof res.rows[0].value === 'string' ? JSON.parse(res.rows[0].value) : res.rows[0].value;
      if (parsed.name) name = parsed.name;
      if (parsed.phone) phone = parsed.phone;
      if (parsed.website) portalUrl = parsed.website;
    }
  } catch (_) {}

  return { name, phone, portalUrl };
}

/**
 * Kick / Disconnect sesi PPPoE aktif di MikroTik agar dial-up ulang
 */
async function kickMikrotikPppUser(routerId: string | null, pppoeUsername: string): Promise<boolean> {
  if (!pppoeUsername) return false;
  try {
    let routerQuery = 'SELECT * FROM routers WHERE id = $1 LIMIT 1';
    let params: any[] = [routerId];
    if (!routerId || routerId === 'default') {
      routerQuery = 'SELECT * FROM routers WHERE status = $1 ORDER BY id ASC LIMIT 1';
      params = ['online'];
    }

    const rRes = await pool.query(routerQuery, params);
    if (rRes.rows.length === 0) return false;

    const router = rRes.rows[0];
    const conn = new RouterOSAPI({
      host: router.ip_address,
      port: router.api_port || 8728,
      user: router.username || 'admin',
      password: router.password || '',
      timeout: 5
    });

    await conn.connect();
    const activeSessions: any = await conn.write('/ppp/active/print', [
      `?name=${pppoeUsername}`
    ]);

    if (Array.isArray(activeSessions) && activeSessions.length > 0) {
      for (const item of activeSessions) {
        if (item['.id']) {
          await conn.write('/ppp/active/remove', [`=.id=${item['.id']}`]);
        }
      }
    }
    await conn.close();
    return true;
  } catch (err: any) {
    console.warn(`[WA BOT] Gagal kick PPPoE user '${pppoeUsername}' di MikroTik:`, err.message);
    return false;
  }
}

/**
 * Normalisasi nomor WhatsApp dari berbagai gateway (WAHA, GoWA, WuzAPI, Fonnte, Meta)
 */
function extractSenderAndMessage(body: any): { sender: string; text: string; fromMe: boolean } {
  let sender = '';
  let text = '';
  let fromMe = false;

  // 1. WAHA format
  if (body?.event === 'message' || body?.payload?.body) {
    const p = body.payload || body;
    sender = p.from || p.participant || '';
    text = p.body || '';
    fromMe = p.fromMe === true;
  }
  // 2. GoWA format
  else if (body?.phone || (body?.sender && body?.message)) {
    sender = body.sender || body.phone || '';
    text = body.message || '';
    fromMe = body.from_me === true;
  }
  // 3. WuzAPI format
  else if (body?.type === 'chat' || body?.body) {
    sender = body.sender || body.from || '';
    text = body.body || '';
    fromMe = body.fromMe === true;
  }
  // 4. Fonnte format
  else if (body?.sender && (body?.message || body?.text)) {
    sender = body.sender || '';
    text = body.message || body.text || '';
    fromMe = false;
  }
  // 5. Generic Fallback
  else {
    sender = body?.sender || body?.phone || body?.from || '';
    text = body?.message || body?.body || body?.text || '';
    fromMe = body?.fromMe === true || body?.from_me === true;
  }

  // Bersihkan format JID (@c.us / @s.whatsapp.net / dll)
  sender = sender.replace(/@.*$/, '').replace(/\D/g, '');
  if (sender.startsWith('0')) {
    sender = '62' + sender.substring(1);
  }

  return { sender, text: (text || '').trim(), fromMe };
}

/**
 * ==============================================================
 * ENGINE KECERDASAN BUATAN (AI NLU CUSTOMER ASSISTANT)
 * Mendukung Google Gemini, OpenAI, & Groq
 * ==============================================================
 */
export interface AiWaConfig {
  enabled: boolean;
  provider: 'gemini' | 'openai' | 'groq';
  apiKey: string;
  model: string;
}

export async function getAiConfig(): Promise<AiWaConfig> {
  let enabled = process.env.AI_WA_ENABLED === 'true';
  let provider: any = process.env.AI_WA_PROVIDER || 'gemini';
  let apiKey = process.env.GEMINI_API_KEY || process.env.AI_WA_API_KEY || '';
  let model = process.env.AI_WA_MODEL || 'gemini-1.5-flash';

  try {
    const res = await pool.query(
      "SELECT key, value FROM system_settings WHERE key IN ('ai_wa_enabled', 'ai_wa_provider', 'ai_wa_api_key', 'ai_wa_model')"
    );
    for (const r of res.rows) {
      if (r.key === 'ai_wa_enabled') enabled = r.value === 'true' || r.value === '1';
      if (r.key === 'ai_wa_provider' && r.value) provider = r.value;
      if (r.key === 'ai_wa_api_key' && r.value) apiKey = r.value.trim();
      if (r.key === 'ai_wa_model' && r.value) model = r.value.trim();
    }
  } catch (_) {}

  return { enabled, provider, apiKey, model };
}

async function queryGemini(apiKey: string, prompt: string, systemPrompt: string, model = 'gemini-1.5-flash'): Promise<string | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
      }),
      signal: AbortSignal.timeout(9000)
    });
    if (!res.ok) {
      console.warn('[GEMINI AI WARNING] Status:', res.status);
      return null;
    }
    const data: any = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (err: any) {
    console.warn('[GEMINI AI FETCH ERROR]', err.message);
    return null;
  }
}

async function queryOpenAi(apiKey: string, prompt: string, systemPrompt: string, model = 'gpt-4o-mini', baseUrl = 'https://api.openai.com/v1'): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 600
      }),
      signal: AbortSignal.timeout(9000)
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (err: any) {
    console.warn('[OPENAI AI FETCH ERROR]', err.message);
    return null;
  }
}

/**
 * Menjawab pertanyaan pelanggan dengan kecerdasan buatan berbasis konteks data riil ISP
 */
async function askAiCustomerAssistant(customer: any, biz: BusinessInfo, userMessage: string): Promise<string | null> {
  const aiCfg = await getAiConfig();
  if (!aiCfg.enabled || !aiCfg.apiKey) return null;

  const customerName = customer.name || 'Pelanggan';
  const customerCode = customer.customer_code || customer.pppoe_username || '-';
  const packageName = customer.package_name || 'Internet PPPoE';
  const speed = customer.speed_limit || 'Normal';
  const status = customer.status || 'active';
  const expiredAt = customer.expired_at ? new Date(customer.expired_at).toLocaleDateString('id-ID') : 'Aktif';

  // 1. Cek ringkasan tagihan riil
  let invoiceSummary = 'Seluruh tagihan sudah lunas. Tidak ada tagihan tertunggak.';
  try {
    const invRes = await pool.query(
      "SELECT * FROM invoices WHERE customer_id = $1 AND status IN ('unpaid', 'pending', 'overdue') ORDER BY due_date ASC LIMIT 1",
      [customer.id]
    );
    if (invRes.rows.length > 0) {
      const inv = invRes.rows[0];
      const amount = Number(inv.amount || 0);
      const dueDate = inv.due_date ? new Date(inv.due_date).toLocaleDateString('id-ID') : 'Segera';
      const payUrl = `${biz.portalUrl}/portal/pay/${inv.id}`;
      invoiceSummary = `Ada tagihan BELUM LUNAS sebesar Rp ${amount.toLocaleString('id-ID')} (Jatuh tempo: ${dueDate}). Tautan bayar instan QRIS/VA: ${payUrl}`;
    }
  } catch (_) {}

  // 2. Cek kuota FUP bulan berjalan
  let usageSummary = 'Normal';
  try {
    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const usageRes = await pool.query(
      "SELECT total_bytes, is_fup FROM customer_monthly_usages WHERE customer_id = $1 AND year_month = $2 LIMIT 1",
      [customer.id, currentYm]
    );
    if (usageRes.rows.length > 0) {
      const u = usageRes.rows[0];
      const gb = (Number(u.total_bytes || 0) / (1024 * 1024 * 1024)).toFixed(2);
      usageSummary = `Terpakai ${gb} GB bulan ini. ${u.is_fup ? 'Peringatan: Melebihi kuota FUP (kecepatan disesuaikan)' : 'Kecepatan normal'}`;
    }
  } catch (_) {}

  const systemInstruction = 
    `Anda adalah Asisten Virtual Pintar dan Ramah (Customer Service AI) untuk penyedia layanan internet "${biz.name}".\n\n` +
    `Konteks Data Pelanggan yang sedang berkomunikasi dengan Anda:\n` +
    `- Nama Pelanggan: ${customerName}\n` +
    `- ID / Username: ${customerCode}\n` +
    `- Paket Internet: ${packageName} (${speed})\n` +
    `- Status Akun: ${status}\n` +
    `- Masa Aktif: ${expiredAt}\n` +
    `- Status Tagihan: ${invoiceSummary}\n` +
    `- Kuota & FUP: ${usageSummary}\n` +
    `- Kontak Admin / CS: ${biz.phone}\n` +
    `- Portal Layanan: ${biz.portalUrl}\n\n` +
    `Panduan Gaya & Tanggapan:\n` +
    `1. Balas dengan bahasa Indonesia yang ramah, sopan, santun, dan solutif layaknya Customer Service profesional ISP.\n` +
    `2. Jika pelanggan menanyakan tagihan atau cara bayar, sampaikan status tagihannya dan sertakan tautan bayar QRIS jika ada tagihan tertunggak.\n` +
    `3. Jika pelanggan mengeluhkan koneksi lemot / macet / ingin refresh, jelaskan dengan tenang dan cantumkan kode [ACTION:RESTART] di akhir balasan Anda agar sistem kami otomatis mereset sesi MikroTik & modem pelanggan.\n` +
    `4. Jika pelanggan mengeluhkan lampu modem LOS merah (kabel putus) atau kerusakan fisik yang membutuhkan kunjungan teknisi, beri tahu bahwa tiket telah dibuat dan cantumkan kode [ACTION:ESCALATE_CS] di akhir balasan Anda.\n` +
    `5. Gunakan format WhatsApp (*tebal*, _miring_).\n` +
    `6. Jangan pernah mengarang data yang tidak ada di konteks. Jawaban harus padat, informatif, dan tidak bertele-tele.`;

  let aiReply: string | null = null;
  if (aiCfg.provider === 'gemini') {
    aiReply = await queryGemini(aiCfg.apiKey, userMessage, systemInstruction, aiCfg.model || 'gemini-1.5-flash');
  } else if (aiCfg.provider === 'groq') {
    aiReply = await queryOpenAi(aiCfg.apiKey, userMessage, systemInstruction, aiCfg.model || 'llama-3.3-70b-versatile', 'https://api.groq.com/openai/v1');
  } else {
    aiReply = await queryOpenAi(aiCfg.apiKey, userMessage, systemInstruction, aiCfg.model || 'gpt-4o-mini', 'https://api.openai.com/v1');
  }

  if (!aiReply) return null;

  // Tangani Action Tag [ACTION:RESTART]
  if (aiReply.includes('[ACTION:RESTART]')) {
    aiReply = aiReply.replace(/\[ACTION:RESTART\]/g, '').trim();
    if (customer.pppoe_username) {
      kickMikrotikPppUser(customer.router_id, customer.pppoe_username).catch(() => {});
    }
  }

  // Tangani Action Tag [ACTION:ESCALATE_CS]
  if (aiReply.includes('[ACTION:ESCALATE_CS]')) {
    aiReply = aiReply.replace(/\[ACTION:ESCALATE_CS\]/g, '').trim();
    const tgMsg =
      `🆘 <b>TIKET ESKALASI GANGGUAN (AI BOT WA)</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>Pelanggan:</b> ${customerName} (<code>${customerCode}</code>)\n` +
      `📱 <b>No. WhatsApp:</b> <a href="https://wa.me/${customer.phone_number}">+${customer.phone_number}</a>\n` +
      `📦 <b>Paket:</b> ${packageName}\n` +
      `💬 <b>Keluhan Pelanggan:</b> <i>"${userMessage}"</i>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `<i>AI mendeteksi kendala fisik/kabel LOS. Mohon tim teknisi segera merespons.</i>`;
    sendTelegramMessage(tgMsg).catch(() => {});
  }

  return aiReply;
}

/**
 * Webhook Handler: Menerima pesan masuk WhatsApp dan membalas otomatis secara interaktif
 */
export async function handleWhatsAppWebhook(req: Request, res: Response) {
  // Langsung kirim respons 200 OK ke gateway WA agar koneksi webhook tidak timeout
  res.status(200).json({ success: true, received: true });

  try {
    const { sender, text, fromMe } = extractSenderAndMessage(req.body);

    // Abaikan jika pesan dikirim dari nomor bot itu sendiri atau pesan kosong
    if (fromMe || !sender || !text) {
      return;
    }

    // Abaikan broadcast grup atau notifikasi internal
    if (sender.includes('status') || sender.length < 8) {
      return;
    }

    console.log(`[WA BOT] 📩 Pesan masuk dari +${sender}: "${text}"`);

    const biz = await getBusinessInfo();
    const cleanPhone = sender;
    const localPhone = cleanPhone.startsWith('62') ? '0' + cleanPhone.substring(2) : cleanPhone;

    // Cari pelanggan berdasarkan nomor WhatsApp (format 628... atau 08...)
    const custRes = await pool.query(`
      SELECT c.*, p.name as package_name, p.speed_limit, p.price as package_price,
             r.name as router_name, r.id as router_id
      FROM customers c
      LEFT JOIN packages p ON c.package_id = p.id
      LEFT JOIN routers r ON c.router_id = r.id
      WHERE REPLACE(REPLACE(REPLACE(c.phone_number, '+', ''), '-', ''), ' ', '') IN ($1, $2)
      LIMIT 1
    `, [cleanPhone, localPhone]);

    const customer = custRes.rows[0];

    // Jika nomor tidak terdaftar sebagai pelanggan
    if (!customer) {
      const lower = text.toLowerCase();
      if (['halo', 'hai', 'p', 'tagihan', 'info', 'bantuan', 'menu', '1', '2', '3'].includes(lower)) {
        const notRegMsg =
          `Halo! Terima kasih telah menghubungi *${biz.name}*. 👋\n\n` +
          `Nomor WhatsApp Anda (*+${cleanPhone}*) belum terdaftar dalam sistem pelanggan kami.\n\n` +
          `Jika Anda adalah pelanggan aktif, silakan hubungi tim Admin/CS kami di *${biz.phone}* untuk mendaftarkan nomor ini.\n\n` +
          `🌐 Portal Layanan: ${biz.portalUrl}`;
        await sendWhatsAppMessage(cleanPhone, notRegMsg);
      }
      return;
    }

    const customerName = customer.name;
    const customerCode = customer.customer_code || customer.pppoe_username || '-';
    const cleanCmd = text.toLowerCase().trim();

    // 1. Jika pesan berupa kalimat bebas / percakapan, prioritaskan kecerdasan buatan AI NLU!
    const isDirectMenuCmd = ['1', '2', '3', '4', '5', 'menu', 'bantuan', 'help'].includes(cleanCmd);
    if (!isDirectMenuCmd && text.length > 3) {
      try {
        const aiResponse = await askAiCustomerAssistant(customer, biz, text);
        if (aiResponse) {
          console.log(`[WA BOT] 🧠 AI Assistant merespons chat dari "${customerName}"`);
          await sendWhatsAppMessage(cleanPhone, aiResponse);
          return;
        }
      } catch (aiErr: any) {
        console.warn('[WA BOT] AI processing fallback notice:', aiErr.message);
      }
    }

    // ==========================================
    // MENU 1: CEK TAGIHAN & BAYAR (QRIS / LINK)
    // ==========================================
    if (
      cleanCmd === '1' ||
      cleanCmd.includes('tagihan') ||
      cleanCmd.includes('bayar') ||
      cleanCmd.includes('invoice') ||
      cleanCmd.includes('qris')
    ) {
      // Cari invoice unpaid / overdue pelanggan ini
      const invRes = await pool.query(`
        SELECT * FROM invoices 
        WHERE customer_id = $1 AND status IN ('unpaid', 'pending', 'overdue')
        ORDER BY due_date ASC, created_at DESC LIMIT 1
      `, [customer.id]);

      if (invRes.rows.length === 0) {
        const paidMsg =
          `✅ *TAGIHAN ANDA LUNAS*\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `Halo Kak *${customerName}*,\n` +
          `Seluruh tagihan internet Anda saat ini sudah *LUNAS*. Tidak ada pembayaran yang tertunda.\n\n` +
          `📅 *Masa Aktif Layanan:* ${customer.expired_at ? new Date(customer.expired_at).toLocaleDateString('id-ID') : 'Aktif'}\n` +
          `📦 *Paket:* ${customer.package_name || 'Internet PPPoE'}\n\n` +
          `Terima kasih telah berlangganan bersama *${biz.name}*! 🙏`;
        await sendWhatsAppMessage(cleanPhone, paidMsg);
        return;
      }

      const inv = invRes.rows[0];
      const amount = Number(inv.amount || 0);
      const dueDate = inv.due_date ? new Date(inv.due_date).toLocaleDateString('id-ID') : 'Segera';
      const paymentUrl = `${biz.portalUrl}/portal/pay/${inv.id}`;

      const billMsg =
        `📄 *RINCIAN TAGIHAN INTERNET*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Pelanggan:* ${customerName}\n` +
        `🔑 *ID Pelanggan:* \`${customerCode}\`\n` +
        `📦 *Paket:* ${customer.package_name || '-'}\n` +
        `📑 *No. Invoice:* \`${inv.invoice_number || inv.id}\`\n` +
        `📅 *Jatuh Tempo:* ${dueDate}\n` +
        `💰 *Total Bayar:* *Rp ${amount.toLocaleString('id-ID')}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `💳 *Cara Pembayaran Otomatis (QRIS / VA):*\n` +
        `Klik tautan di bawah ini untuk bayar instan:\n` +
        `👉 ${paymentUrl}\n\n` +
        `_Setelah bayar, sistem otomatis memverifikasi dan membuka isolir tanpa perlu kirim struk manual!_`;

      await sendWhatsAppMessage(cleanPhone, billMsg);
      return;
    }

    // ==========================================
    // MENU 2: CEK STATUS & KUOTA FUP
    // ==========================================
    if (
      cleanCmd === '2' ||
      cleanCmd.includes('status') ||
      cleanCmd.includes('kuota') ||
      cleanCmd.includes('fup') ||
      cleanCmd.includes('speed')
    ) {
      // Ambil pemakaian bulan ini dari customer_monthly_usages
      const now = new Date();
      const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const usageRes = await pool.query(`
        SELECT total_bytes, quota_mb, is_fup FROM customer_monthly_usages
        WHERE customer_id = $1 AND year_month = $2 LIMIT 1
      `, [customer.id, currentYm]);

      let usageStr = '0 MB';
      let fupStatusStr = 'Normal (Kecepatan Maksimal)';
      if (usageRes.rows.length > 0) {
        const row = usageRes.rows[0];
        const bytes = Number(row.total_bytes || 0);
        const gb = (bytes / (1024 * 1024 * 1024)).toFixed(2);
        usageStr = `${gb} GB`;
        if (row.is_fup) {
          fupStatusStr = '⚠️ Melebihi Batas FUP (Kecepatan Disesuaikan)';
        }
      }

      const statusMsg =
        `📊 *STATUS KONEKSI & PAKET*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Pelanggan:* ${customerName}\n` +
        `🔑 *Username PPPoE:* \`${customer.pppoe_username || customerCode}\`\n` +
        `📦 *Paket Langganan:* ${customer.package_name || '-'} (${customer.speed_limit || 'Normal'})\n` +
        `🟢 *Status Akun:* *${(customer.status || 'active').toUpperCase()}*\n` +
        `📶 *Pemakaian Bulan Ini:* *${usageStr}*\n` +
        `⚡ *Kondisi Bandwidth:* ${fupStatusStr}\n` +
        `📅 *Berlaku Sampai:* ${customer.expired_at ? new Date(customer.expired_at).toLocaleDateString('id-ID') : 'Aktif'}\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `_Ketik *RESTART* jika koneksi lambat untuk refresh jaringan._`;

      await sendWhatsAppMessage(cleanPhone, statusMsg);
      return;
    }

    // ==========================================
    // MENU 3: RESET / RESTART KONEKSI MANDIRI
    // ==========================================
    if (
      cleanCmd === '3' ||
      cleanCmd.includes('restart') ||
      cleanCmd.includes('reset') ||
      cleanCmd.includes('lemot') ||
      cleanCmd.includes('gangguan') ||
      cleanCmd.includes('reboot')
    ) {
      // 1. Kick sesi MikroTik
      const pppUser = customer.pppoe_username;
      const routerId = customer.router_id;
      let kicked = false;
      if (pppUser) {
        kicked = await kickMikrotikPppUser(routerId, pppUser);
      }

      // 2. Trigger reboot ONT via GenieACS jika ada SN
      const sn = (customer.sn_onu || '').trim();
      let ontRebooted = false;
      if (sn) {
        try {
          const cleanUrl = (process.env.GENIEACS_URL || 'http://localhost:7557').replace(/\/$/, '');
          await fetch(`${cleanUrl}/devices/${encodeURIComponent(sn)}/tasks?timeout=3000&connection_request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'reboot' })
          });
          ontRebooted = true;
        } catch (_) {}
      }

      const resetMsg =
        `🔄 *RESET JARINGAN BERHASIL DIPROSES*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `Halo Kak *${customerName}*,\n` +
        `Sistem telah menyegarkan sesi internet Anda:\n` +
        `• Sesi PPPoE MikroTik: ${kicked ? '✅ Di-refresh dial ulang' : '✅ Jalur aktif'}\n` +
        `• Modem ONT Rumah: ${ontRebooted ? '✅ Sinyal restart terkirim' : '✅ Sinyal refresh normal'}\n\n` +
        `⏳ *Petunjuk:* Mohon tunggu 1-2 menit hingga modem menyala kembali dan lampu indikator internet stabil.\n\n` +
        `Jika dalam 5 menit masih ada kendala, ketik *CS* untuk dibantu teknisi kami.`;

      await sendWhatsAppMessage(cleanPhone, resetMsg);
      return;
    }

    // ==========================================
    // MENU 4: INFORMASI WI-FI RUMAH
    // ==========================================
    if (
      cleanCmd === '4' ||
      cleanCmd.includes('wifi') ||
      cleanCmd.includes('ssid') ||
      cleanCmd.includes('sandi') ||
      cleanCmd.includes('password')
    ) {
      const wifiMsg =
        `📶 *LAYANAN WI-FI RUMAH*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Pelanggan:* ${customerName}\n` +
        `📟 *SN Modem:* \`${customer.sn_onu || 'ONT Standar'}\`\n\n` +
        `🔐 *Ingin Mengubah Nama / Sandi Wi-Fi?*\n` +
        `Anda dapat mengubah nama SSID & kata sandi Wi-Fi secara mandiri melalui Portal Pelanggan kami:\n` +
        `👉 ${biz.portalUrl}\n\n` +
        `Atau hubungi admin kami jika membutuhkan bantuan teknisi datang ke rumah.`;

      await sendWhatsAppMessage(cleanPhone, wifiMsg);
      return;
    }

    // ==========================================
    // MENU 5: BANTUAN TEKNISI / CS
    // ==========================================
    if (
      cleanCmd === '5' ||
      cleanCmd.includes('cs') ||
      cleanCmd.includes('admin') ||
      cleanCmd.includes('lapor') ||
      cleanCmd.includes('komplain')
    ) {
      // Kirim pesan ke pelanggan
      const csMsg =
        `👨‍🔧 *LAYANAN BANTUAN TEKNISI*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `Halo Kak *${customerName}*,\n` +
        `Laporan kendala Anda telah kami terima dan diteruskan ke tim teknisi lapangan.\n\n` +
        `📞 *Kontak CS Langsung:* ${biz.phone}\n` +
        `⏰ *Jam Operasional:* 08:00 - 21:00 WIB\n\n` +
        `Mohon tunggu sebentar, petugas kami akan segera merespons chat Anda. Terima kasih! 🙏`;

      await sendWhatsAppMessage(cleanPhone, csMsg);

      // Teruskan aduan pelanggan ke Telegram Admin / Grup Teknisi
      const tgReport =
        `🆘 <b>PENGADUAN PELANGGAN VIA WHATSAPP BOT</b>\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `👤 <b>Nama:</b> ${customerName}\n` +
        `🔑 <b>Kode Pelanggan:</b> <code>${customerCode}</code>\n` +
        `📱 <b>No. WhatsApp:</b> <a href="https://wa.me/${cleanPhone}">+${cleanPhone}</a>\n` +
        `📦 <b>Paket:</b> ${customer.package_name || '-'}\n` +
        `📡 <b>Router:</b> ${customer.router_name || '-'}\n` +
        `💬 <b>Pesan Aduan:</b> <i>"${text}"</i>\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `<i>Mohon tim support/teknisi segera menindaklanjuti.</i>`;

      sendTelegramMessage(tgReport).catch(() => {});
      return;
    }

    // ==========================================
    // DEFAULT: TAMPILKAN MENU INTERAKTIF LENGKAP
    // ==========================================
    const menuMsg =
      `Halo Kak *${customerName}*! 👋\n` +
      `Selamat datang di Layanan Mandiri *${biz.name}*.\n\n` +
      `Silakan ketik nomor atau kata kunci pilihan Anda:\n\n` +
      `1️⃣ *TAGIHAN* ➔ Cek tagihan & bayar instan (QRIS)\n` +
      `2️⃣ *STATUS* ➔ Cek status koneksi, paket & FUP\n` +
      `3️⃣ *RESTART* ➔ Reset sinyal & modem otomatis\n` +
      `4️⃣ *WIFI* ➔ Info & ganti sandi Wi-Fi rumah\n` +
      `5️⃣ *CS* ➔ Hubungi teknisi / lapor kendala\n\n` +
      `_Balas pesan ini dengan angka (1, 2, 3, 4, 5) atau kata kuncinya._`;

    await sendWhatsAppMessage(cleanPhone, menuMsg);

  } catch (err: any) {
    console.error('[WA BOT ERROR]:', err.message);
  }
}

/**
 * Endpoint verifikasi webhook (GET) untuk gateway Meta Cloud API / test ping
 */
export function verifyWhatsAppWebhook(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === (process.env.WA_VERIFY_TOKEN || 'arbill_token')) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  res.json({
    success: true,
    message: '⚡ WhatsApp Interactive Bot Webhook is online and ready!',
    time: new Date().toISOString()
  });
}

/**
 * Tes kirim pesan dari dashboard
 */
export async function sendDirectTestMessage(req: Request, res: Response) {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ success: false, message: 'Nomor telepon dan pesan wajib diisi.' });
  }

  const result = await sendWhatsAppMessage(phone, message);
  res.json(result);
}

/**
 * Mengambil konfigurasi AI Assistant saat ini
 */
export async function getAiConfigEndpoint(req: Request, res: Response) {
  const cfg = await getAiConfig();
  // Mask API key for security
  const maskedKey = cfg.apiKey ? `${cfg.apiKey.substring(0, 4)}••••${cfg.apiKey.slice(-4)}` : '';
  res.json({
    success: true,
    config: {
      enabled: cfg.enabled,
      provider: cfg.provider,
      apiKey: maskedKey,
      hasKey: !!cfg.apiKey,
      model: cfg.model
    }
  });
}

/**
 * Menyimpan konfigurasi AI Assistant ke database PostgreSQL
 */
export async function saveAiConfigEndpoint(req: Request, res: Response) {
  const { enabled, provider, apiKey, model } = req.body;

  try {
    const queries: { key: string; val: string }[] = [
      { key: 'ai_wa_enabled', val: enabled ? 'true' : 'false' },
      { key: 'ai_wa_provider', val: provider || 'gemini' },
      { key: 'ai_wa_model', val: model || 'gemini-1.5-flash' }
    ];

    if (apiKey && !apiKey.includes('••••')) {
      queries.push({ key: 'ai_wa_api_key', val: apiKey.trim() });
    }

    for (const q of queries) {
      await pool.query(`
        INSERT INTO system_settings (key, value, updated_at) 
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [q.key, q.val]);
    }

    res.json({
      success: true,
      message: '⚡ Pengaturan AI Customer Service Assistant berhasil disimpan!'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Uji Coba Respons AI dari Dashboard Admin
 */
export async function testAiEndpoint(req: Request, res: Response) {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ success: false, message: 'Pertanyaan prompt wajib diisi.' });

  const biz = await getBusinessInfo();
  const mockCustomer = {
    name: 'Bpk Joko Santoso',
    customer_code: 'CUST-007',
    package_name: 'Paket Home 20 Mbps',
    speed_limit: '20M/20M',
    status: 'active',
    expired_at: new Date(Date.now() + 15 * 86400000),
    phone_number: '628123456789'
  };

  try {
    const reply = await askAiCustomerAssistant(mockCustomer, biz, prompt);
    if (!reply) {
      return res.status(500).json({
        success: false,
        message: 'Gagal mendapatkan jawaban dari AI. Pastikan API Key valid dan terisi di pengaturan.'
      });
    }

    res.json({
      success: true,
      prompt,
      reply
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}


