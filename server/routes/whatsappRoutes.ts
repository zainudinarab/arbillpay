import { Router } from 'express';
import { 
  handleWhatsAppWebhook, 
  verifyWhatsAppWebhook, 
  sendDirectTestMessage 
} from '../controllers/whatsappBotController.js';

const router = Router();

// Webhook endpoints (mendukung integrasi WAHA, GoWA, WuzAPI, Fonnte, Wablas, Meta)
router.post('/webhook', handleWhatsAppWebhook);
router.get('/webhook', verifyWhatsAppWebhook);

// Direct dispatch / test send
router.post('/send', sendDirectTestMessage);

export default router;

