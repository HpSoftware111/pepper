import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getCaseFolderFiles, getAllCaseFolders, readFileFromCaseFolder, deleteFileFromCaseFolder, saveFileToCaseFolder } from '../utils/caseFolderUtils.js';
import { filesUpload } from '../controllers/fileController.js';
import MasterCaseDocument from '../models/MasterCaseDocument.js';
import path from 'path';

const router = express.Router();

/**
 * GET /api/case-files
 * Get all files from all case folders for the user
 */
router.get('/', requireAuth, (req, res) => {
    try {
        const { userId } = req.user || {};
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const caseFolders = getAllCaseFolders(userId);

        // Format all files from all case folders
        const allFiles = [];
        caseFolders.forEach(folder => {
            folder.files.forEach(file => {
                allFiles.push({
                    id: `${folder.caseId}-${file.name}`,
                    name: file.name,
                    caseId: folder.caseId,
                    size: file.stats.size,
                    updated: file.stats.mtime.toISOString(),
                    type: path.extname(file.name).slice(1).toLowerCase() || 'file',
                    path: file.path,
                });
            });
        });

        return res.json({
            success: true,
            files: allFiles,
            caseFolders: caseFolders.map(f => ({
                caseId: f.caseId,
                fileCount: f.files.length,
            })),
        });
    } catch (error) {
        console.error('[caseFiles][getAll] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to get all case files',
            message: error.message,
        });
    }
});

/**
 * GET /api/case-files/:caseId
 * Get all files in a specific case folder
 */
router.get('/:caseId', requireAuth, (req, res) => {
    try {
        const { userId } = req.user || {};
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { caseId } = req.params;
        const files = getCaseFolderFiles(userId, caseId);

        // Format file information
        const fileList = files.map(file => ({
            name: file.name,
            path: file.path,
            size: file.stats.size,
            updated: file.stats.mtime.toISOString(),
            type: path.extname(file.name).slice(1).toLowerCase() || 'file',
        }));

        return res.json({
            success: true,
            caseId,
            files: fileList,
        });
    } catch (error) {
        console.error('[caseFiles][get] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to get case files',
            message: error.message,
        });
    }
});

/**
 * GET /api/case-files/:caseId/:fileName
 * Download a specific file from a case folder
 */
router.get('/:caseId/:fileName', requireAuth, (req, res) => {
    try {
        const { userId } = req.user || {};
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { caseId, fileName } = req.params;
        const fileContent = readFileFromCaseFolder(userId, caseId, fileName, true);

        if (!fileContent) {
            return res.status(404).json({
                success: false,
                error: 'File not found',
            });
        }

        // Set appropriate headers for file download
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        // Determine content type based on file extension
        const ext = path.extname(fileName).toLowerCase();
        const contentTypeMap = {
            '.pdf': 'application/pdf',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.doc': 'application/msword',
            '.txt': 'text/plain',
            '.json': 'application/json',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
        };
        res.setHeader('Content-Type', contentTypeMap[ext] || 'application/octet-stream');

        res.send(fileContent);
    } catch (error) {
        console.error('[caseFiles][download] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to download file',
            message: error.message,
        });
    }
});

/**
 * POST /api/case-files/:caseId/upload
 * Upload files to a case folder
 * Key rule: All file operations go through Pepper UI - lawyer never touches files directly
 */
router.post('/:caseId/upload', requireAuth, (req, res, next) => {
    filesUpload(req, res, async (err) => {
        if (err) {
            if (err.message === 'UNSUPPORTED_EXTENSION' || err.message === 'UNSUPPORTED_MIMETYPE') {
                return res.status(400).json({ success: false, error: 'Unsupported file format' });
            }
            if (err.message === 'File too large') {
                return res.status(400).json({ success: false, error: 'File too large (maximum 12MB)' });
            }
            return res.status(400).json({ success: false, error: err.message || 'Error uploading file' });
        }

        try {
            const { userId } = req.user || {};
            if (!userId) {
                return res.status(401).json({ success: false, error: 'Unauthorized' });
            }

            const { caseId } = req.params;
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ success: false, error: 'No files uploaded' });
            }

            // Save each file to the case folder
            const savedFiles = [];
            const errors = [];
            const userIdStr = userId.toString();

            req.files.forEach((file) => {
                try {
                    const result = saveFileToCaseFolder(
                        userIdStr,
                        caseId,
                        file.originalname,
                        file.buffer,
                        true // isBinary
                    );

                    if (result.success) {
                        savedFiles.push({
                            name: file.originalname,
                            size: file.size,
                            path: result.relativePath,
                        });
                    } else {
                        errors.push({
                            name: file.originalname,
                            error: result.error || 'Failed to save file',
                        });
                    }
                } catch (error) {
                    errors.push({
                        name: file.originalname,
                        error: error.message || 'Failed to save file',
                    });
                }
            });

            if (savedFiles.length === 0) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to save files',
                    errors,
                });
            }

            // Update MCD's last_documents array with uploaded files
            try {
                const mcd = await MasterCaseDocument.findOne({
                    case_id: caseId.toUpperCase(),
                    user_id: userId,
                });

                if (mcd) {
                    // Add new documents to last_documents array (avoid duplicates)
                    const existingDocNames = new Set((mcd.last_documents || []).map(doc => doc.name));

                    savedFiles.forEach((savedFile) => {
                        if (!existingDocNames.has(savedFile.name)) {
                            mcd.last_documents.push({
                                name: savedFile.name,
                                uploaded_at: new Date(),
                                type: path.extname(savedFile.name).slice(1).toLowerCase() || 'document',
                            });
                        }
                    });

                    await mcd.save();
                    console.log(`[caseFiles][upload] Updated MCD ${caseId} with ${savedFiles.length} new document(s)`);
                } else {
                    console.log(`[caseFiles][upload] No MCD found for case ${caseId} - files saved but not added to MCD`);
                }
            } catch (mcdError) {
                console.error('[caseFiles][upload] Error updating MCD:', mcdError);
                // Don't fail the request if MCD update fails - files are already saved
            }

            return res.json({
                success: true,
                message: `Successfully uploaded ${savedFiles.length} file${savedFiles.length > 1 ? 's' : ''} to case folder`,
                files: savedFiles,
                errors: errors.length > 0 ? errors : undefined,
            });
        } catch (error) {
            console.error('[caseFiles][upload] Error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to upload files',
                message: error.message,
            });
        }
    });
});

/**
 * DELETE /api/case-files/:caseId/:fileName
 * Delete a file from a case folder
 */
router.delete('/:caseId/:fileName', requireAuth, async (req, res) => {
    try {
        const { userId } = req.user || {};
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { caseId, fileName } = req.params;
        const userIdStr = userId.toString();
        const deleted = deleteFileFromCaseFolder(userIdStr, caseId, fileName);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: 'File not found',
            });
        }

        // Remove document from MCD's last_documents array
        try {
            const mcd = await MasterCaseDocument.findOne({
                case_id: caseId.toUpperCase(),
                user_id: userId,
            });

            if (mcd && mcd.last_documents) {
                const initialLength = mcd.last_documents.length;
                mcd.last_documents = mcd.last_documents.filter(doc => doc.name !== fileName);

                if (mcd.last_documents.length < initialLength) {
                    await mcd.save();
                    console.log(`[caseFiles][delete] Removed document "${fileName}" from MCD ${caseId}`);
                }
            }
        } catch (mcdError) {
            console.error('[caseFiles][delete] Error updating MCD:', mcdError);
            // Don't fail the request if MCD update fails - file is already deleted
        }

        return res.json({
            success: true,
            message: `File "${fileName}" deleted from case "${caseId}"`,
        });
    } catch (error) {
        console.error('[caseFiles][delete] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to delete file',
            message: error.message,
        });
    }
});

export default router;

