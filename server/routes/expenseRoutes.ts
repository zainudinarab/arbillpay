import { Router } from 'express';
import {
  listExpenses,
  getSingleExpense,
  createNewExpense,
  updateExistingExpense,
  removeExpense,
  getProfitLoss
} from '../controllers/expenseController.js';

const router = Router();

// Laba Rugi / Profit Loss Summary endpoint (harus sebelum :id)
router.get('/profit-loss', getProfitLoss);

// CRUD Endpoints
router.get('/', listExpenses);
router.get('/:id', getSingleExpense);
router.post('/', createNewExpense);
router.put('/:id', updateExistingExpense);
router.delete('/:id', removeExpense);

export default router;

