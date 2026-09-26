import { Router } from 'express';
import {
  verifyApiSecretMiddleware,
  pingIntegration,
  getInvoicesIntegration,
  getCustomerIntegration,
  getPackagesIntegration
} from '../controllers/integrationController.js';

const router = Router();

// All integration routes are protected by verifyApiSecretMiddleware
router.use(verifyApiSecretMiddleware);

router.get('/ping', pingIntegration);
router.get('/invoices', getInvoicesIntegration);
router.get('/customer', getCustomerIntegration);
router.get('/packages', getPackagesIntegration);

export default router;
