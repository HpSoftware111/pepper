import express from 'express';
import { registerDevice, listDevices, removeDevice } from '../controllers/deviceController.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

router.use(requireAuth);
router.get('/', listDevices);
router.post('/register', registerDevice);
router.delete('/:deviceId', removeDevice);

export default router;

