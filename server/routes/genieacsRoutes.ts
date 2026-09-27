import { Router } from 'express';
import { 
  getSettings, 
  saveSettings, 
  listDevices, 
  syncCustomersLaser, 
  rebootDevice, 
  updateDeviceWifi,
  getDeviceDetail,
  updateDeviceWan,
  factoryResetDevice,
  refreshDeviceTask,
  linkCustomerToDevice
} from '../controllers/genieacsController.js';

const router = Router();

router.get('/settings', getSettings);
router.post('/settings', saveSettings);
router.get('/devices', listDevices);
router.post('/sync-customers', syncCustomersLaser);
router.get('/devices/:device_id/detail', getDeviceDetail);
router.post('/devices/:device_id/reboot', rebootDevice);
router.post('/devices/:device_id/wifi', updateDeviceWifi);
router.post('/devices/:device_id/wan', updateDeviceWan);
router.post('/devices/:device_id/factory-reset', factoryResetDevice);
router.post('/devices/:device_id/refresh', refreshDeviceTask);
router.post('/devices/:device_id/link-customer', linkCustomerToDevice);

export default router;

