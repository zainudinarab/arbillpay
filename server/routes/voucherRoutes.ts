import { Router } from 'express';
import {
  listVouchers,
  generateBatchVouchers,
  removeBatchVouchers,
  listAvailableVouchers,
  buyVoucher,
  listMyPurchasedVouchers,
  handleVoucherFirstLogin,
  syncVouchersToMikrotik,
  inspectMikrotikStatus
} from '../controllers/voucherController.js';

const router = Router();

// Endpoint webhook on-login pertama kali dari MikroTik RouterOS (/tool fetch)
router.get('/first-login', handleVoucherFirstLogin);
router.post('/first-login', handleVoucherFirstLogin);

router.get('/', listVouchers);
router.get('/available', listAvailableVouchers);
router.get('/my-vouchers', listMyPurchasedVouchers);
router.post('/buy', buyVoucher);
router.post('/generate', generateBatchVouchers);
router.post('/sync', syncVouchersToMikrotik);
router.post('/inspect-mikrotik', inspectMikrotikStatus);
router.delete('/batch/:batch_id', removeBatchVouchers);

export default router;

