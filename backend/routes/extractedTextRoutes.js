import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
    storeVoiceText,
    storeFileText,
    getExtractedTexts,
    getExtractedText,
    deleteExtractedText,
} from '../controllers/extractedTextController.js';

const router = Router();

/**
 * POST /api/extracted-text/voice
 * Store voice transcription as extracted text
 * Body: { text, sourceName?, duration?, language?, meetingTitle? }
 */
router.post('/voice', requireAuth, storeVoiceText);

/**
 * POST /api/extracted-text/file
 * Store file extraction as extracted text
 * Body: { text, sourceName?, fileSize?, fileType?, fileName?, language? }
 */
router.post('/file', requireAuth, storeFileText);

/**
 * GET /api/extracted-text
 * Get all extracted texts for the authenticated user
 * Query params: source?, limit?, offset?
 */
router.get('/', requireAuth, getExtractedTexts);

/**
 * GET /api/extracted-text/:textId
 * Get a specific extracted text by textId
 */
router.get('/:textId', requireAuth, getExtractedText);

/**
 * DELETE /api/extracted-text/:textId
 * Delete an extracted text by textId
 */
router.delete('/:textId', requireAuth, deleteExtractedText);

export default router;

