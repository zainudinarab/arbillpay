import { Router } from 'express';
import { listPackages, addPackage, editPackage, removePackage, togglePackageStatus } from '../controllers/packageController.js';

const router = Router();

router.get('/', listPackages);
router.post('/', addPackage);
router.put('/:id', editPackage);
router.put('/:id/toggle-status', togglePackageStatus);
router.delete('/:id', removePackage);

export default router;
