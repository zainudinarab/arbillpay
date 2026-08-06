import { Router } from 'express';
import { 
  listCustomers, addCustomer, editCustomer, updateLocation, 
  createUserAccount, payCustomerBill, removeCustomer, 
  checkPhone, linkPhone, syncCustomerToMikrotik, disconnectCustomerPpp,
  checkMyStatus
} from '../controllers/customerController.js';

import { listInvoices } from '../controllers/invoiceController.js';

const router = Router();

router.get('/', listCustomers);
router.post('/', addCustomer);
router.get('/:id/invoices', (req, res) => {
  req.query.customer_id = req.params.id;
  return listInvoices(req, res);
});
router.put('/:id', editCustomer);
router.delete('/:id', removeCustomer);
router.put('/:id/location', updateLocation);
router.post('/:id/create-user-account', createUserAccount);
router.post('/:id/pay-bill', payCustomerBill);
router.post('/:id/sync-to-mikrotik', syncCustomerToMikrotik);
router.post('/:id/disconnect-ppp', disconnectCustomerPpp);
router.post('/check-phone', checkPhone);
router.post('/link-phone', linkPhone);
router.post('/check-my-status', checkMyStatus);

export default router;
