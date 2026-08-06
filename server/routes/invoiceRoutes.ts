import { Router } from 'express';
import { 
  listInvoices, createManualInvoice, createBatchInvoices, 
  triggerAutoGenerate, payInvoice, createArabPayInvoiceOrder, handleArabPayCallback, sendInvoiceWhatsApp,
  createCheckout, payWithPin, getCheckoutStatus, deleteInvoice
} from '../controllers/invoiceController.js';

const router = Router();

router.get('/', listInvoices);
router.post('/create-manual', createManualInvoice);
router.post('/create-batch', createBatchInvoices);
router.post('/auto-generate', triggerAutoGenerate);
router.post('/arabpay-callback', handleArabPayCallback);

// ArabPay Checkout & PIN payment routes (persis arbiljs)
router.post('/checkouts', createCheckout);
router.post('/pay-pin', payWithPin);
router.get('/status/:id', getCheckoutStatus);

router.post('/:id/pay', payInvoice);
router.delete('/:id', deleteInvoice);
router.post('/:id/pay-arabpay', createArabPayInvoiceOrder);
router.post('/:id/send-wa', sendInvoiceWhatsApp);

export default router;
