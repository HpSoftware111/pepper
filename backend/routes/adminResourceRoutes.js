import express from 'express';
import {
  getAllUsersResourceUsage,
  getUserResourceUsageDetail,
  setUserResourceLimit,
  resetUserResourceUsage,
} from '../controllers/adminResourceController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/', getAllUsersResourceUsage);
router.get('/:id', getUserResourceUsageDetail);
router.patch('/:id/limit', setUserResourceLimit);
router.post('/:id/reset', resetUserResourceUsage);

export default router;
