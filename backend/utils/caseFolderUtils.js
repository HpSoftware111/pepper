import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the base cases directory for a user
 * @param {string} userId - User ID
 * @returns {string} Path to user's cases directory
 */
export function getUserCasesDir(userId) {
    // Ensure userId is a string and sanitize it
    const userIdStr = userId.toString().trim();
    if (!userIdStr) {
        throw new Error('userId cannot be empty');
    }
    
    const casesDir = path.join(__dirname, '..', 'cases', userIdStr);
    console.log(`[caseFolderUtils] getUserCasesDir - userId: ${userIdStr}, path: ${casesDir}`);
    
    if (!fs.existsSync(casesDir)) {
        console.log(`[caseFolderUtils] Creating cases directory: ${casesDir}`);
        fs.mkdirSync(casesDir, { recursive: true });
    }
    
    return casesDir;
}

/**
 * Get the folder path for a specific case
 * Creates the folder if it doesn't exist
 * @param {string} userId - User ID
 * @param {string} caseId - Case ID
 * @returns {string} Path to case folder
 */
export function getCaseFolder(userId, caseId) {
    // Ensure userId is a string
    const userIdStr = userId.toString().trim();
    if (!userIdStr) {
        throw new Error('userId cannot be empty');
    }
    
    const userCasesDir = getUserCasesDir(userIdStr);
    // Sanitize case_id for folder name (remove special characters, keep alphanumeric, dashes, underscores)
    const sanitizedCaseId = caseId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const caseFolder = path.join(userCasesDir, sanitizedCaseId);
    
    console.log(`[caseFolderUtils] getCaseFolder - userId: ${userIdStr}, caseId: ${caseId}, sanitized: ${sanitizedCaseId}, path: ${caseFolder}`);
    
    if (!fs.existsSync(caseFolder)) {
        fs.mkdirSync(caseFolder, { recursive: true });
        console.log(`[caseFolderUtils] Created case folder: ${caseFolder}`);
    }
    
    return caseFolder;
}

/**
 * Get all case folders for a user
 * @param {string} userId - User ID
 * @returns {Array<{caseId: string, folderPath: string, files: string[]}>} Array of case folders with their files
 */
export function getAllCaseFolders(userId) {
    try {
        const userCasesDir = getUserCasesDir(userId);
        if (!fs.existsSync(userCasesDir)) {
            return [];
        }

        const folders = fs.readdirSync(userCasesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => {
                const folderPath = path.join(userCasesDir, dirent.name);
                const files = fs.readdirSync(folderPath);
                return {
                    caseId: dirent.name, // This is the sanitized case ID
                    folderPath,
                    files: files.map(f => ({
                        name: f,
                        path: path.join(folderPath, f),
                        stats: fs.statSync(path.join(folderPath, f))
                    }))
                };
            });

        return folders;
    } catch (error) {
        console.error('[caseFolder] Error getting case folders:', error);
        return [];
    }
}

/**
 * Get all files in a case folder
 * @param {string} userId - User ID
 * @param {string} caseId - Case ID
 * @returns {Array<{name: string, path: string, stats: fs.Stats}>} Array of files in the case folder
 */
export function getCaseFolderFiles(userId, caseId) {
    try {
        const caseFolder = getCaseFolder(userId, caseId);
        if (!fs.existsSync(caseFolder)) {
            return [];
        }

        const files = fs.readdirSync(caseFolder)
            .map(fileName => {
                const filePath = path.join(caseFolder, fileName);
                return {
                    name: fileName,
                    path: filePath,
                    stats: fs.statSync(filePath)
                };
            });

        return files;
    } catch (error) {
        console.error('[caseFolder] Error getting case folder files:', error);
        return [];
    }
}

/**
 * Save a file to a case folder
 * @param {string} userId - User ID
 * @param {string} caseId - Case ID
 * @param {string} fileName - Name of the file
 * @param {Buffer|string} fileContent - File content (Buffer for binary, string for text)
 * @param {boolean} isBinary - Whether the content is binary
 * @returns {Object} File location information
 */
export function saveFileToCaseFolder(userId, caseId, fileName, fileContent, isBinary = false) {
    try {
        const caseFolder = getCaseFolder(userId, caseId);
        const filePath = path.join(caseFolder, fileName);

        if (isBinary && Buffer.isBuffer(fileContent)) {
            fs.writeFileSync(filePath, fileContent);
        } else {
            fs.writeFileSync(filePath, fileContent, 'utf8');
        }

        console.log(`[caseFolder] File saved to case folder: ${filePath}`);
        
        return {
            success: true,
            filePath,
            relativePath: `cases/${userId}/${caseId}/${fileName}`,
            caseId,
            fileName
        };
    } catch (error) {
        console.error('[caseFolder] Error saving file to case folder:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Delete a file from a case folder
 * @param {string} userId - User ID
 * @param {string} caseId - Case ID
 * @param {string} fileName - Name of the file to delete
 * @returns {boolean} Success status
 */
export function deleteFileFromCaseFolder(userId, caseId, fileName) {
    try {
        const caseFolder = getCaseFolder(userId, caseId);
        const filePath = path.join(caseFolder, fileName);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[caseFolder] File deleted from case folder: ${filePath}`);
            return true;
        }
        return false;
    } catch (error) {
        console.error('[caseFolder] Error deleting file from case folder:', error);
        return false;
    }
}

/**
 * Read a file from a case folder
 * @param {string} userId - User ID
 * @param {string} caseId - Case ID
 * @param {string} fileName - Name of the file to read
 * @param {boolean} asBuffer - Whether to return as Buffer
 * @returns {string|Buffer|null} File content or null if not found
 */
export function readFileFromCaseFolder(userId, caseId, fileName, asBuffer = false) {
    try {
        const caseFolder = getCaseFolder(userId, caseId);
        const filePath = path.join(caseFolder, fileName);

        if (!fs.existsSync(filePath)) {
            return null;
        }

        if (asBuffer) {
            return fs.readFileSync(filePath);
        } else {
            return fs.readFileSync(filePath, 'utf8');
        }
    } catch (error) {
        console.error('[caseFolder] Error reading file from case folder:', error);
        return null;
    }
}

