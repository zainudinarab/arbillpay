import { Router } from 'express';
import {
  listOlts,
  addOlt,
  editOlt,
  deleteOlt,
  testOlt,
  linkOltToNode,
  getOltOnus,
  syncOltOnusAction,
  registerOltOnuAction,
  deleteOltOnuAction,
  linkCustomerToOnuAction,
  getOnuOptical,
  rebootOnuAction,
  testOltSnmpAction,
  enableOltSnmpAction,
  syncOltSnmpTelemetryAction,
  getUnconfiguredOnusAction
} from '../controllers/oltController.js';

const router = Router();

// OLT CRUD & Connectivity
router.get('/olts', listOlts);
router.post('/olts', addOlt);
router.put('/olts/:id', editOlt);
router.delete('/olts/:id', deleteOlt);
router.post('/olts/:id/test-connection', testOlt);
router.post('/olts/:id/test-snmp', testOltSnmpAction);
router.post('/olts/:id/enable-snmp', enableOltSnmpAction);
router.post('/olts/:id/link-node', linkOltToNode);

// OLT Port PON & ONU Control & Database Cache
router.get('/olts/:id/onus', getOltOnus);
router.post('/olts/:id/sync', syncOltOnusAction);
router.post('/olts/:id/sync-snmp', syncOltSnmpTelemetryAction);
router.post('/olts/:id/register-onu', registerOltOnuAction);
router.post('/olts/:id/delete-onu', deleteOltOnuAction);
router.post('/olts/:id/link-customer', linkCustomerToOnuAction);
router.get('/olts/:id/optical-power', getOnuOptical);
router.post('/olts/:id/reboot-onu', rebootOnuAction);
router.get('/olts/:id/unconfigured-onus', getUnconfiguredOnusAction);

export default router;

