import { Router } from 'express';
import { getSetupStatus, verifyArabPay, saveSetupConfig } from '../controllers/setupController.js';
import { getApiSecretStatus, generateApiSecret, deleteApiSecret } from '../controllers/apiSecretController.js';

const router = Router();

router.get('/status', getSetupStatus);
router.post('/verify-arabpay', verifyArabPay);
router.post('/save', saveSetupConfig);

// API Secret Management for Arbill-Chat & External Integrations
router.get('/api-secret', getApiSecretStatus);
router.post('/api-secret/generate', generateApiSecret);
router.delete('/api-secret', deleteApiSecret);

export default router;
