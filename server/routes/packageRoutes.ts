import { Router } from 'express';
import { listPackages, addPackage, editPackage, removePackage } from '../controllers/packageController.js';

const router = Router();

router.get('/', listPackages);
router.post('/', addPackage);
router.put('/:id', editPackage);
router.delete('/:id', removePackage);

export default router;
