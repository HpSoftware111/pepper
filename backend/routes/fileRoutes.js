import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { filesUpload, extractUploadedFiles, extractAndChat, extractAndStore } from '../controllers/fileController.js';

const router = Router();

router.post('/extract', requireAuth, (req, res, next) => {
  filesUpload(req, res, (err) => {
    if (err) {
      if (err.message === 'UNSUPPORTED_EXTENSION' || err.message === 'UNSUPPORTED_MIMETYPE') {
        return res.status(400).json({ error: 'Formato de archivo no admitido.' });
      }
      if (err.message === 'File too large') {
        return res.status(400).json({ error: 'Archivo demasiado grande (máximo 12MB).' });
      }
      return res.status(400).json({ error: err.message || 'Error al recibir el archivo.' });
    }
    return extractUploadedFiles(req, res, next);
  });
});

router.post('/extract-and-chat', requireAuth, (req, res, next) => {
  filesUpload(req, res, (err) => {
    if (err) {
      if (err.message === 'UNSUPPORTED_EXTENSION' || err.message === 'UNSUPPORTED_MIMETYPE') {
        return res.status(400).json({ error: 'Formato de archivo no admitido.' });
      }
      if (err.message === 'File too large') {
        return res.status(400).json({ error: 'Archivo demasiado grande (máximo 12MB).' });
      }
      return res.status(400).json({ error: err.message || 'Error al recibir el archivo.' });
    }
    return extractAndChat(req, res, next);
  });
});

// New endpoint: Extract files and store in ExtractedText model
router.post('/extract-and-store', requireAuth, (req, res, next) => {
  filesUpload(req, res, (err) => {
    if (err) {
      if (err.message === 'UNSUPPORTED_EXTENSION' || err.message === 'UNSUPPORTED_MIMETYPE') {
        return res.status(400).json({ error: 'Formato de archivo no admitido.' });
      }
      if (err.message === 'File too large') {
        return res.status(400).json({ error: 'Archivo demasiado grande (máximo 12MB).' });
      }
      return res.status(400).json({ error: err.message || 'Error al recibir el archivo.' });
    }
    return extractAndStore(req, res, next);
  });
});

export default router;


