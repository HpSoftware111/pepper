import express from 'express';
import {
  getReminders,
  getReminder,
  createReminder,
  updateReminder,
  deleteReminder,
  completeReminder,
  uncompleteReminder,
} from '../controllers/reminderController.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// All routes require authentication
router.get('/', requireAuth, getReminders);
router.get('/:id', requireAuth, getReminder);
router.post('/', requireAuth, createReminder);
router.put('/:id', requireAuth, updateReminder);
router.delete('/:id', requireAuth, deleteReminder);
router.post('/:id/complete', requireAuth, completeReminder);
router.post('/:id/uncomplete', requireAuth, uncompleteReminder);

export default router;

