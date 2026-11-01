import { Router } from 'express';
import { 
  getTelegramSettings, 
  updateTelegramSettings, 
  testTelegramNotification, 
  getOfflineWatchQueue 
} from '../controllers/telegramController.js';

const router = Router();

router.get('/settings', getTelegramSettings);
router.post('/settings', updateTelegramSettings);
router.post('/test', testTelegramNotification);
router.get('/queue', getOfflineWatchQueue);

export default router;
