import fs from 'fs';
import path from 'path';
import { getCaseFolder } from './caseFolderUtils.js';

/**
 * Convert MCD Mongoose document to plain JSON object for file storage
 */
function mcdToFileFormat(mcd) {
    // Convert Mongoose document to plain object
    const mcdObj = mcd.toObject ? mcd.toObject() : mcd;
    
    // Remove MongoDB-specific fields and convert ObjectIds to strings
    const fileFormat = {
        case_id: mcdObj.case_id,
        parties: mcdObj.parties || {},
        case_type: mcdObj.case_type || '',
        status: mcdObj.status || 'new',
        deadlines: (mcdObj.deadlines || []).map((d) => ({
            title: d.title || '',
            due_date: d.due_date ? new Date(d.due_date).toISOString().split('T')[0] : '',
            case_id: d.case_id || mcdObj.case_id,
            owner: d.owner || '',
            completed: d.completed || false,
        })),
        last_documents: (mcdObj.last_documents || []).map((doc) => ({
            name: doc.name || '',
            uploaded_at: doc.uploaded_at ? new Date(doc.uploaded_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            type: doc.type || 'document',
        })),
        next_actions: (mcdObj.next_actions || []).map((action) => ({
            title: action.title || '',
            description: action.description || '',
            priority: action.priority || 'pending',
        })),
        summary: mcdObj.summary || '',
        mcd_file_path: mcdObj.mcd_file_path || '',
        source: mcdObj.source || 'manual',
        updated_at: new Date().toISOString(),
        created_at: mcdObj.createdAt ? new Date(mcdObj.createdAt).toISOString() : new Date().toISOString(),
    };

    return fileFormat;
}

/**
 * Save MCD to local JSON file in case folder
 * @param {string} userId - User ID
 * @param {Object} mcd - MCD Mongoose document or plain object
 * @returns {Object} File location information
 */
export function saveMCDToFile(userId, mcd) {
    try {
        const mcdData = mcdToFileFormat(mcd);
        const caseId = mcdData.case_id;
        
        // Get case folder (creates if doesn't exist)
        const caseFolder = getCaseFolder(userId, caseId);
        
        // Save MCD as mcd.json in the case folder
        const jsonFilePath = path.join(caseFolder, 'mcd.json');
        fs.writeFileSync(jsonFilePath, JSON.stringify(mcdData, null, 2), 'utf8');
        console.log(`[MCD][fileStorage] MCD saved to case folder: ${jsonFilePath}`);
        
        return {
            success: true,
            jsonFile: jsonFilePath,
            relativePath: `cases/${userId}/${caseId}/mcd.json`,
            caseId: caseId,
            caseFolder: caseFolder,
        };
    } catch (error) {
        console.error('[MCD][fileStorage] Error saving to file:', error);
        // Don't throw - file storage is secondary to database storage
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Read MCD from local JSON file in case folder
 * @param {string} userId - User ID
 * @param {string} caseId - Case ID
 * @returns {Object|null} MCD data or null if not found
 */
export function readMCDFromFile(userId, caseId) {
    try {
        const caseFolder = getCaseFolder(userId, caseId);
        const jsonFilePath = path.join(caseFolder, 'mcd.json');
        
        if (!fs.existsSync(jsonFilePath)) {
            return null;
        }
        
        const fileContent = fs.readFileSync(jsonFilePath, 'utf8');
        return JSON.parse(fileContent);
    } catch (error) {
        console.error('[MCD][fileStorage] Error reading from file:', error);
        return null;
    }
}

/**
 * Delete MCD JSON file from case folder
 * @param {string} userId - User ID
 * @param {string} caseId - Case ID
 * @returns {boolean} Success status
 */
export function deleteMCDFile(userId, caseId) {
    try {
        const caseFolder = getCaseFolder(userId, caseId);
        const jsonFilePath = path.join(caseFolder, 'mcd.json');
        
        if (fs.existsSync(jsonFilePath)) {
            fs.unlinkSync(jsonFilePath);
            console.log(`[MCD][fileStorage] MCD file deleted: ${jsonFilePath}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('[MCD][fileStorage] Error deleting file:', error);
        return false;
    }
}

