import ExtractedText from '../models/ExtractedText.js';
import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * Store voice transcription as extracted text
 */
export const storeVoiceText = async (req, res) => {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const { text, sourceName, duration, language, meetingTitle } = req.body || {};

        if (!text || typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({ error: 'Texto de transcripción requerido' });
        }

        // Generate textId explicitly to avoid validation error (required field)
        const textId = `text-${crypto.randomUUID()}`;

        const extractedText = new ExtractedText({
            textId,
            userId: new mongoose.Types.ObjectId(userId),
            userEmail: email.toLowerCase(),
            source: 'voice',
            sourceName: sourceName || `Voice Recording - ${new Date().toLocaleString()}`,
            extractedText: text.trim(),
            metadata: {
                duration: duration || null,
                wordCount: 0, // Will be calculated in pre-save hook
                language: language || null,
                meetingTitle: meetingTitle || null,
            },
            status: 'ready',
        });

        await extractedText.save();

        return res.json({
            success: true,
            textId: extractedText.textId,
            extractedText: {
                textId: extractedText.textId,
                source: extractedText.source,
                sourceName: extractedText.sourceName,
                wordCount: extractedText.metadata.wordCount,
                createdAt: extractedText.createdAt,
            },
        });
    } catch (error) {
        console.error('[extractedText][storeVoice] Error:', error);
        return res.status(500).json({
            error: 'Error al almacenar la transcripción',
            message: error?.message || 'Error desconocido',
        });
    }
};

/**
 * Store file extraction as extracted text
 */
export const storeFileText = async (req, res) => {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const { text, sourceName, fileSize, fileType, fileName, language } = req.body || {};

        if (!text || typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({ error: 'Texto extraído requerido' });
        }

        // Generate textId explicitly to avoid validation error (required field)
        const textId = `text-${crypto.randomUUID()}`;

        const extractedText = new ExtractedText({
            textId,
            userId: new mongoose.Types.ObjectId(userId),
            userEmail: email.toLowerCase(),
            source: 'file',
            sourceName: sourceName || fileName || `File - ${new Date().toLocaleString()}`,
            extractedText: text.trim(),
            metadata: {
                fileSize: fileSize || null,
                fileType: fileType || null,
                fileName: fileName || null,
                wordCount: 0, // Will be calculated in pre-save hook
                language: language || null,
            },
            status: 'ready',
        });

        await extractedText.save();

        return res.json({
            success: true,
            textId: extractedText.textId,
            extractedText: {
                textId: extractedText.textId,
                source: extractedText.source,
                sourceName: extractedText.sourceName,
                wordCount: extractedText.metadata.wordCount,
                createdAt: extractedText.createdAt,
            },
        });
    } catch (error) {
        console.error('[extractedText][storeFile] Error:', error);
        return res.status(500).json({
            error: 'Error al almacenar el texto extraído',
            message: error?.message || 'Error desconocido',
        });
    }
};

/**
 * Get all extracted texts for the authenticated user
 */
export const getExtractedTexts = async (req, res) => {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const { source, limit = 50, offset = 0 } = req.query || {};

        const query = {
            userId: new mongoose.Types.ObjectId(userId),
        };

        if (source && (source === 'voice' || source === 'file')) {
            query.source = source;
        }

        const extractedTexts = await ExtractedText.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(offset))
            .select('textId source sourceName metadata status createdAt updatedAt')
            .lean();

        const total = await ExtractedText.countDocuments(query);

        return res.json({
            success: true,
            extractedTexts,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
        });
    } catch (error) {
        console.error('[extractedText][list] Error:', error);
        return res.status(500).json({
            error: 'Error al obtener los textos extraídos',
            message: error?.message || 'Error desconocido',
        });
    }
};

/**
 * Get a specific extracted text by textId
 */
export const getExtractedText = async (req, res) => {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const { textId } = req.params;
        if (!textId) {
            return res.status(400).json({ error: 'textId requerido' });
        }

        const extractedText = await ExtractedText.findOne({
            textId,
            userId: new mongoose.Types.ObjectId(userId),
        }).lean();

        if (!extractedText) {
            return res.status(404).json({ error: 'Texto extraído no encontrado' });
        }

        return res.json({
            success: true,
            extractedText,
        });
    } catch (error) {
        console.error('[extractedText][get] Error:', error);
        return res.status(500).json({
            error: 'Error al obtener el texto extraído',
            message: error?.message || 'Error desconocido',
        });
    }
};

/**
 * Delete an extracted text by textId
 */
export const deleteExtractedText = async (req, res) => {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const { textId } = req.params;
        if (!textId) {
            return res.status(400).json({ error: 'textId requerido' });
        }

        const result = await ExtractedText.findOneAndDelete({
            textId,
            userId: new mongoose.Types.ObjectId(userId),
        });

        if (!result) {
            return res.status(404).json({ error: 'Texto extraído no encontrado' });
        }

        return res.json({
            success: true,
            message: 'Texto extraído eliminado correctamente',
            textId,
        });
    } catch (error) {
        console.error('[extractedText][delete] Error:', error);
        return res.status(500).json({
            error: 'Error al eliminar el texto extraído',
            message: error?.message || 'Error desconocido',
        });
    }
};

/**
 * Batch get extracted texts by textIds
 * Used by chat controller to load multiple texts at once
 */
export const getExtractedTextsByIds = async (textIds, userId) => {
    try {
        if (!textIds || !Array.isArray(textIds) || textIds.length === 0) {
            return [];
        }

        const extractedTexts = await ExtractedText.find({
            textId: { $in: textIds },
            userId: new mongoose.Types.ObjectId(userId),
            status: 'ready',
        })
            .sort({ createdAt: -1 })
            .lean();

        return extractedTexts;
    } catch (error) {
        console.error('[extractedText][getByIds] Error:', error);
        return [];
    }
};

