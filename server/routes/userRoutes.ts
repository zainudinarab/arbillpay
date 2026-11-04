import { Router } from 'express';
import { listUsers, addUser, editUser, editProfile, changePassword, removeUser } from '../controllers/userController.js';

const router = Router();

router.get('/', listUsers);
router.post('/', addUser);
router.post('/change-password', changePassword);
router.put('/profile', editProfile);
router.put('/:id', editUser);
router.delete('/:id', removeUser);

export default router;
