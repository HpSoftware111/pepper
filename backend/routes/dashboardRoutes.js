import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { buildMasterDocument } from '../controllers/chatController.js';

const router = Router();

/**
 * GET /api/dashboard/master-document
 * Returns master document for user's text-analysis threads
 * Used to feed dashboard with aggregated analysis data
 */
router.get('/master-document', requireAuth, async (req, res) => {
    try {
        const { userId, email } = req.user || {};
        const { threadId } = req.query || {};

        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const masterDoc = await buildMasterDocument(
            userId,
            email.toLowerCase(),
            threadId || null
        );

        if (!masterDoc) {
            return res.status(404).json({
                error: 'No se encontraron documentos para este usuario',
                masterDocument: null,
            });
        }

        return res.json({
            success: true,
            masterDocument: masterDoc,
        });
    } catch (error) {
        console.error('[dashboard][master-document] Error:', error);
        return res.status(500).json({
            error: 'Error al generar el documento maestro',
            message: error?.message || 'Error desconocido',
        });
    }
});

export default router;

