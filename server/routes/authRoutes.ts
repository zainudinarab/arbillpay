import { Router } from 'express';
import { login, arabpayOAuth, changePassword, getLiveBalance } from '../controllers/authController.js';

const router = Router();

router.post('/login', login);
router.post('/arabpay', arabpayOAuth);
router.post('/change-password', changePassword);
router.post('/live-balance', getLiveBalance);
router.get('/live-balance', getLiveBalance);

export default router;
