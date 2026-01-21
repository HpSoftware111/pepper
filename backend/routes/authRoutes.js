import express from 'express';
import {
  googleAuth,
  login,
  logout,
  me,
  updateProfile,
  refreshToken,
  signup,
  requestPasswordReset,
  verifyPasswordReset,
  getInviteDetails,
  acceptInvite,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.post('/refresh', refreshToken);
router.post('/google', googleAuth);
router.get('/me', requireAuth, me);
router.put('/profile', requireAuth, updateProfile);
router.post('/reset/request', requestPasswordReset);
router.post('/reset/verify', verifyPasswordReset);
router.get('/invite/:token', getInviteDetails);
router.post('/invite/accept', acceptInvite);

export default router;

