import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import MasterCaseDocument from '../models/MasterCaseDocument.js';
import { getUserCasesDir, getCaseFolder } from '../utils/caseFolderUtils.js';
import { deleteMCDFile } from '../utils/mcdFileStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Auto-delete policy configuration
 * Cases are automatically deleted after X days of being closed
 */
const CLOSED_CASE_RETENTION_DAYS = parseInt(process.env.CLOSED_CASE_RETENTION_DAYS || '90', 10); // Default: 90 days

/**
 * Delete a case folder and all its files
 * @param {string} userId - User ID
 * @param {string} caseId - Case ID
 * @returns {boolean} Success status
 */
function deleteCaseFolder(userId, caseId) {
    try {
        const caseFolder = getCaseFolder(userId, caseId);
        if (!fs.existsSync(caseFolder)) {
            return false;
        }

        // Delete all files in the folder
        const files = fs.readdirSync(caseFolder);
        files.forEach((file) => {
            const filePath = path.join(caseFolder, file);
            try {
                fs.unlinkSync(filePath);
            } catch (error) {
                console.error(`[caseCleanup] Error deleting file ${filePath}:`, error);
            }
        });

        // Delete the folder itself
        fs.rmdirSync(caseFolder);
        console.log(`[caseCleanup] Deleted case folder: ${caseFolder}`);
        return true;
    } catch (error) {
        console.error(`[caseCleanup] Error deleting case folder for ${caseId}:`, error);
        return false;
    }
}

/**
 * Get all closed cases that should be deleted based on retention policy
 * @returns {Promise<Array<{userId: string, caseId: string, closedAt: Date}>>}
 */
async function getCasesToDelete() {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - CLOSED_CASE_RETENTION_DAYS);

        // Find all closed MCDs older than retention period
        const closedMCDs = await MasterCaseDocument.find({
            status: 'closed',
            updatedAt: { $lt: cutoffDate },
        }).select('user_id case_id updatedAt');

        return closedMCDs.map((mcd) => ({
            userId: mcd.user_id.toString(),
            caseId: mcd.case_id,
            closedAt: mcd.updatedAt,
        }));
    } catch (error) {
        console.error('[caseCleanup] Error getting cases to delete:', error);
        return [];
    }
}

/**
 * Clean up closed cases that exceed retention period
 * This function should be called periodically (e.g., daily via cron job)
 * @returns {Promise<{deleted: number, errors: number}>}
 */
export async function cleanupClosedCases() {
    try {
        console.log(`[caseCleanup] Starting cleanup of closed cases (retention: ${CLOSED_CASE_RETENTION_DAYS} days)`);
        
        const casesToDelete = await getCasesToDelete();
        let deleted = 0;
        let errors = 0;

        for (const caseInfo of casesToDelete) {
            try {
                // Delete MCD JSON file
                try {
                    await deleteMCDFile(caseInfo.userId, caseInfo.caseId);
                } catch (error) {
                    console.error(`[caseCleanup] Error deleting MCD file for ${caseInfo.caseId}:`, error);
                }

                // Delete case folder (includes case.json, case.docx, and all other files)
                const folderDeleted = deleteCaseFolder(caseInfo.userId, caseInfo.caseId);
                
                if (folderDeleted) {
                    deleted++;
                    console.log(`[caseCleanup] Deleted case ${caseInfo.caseId} (closed ${caseInfo.closedAt.toISOString()})`);
                } else {
                    errors++;
                    console.warn(`[caseCleanup] Failed to delete case folder for ${caseInfo.caseId}`);
                }

                // Optionally: Delete MCD from MongoDB (uncomment if desired)
                // await MasterCaseDocument.deleteOne({ case_id: caseInfo.caseId, user_id: caseInfo.userId });
            } catch (error) {
                errors++;
                console.error(`[caseCleanup] Error processing case ${caseInfo.caseId}:`, error);
            }
        }

        console.log(`[caseCleanup] Cleanup complete: ${deleted} cases deleted, ${errors} errors`);
        return { deleted, errors };
    } catch (error) {
        console.error('[caseCleanup] Error during cleanup:', error);
        return { deleted: 0, errors: 1 };
    }
}

/**
 * Manual cleanup endpoint (for testing or manual triggers)
 * Can be called via API endpoint
 */
export async function manualCleanup(req, res) {
    try {
        const result = await cleanupClosedCases();
        return res.json({
            success: true,
            message: `Cleanup completed: ${result.deleted} cases deleted, ${result.errors} errors`,
            ...result,
        });
    } catch (error) {
        console.error('[caseCleanup] Manual cleanup error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to run cleanup',
            message: error.message,
        });
    }
}

