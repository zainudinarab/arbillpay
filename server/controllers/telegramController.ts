import { Request, Response } from 'express';
import { pool } from '../config/db.js';
import { 
  getTelegramConfig, 
  saveTelegramConfig, 
  sendTelegramMessage 
} from '../services/telegramAlertService.js';

/**
 * Mengambil konfigurasi Telegram dan Offline Alert
 */
export async function getTelegramSettings(req: Request, res: Response) {
  try {
    const config = await getTelegramConfig();
    return res.json({
      success: true,
      data: {
        bot_token: config.botToken,
        chat_id: config.chatId,
        enabled: config.enabled,
        grace_minutes: config.graceMinutes
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Menyimpan / memperbarui konfigurasi Telegram
 */
export async function updateTelegramSettings(req: Request, res: Response) {
  try {
    const { bot_token, chat_id, enabled, grace_minutes } = req.body;

    const updated = await saveTelegramConfig({
      botToken: bot_token !== undefined ? String(bot_token) : undefined,
      chatId: chat_id !== undefined ? String(chat_id) : undefined,
      enabled: enabled !== undefined ? Boolean(enabled) : undefined,
      graceMinutes: grace_minutes !== undefined ? parseInt(grace_minutes, 10) : undefined
    });

    return res.json({
      success: true,
      message: 'Pengaturan Telegram berhasil disimpan.',
      data: {
        bot_token: updated.botToken,
        chat_id: updated.chatId,
        enabled: updated.enabled,
        grace_minutes: updated.graceMinutes
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Mengirim pesan uji coba (Test Notification) ke Telegram
 */
export async function testTelegramNotification(req: Request, res: Response) {
  try {
    const { bot_token, chat_id } = req.body;

    // Jika admin menginput token/chat_id sementara untuk pengujian
    if (bot_token && chat_id) {
      await saveTelegramConfig({ botToken: bot_token, chatId: chat_id, enabled: true });
    }

    const testMsg = 
      `🤖 <b>UJI COBA NOTIFIKASI ARBILL PAY</b>\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `✅ Bot Telegram berhasil terhubung dengan sistem Arbill Billing!\n` +
      `📡 <b>Layanan:</b> Pemantauan Koneksi Pelanggan MikroTik\n` +
      `⏰ <b>Waktu:</b> ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `<i>Pesan ini mengonfirmasi bahwa Bot Token dan Chat ID Anda aktif dan siap menerima peringatan gangguan.</i>`;

    const sendRes = await sendTelegramMessage(testMsg);
    if (!sendRes.success) {
      return res.status(400).json({
        success: false,
        message: `Gagal mengirim pesan uji coba: ${sendRes.message}`
      });
    }

    return res.json({
      success: true,
      message: '✅ Berhasil mengirim pesan uji coba ke Telegram!'
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Mengambil daftar antrean pemantauan (Offline Watch Queue)
 */
export async function getOfflineWatchQueue(req: Request, res: Response) {
  try {
    const status = (req.query.status || '').toString().toUpperCase().trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);

    let query = `
      SELECT 
        q.*,
        c.customer_code,
        c.phone_number,
        c.is_online
      FROM customer_offline_queue q
      LEFT JOIN customers c ON q.customer_id = c.id OR LOWER(q.pppoe_username) = LOWER(c.pppoe_username)
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && status !== 'ALL') {
      params.push(status);
      query += ` AND q.status = $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY q.id DESC LIMIT $${params.length}`;

    const rowsRes = await pool.query(query, params);

    // Hitung ringkasan status antrean
    const statsRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'PENDING')::int as pending_count,
        COUNT(*) FILTER (WHERE status = 'ALERT_SENT')::int as alert_sent_count,
        COUNT(*) FILTER (WHERE status = 'RECOVERED')::int as recovered_count,
        COUNT(*)::int as total_count
      FROM customer_offline_queue
    `);

    return res.json({
      success: true,
      stats: statsRes.rows[0] || { pending_count: 0, alert_sent_count: 0, recovered_count: 0, total_count: 0 },
      queue: rowsRes.rows
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
