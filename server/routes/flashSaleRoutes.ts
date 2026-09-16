import { Router } from 'express';
import {
  listFlashSales,
  createFlashSale,
  updateFlashSale,
  deleteFlashSale,
  toggleFlashSaleStatus,
  resetFlashSaleQuota,
  getFlashSaleBuyersList
} from '../controllers/flashSaleController.js';

const router = Router();

router.get('/', listFlashSales);
router.post('/', createFlashSale);
router.get('/buyers', getFlashSaleBuyersList);
router.put('/:id', updateFlashSale);
router.delete('/:id', deleteFlashSale);
router.patch('/:id/toggle', toggleFlashSaleStatus);
router.post('/:id/reset-quota', resetFlashSaleQuota);

export default router;
