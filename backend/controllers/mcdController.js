import mongoose from 'mongoose';
import MasterCaseDocument from '../models/MasterCaseDocument.js';
import { syncMCDToCalendar } from '../services/calendarSyncService.js';
import { saveMCDToFile } from '../utils/mcdFileStorage.js';
import { getCaseFolder } from '../utils/caseFolderUtils.js';
import path from 'path';
import fs from 'fs';

/**
 * Create a new Master Case Document
 */
export async function createMCD(req, res) {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const {
            case_id,
            parties,
            case_type,
            status = 'new',
            deadlines = [],
            last_documents = [],
            next_actions = [],
            summary = '',
            mcd_file_path = '',
            source = 'manual',
            source_document_id = null,
        } = req.body;

        // Validate required fields
        if (!case_id || !parties || !case_type) {
            return res.status(400).json({
                error: 'Faltan campos requeridos: case_id, parties, case_type son obligatorios',
            });
        }

        // Validate parties structure
        if (!parties.plaintiff && !parties.defendant && (!parties.other || parties.other.length === 0)) {
            return res.status(400).json({
                error: 'Parties debe contener al menos plaintiff, defendant, o other',
            });
        }

        // Validate status
        const validStatuses = ['new', 'review', 'in_progress', 'appeals', 'pending_decision', 'closed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                error: `Status inválido. Debe ser uno de: ${validStatuses.join(', ')}`,
            });
        }

        // Check if case_id already exists for this user (exclude soft-deleted cases)
        const existing = await MasterCaseDocument.findOne({
            case_id,
            user_id: userId,
            is_deleted: { $ne: true }, // Exclude soft-deleted cases
        });

        if (existing) {
            return res.status(409).json({
                error: `Ya existe un caso con ID "${case_id}" para este usuario`,
            });
        }

        // Validate deadlines (must have explicit dates, no computed dates)
        const validatedDeadlines = deadlines.map((deadline) => {
            if (!deadline.due_date) {
                throw new Error('Todos los deadlines deben tener due_date explícito');
            }
            return {
                title: deadline.title || '',
                due_date: new Date(deadline.due_date),
                case_id: deadline.case_id || case_id,
                owner: deadline.owner || '',
                completed: deadline.completed || false,
            };
        });

        // Create MCD
        const mcd = await MasterCaseDocument.create({
            case_id: case_id.trim().toUpperCase(),
            parties: {
                plaintiff: parties.plaintiff || '',
                defendant: parties.defendant || '',
                other: parties.other || [],
            },
            case_type: case_type.trim(),
            status,
            deadlines: validatedDeadlines,
            last_documents: last_documents.map((doc) => ({
                name: doc.name || '',
                uploaded_at: doc.uploaded_at ? new Date(doc.uploaded_at) : new Date(),
                type: doc.type || 'document',
            })),
            next_actions: next_actions.map((action) => ({
                title: action.title || '',
                description: action.description || '',
                priority: action.priority || 'pending',
            })),
            summary: summary.trim(),
            user_id: new mongoose.Types.ObjectId(userId),
            user_email: email.toLowerCase().trim(),
            mcd_file_path: mcd_file_path.trim(),
            source,
            source_document_id: source_document_id
                ? new mongoose.Types.ObjectId(source_document_id)
                : null,
        });

        // Automatically sync to calendar (async, don't wait)
        syncMCDToCalendar(userId, mcd.toObject()).catch((error) => {
            console.error('[MCD][create] Error syncing to calendar:', error);
            // Don't fail the request if calendar sync fails
        });

        // Save MCD to local JSON file
        const mcdObject = mcd.toObject();
        const fileSaveResult = saveMCDToFile(userId, mcd);

        return res.status(201).json({
            success: true,
            mcd: mcdObject,
            fileLocation: fileSaveResult.success ? {
                jsonFile: fileSaveResult.jsonFile,
                relativePath: fileSaveResult.relativePath,
            } : undefined,
        });
    } catch (error) {
        console.error('[MCD][create] Error:', error);
        return res.status(500).json({
            error: 'Error al crear Master Case Document',
            message: error.message || 'Error desconocido',
        });
    }
}

/**
 * Get MCD by case_id
 */
export async function getMCDByCaseId(req, res) {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const { caseId } = req.params;
        if (!caseId) {
            return res.status(400).json({ error: 'caseId es requerido' });
        }

        const mcd = await MasterCaseDocument.findOne({
            case_id: caseId.toUpperCase(),
            user_id: userId,
        }).lean();

        if (!mcd) {
            return res.status(404).json({
                error: `No se encontró un caso con ID "${caseId}"`,
            });
        }

        return res.json({
            success: true,
            mcd,
        });
    } catch (error) {
        console.error('[MCD][getByCaseId] Error:', error);
        return res.status(500).json({
            error: 'Error al obtener Master Case Document',
            message: error.message || 'Error desconocido',
        });
    }
}

/**
 * Get all MCDs for the authenticated user
 */
/**
 * Get all MCDs for the authenticated user
 * Filters out deleted cases (is_deleted !== true)
 */
export async function getAllMCDs(req, res) {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const { status, limit = 50, offset = 0 } = req.query;

        // Filter out deleted cases - use $ne: true to handle false, null, and undefined
        // This matches the partial index structure which uses { is_deleted: false }
        const query = { 
            user_id: userId,
            $or: [
                { is_deleted: false },
                { is_deleted: { $exists: false } },
                { is_deleted: null }
            ],
        };
        if (status) {
            query.status = status;
        }

        const mcds = await MasterCaseDocument.find(query)
            .sort({ updatedAt: -1 })
            .limit(parseInt(limit, 10))
            .skip(parseInt(offset, 10))
            .lean();

        // Defensive filter: remove any cases with is_deleted: true (shouldn't happen, but safety check)
        const filteredMcds = mcds.filter(mcd => {
            const isDeleted = (mcd.is_deleted === true);
            if (isDeleted) {
                console.warn(`[MCD][getAll] WARNING: Found deleted case ${mcd.case_id} in query results - filtering out`);
            }
            return !isDeleted;
        });
        
        if (filteredMcds.length !== mcds.length) {
            console.warn(`[MCD][getAll] Query returned ${mcds.length} MCDs but ${filteredMcds.length} after filtering deleted cases`);
        }

        const total = filteredMcds.length; // Use filtered count for accurate pagination

        return res.json({
            success: true,
            mcds: filteredMcds, // Use filtered array - ensures no deleted cases are returned
            total,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10),
        });
    } catch (error) {
        console.error('[MCD][getAll] Error:', error);
        return res.status(500).json({
            error: 'Error al obtener Master Case Documents',
            message: error.message || 'Error desconocido',
        });
    }
}

/**
 * Update MCD by case_id
 */
export async function updateMCD(req, res) {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const { caseId } = req.params;
        if (!caseId) {
            return res.status(400).json({ error: 'caseId es requerido' });
        }

        const {
            parties,
            case_type,
            status,
            deadlines,
            last_documents,
            next_actions,
            summary,
            mcd_file_path,
        } = req.body;

        // Find existing MCD
        const mcd = await MasterCaseDocument.findOne({
            case_id: caseId.toUpperCase(),
            user_id: userId,
        });

        if (!mcd) {
            return res.status(404).json({
                error: `No se encontró un caso con ID "${caseId}"`,
            });
        }

        // Update fields (only provided fields)
        const updateData = {};

        if (parties !== undefined) {
            updateData.parties = {
                plaintiff: parties.plaintiff !== undefined ? parties.plaintiff : mcd.parties.plaintiff,
                defendant: parties.defendant !== undefined ? parties.defendant : mcd.parties.defendant,
                other: parties.other !== undefined ? parties.other : mcd.parties.other,
            };
        }

        if (case_type !== undefined) updateData.case_type = case_type.trim();
        if (status !== undefined) {
            const validStatuses = ['new', 'review', 'in_progress', 'appeals', 'pending_decision', 'closed'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    error: `Status inválido. Debe ser uno de: ${validStatuses.join(', ')}`,
                });
            }
            updateData.status = status;
        }

        if (deadlines !== undefined) {
            // Validate deadlines have explicit dates
            updateData.deadlines = deadlines.map((deadline) => {
                if (!deadline.due_date) {
                    throw new Error('Todos los deadlines deben tener due_date explícito');
                }
                return {
                    title: deadline.title || '',
                    due_date: new Date(deadline.due_date),
                    case_id: deadline.case_id || mcd.case_id,
                    owner: deadline.owner || '',
                    completed: deadline.completed || false,
                };
            });
        }

        if (last_documents !== undefined) {
            updateData.last_documents = last_documents.map((doc) => ({
                name: doc.name || '',
                uploaded_at: doc.uploaded_at ? new Date(doc.uploaded_at) : new Date(),
                type: doc.type || 'document',
            }));
        }

        if (next_actions !== undefined) {
            updateData.next_actions = next_actions.map((action) => ({
                title: action.title || '',
                description: action.description || '',
                priority: action.priority || 'pending',
            }));
        }

        if (summary !== undefined) updateData.summary = summary.trim();
        if (mcd_file_path !== undefined) updateData.mcd_file_path = mcd_file_path.trim();

        // Update MCD
        Object.assign(mcd, updateData);
        await mcd.save();

        // Automatically sync to calendar (async, don't wait)
        syncMCDToCalendar(userId, mcd.toObject()).catch((error) => {
            console.error('[MCD][update] Error syncing to calendar:', error);
            // Don't fail the request if calendar sync fails
        });

        // Save updated MCD to local JSON file
        const mcdObject = mcd.toObject();
        const fileSaveResult = saveMCDToFile(userId, mcd);

        return res.json({
            success: true,
            mcd: mcdObject,
            fileLocation: fileSaveResult.success ? {
                jsonFile: fileSaveResult.jsonFile,
                relativePath: fileSaveResult.relativePath,
            } : undefined,
        });
    } catch (error) {
        console.error('[MCD][update] Error:', error);
        return res.status(500).json({
            error: 'Error al actualizar Master Case Document',
            message: error.message || 'Error desconocido',
        });
    }
}

/**
 * Delete MCD by case_id
 */
/**
 * Soft delete MCD (mark as deleted instead of removing from database)
 * Updated to support soft delete for CPNU integration
 */
export async function deleteMCD(req, res) {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const { caseId } = req.params;
        if (!caseId) {
            return res.status(400).json({ error: 'caseId es requerido' });
        }

        // Find MCD
        const mcd = await MasterCaseDocument.findOne({
            case_id: caseId.toUpperCase(),
            user_id: userId,
        });

        if (!mcd) {
            return res.status(404).json({
                error: `No se encontró un caso con ID "${caseId}"`,
            });
        }

        // Check if already deleted - return success (idempotent operation)
        if (mcd.is_deleted === true) {
            console.log(`[MCD][delete] Case ${caseId} is already deleted - returning success (idempotent)`);
            return res.json({
                success: true,
                message: 'El caso ya está eliminado',
            });
        }

        // Soft delete: update MCD using findOneAndUpdate for atomicity
        console.log(`[MCD][delete] Attempting to soft delete case ${caseId} (normalized: ${caseId.toUpperCase()}) for user ${userId}`);
        
        const updatedMCD = await MasterCaseDocument.findOneAndUpdate(
            {
                case_id: caseId.toUpperCase(),
                user_id: userId,
            },
            {
                $set: {
                    is_deleted: true,
                    deleted_at: new Date(),
                    deleted_by: userId,
                }
            },
            {
                new: true, // Return the updated document
                runValidators: true, // Run schema validators
            }
        );

        if (!updatedMCD) {
            console.error(`[MCD][delete] ❌ Case ${caseId} not found during update - case may not exist or was already deleted`);
            return res.status(404).json({
                error: `No se encontró un caso con ID "${caseId}"`,
                message: 'El caso no existe o ya fue eliminado',
            });
        }

        if (updatedMCD.is_deleted !== true) {
            console.error(`[MCD][delete] ❌ Case ${caseId} update returned but is_deleted is ${updatedMCD.is_deleted} (expected true)`);
            return res.status(500).json({
                error: 'Error al eliminar Master Case Document',
                message: 'No se pudo verificar la eliminación del caso',
            });
        }

        // Verify with a separate query to ensure the update is committed
        const verifyQuery = await MasterCaseDocument.findOne({
            case_id: caseId.toUpperCase(),
            user_id: userId,
        }).select('is_deleted deleted_at').lean();

        if (!verifyQuery) {
            console.error(`[MCD][delete] ❌ Case ${caseId} not found in verification query - possible database inconsistency`);
            return res.status(500).json({
                error: 'Error al eliminar Master Case Document',
                message: 'No se pudo verificar la eliminación del caso',
            });
        }

        if (verifyQuery.is_deleted !== true) {
            console.error(`[MCD][delete] ❌ Case ${caseId} verification query shows is_deleted: ${verifyQuery.is_deleted} (expected true)`);
            return res.status(500).json({
                error: 'Error al eliminar Master Case Document',
                message: 'No se pudo verificar la eliminación del caso',
            });
        }

        console.log(`[MCD][delete] ✅ Case ${caseId} soft deleted successfully and verified (is_deleted: ${verifyQuery.is_deleted}, deleted_at: ${verifyQuery.deleted_at})`);

        // Also update mcd.json file in file system if it exists (for consistency)
        try {
            const caseFolder = getCaseFolder(userId.toString(), caseId);
            const mcdJsonPath = path.join(caseFolder, 'mcd.json');
            
            if (fs.existsSync(mcdJsonPath)) {
                const mcdFileData = JSON.parse(fs.readFileSync(mcdJsonPath, 'utf8'));
                mcdFileData.is_deleted = true;
                mcdFileData.deleted_at = new Date().toISOString();
                mcdFileData.deleted_by = userId.toString();
                fs.writeFileSync(mcdJsonPath, JSON.stringify(mcdFileData, null, 2), 'utf8');
                console.log(`[MCD][delete] ✅ Updated mcd.json file in file system for case ${caseId}`);
            }
        } catch (fileError) {
            // Don't fail the delete if file update fails - MongoDB is the source of truth
            console.warn(`[MCD][delete] ⚠️ Could not update mcd.json file for case ${caseId}:`, fileError.message);
        }

        return res.json({
            success: true,
            message: `Caso "${caseId}" eliminado exitosamente`,
        });
    } catch (error) {
        console.error('[MCD][delete] Error:', error);
        return res.status(500).json({
            error: 'Error al eliminar Master Case Document',
            message: error.message || 'Error desconocido',
        });
    }
}

/**
 * Sync MCD from local file (for future file watcher implementation)
 */
export async function syncMCDFromFile(req, res) {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const { mcd_data, file_path } = req.body;

        if (!mcd_data || !mcd_data.case_id) {
            return res.status(400).json({
                error: 'mcd_data con case_id es requerido',
            });
        }

        // Validate and normalize MCD data
        const normalizedMCD = {
            case_id: mcd_data.case_id.trim().toUpperCase(),
            parties: {
                plaintiff: mcd_data.parties?.plaintiff || '',
                defendant: mcd_data.parties?.defendant || '',
                other: mcd_data.parties?.other || [],
            },
            case_type: mcd_data.case_type || '',
            status: mcd_data.status || 'new',
            deadlines: (mcd_data.deadlines || []).map((d) => ({
                title: d.title || '',
                due_date: new Date(d.due_date),
                case_id: d.case_id || mcd_data.case_id,
                owner: d.owner || '',
                completed: d.completed || false,
            })),
            last_documents: (mcd_data.last_documents || []).map((d) => ({
                name: d.name || '',
                uploaded_at: d.uploaded_at ? new Date(d.uploaded_at) : new Date(),
                type: d.type || 'document',
            })),
            next_actions: (mcd_data.next_actions || []).map((a) => ({
                title: a.title || '',
                description: a.description || '',
                priority: a.priority || 'pending',
            })),
            summary: mcd_data.summary || '',
            user_id: new mongoose.Types.ObjectId(userId),
            user_email: email.toLowerCase().trim(),
            mcd_file_path: file_path || '',
            source: 'file',
        };

        // Upsert MCD
        const mcd = await MasterCaseDocument.findOneAndUpdate(
            {
                case_id: normalizedMCD.case_id,
                user_id: normalizedMCD.user_id,
            },
            normalizedMCD,
            {
                upsert: true,
                new: true,
                runValidators: true,
            }
        );

        return res.json({
            success: true,
            mcd: mcd.toObject(),
            message: 'MCD sincronizado desde archivo local',
        });
    } catch (error) {
        console.error('[MCD][syncFromFile] Error:', error);
        return res.status(500).json({
            error: 'Error al sincronizar MCD desde archivo',
            message: error.message || 'Error desconocido',
        });
    }
}

