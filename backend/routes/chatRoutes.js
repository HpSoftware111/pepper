import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  createThread,
  listMessages,
  sendMessage,
  clearHistory,
  listThreads,
  updateThreadTitle,
  deleteThread,
} from '../controllers/chatController.js';

const router = Router();

router.get('/threads', requireAuth, listThreads);
router.post('/threads', requireAuth, createThread);
router.patch('/threads/:threadId', requireAuth, updateThreadTitle);
router.delete('/threads/:threadId', requireAuth, deleteThread);
router.get('/messages', requireAuth, listMessages);
router.post('/send', requireAuth, sendMessage);
router.post('/history/clear', requireAuth, clearHistory);

export default router;

