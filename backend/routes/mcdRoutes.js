import express from 'express';
import {
    createMCD,
    getMCDByCaseId,
    getAllMCDs,
    updateMCD,
    deleteMCD,
    syncMCDFromFile,
} from '../controllers/mcdController.js';
import {
    extractFromDocument,
    generateMCDFromExtraction,
    extractAndGenerateMCD,
} from '../controllers/caseExtractionController.js';
import {
    submitQuestionnaire,
    getQuestionnaireTemplate,
} from '../controllers/questionnaireController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { filesUpload } from '../controllers/fileController.js';

const router = express.Router();

/**
 * POST /api/mcd
 * Create a new Master Case Document
 */
router.post('/', requireAuth, createMCD);

/**
 * GET /api/mcd
 * Get all MCDs for the authenticated user
 * Query params: status, limit, offset
 */
router.get('/', requireAuth, getAllMCDs);

/**
 * GET /api/mcd/:caseId
 * Get MCD by case_id
 */
router.get('/:caseId', requireAuth, getMCDByCaseId);

/**
 * PUT /api/mcd/:caseId
 * Update MCD by case_id
 */
router.put('/:caseId', requireAuth, updateMCD);

/**
 * DELETE /api/mcd/:caseId
 * Delete MCD by case_id
 */
router.delete('/:caseId', requireAuth, deleteMCD);

/**
 * POST /api/mcd/sync-from-file
 * Sync MCD from local file (for file watcher)
 */
router.post('/sync-from-file', requireAuth, syncMCDFromFile);

/**
 * POST /api/mcd/extract-from-document
 * Extract case data from uploaded document (returns extracted data, does not create MCD)
 */
router.post('/extract-from-document', requireAuth, filesUpload, extractFromDocument);

/**
 * POST /api/mcd/generate-from-extraction
 * Generate MCD from previously extracted case data
 */
router.post('/generate-from-extraction', requireAuth, generateMCDFromExtraction);

/**
 * POST /api/mcd/extract-and-generate
 * Extract case data from document and generate MCD in one step
 */
router.post('/extract-and-generate', requireAuth, filesUpload, extractAndGenerateMCD);

/**
 * GET /api/mcd/questionnaire/template
 * Get questionnaire template structure
 */
router.get('/questionnaire/template', requireAuth, getQuestionnaireTemplate);

/**
 * POST /api/mcd/questionnaire
 * Submit questionnaire and generate MCD
 */
router.post('/questionnaire', requireAuth, submitQuestionnaire);

export default router;

