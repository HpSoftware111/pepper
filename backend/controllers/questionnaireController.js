import mongoose from 'mongoose';
import MasterCaseDocument from '../models/MasterCaseDocument.js';
import { syncMCDToCalendar } from '../services/calendarSyncService.js';
import { saveMCDToFile } from '../utils/mcdFileStorage.js';
import { getCaseFolder } from '../utils/caseFolderUtils.js';
import { generateDashboardDocx } from '../utils/docxGenerator.js';
import path from 'path';
import fs from 'fs';

/**
 * Validate questionnaire data structure
 */
const validateQuestionnaireData = (data) => {
    const errors = [];

    // Validate case_id
    if (!data.case_id || typeof data.case_id !== 'string' || data.case_id.trim().length === 0) {
        errors.push('case_id es requerido');
    }

    // Validate parties (at least one party required)
    if (!data.parties) {
        errors.push('parties es requerido');
    } else {
        const { plaintiff, defendant, other } = data.parties;
        const hasPlaintiff = plaintiff && typeof plaintiff === 'string' && plaintiff.trim().length > 0;
        const hasDefendant = defendant && typeof defendant === 'string' && defendant.trim().length > 0;
        const hasOther = Array.isArray(other) && other.length > 0 && other.some((p) => p && typeof p === 'string' && p.trim().length > 0);

        if (!hasPlaintiff && !hasDefendant && !hasOther) {
            errors.push('parties debe contener al menos un party (plaintiff, defendant, o other)');
        }
    }

    // Validate case_type
    if (!data.case_type || typeof data.case_type !== 'string' || data.case_type.trim().length === 0) {
        errors.push('case_type es requerido');
    }

    // Validate status (if provided)
    if (data.status) {
        const validStatuses = ['new', 'review', 'in_progress', 'appeals', 'pending_decision', 'closed'];
        if (!validStatuses.includes(data.status)) {
            errors.push(`status debe ser uno de: ${validStatuses.join(', ')}`);
        }
    }

    // Validate deadlines (if provided)
    if (data.deadlines && Array.isArray(data.deadlines)) {
        data.deadlines.forEach((deadline, index) => {
            if (!deadline.title || typeof deadline.title !== 'string' || deadline.title.trim().length === 0) {
                errors.push(`deadlines[${index}].title es requerido`);
            }
            if (!deadline.due_date) {
                errors.push(`deadlines[${index}].due_date es requerido`);
            } else {
                const dueDate = new Date(deadline.due_date);
                if (isNaN(dueDate.getTime())) {
                    errors.push(`deadlines[${index}].due_date debe ser una fecha válida`);
                }
            }
            if (!deadline.case_id || typeof deadline.case_id !== 'string' || deadline.case_id.trim().length === 0) {
                errors.push(`deadlines[${index}].case_id es requerido`);
            }
        });
    }

    // Validate next_actions (if provided)
    if (data.next_actions && Array.isArray(data.next_actions)) {
        data.next_actions.forEach((action, index) => {
            if (!action.title || typeof action.title !== 'string' || action.title.trim().length === 0) {
                errors.push(`next_actions[${index}].title es requerido`);
            }
            if (action.priority && !['urgent', 'pending', 'normal'].includes(action.priority)) {
                errors.push(`next_actions[${index}].priority debe ser uno de: urgent, pending, normal`);
            }
        });
    }

    return errors;
};

/**
 * Normalize questionnaire data
 */
const normalizeQuestionnaireData = (data, userId, email) => {
    const caseId = data.case_id.trim().toUpperCase();

    // Check if case_id is a 23-digit radicado (CPNU format)
    const isRadicadoCPNU = /^\d{23}$/.test(caseId);

    return {
        case_id: caseId,
        parties: {
            plaintiff: data.parties.plaintiff?.trim() || null,
            defendant: data.parties.defendant?.trim() || null,
            other: Array.isArray(data.parties.other)
                ? data.parties.other.map((p) => p.trim()).filter((p) => p.length > 0)
                : [],
        },
        case_type: data.case_type.trim(),
        status: data.status || 'new',
        // CPNU-related fields (from CPNU sync or form)
        court: data.court?.trim() || null, // Court/Judicial Office from CPNU or form
        // Last action: object with title (Actuacion) and date (Fecha de actuacion)
        // Backward compatibility: also handle string format (legacy data)
        last_action: (() => {
            if (!data.last_action) return null;
            // If it's already an object with title and date
            if (typeof data.last_action === 'object' && data.last_action !== null) {
                const title = data.last_action.title?.trim() || '';
                let date = null;
                if (data.last_action.date) {
                    // Handle different date formats
                    if (data.last_action.date instanceof Date) {
                        date = data.last_action.date;
                    } else if (typeof data.last_action.date === 'string') {
                        // Parse ISO string or YYYY-MM-DD format
                        if (/^\d{4}-\d{2}-\d{2}$/.test(data.last_action.date)) {
                            const [year, month, day] = data.last_action.date.split('-').map(Number);
                            date = new Date(year, month - 1, day);
                        } else {
                            date = new Date(data.last_action.date);
                            if (isNaN(date.getTime())) date = null;
                        }
                    }
                }
                return (title || date) ? { title, date } : null;
            }
            // Backward compatibility: handle string format (e.g., "Fijacion Estado - 2025-12-16")
            if (typeof data.last_action === 'string') {
                const trimmed = data.last_action.trim();
                if (!trimmed) return null;
                // Try to parse "Description - Date" format
                const parts = trimmed.split(' - ');
                if (parts.length >= 2) {
                    const title = parts[0].trim();
                    const dateStr = parts[parts.length - 1].trim();
                    let date = null;
                    // Try to parse date
                    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                        const [year, month, day] = dateStr.split('-').map(Number);
                        date = new Date(year, month - 1, day);
                    } else {
                        const parsed = new Date(dateStr);
                        if (!isNaN(parsed.getTime())) date = parsed;
                    }
                    return { title, date };
                }
                // If no separator, treat entire string as title
                return { title: trimmed, date: null };
            }
            return null;
        })(),
        attorney: data.attorney?.trim() || null, // Attorney from CPNU (defensorPrivado) - if added to form
        // Store CPNU actuaciones for calendar events (including past dates for historical records)
        cpnu_actuaciones: Array.isArray(data.cpnu_actuaciones) && data.cpnu_actuaciones.length > 0
            ? data.cpnu_actuaciones.map(a => ({
                fecha_registro: a.fecha_registro?.toString().trim() || null,
                fecha_actuacion: a.fecha_actuacion?.toString().trim() || null,
                descripcion: a.descripcion?.toString().trim() || null,
            }))
            : [],
        // Set cpnu_last_fecha_registro from latest actuacion if available
        cpnu_last_fecha_registro: (Array.isArray(data.cpnu_actuaciones) && data.cpnu_actuaciones.length > 0 && data.cpnu_actuaciones[0]?.fecha_registro)
            ? data.cpnu_actuaciones[0].fecha_registro.toString().trim()
            : null,
        // If case_id is a 23-digit radicado, also save it as radicado_cpnu and mark as linked
        radicado_cpnu: isRadicadoCPNU ? caseId : (data.radicado_cpnu?.trim() || null),
        linked_cpnu: isRadicadoCPNU || data.linked_cpnu || false, // Mark as CPNU-linked if radicado format
        // If case was created with CPNU preview data (has court or last_action or actuaciones), mark as bootstrapped
        // This prevents duplicate manual syncs via /sync/:caseId endpoint
        cpnu_bootstrap_done: (isRadicadoCPNU && (data.court || data.last_action || (Array.isArray(data.cpnu_actuaciones) && data.cpnu_actuaciones.length > 0))) ? true : (data.cpnu_bootstrap_done || false),
        cpnu_bootstrap_at: (isRadicadoCPNU && (data.court || data.last_action || (Array.isArray(data.cpnu_actuaciones) && data.cpnu_actuaciones.length > 0))) ? new Date() : (data.cpnu_bootstrap_at ? new Date(data.cpnu_bootstrap_at) : null),
        cpnu_bootstrap_by: (isRadicadoCPNU && (data.court || data.last_action || (Array.isArray(data.cpnu_actuaciones) && data.cpnu_actuaciones.length > 0))) ? new mongoose.Types.ObjectId(userId) : (data.cpnu_bootstrap_by ? new mongoose.Types.ObjectId(data.cpnu_bootstrap_by) : null),
        deadlines: Array.isArray(data.deadlines)
            ? data.deadlines
                .map((d) => {
                    // Parse date as local date to avoid timezone shift
                    let dueDate;
                    if (typeof d.due_date === 'string') {
                        // Check if it's in YYYY-MM-DD format
                        if (/^\d{4}-\d{2}-\d{2}$/.test(d.due_date)) {
                            // Parse YYYY-MM-DD as local date (not UTC) to avoid timezone issues
                            const [year, month, day] = d.due_date.split('-').map(Number);
                            dueDate = new Date(year, month - 1, day);
                            // Validate the parsed date
                            if (dueDate.getFullYear() !== year || dueDate.getMonth() !== month - 1 || dueDate.getDate() !== day) {
                                console.warn(`[Questionnaire] Invalid date format: ${d.due_date}`);
                                return null;
                            }
                        } else {
                            // Try parsing as ISO string or other format
                            const parsedDate = new Date(d.due_date);
                            if (!isNaN(parsedDate.getTime())) {
                                // Extract local date components to avoid timezone shift
                                const year = parsedDate.getFullYear();
                                const month = parsedDate.getMonth();
                                const day = parsedDate.getDate();
                                dueDate = new Date(year, month, day); // Create as local date
                            } else {
                                console.warn(`[Questionnaire] Invalid date: ${d.due_date}`);
                                return null;
                            }
                        }
                    } else if (d.due_date instanceof Date) {
                        // If it's already a Date object, extract local components
                        const year = d.due_date.getFullYear();
                        const month = d.due_date.getMonth();
                        const day = d.due_date.getDate();
                        dueDate = new Date(year, month, day); // Create as local date
                    } else {
                        console.warn(`[Questionnaire] Invalid date type: ${typeof d.due_date}`);
                        return null;
                    }

                    return {
                        title: d.title.trim(),
                        due_date: dueDate,
                        case_id: d.case_id.trim().toUpperCase(),
                        owner: d.owner?.trim() || '',
                        completed: d.completed || false,
                    };
                })
                .filter((d) => d !== null && !isNaN(d.due_date.getTime()))
            : [],
        last_documents: Array.isArray(data.last_documents)
            ? data.last_documents.map((d) => ({
                name: d.name.trim(),
                uploaded_at: d.uploaded_at ? new Date(d.uploaded_at) : new Date(),
                type: d.type || 'document',
            }))
            : [],
        next_actions: Array.isArray(data.next_actions)
            ? data.next_actions.map((a) => ({
                title: a.title.trim(),
                description: a.description?.trim() || null,
                priority: ['urgent', 'pending', 'normal'].includes(a.priority) ? a.priority : 'pending',
            }))
            : [],
        summary: data.summary?.trim() || '',
        user_id: new mongoose.Types.ObjectId(userId),
        user_email: email.toLowerCase().trim(),
        source: 'questionnaire',
    };
};

/**
 * Submit questionnaire and generate MCD
 */
export async function submitQuestionnaire(req, res) {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const questionnaireData = req.body;

        // Validate questionnaire data
        const validationErrors = validateQuestionnaireData(questionnaireData);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: 'Errores de validación en el cuestionario',
                errors: validationErrors,
            });
        }

        // Normalize data
        const normalizedData = normalizeQuestionnaireData(questionnaireData, userId, email);

        // Ensure userId is a string
        const userIdStr = userId.toString();

        // Check if case_id already exists in MongoDB (INCLUDE soft-deleted cases for update)
        const existingMCD = await MasterCaseDocument.findOne({
            case_id: normalizedData.case_id,
            user_id: normalizedData.user_id,
            // Remove the is_deleted filter - we want to find ALL cases, including soft-deleted ones
        }).sort({ _id: -1 }); // Get the most recent one if multiple exist

        // Check if case exists in file system (for reference, but MongoDB is authoritative)
        let fileCaseExists = false;
        let fileCaseIsDeleted = false;
        const caseFolder = getCaseFolder(userIdStr, normalizedData.case_id);
        const jsonFilePath = path.join(caseFolder, 'case.json');

        if (fs.existsSync(jsonFilePath)) {
            try {
                const fileCaseData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
                fileCaseExists = true;
                fileCaseIsDeleted = fileCaseData.is_deleted === true;

                // Only block if a non-deleted case exists in file system and we don't have it in MongoDB
                if (fileCaseData.is_deleted !== true && !existingMCD) {
                    return res.status(409).json({
                        error: `Ya existe un caso con ID "${normalizedData.case_id}"`,
                        message: 'El caso existe en el sistema de archivos y no está eliminado',
                    });
                } else if (fileCaseData.is_deleted === true) {
                    console.log(`[questionnaire][submitQuestionnaire] Found soft-deleted case ${normalizedData.case_id} in file system - will update from MongoDB`);
                }
            } catch (fileError) {
                console.error('[questionnaire][submitQuestionnaire] Error reading case.json file:', fileError);
                // If file exists but can't be read, treat as not existing and continue
            }
        }

        let mcd;
        let isUpdate = false;
        let wasSoftDeleted = false;

        if (existingMCD) {
            // Case exists (including soft-deleted) - UPDATE it instead of creating new
            isUpdate = true;
            wasSoftDeleted = existingMCD.is_deleted === true;

            console.log(`[questionnaire][submitQuestionnaire] Case ${normalizedData.case_id} exists (is_deleted: ${existingMCD.is_deleted}), updating...`);

            // Prepare update data - restore from soft-deleted if needed
            // Filter out undefined values to avoid MongoDB issues
            // IMPORTANT: Preserve attorney field if not provided in form (don't overwrite CPNU sync value)
            const updateData = {};
            Object.keys(normalizedData).forEach(key => {
                // Skip attorney if it's null/undefined/empty to preserve CPNU sync value
                if (key === 'attorney') {
                    const attorneyValue = normalizedData[key];
                    // Only update attorney if a non-empty value is provided
                    if (attorneyValue && typeof attorneyValue === 'string' && attorneyValue.trim().length > 0) {
                        updateData[key] = attorneyValue.trim();
                    }
                    // Otherwise, don't include it in update (preserves existing value from CPNU sync)
                    return;
                }
                
                if (normalizedData[key] !== undefined) {
                    updateData[key] = normalizedData[key];
                }
            });

            // Always restore from soft-deleted
            updateData.is_deleted = false;

            // Prepare update operation
            const updateOperation = {
                $set: updateData,
            };

            // Unset deleted fields if case was soft-deleted
            if (wasSoftDeleted) {
                updateOperation.$unset = {
                    deleted_at: "",
                    deleted_by: ""
                };
            }

            // Use findOneAndUpdate to atomically update the existing case
            mcd = await MasterCaseDocument.findOneAndUpdate(
                {
                    case_id: normalizedData.case_id,
                    user_id: normalizedData.user_id,
                    _id: existingMCD._id, // Update the specific one we found
                },
                updateOperation,
                {
                    new: true, // Return updated document
                    runValidators: true, // Run schema validators
                }
            );

            // Clean up any other soft-deleted duplicates (hard delete them)
            if (wasSoftDeleted) {
                const deleteResult = await MasterCaseDocument.deleteMany({
                    case_id: normalizedData.case_id,
                    user_id: normalizedData.user_id,
                    is_deleted: true,
                    _id: { $ne: mcd._id } // Exclude the one we just updated
                });

                if (deleteResult.deletedCount > 0) {
                    console.log(`[questionnaire][submitQuestionnaire] 🧹 Cleaned up ${deleteResult.deletedCount} duplicate soft-deleted case(s) for ${normalizedData.case_id}`);
                }
            }

            console.log(`[questionnaire][submitQuestionnaire] ✅ Updated existing MCD for case ${normalizedData.case_id} (restored from soft-deleted: ${wasSoftDeleted})`);
        } else {
            // No existing case found - CREATE new one
            console.log(`[questionnaire][submitQuestionnaire] Creating new MCD for userId: ${userIdStr}, case_id: ${normalizedData.case_id}`);
            mcd = await MasterCaseDocument.create(normalizedData);
            console.log(`[questionnaire][submitQuestionnaire] ✅ Created new MCD for case ${normalizedData.case_id}`);
        }

        const mcdObject = mcd.toObject();

        // Save MCD to local JSON file (update or create)
        console.log(`[questionnaire][submitQuestionnaire] ${isUpdate ? 'Updating' : 'Saving'} MCD to file for case ${normalizedData.case_id}`);
        const fileSaveResult = saveMCDToFile(userIdStr, mcd);

        if (!fileSaveResult.success) {
            console.error(`[questionnaire][submitQuestionnaire] ❌ Failed to save MCD to file:`, fileSaveResult.error);
            // Continue anyway - database save is primary, file save is secondary
        } else {
            console.log(`[questionnaire][submitQuestionnaire] ✅ MCD ${isUpdate ? 'updated' : 'saved'} to file: ${fileSaveResult.jsonFile}`);
        }

        // Generate DOCX file for MCD (always regenerate to ensure it's up-to-date)
        let docxFilePath = null;
        let docxError = null;
        try {
            const caseFolder = getCaseFolder(userIdStr, normalizedData.case_id);
            docxFilePath = path.join(caseFolder, 'mcd.docx');

            // Convert MCD to Dashboard Template format for DOCX generation
            const dashboardTemplate = {
                case_id: mcd.case_id,
                client: `${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}`,
                practice: mcd.case_type || 'General',
                type: mcd.case_type || 'General',
                attorney: 'N/A', // MCD doesn't have attorney field
                status: mcd.status === 'new' ? 'urgent' : mcd.status === 'in_progress' ? 'active' : 'pending',
                stage: 'Discovery', // Default stage
                summary: mcd.summary || 'No summary provided',
                hearing: 'none',
                important_dates: [],
                recent_activity: [{
                    id: `activity-${Date.now()}`,
                    message: isUpdate
                        ? (wasSoftDeleted ? 'Case restored and updated via questionnaire' : 'Case updated via questionnaire')
                        : 'Case created via questionnaire',
                    time: new Date().toISOString(),
                }],
                deadlines: (mcd.deadlines || []).map(d => ({
                    title: d.title,
                    caseId: d.case_id || mcd.case_id,
                    due: d.due_date ? new Date(d.due_date).toISOString().split('T')[0] : '',
                    owner: d.owner || 'Unassigned',
                    completed: d.completed || false,
                })),
                sidebar_case: {
                    id: mcd.case_id,
                    name: `${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}`,
                    type: mcd.case_type || 'General',
                    status: mcd.status === 'new' ? 'urgent' : mcd.status === 'in_progress' ? 'active' : 'pending',
                },
            };

            console.log(`[questionnaire][submitQuestionnaire] Generating DOCX file at: ${docxFilePath}`);
            await generateDashboardDocx(dashboardTemplate, docxFilePath);
            console.log(`[questionnaire][submitQuestionnaire] ✅ DOCX file generated successfully: ${docxFilePath}`);
        } catch (error) {
            docxError = error;
            console.error('[questionnaire][submitQuestionnaire] ❌ Error generating DOCX:', error);
            console.error('[questionnaire][submitQuestionnaire] Error message:', error.message);
            console.error('[questionnaire][submitQuestionnaire] Error stack:', error.stack);
            // Continue even if DOCX generation fails - JSON is the critical file
        }

        // Automatically sync to calendar (await to ensure it completes, but don't fail request if it errors)
        let calendarSyncResult = null;
        let calendarSyncError = null;
        try {
            console.log(`[questionnaire][submitQuestionnaire] Starting calendar sync for case ${normalizedData.case_id}`);
            calendarSyncResult = await syncMCDToCalendar(userIdStr, mcdObject);
            console.log(`[questionnaire][submitQuestionnaire] ✅ Calendar sync completed for case ${normalizedData.case_id}:`, {
                success: calendarSyncResult.success,
                created: calendarSyncResult.created,
                skipped: calendarSyncResult.skipped,
                message: calendarSyncResult.message,
            });
        } catch (error) {
            calendarSyncError = error;
            console.error(`[questionnaire][submitQuestionnaire] ❌ Error syncing case ${normalizedData.case_id} to calendar:`, error);
            console.error('[questionnaire][submitQuestionnaire] Error message:', error.message);
            console.error('[questionnaire][submitQuestionnaire] Error stack:', error.stack);
            // Don't fail the request if calendar sync fails
        }

        // Build response with operation results
        const response = {
            success: true,
            mcd: mcdObject,
            operations: {
                fileSave: fileSaveResult.success ? {
                    success: true,
                    jsonFile: fileSaveResult.jsonFile,
                    relativePath: fileSaveResult.relativePath,
                } : {
                    success: false,
                    error: fileSaveResult.error,
                },
                docxGeneration: docxFilePath ? {
                    success: true,
                    docxFile: docxFilePath,
                } : {
                    success: false,
                    error: docxError ? docxError.message : 'Unknown error',
                },
                calendarSync: calendarSyncResult ? {
                    success: calendarSyncResult.success,
                    created: calendarSyncResult.created || 0,
                    skipped: calendarSyncResult.skipped || 0,
                    message: calendarSyncResult.message,
                } : {
                    success: false,
                    error: calendarSyncError ? calendarSyncError.message : 'Calendar sync failed',
                },
            },
            message: isUpdate
                ? (wasSoftDeleted
                    ? `Master Case Document restaurado y actualizado exitosamente desde cuestionario`
                    : `Master Case Document actualizado exitosamente desde cuestionario`)
                : 'Master Case Document creado exitosamente desde cuestionario',
        };

        // Log summary
        console.log(`[questionnaire][submitQuestionnaire] 📊 Operation summary for case ${normalizedData.case_id} (${isUpdate ? 'UPDATE' : 'CREATE'}):`, {
            fileSave: response.operations.fileSave.success ? '✅' : '❌',
            docxGeneration: response.operations.docxGeneration.success ? '✅' : '❌',
            calendarSync: response.operations.calendarSync.success ? '✅' : '❌',
            wasSoftDeleted: wasSoftDeleted ? '✅ Restored' : 'N/A',
        });

        return res.status(isUpdate ? 200 : 201).json(response);
    } catch (error) {
        console.error('[questionnaire][submitQuestionnaire] Error:', error);
        return res.status(500).json({
            error: 'Error al procesar el cuestionario',
            message: error.message || 'Error desconocido',
        });
    }
}

/**
 * Get questionnaire template (for frontend form structure)
 */
export async function getQuestionnaireTemplate(req, res) {
    try {
        // Return template structure for frontend
        return res.json({
            success: true,
            template: {
                case_id: {
                    label: 'Case ID',
                    type: 'text',
                    required: true,
                    placeholder: 'e.g., TUT-214, CIV-442',
                },
                parties: {
                    label: 'Parties',
                    type: 'object',
                    required: true,
                    fields: {
                        plaintiff: {
                            label: 'Plaintiff',
                            type: 'text',
                            required: false,
                            placeholder: 'Name of plaintiff',
                        },
                        defendant: {
                            label: 'Defendant',
                            type: 'text',
                            required: false,
                            placeholder: 'Name of defendant',
                        },
                        other: {
                            label: 'Other Parties',
                            type: 'array',
                            required: false,
                            itemType: 'text',
                            placeholder: 'Add party name',
                        },
                    },
                },
                case_type: {
                    label: 'Case Type',
                    type: 'text',
                    required: true,
                    placeholder: 'e.g., Criminal Defense, Family Law, Corporate',
                },
                status: {
                    label: 'Status',
                    type: 'select',
                    required: false,
                    options: [
                        { value: 'new', label: 'New' },
                        { value: 'review', label: 'Review' },
                        { value: 'in_progress', label: 'In Progress' },
                        { value: 'appeals', label: 'Appeals' },
                        { value: 'pending_decision', label: 'Pending Decision' },
                        { value: 'closed', label: 'Closed' },
                    ],
                    default: 'new',
                },
                deadlines: {
                    label: 'Deadlines',
                    type: 'array',
                    required: false,
                    itemType: 'object',
                    fields: {
                        title: {
                            label: 'Title',
                            type: 'text',
                            required: true,
                            placeholder: 'e.g., File motion to suppress',
                        },
                        due_date: {
                            label: 'Due Date',
                            type: 'date',
                            required: true,
                        },
                        owner: {
                            label: 'Owner',
                            type: 'text',
                            required: false,
                            placeholder: 'Responsible person',
                        },
                    },
                },
                next_actions: {
                    label: 'Next Actions',
                    type: 'array',
                    required: false,
                    itemType: 'object',
                    fields: {
                        title: {
                            label: 'Title',
                            type: 'text',
                            required: true,
                            placeholder: 'e.g., Witness prep session',
                        },
                        description: {
                            label: 'Description',
                            type: 'textarea',
                            required: false,
                            placeholder: 'Additional details',
                        },
                        priority: {
                            label: 'Priority',
                            type: 'select',
                            required: false,
                            options: [
                                { value: 'urgent', label: 'Urgent' },
                                { value: 'pending', label: 'Pending' },
                                { value: 'normal', label: 'Normal' },
                            ],
                            default: 'pending',
                        },
                    },
                },
                summary: {
                    label: 'Summary',
                    type: 'textarea',
                    required: false,
                    placeholder: 'Brief summary of the case',
                },
            },
        });
    } catch (error) {
        console.error('[questionnaire][getQuestionnaireTemplate] Error:', error);
        return res.status(500).json({
            error: 'Error al obtener plantilla del cuestionario',
            message: error.message || 'Error desconocido',
        });
    }
}

