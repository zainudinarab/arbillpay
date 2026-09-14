import { Router } from 'express';
import { getPortalConfig, savePortalConfig, resetPortalConfig } from '../controllers/portalController.js';

const router = Router();

router.get('/portal-config', getPortalConfig);
router.post('/portal-config', savePortalConfig);
router.post('/portal-config/reset', resetPortalConfig);

export default router;
