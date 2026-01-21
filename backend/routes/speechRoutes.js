import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
    speechUpload,
    transcribeAudio,
    transcribeAndStore,
    appendTranscriptionChunk,
    synthesizeSpeech,
} from '../controllers/speechController.js';

const router = Router();

// Original transcription endpoint (maintains backward compatibility)
router.post('/transcribe', requireAuth, speechUpload.single('audio'), transcribeAudio);

// New transcription endpoint that stores result in ExtractedText
router.post('/transcribe-and-store', requireAuth, speechUpload.single('audio'), transcribeAndStore);

// Append chunk to existing transcription (for continuous/streaming transcription)
router.post('/append-chunk', requireAuth, appendTranscriptionChunk);

router.post('/synthesize', requireAuth, synthesizeSpeech);

export default router;


