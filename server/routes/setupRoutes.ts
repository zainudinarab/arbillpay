import { Router } from 'express';
import { getSetupStatus, verifyArabPay, saveSetupConfig } from '../controllers/setupController.js';

const router = Router();

router.get('/status', getSetupStatus);
router.post('/verify-arabpay', verifyArabPay);
router.post('/save', saveSetupConfig);

export default router;
