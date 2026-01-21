import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/requireAuth.js';
import { generateDashboardDocx } from '../utils/docxGenerator.js';
import { syncDashboardTemplateToCalendar } from '../services/calendarSyncService.js';
import { getCaseFolder, getUserCasesDir } from '../utils/caseFolderUtils.js';
import MasterCaseDocument from '../models/MasterCaseDocument.js';
import { saveMCDToFile } from '../utils/mcdFileStorage.js';
import { syncMCDToCalendar } from '../services/calendarSyncService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

/**
 * Get cases directory for a specific user (for backward compatibility)
 * @deprecated Use getCaseFolder instead for case-specific operations
 */
const getCasesDir = (userId) => {
    return getUserCasesDir(userId);
};

// =========================================================
// Validation Functions
// =========================================================

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isValidISODate(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function validateEnum(value, allowed) {
    return allowed.includes(value);
}

function validateCaseId(caseId) {
    if (!isNonEmptyString(caseId)) return 'Case ID is required.';
    // Case ID must be numeric only for Colombian judicial compatibility
    if (!/^\d+$/.test(caseId))
        return 'Case ID must be numeric only (no letters, dashes, or special characters).';
    return null;
}

/**
 * Normalize status values from Spanish to English
 */
function normalizeStatus(status) {
    if (!status || typeof status !== 'string') return status;
    const normalized = status.trim().toLowerCase();
    const statusMap = {
        // Spanish
        'activo': 'active',
        'activa': 'active',
        'pendiente': 'pending',
        'urgente': 'urgent',
        // English (already correct)
        'active': 'active',
        'pending': 'pending',
        'urgent': 'urgent',
    };
    return statusMap[normalized] || status;
}

/**
 * Normalize Dashboard Template data (convert Spanish status values to English)
 */
function normalizeTemplate(data) {
    if (!data || typeof data !== 'object') return data;

    const normalized = { ...data };

    // Normalize main status
    if (normalized.status) {
        normalized.status = normalizeStatus(normalized.status);
    }

    // Normalize sidebar_case status
    if (normalized.sidebar_case && normalized.sidebar_case.status) {
        normalized.sidebar_case = {
            ...normalized.sidebar_case,
            status: normalizeStatus(normalized.sidebar_case.status),
        };
    }

    // Normalize deadlines - ensure due dates are in YYYY-MM-DD format
    if (Array.isArray(normalized.deadlines)) {
        normalized.deadlines = normalized.deadlines.map((deadline) => {
            const normalizedDeadline = { ...deadline };

            // Ensure caseId matches case_id
            if (normalized.case_id) {
                normalizedDeadline.caseId = normalized.case_id;
            }

            // Normalize due date format
            if (normalizedDeadline.due) {
                try {
                    // If it's already a string in YYYY-MM-DD format, keep it
                    if (typeof normalizedDeadline.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(normalizedDeadline.due)) {
                        // Already in correct format - validate it's a valid date
                        const [year, month, day] = normalizedDeadline.due.split('-').map(Number);
                        const testDate = new Date(year, month - 1, day);
                        if (testDate.getFullYear() === year && testDate.getMonth() === month - 1 && testDate.getDate() === day) {
                            // Valid date, keep it
                        } else {
                            throw new Error('Invalid date');
                        }
                    } else if (typeof normalizedDeadline.due === 'string') {
                        // Try to detect and parse different date formats
                        let date;

                        // Check for DD-MM-YYYY format (e.g., "21-12-2025")
                        const ddMMyyyyMatch = normalizedDeadline.due.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
                        if (ddMMyyyyMatch) {
                            const [, day, month, year] = ddMMyyyyMatch.map(Number);
                            date = new Date(year, month - 1, day);
                            // Validate the parsed date
                            if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
                                // Valid date, format as YYYY-MM-DD
                                normalizedDeadline.due = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            } else {
                                throw new Error(`Invalid DD-MM-YYYY date: ${normalizedDeadline.due}`);
                            }
                        } else {
                            // Try parsing as ISO string or other format
                            date = new Date(normalizedDeadline.due);
                            if (!Number.isNaN(date.getTime())) {
                                // Format as YYYY-MM-DD using local timezone
                                const year = date.getFullYear();
                                const month = String(date.getMonth() + 1).padStart(2, '0');
                                const day = String(date.getDate()).padStart(2, '0');
                                normalizedDeadline.due = `${year}-${month}-${day}`;
                            } else {
                                throw new Error(`Invalid date format: ${normalizedDeadline.due}`);
                            }
                        }
                    } else if (normalizedDeadline.due instanceof Date) {
                        // If it's already a Date object, format it
                        if (!Number.isNaN(normalizedDeadline.due.getTime())) {
                            const year = normalizedDeadline.due.getFullYear();
                            const month = String(normalizedDeadline.due.getMonth() + 1).padStart(2, '0');
                            const day = String(normalizedDeadline.due.getDate()).padStart(2, '0');
                            normalizedDeadline.due = `${year}-${month}-${day}`;
                        } else {
                            throw new Error('Invalid Date object');
                        }
                    } else {
                        throw new Error(`Unsupported date type: ${typeof normalizedDeadline.due}`);
                    }
                } catch (error) {
                    console.warn(`[dashboardAgent][normalize] Error normalizing deadline due date "${normalizedDeadline.due}":`, error.message);
                    // Don't remove the deadline, but log the error
                }
            }

            // Ensure completed is boolean
            if (normalizedDeadline.completed === undefined) {
                normalizedDeadline.completed = false;
            }

            return normalizedDeadline;
        });
    }

    return normalized;
}

function validateTemplate(data) {
    const errors = [];

    // Normalize status values before validation
    const normalized = normalizeTemplate(data);

    // Required identity fields
    errors.push(validateCaseId(normalized.case_id));
    errors.push(isNonEmptyString(normalized.court) ? null : 'Court / Judicial Office is required.');
    errors.push(isNonEmptyString(normalized.plaintiff) ? null : 'Plaintiff is required.');
    errors.push(isNonEmptyString(normalized.defendant) ? null : 'Defendant is required.');
    errors.push(isNonEmptyString(normalized.last_action) ? null : 'Last action is required.');
    errors.push(isNonEmptyString(normalized.client) ? null : 'Client name required.');
    errors.push(isNonEmptyString(normalized.practice) ? null : 'Practice area required.');
    errors.push(isNonEmptyString(normalized.type) ? null : 'Case type required.');
    errors.push(isNonEmptyString(normalized.attorney) ? null : 'Attorney required.');

    // Status validation
    const allowedStatus = ['active', 'pending', 'urgent'];
    errors.push(
        validateEnum(normalized.status, allowedStatus)
            ? null
            : `Status must be one of: ${allowedStatus.join(', ')}.`
    );

    errors.push(isNonEmptyString(normalized.stage) ? null : 'Case stage required.');
    errors.push(isNonEmptyString(normalized.summary) ? null : 'Case summary required.');

    // Hearing validation
    if (normalized.hearing && normalized.hearing.toLowerCase() !== 'none') {
        errors.push(
            isValidISODate(normalized.hearing)
                ? null
                : 'Hearing must follow YYYY-MM-DD format.'
        );
    }

    // Important dates validation
    if (Array.isArray(normalized.important_dates)) {
        normalized.important_dates.forEach((d, i) => {
            if (!isNonEmptyString(d.title))
                errors.push(`Important date #${i}: Title required.`);
            if (!isValidISODate(d.date))
                errors.push(`Important date #${i}: Must use YYYY-MM-DD format.`);
        });
    }

    // Recent activity validation
    if (Array.isArray(normalized.recent_activity)) {
        normalized.recent_activity.forEach((a, i) => {
            if (!isNonEmptyString(a.id)) errors.push(`Activity #${i}: ID missing.`);
            if (!isNonEmptyString(a.message))
                errors.push(`Activity #${i}: Message missing.`);
            if (!isNonEmptyString(a.time))
                errors.push(`Activity #${i}: Timestamp missing.`);
        });
    }

    // Deadlines validation
    if (Array.isArray(normalized.deadlines)) {
        normalized.deadlines.forEach((d, i) => {
            if (!isNonEmptyString(d.title))
                errors.push(`Deadline #${i}: Title required.`);
            if (d.caseId !== normalized.case_id)
                errors.push(`Deadline #${i}: caseId must match case_id.`);
            if (!isValidISODate(d.due))
                errors.push(`Deadline #${i}: Must use YYYY-MM-DD format.`);
            if (!isNonEmptyString(d.owner))
                errors.push(`Deadline #${i}: Owner required.`);
        });
    }

    // Sidebar case validation
    if (normalized.sidebar_case) {
        const sc = normalized.sidebar_case;
        if (!isNonEmptyString(sc.id)) errors.push('Sidebar case id required.');
        if (!isNonEmptyString(sc.name)) errors.push('Sidebar case name required.');
        if (!isNonEmptyString(sc.type)) errors.push('Sidebar case type required.');
        if (!validateEnum(sc.status, allowedStatus))
            errors.push('Sidebar status must be active, pending, or urgent.');
    }

    return errors.filter(Boolean);
}

// =========================================================
// Express Routes
// =========================================================

/**
 * POST /api/dashboard-agent/case/save
 * Create or update a case template
 */
router.post('/case/save', requireAuth, async (req, res) => {
    try {
        const { userId, email } = req.user || {};
        if (!userId) {
            console.error('[dashboardAgent][save] No userId in request user object:', req.user);
            return res.status(401).json({ success: false, error: 'Unauthorized - No userId found' });
        }

        console.log(`[dashboardAgent][save] Saving case for userId: ${userId}, email: ${email || 'N/A'}`);

        const data = req.body;

        // Normalize status values before validation and saving
        const normalized = normalizeTemplate(data);
        const errors = validateTemplate(normalized);

        if (errors.length > 0) {
            console.error('[dashboardAgent][save] Validation errors:', errors);
            return res.status(400).json({ success: false, errors });
        }

        // Ensure userId is a string (handle ObjectId or other types)
        const userIdStr = userId.toString();
        console.log(`[dashboardAgent][save] Using userId (string): ${userIdStr}, case_id: ${normalized.case_id}`);

        // UNIFIED LOGIC: Check if case exists in EITHER file system OR MongoDB
        // This ensures both flows (Pepper and New Case button) can update each other's cases
        const caseFolder = getCaseFolder(userIdStr, normalized.case_id);
        console.log(`[dashboardAgent][save] Case folder: ${caseFolder}`);

        const jsonFilePath = path.join(caseFolder, 'case.json');
        const docxFilePath = path.join(caseFolder, 'case.docx');
        
        // Check if case exists in file system (and not soft-deleted)
        let existsInFileSystem = false;
        let fileCaseData = null;
        if (fs.existsSync(jsonFilePath)) {
            try {
                fileCaseData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
                // Only consider non-deleted cases as existing
                existsInFileSystem = fileCaseData.is_deleted !== true;
                if (fileCaseData.is_deleted === true) {
                    console.log(`[dashboardAgent][save] Found case ${normalized.case_id} in file system but it's soft-deleted - will create as new`);
                }
            } catch (fileError) {
                console.error('[dashboardAgent][save] Error reading case.json file:', fileError);
                // If file exists but can't be read, treat as not existing
                existsInFileSystem = false;
            }
        }

        // Check if case exists in MongoDB (created via New Case button) - exclude soft-deleted
        let existingMCD = null;
        try {
            existingMCD = await MasterCaseDocument.findOne({
                case_id: normalized.case_id,
                user_id: userId,
                is_deleted: { $ne: true }, // Exclude soft-deleted cases
            });
            if (existingMCD) {
                console.log(`[dashboardAgent][save] Found case ${normalized.case_id} in MongoDB (created via New Case button)`);
            }
        } catch (mcdError) {
            console.error('[dashboardAgent][save] Error checking MongoDB:', mcdError);
            // Continue - we'll still save to file system
        }

        const isUpdate = existsInFileSystem || existingMCD !== null;
        console.log(`[dashboardAgent][save] Case ${normalized.case_id} isUpdate: ${isUpdate} (fileSystem: ${existsInFileSystem}, mongoDB: ${existingMCD !== null})`);

        // If updating, load existing data and track changes
        let previousStatus = null;
        if (isUpdate) {
            try {
                // Load from file system if it exists, otherwise use MongoDB data
                let existingData = null;
                if (existsInFileSystem && fileCaseData) {
                    // Use already loaded fileCaseData (avoids double read and ensures we check is_deleted)
                    existingData = fileCaseData;
                    previousStatus = existingData.status;
                } else if (existingMCD) {
                    // Convert MCD to Dashboard Template format for merging
                    existingData = convertMCDToDashboardTemplate(existingMCD);
                    // Map MCD status to Dashboard Template status for comparison
                    const mcdStatusMap = {
                        'new': 'urgent',
                        'review': 'pending',
                        'in_progress': 'active',
                        'appeals': 'active',
                        'pending_decision': 'pending',
                        'closed': 'pending',
                    };
                    previousStatus = mcdStatusMap[existingMCD.status] || 'pending';
                }

                // Merge existing data with new data
                if (existingData) {
                    // Preserve existing recent_activity if not provided
                    if (!normalized.recent_activity || !Array.isArray(normalized.recent_activity) || normalized.recent_activity.length === 0) {
                        normalized.recent_activity = existingData.recent_activity || [];
                    }

                    // Merge important_dates (add new ones, preserve existing)
                    if (existingData.important_dates && Array.isArray(existingData.important_dates)) {
                        const existingDates = existingData.important_dates || [];
                        const newDates = normalized.important_dates || [];
                        // Combine and deduplicate by title and date
                        const combinedDates = [...existingDates];
                        newDates.forEach(newDate => {
                            const exists = combinedDates.some(existing =>
                                existing.title === newDate.title && existing.date === newDate.date
                            );
                            if (!exists) {
                                combinedDates.push(newDate);
                            }
                        });
                        normalized.important_dates = combinedDates;
                    }

                    // Merge deadlines (add new ones, preserve existing)
                    if (existingData.deadlines && Array.isArray(existingData.deadlines)) {
                        const existingDeadlines = existingData.deadlines || [];
                        const newDeadlines = normalized.deadlines || [];
                        // Combine and deduplicate by title and due date
                        const combinedDeadlines = [...existingDeadlines];
                        newDeadlines.forEach(newDeadline => {
                            const exists = combinedDeadlines.some(existing =>
                                existing.title === newDeadline.title && existing.due === newDeadline.due
                            );
                            if (!exists) {
                                combinedDeadlines.push(newDeadline);
                            }
                        });
                        normalized.deadlines = combinedDeadlines;
                    }
                }

                // Add activity entry if status changed
                if (normalized.status && normalized.status !== previousStatus) {
                    const statusMessages = {
                        active: 'Case status changed to Active',
                        pending: 'Case status changed to Pending',
                        urgent: 'Case status changed to Urgent',
                    };
                    const statusMessage = statusMessages[normalized.status] || `Case status changed to ${normalized.status}`;

                    // Generate UUID for activity ID
                    const activityId = `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    const now = new Date().toISOString();

                    // Add new activity at the beginning of the array
                    normalized.recent_activity.unshift({
                        id: activityId,
                        message: statusMessage,
                        time: now,
                    });

                    // Keep only the most recent 10 activities
                    if (normalized.recent_activity.length > 10) {
                        normalized.recent_activity = normalized.recent_activity.slice(0, 10);
                    }

                    // Update sidebar_case status to match main status
                    if (normalized.sidebar_case) {
                        normalized.sidebar_case.status = normalized.status;
                    } else {
                        // Create sidebar_case if it doesn't exist
                        normalized.sidebar_case = {
                            id: normalized.case_id,
                            name: normalized.client || normalized.case_id,
                            type: normalized.type || normalized.practice || 'General',
                            status: normalized.status,
                        };
                    }
                } else if (!normalized.recent_activity || normalized.recent_activity.length === 0) {
                    // If no recent_activity exists, add a default update entry
                    const activityId = `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    normalized.recent_activity = [{
                        id: activityId,
                        message: 'Case information updated',
                        time: new Date().toISOString(),
                    }];
                }

                // Ensure sidebar_case is always in sync with main status
                if (normalized.sidebar_case && normalized.status) {
                    normalized.sidebar_case.status = normalized.status;
                }
            } catch (error) {
                console.error('[dashboardAgent] Error reading existing case data:', error);
                // Continue with new case creation if read fails
            }
        }

        // Save JSON file in case folder (internal use only - hidden from user)
        // Use normalized data to ensure consistent English status values
        fs.writeFileSync(jsonFilePath, JSON.stringify(normalized, null, 2), 'utf8');
        console.log(`[dashboardAgent][save] Case JSON file ${isUpdate ? 'updated' : 'saved'}: ${jsonFilePath}`);

        // Verify file was actually written
        if (!fs.existsSync(jsonFilePath)) {
            console.error(`[dashboardAgent][save] ERROR: File was not created at ${jsonFilePath}`);
            throw new Error('Failed to save case file');
        }

        const fileStats = fs.statSync(jsonFilePath);
        console.log(`[dashboardAgent][save] File verified - size: ${fileStats.size} bytes, exists: ${fs.existsSync(jsonFilePath)}`);

        // Generate DOCX file in case folder (user-facing document)
        // Use normalized data to ensure consistent English status values
        try {
            await generateDashboardDocx(normalized, docxFilePath);
            console.log(`[dashboardAgent] Case DOCX file ${isUpdate ? 'regenerated' : 'generated'}: ${docxFilePath}`);
        } catch (docxError) {
            console.error('[dashboardAgent] Error generating DOCX:', docxError);
            console.error('[dashboardAgent] Error stack:', docxError.stack);
            console.error('[dashboardAgent] Case ID:', normalized.case_id);
            console.error('[dashboardAgent] Summary length:', normalized.summary?.length || 0);
            // Continue even if DOCX generation fails - JSON is the critical file
        }

        // Automatically sync to calendar (await to ensure it completes, but don't fail request if it errors)
        let calendarSyncResult = null;
        let calendarSyncError = null;
        try {
            console.log(`[dashboardAgent][save] Starting calendar sync for case ${normalized.case_id}`);
            console.log(`[dashboardAgent][save] Template data for sync:`, {
                case_id: normalized.case_id,
                hearing: normalized.hearing,
                important_dates_count: normalized.important_dates?.length || 0,
                deadlines_count: normalized.deadlines?.length || 0,
                deadlines: normalized.deadlines?.map(d => ({
                    title: d.title,
                    due: d.due,
                    completed: d.completed,
                    owner: d.owner,
                    caseId: d.caseId,
                })) || [],
            });

            // Verify deadlines are properly formatted before sync
            if (normalized.deadlines && normalized.deadlines.length > 0) {
                console.log(`[dashboardAgent][save] Verifying ${normalized.deadlines.length} deadline(s) before calendar sync:`);
                normalized.deadlines.forEach((deadline, index) => {
                    console.log(`[dashboardAgent][save] Deadline #${index + 1}:`, {
                        title: deadline.title,
                        due: deadline.due,
                        dueType: typeof deadline.due,
                        completed: deadline.completed,
                        owner: deadline.owner,
                        caseId: deadline.caseId,
                        isValidDate: deadline.due ? !Number.isNaN(new Date(deadline.due).getTime()) : false,
                    });
                });
            } else {
                console.log(`[dashboardAgent][save] No deadlines to sync for case ${normalized.case_id}`);
            }

            calendarSyncResult = await syncDashboardTemplateToCalendar(userIdStr, normalized);

            console.log(`[dashboardAgent][save] ✅ Calendar sync completed for case ${normalized.case_id}:`, {
                success: calendarSyncResult.success,
                created: calendarSyncResult.created || 0,
                skipped: calendarSyncResult.skipped || 0,
                message: calendarSyncResult.message,
            });

            if (!calendarSyncResult.success) {
                console.error(`[dashboardAgent][save] ⚠️ Calendar sync returned failure for case ${normalized.case_id}:`, calendarSyncResult.error || calendarSyncResult.message);
            }
        } catch (error) {
            calendarSyncError = error;
            console.error(`[dashboardAgent][save] ❌ Error syncing case ${normalized.case_id} to calendar:`, error);
            console.error('[dashboardAgent][save] Error message:', error.message);
            console.error('[dashboardAgent][save] Error stack:', error.stack);
            // Don't fail the request if calendar sync fails - files are already saved
        }

        // Create user-friendly file location information
        const relativeJsonPath = `cases/${userIdStr}/${normalized.case_id}/case.json`;
        const relativeDocxPath = `cases/${userIdStr}/${normalized.case_id}/case.docx`;
        const action = isUpdate ? 'updated' : 'created';

        // Build response with operation results
        const response = {
            success: true,
            jsonFile: jsonFilePath,
            docxFile: docxFilePath,
            caseId: normalized.case_id,
            isUpdate: isUpdate,
            fileLocation: {
                json: {
                    fullPath: jsonFilePath,
                    relativePath: relativeJsonPath,
                    description: 'JSON file (internal use - for Dashboard)'
                },
                docx: {
                    fullPath: docxFilePath,
                    relativePath: relativeDocxPath,
                    description: 'DOCX file (Master Case Document - you can download this)'
                }
            },
            operations: {
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
            message: `Case "${normalized.case_id}" ${action} successfully! Files saved to: ${relativeJsonPath} and ${relativeDocxPath}. You can access the DOCX file through the Dashboard or download it directly.`,
        };

        // UNIFIED UPDATE: If case exists in MongoDB, update it too
        let mcdUpdateResult = null;
        let mcdUpdateError = null;
        if (existingMCD) {
            try {
                console.log(`[dashboardAgent][save] Updating MCD in MongoDB for case ${normalized.case_id}`);

                // Convert Dashboard Template to MCD format
                const mcdUpdateData = convertDashboardTemplateToMCD(normalized, userId, email);

                // Preserve existing fields that Dashboard Template doesn't have
                mcdUpdateData.last_documents = existingMCD.last_documents || [];
                mcdUpdateData.next_actions = existingMCD.next_actions || [];
                mcdUpdateData.mcd_file_path = existingMCD.mcd_file_path || '';

                // Update MCD in MongoDB
                Object.assign(existingMCD, mcdUpdateData);
                await existingMCD.save();

                console.log(`[dashboardAgent][save] ✅ MCD updated in MongoDB for case ${normalized.case_id}`);

                // Also update the file system copy (mcd.json)
                const mcdFileResult = saveMCDToFile(userIdStr, existingMCD);
                if (mcdFileResult.success) {
                    console.log(`[dashboardAgent][save] ✅ MCD file updated: ${mcdFileResult.jsonFile}`);
                }

                // Sync MCD to calendar (in addition to Dashboard Template sync)
                const mcdCalendarResult = await syncMCDToCalendar(userIdStr, existingMCD.toObject());
                console.log(`[dashboardAgent][save] ✅ MCD calendar sync: ${mcdCalendarResult.created || 0} event(s) created`);

                mcdUpdateResult = {
                    success: true,
                    mcdUpdated: true,
                    calendarEventsCreated: mcdCalendarResult.created || 0,
                };
            } catch (error) {
                mcdUpdateError = error;
                console.error(`[dashboardAgent][save] ❌ Error updating MCD in MongoDB:`, error);
                console.error('[dashboardAgent][save] Error message:', error.message);
                console.error('[dashboardAgent][save] Error stack:', error.stack);
                // Don't fail the request - file system save already succeeded
            }
        } else if (!existsInFileSystem) {
            // New case - create in MongoDB too for unified storage
            try {
                console.log(`[dashboardAgent][save] Creating new MCD in MongoDB for case ${normalized.case_id}`);

                const mcdData = convertDashboardTemplateToMCD(normalized, userId, email);
                const newMCD = await MasterCaseDocument.create(mcdData);

                console.log(`[dashboardAgent][save] ✅ New MCD created in MongoDB for case ${normalized.case_id}`);

                // Save MCD to file system
                const mcdFileResult = saveMCDToFile(userIdStr, newMCD);
                if (mcdFileResult.success) {
                    console.log(`[dashboardAgent][save] ✅ MCD file saved: ${mcdFileResult.jsonFile}`);
                }

                // Sync MCD to calendar
                const mcdCalendarResult = await syncMCDToCalendar(userIdStr, newMCD.toObject());
                console.log(`[dashboardAgent][save] ✅ MCD calendar sync: ${mcdCalendarResult.created || 0} event(s) created`);

                mcdUpdateResult = {
                    success: true,
                    mcdCreated: true,
                    calendarEventsCreated: mcdCalendarResult.created || 0,
                };
            } catch (error) {
                mcdUpdateError = error;
                console.error(`[dashboardAgent][save] ❌ Error creating MCD in MongoDB:`, error);
                // Don't fail the request - file system save already succeeded
            }
        }

        // Add MCD update result to response
        if (mcdUpdateResult || mcdUpdateError) {
            response.operations.mcdSync = mcdUpdateResult || {
                success: false,
                error: mcdUpdateError ? mcdUpdateError.message : 'MCD sync failed',
            };
        }

        // Log summary
        console.log(`[dashboardAgent][save] 📊 Operation summary for case ${normalized.case_id}:`, {
            fileSave: '✅',
            docxGeneration: fs.existsSync(docxFilePath) ? '✅' : '❌',
            calendarSync: calendarSyncResult?.success ? '✅' : '❌',
            calendarEventsCreated: calendarSyncResult?.created || 0,
            mcdSync: mcdUpdateResult?.success ? '✅' : mcdUpdateError ? '❌' : 'N/A',
        });

        return res.json(response);
    } catch (error) {
        console.error('[dashboardAgent][save] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to save case template',
            message: error.message,
        });
    }
});

/**
 * Convert Dashboard Template to MCD format for MongoDB
 */
function convertDashboardTemplateToMCD(template, userId, email) {
    // Map Dashboard Template status to MCD status
    const statusMap = {
        'active': 'in_progress',
        'pending': 'review',
        'urgent': 'new',
    };

    const mcdStatus = statusMap[template.status] || 'new';

    // Parse client name to extract parties (format: "Plaintiff vs. Defendant")
    let plaintiff = '';
    let defendant = '';
    const clientName = template.client || '';

    if (clientName.includes(' vs. ')) {
        const parts = clientName.split(' vs. ');
        plaintiff = parts[0]?.trim() || '';
        defendant = parts[1]?.trim() || '';
    } else if (clientName) {
        // If no "vs.", assume it's the plaintiff
        plaintiff = clientName.trim();
    }

    // Convert deadlines from Dashboard Template format (due: YYYY-MM-DD) to MCD format (due_date: Date)
    const deadlines = (template.deadlines || []).map(deadline => ({
        title: deadline.title || '',
        due_date: deadline.due ? new Date(deadline.due) : new Date(),
        case_id: deadline.caseId || template.case_id,
        owner: deadline.owner || 'Unassigned',
        completed: deadline.completed || false,
    }));

    // Build MCD object
    const mcdData = {
        case_id: template.case_id,
        parties: {
            plaintiff: plaintiff || 'Unknown',
            defendant: defendant || 'Unknown',
            other: [],
        },
        case_type: template.practice || template.type || 'General',
        status: mcdStatus,
        deadlines: deadlines,
        last_documents: [], // Dashboard Template doesn't have last_documents
        next_actions: [], // Dashboard Template doesn't have next_actions
        summary: template.summary || '',
        user_id: userId instanceof mongoose.Types.ObjectId ? userId : new mongoose.Types.ObjectId(userId),
        user_email: email.toLowerCase().trim(),
        source: 'dashboard-agent', // Mark as created/updated via Dashboard Agent
    };

    return mcdData;
}

/**
 * Convert MCD (Master Case Document) to Dashboard Template format
 */
function convertMCDToDashboardTemplate(mcd) {
    const mcdObj = mcd.toObject ? mcd.toObject() : mcd;

    // Map MCD status to Dashboard Template status
    const statusMap = {
        'new': 'urgent',
        'review': 'pending',
        'in_progress': 'active',
        'appeals': 'active',
        'pending_decision': 'pending',
        'closed': 'pending',
    };

    const dashboardStatus = statusMap[mcdObj.status] || 'pending';

    // Build client name from parties
    const clientName = mcdObj.parties?.plaintiff && mcdObj.parties?.defendant
        ? `${mcdObj.parties.plaintiff} vs. ${mcdObj.parties.defendant}`
        : mcdObj.parties?.plaintiff || mcdObj.parties?.defendant || mcdObj.case_id;

    // Convert deadlines from MCD format (due_date) to Dashboard Template format (due)
    const deadlines = (mcdObj.deadlines || []).map(deadline => ({
        title: deadline.title || '',
        caseId: deadline.case_id || mcdObj.case_id,
        due: deadline.due_date
            ? (deadline.due_date instanceof Date
                ? deadline.due_date.toISOString().split('T')[0]
                : new Date(deadline.due_date).toISOString().split('T')[0])
            : '',
        owner: deadline.owner || 'Unassigned',
        completed: deadline.completed || false,
    }));

    // Build recent activity from MCD metadata
    const recentActivity = [{
        id: `activity-${Date.now()}`,
        message: `Case created via ${mcdObj.source || 'questionnaire'}`,
        time: mcdObj.createdAt ? new Date(mcdObj.createdAt).toISOString() : new Date().toISOString(),
    }];

    // Extract last action - prioritize stored last_action from CPNU (object with title and date)
    // Format as "title + date" for display (e.g., "Fijacion Estado - 2025-12-16")
    let lastAction = 'No actions recorded';
    if (mcdObj.last_action) {
        // Handle new object structure: { title: "Actuacion", date: Date }
        if (typeof mcdObj.last_action === 'object' && mcdObj.last_action !== null) {
            const title = mcdObj.last_action.title?.trim() || '';
            const date = mcdObj.last_action.date;
            if (title && date) {
                // Format date as YYYY-MM-DD
                let dateStr = '';
                if (date instanceof Date) {
                    dateStr = date.toISOString().split('T')[0];
                } else if (typeof date === 'string') {
                    // Try to parse and format
                    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                        dateStr = date;
                    } else {
                        const parsed = new Date(date);
                        if (!isNaN(parsed.getTime())) {
                            dateStr = parsed.toISOString().split('T')[0];
                        }
                    }
                }
                lastAction = dateStr ? `${title} - ${dateStr}` : title;
            } else if (title) {
                lastAction = title;
            } else if (date) {
                // Only date available, format it
                let dateStr = '';
                if (date instanceof Date) {
                    dateStr = date.toISOString().split('T')[0];
                } else if (typeof date === 'string') {
                    dateStr = date.includes('T') ? date.split('T')[0] : date;
                }
                lastAction = dateStr || 'No actions recorded';
            }
        } 
        // Backward compatibility: handle string format (legacy data)
        else if (typeof mcdObj.last_action === 'string' && mcdObj.last_action.trim()) {
            lastAction = mcdObj.last_action.trim();
        }
    } else if (mcdObj.recent_activity && mcdObj.recent_activity.length > 0) {
        // Try to get the most recent activity message
        const mostRecent = mcdObj.recent_activity[mcdObj.recent_activity.length - 1];
        if (mostRecent && mostRecent.message) {
            lastAction = mostRecent.message;
        }
    } else if (mcdObj.next_actions && mcdObj.next_actions.length > 0) {
        // Fallback to next actions if no recent activity
        lastAction = mcdObj.next_actions[0].title || 'No actions recorded';
    }

    // Build Dashboard Template
    const dashboardTemplate = {
        case_id: mcdObj.case_id,
        court: mcdObj.court || 'Not specified', // Extract from MCD if available (synced from CPNU)
        plaintiff: mcdObj.parties?.plaintiff || 'Not specified',
        defendant: mcdObj.parties?.defendant || 'Not specified',
        last_action: lastAction, // Use prioritized last_action (from CPNU if available)
        client: clientName,
        practice: mcdObj.case_type || 'General',
        type: mcdObj.case_type || 'General',
        attorney: mcdObj.attorney || 'N/A', // Use stored attorney from CPNU (defensorPrivado) or default
        status: dashboardStatus,
        stage: 'Discovery', // Default stage - will be updated by user
        summary: mcdObj.summary || 'No summary provided',
        hearing: 'none', // MCD doesn't have hearing field - will be updated by user
        important_dates: [], // MCD doesn't have important_dates - will be updated by user
        recent_activity: recentActivity,
        deadlines: deadlines,
        sidebar_case: {
            id: mcdObj.case_id,
            name: clientName,
            type: mcdObj.case_type || 'General',
            status: dashboardStatus,
        },
    };

    return dashboardTemplate;
}

/**
 * GET /api/dashboard-agent/case/:id
 * Retrieve a case template by ID
 * Checks both file system (Dashboard Agent cases) and MongoDB (MCD cases)
 */
router.get('/case/:id', requireAuth, async (req, res) => {
    try {
        const { userId } = req.user || {};
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const userIdStr = userId.toString();
        const { id } = req.params;

        console.log(`[dashboardAgent][get] Looking for case ${id} for user ${userIdStr}`);

        // First, try to find in file system (Dashboard Agent cases)
        const caseFolder = getCaseFolder(userIdStr, id);
        const filePath = path.join(caseFolder, 'case.json');

        if (fs.existsSync(filePath)) {
            console.log(`[dashboardAgent][get] Found case ${id} in file system`);
            const caseData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            // Check if case is deleted
            if (caseData.is_deleted === true) {
                console.log(`[dashboardAgent][get] Case ${id} is deleted`);
                return res.status(404).json({
                    success: false,
                    error: 'Case not found.',
                });
            }
            
            return res.json({ success: true, data: caseData, source: 'file' });
        }

        // If not found in file system, check MongoDB (MCD cases)
        console.log(`[dashboardAgent][get] Case ${id} not found in file system, checking MongoDB...`);
        const mcd = await MasterCaseDocument.findOne({
            case_id: id,
            user_id: userId,
            is_deleted: { $ne: true }, // Filter out deleted cases
        });

        if (mcd) {
            console.log(`[dashboardAgent][get] Found case ${id} in MongoDB (MCD), converting to Dashboard Template format`);
            const dashboardTemplate = convertMCDToDashboardTemplate(mcd);
            return res.json({ success: true, data: dashboardTemplate, source: 'mcd' });
        }

        // Case not found in either location
        console.log(`[dashboardAgent][get] Case ${id} not found in file system or MongoDB`);
        return res.status(404).json({
            success: false,
            error: 'Case not found.',
        });
    } catch (error) {
        console.error('[dashboardAgent][get] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to read case template',
            message: error.message,
        });
    }
});

/**
 * GET /api/dashboard-agent/cases/all
 * Get list of all case IDs for the user
 * Includes both file-based (Dashboard Agent) and MongoDB (MCD) cases
 */
router.get('/cases/all', requireAuth, async (req, res) => {
    try {
        const { userId } = req.user || {};
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const userIdStr = userId.toString();
        const caseIds = new Set();

        // Get case IDs from file system (Dashboard Agent cases)
        const casesDir = getUserCasesDir(userIdStr);
        if (fs.existsSync(casesDir)) {
            const caseFolders = fs.readdirSync(casesDir, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            caseFolders.forEach(caseId => caseIds.add(caseId));
            console.log(`[dashboardAgent][getAll] Found ${caseFolders.length} case(s) in file system`);
        }

        // Get case IDs from MongoDB (MCD cases)
        try {
            const mcds = await MasterCaseDocument.find({ 
                user_id: userId,
                is_deleted: { $ne: true }, // Filter out deleted cases
            })
                .select('case_id')
                .lean();

            mcds.forEach(mcd => caseIds.add(mcd.case_id));
            console.log(`[dashboardAgent][getAll] Found ${mcds.length} case(s) in MongoDB`);
        } catch (mcdError) {
            console.error('[dashboardAgent][getAll] Error fetching MCD cases:', mcdError);
            // Continue with file system cases even if MongoDB query fails
        }

        const allCaseIds = Array.from(caseIds).sort();
        console.log(`[dashboardAgent][getAll] Total unique cases: ${allCaseIds.length}`);

        return res.json({ success: true, cases: allCaseIds });
    } catch (error) {
        console.error('[dashboardAgent][getAll] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to list cases',
            message: error.message,
        });
    }
});

/**
 * GET /api/dashboard-agent/cases/all-data
 * Get all case templates with full data for the user (for dashboard integration)
 */
router.get('/cases/all-data', requireAuth, (req, res) => {
    try {
        const { userId, email } = req.user || {};
        if (!userId) {
            console.error('[dashboardAgent][getAllData] No userId in request user object:', req.user);
            return res.status(401).json({ success: false, error: 'Unauthorized - No userId found' });
        }

        // Ensure userId is a string (handle ObjectId or other types)
        const userIdStr = userId.toString();
        console.log(`[dashboardAgent][getAllData] Fetching cases for userId: ${userIdStr}, email: ${email || 'N/A'}`);

        const casesDir = getUserCasesDir(userIdStr);
        console.log(`[dashboardAgent][getAllData] Cases directory: ${casesDir}`);
        console.log(`[dashboardAgent][getAllData] Directory exists: ${fs.existsSync(casesDir)}`);

        if (!fs.existsSync(casesDir)) {
            console.log(`[dashboardAgent][getAllData] Cases directory does not exist, returning empty array`);
            return res.json({ success: true, cases: [] });
        }

        // Get all case folders and read case.json from each
        const folders = fs.readdirSync(casesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory());

        console.log(`[dashboardAgent][getAllData] Found ${folders.length} case folder(s):`, folders.map(d => d.name));

        const cases = [];

        folders.forEach((dirent) => {
            try {
                const caseFolder = path.join(casesDir, dirent.name);
                const caseJsonPath = path.join(caseFolder, 'case.json');

                console.log(`[dashboardAgent][getAllData] Checking case folder: ${caseFolder}`);
                console.log(`[dashboardAgent][getAllData] case.json exists: ${fs.existsSync(caseJsonPath)}`);

                if (fs.existsSync(caseJsonPath)) {
                    const fileContent = fs.readFileSync(caseJsonPath, 'utf8');
                    const caseData = JSON.parse(fileContent);
                    // Filter out deleted cases
                    if (caseData.is_deleted !== true) {
                    console.log(`[dashboardAgent][getAllData] Successfully loaded case: ${caseData.case_id || dirent.name}`);
                    cases.push(caseData);
                    } else {
                        console.log(`[dashboardAgent][getAllData] Skipping deleted case: ${caseData.case_id || dirent.name}`);
                    }
                } else {
                    console.warn(`[dashboardAgent][getAllData] case.json not found in folder: ${caseFolder}`);
                }
            } catch (err) {
                console.error(`[dashboardAgent][getAllData] Error reading case folder ${dirent.name}:`, err);
                console.error(`[dashboardAgent][getAllData] Error stack:`, err.stack);
                // Continue with other folders even if one fails
            }
        });

        console.log(`[dashboardAgent][getAllData] Returning ${cases.length} case(s) for userId: ${userIdStr}`);
        return res.json({ success: true, cases });
    } catch (error) {
        console.error('[dashboardAgent][getAllData] Error:', error);
        console.error('[dashboardAgent][getAllData] Error stack:', error.stack);
        return res.status(500).json({
            success: false,
            error: 'Failed to retrieve case templates',
            message: error.message,
        });
    }
});

/**
 * GET /api/dashboard-agent/case/:id/docx
 * Download the DOCX file for a case
 */
router.get('/case/:id/docx', requireAuth, (req, res) => {
    try {
        const { userId } = req.user || {};
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const userIdStr = userId.toString();
        const { id } = req.params;
        const caseFolder = getCaseFolder(userIdStr, id);
        const docxFilePath = path.join(caseFolder, 'case.docx');

        if (!fs.existsSync(docxFilePath)) {
            return res.status(404).json({
                success: false,
                error: 'DOCX file not found. Please regenerate the case template.',
            });
        }

        // Send the DOCX file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${id}.docx"`);
        res.sendFile(docxFilePath);
    } catch (error) {
        console.error('[dashboardAgent][getDocx] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to retrieve DOCX file',
            message: error.message,
        });
    }
});

/**
 * DELETE /api/dashboard-agent/case/:id
 * Soft delete a case (file-based Dashboard Agent case)
 */
router.delete('/case/:id', requireAuth, async (req, res) => {
    try {
        const { userId } = req.user || {};
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const userIdStr = userId.toString();
        const { id } = req.params;

        console.log(`[dashboardAgent][delete] Deleting case ${id} for user ${userIdStr}`);

        // Find case in file system
        const caseFolder = getCaseFolder(userIdStr, id);
        const filePath = path.join(caseFolder, 'case.json');

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'Case not found.',
            });
        }

        // Read case data
        const caseData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Check if already deleted - return success (idempotent operation)
        if (caseData.is_deleted === true) {
            console.log(`[dashboardAgent][delete] Case ${id} is already deleted - returning success (idempotent)`);
            return res.json({
                success: true,
                message: 'Case is already deleted.',
            });
        }

        // Soft delete: update case data
        caseData.is_deleted = true;
        caseData.deleted_at = new Date().toISOString();
        caseData.deleted_by = userIdStr;

        // Save updated case
        fs.writeFileSync(filePath, JSON.stringify(caseData, null, 2), 'utf8');

        console.log(`[dashboardAgent][delete] ✅ Case ${id} soft deleted successfully`);

        return res.json({
            success: true,
            message: 'Case deleted successfully',
        });
    } catch (error) {
        console.error('[dashboardAgent][delete] Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to delete case',
            message: error.message,
        });
    }
});

export default router;

