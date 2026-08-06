import { Router } from 'express';
import { getSettings, saveSettings, listDevices, syncCustomersLaser, rebootDevice, updateDeviceWifi } from '../controllers/genieacsController.js';

const router = Router();

router.get('/settings', getSettings);
router.post('/settings', saveSettings);
router.get('/devices', listDevices);
router.post('/sync-customers', syncCustomersLaser);
router.post('/devices/:device_id/reboot', rebootDevice);
router.post('/devices/:device_id/wifi', updateDeviceWifi);

export default router;
