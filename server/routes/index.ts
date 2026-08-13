import { Router } from 'express';
import { pool } from '../config/db.js';
import setupRoutes from './setupRoutes.js';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import customerRoutes from './customerRoutes.js';
import packageRoutes from './packageRoutes.js';
import invoiceRoutes from './invoiceRoutes.js';
import voucherRoutes from './voucherRoutes.js';
import genieacsRoutes from './genieacsRoutes.js';
import mikrotikRoutes from './mikrotikRoutes.js';
import ftthMapRoutes from './ftthMapRoutes.js';

const router = Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', time: result.rows[0].now, database: 'arbil_db' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Modular Routes
router.use('/setup', setupRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/customers', customerRoutes);
router.use('/packages', packageRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/vouchers', voucherRoutes);
router.use('/genieacs', genieacsRoutes);
router.use('/ftth', ftthMapRoutes);
router.use('/', mikrotikRoutes);

export default router;
