import { Router } from 'express';
import {
  handleSpeedtestPing,
  handleSpeedtestDownload,
  handleSpeedtestUpload,
  saveSpeedtestResult,
  getCustomerSpeedtestHistory
} from '../controllers/speedtestController.js';

const router = Router();

router.get('/ping', handleSpeedtestPing);
router.get('/download', handleSpeedtestDownload);
router.post('/upload', handleSpeedtestUpload);
router.post('/result', saveSpeedtestResult);
router.get('/customer/:customer_id/history', getCustomerSpeedtestHistory);

export default router;

