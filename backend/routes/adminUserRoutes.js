import express from 'express';
import { createUser, disableUser, listUsers, updateUser, getUserDetail } from '../controllers/adminUserController.js';
import { adminRemoveUserDevice, adminGetUserDevices } from '../controllers/deviceController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = express.Router();

router.use(requireAuth, requireAdmin);
router.get('/', listUsers);
router.post('/', createUser);
router.get('/:id', getUserDetail);
router.get('/:id/devices', adminGetUserDevices);
router.post('/:id/devices/remove', adminRemoveUserDevice);
router.patch('/:id', updateUser);
router.delete('/:id', disableUser);

export default router;

