import express from 'express';
import { getBillingSummary } from '../controllers/adminBillingController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router = express.Router();

router.use(requireAuth, requireAdmin);
router.get('/summary', getBillingSummary);

export default router;

