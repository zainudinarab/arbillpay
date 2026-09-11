import { Router } from 'express';
import { handlePppEvent, listPppLogs } from '../controllers/pppEventController.js';

const router = Router();

// Webhook On-Up & On-Down dari Mikrotik RouterOS
router.get('/events', handlePppEvent);
router.post('/events', handlePppEvent);

// Endpoint alternatif jika router memanggil /event langsung
router.get('/event', handlePppEvent);
router.post('/event', handlePppEvent);

// API monitoring histori log koneksi PPPoE
router.get('/logs', listPppLogs);

export default router;
