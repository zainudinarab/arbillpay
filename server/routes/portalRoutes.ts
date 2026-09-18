import { Router } from 'express';
import { getPortalConfig, savePortalConfig, resetPortalConfig } from '../controllers/portalController.js';
import { requestArabPayTopup, checkArabPayTopupStatus } from '../services/arabpayService.js';

const router = Router();

router.get('/portal-config', getPortalConfig);
router.post('/portal-config', savePortalConfig);
router.post('/portal-config/reset', resetPortalConfig);

router.post('/topup', async (req, res) => {
  try {
    const { phone_number, user_id, amount, channel } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Nominal topup wajib diisi' });
    }
    const result = await requestArabPayTopup({
      phoneNumber: phone_number,
      userId: user_id,
      amount: Number(amount),
      channel: channel || 'qris'
    });
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/topup-status', async (req, res) => {
  try {
    const reference_id = (req.query.reference_id as string) || (req.query.ref as string);
    if (!reference_id) {
      return res.status(400).json({ success: false, error: 'reference_id is required' });
    }
    const result = await checkArabPayTopupStatus(reference_id);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/topup-status', async (req, res) => {
  try {
    const reference_id = req.body.reference_id || req.body.ref || (req.query.reference_id as string);
    if (!reference_id) {
      return res.status(400).json({ success: false, error: 'reference_id is required' });
    }
    const result = await checkArabPayTopupStatus(reference_id);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
