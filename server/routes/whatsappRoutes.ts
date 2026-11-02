import { Router } from 'express';
import { 
  handleWhatsAppWebhook, 
  verifyWhatsAppWebhook, 
  sendDirectTestMessage,
  getAiConfigEndpoint,
  saveAiConfigEndpoint,
  testAiEndpoint
} from '../controllers/whatsappBotController.js';

const router = Router();

// Webhook endpoints (mendukung integrasi WAHA, GoWA, WuzAPI, Fonnte, Wablas, Meta)
router.post('/webhook', handleWhatsAppWebhook);
router.get('/webhook', verifyWhatsAppWebhook);

// Direct dispatch / test send
router.post('/send', sendDirectTestMessage);

// AI Assistant Configuration
router.get('/ai-config', getAiConfigEndpoint);
router.post('/ai-config', saveAiConfigEndpoint);
router.post('/ai-test', testAiEndpoint);

export default router;

