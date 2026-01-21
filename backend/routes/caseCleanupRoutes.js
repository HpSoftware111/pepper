import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { manualCleanup } from '../services/caseCleanupService.js';

const router = express.Router();

/**
 * POST /api/case-cleanup/manual
 * Manually trigger cleanup of closed cases
 * Protected route - requires authentication
 */
router.post('/manual', requireAuth, manualCleanup);

export default router;

