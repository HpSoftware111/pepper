import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  triggerUserNotifications,
  getNotificationHistory,
  triggerAllNotifications,
} from '../controllers/calendarNotificationController.js';

const router = express.Router();

// User endpoints
router.post('/trigger', requireAuth, triggerUserNotifications);
router.get('/history', requireAuth, getNotificationHistory);

// Admin endpoint
router.post('/trigger-all', requireAuth, requireAdmin, triggerAllNotifications);

export default router;

