import { Router } from 'express';
import { listVouchers, generateBatchVouchers, removeBatchVouchers, listAvailableVouchers, buyVoucher } from '../controllers/voucherController.js';

const router = Router();

router.get('/', listVouchers);
router.get('/available', listAvailableVouchers);
router.post('/buy', buyVoucher);
router.post('/generate', generateBatchVouchers);
router.delete('/batch/:batch_id', removeBatchVouchers);

export default router;
