import mongoose from 'mongoose';
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const TAG_POSITION = SALT_LENGTH + IV_LENGTH;
const ENCRYPTED_POSITION = TAG_POSITION + TAG_LENGTH;

// Get encryption key from environment variable
// AES-256-GCM requires a 32-byte (256-bit) key
const getEncryptionKey = () => {
    const key = process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error('GOOGLE_CALENDAR_ENCRYPTION_KEY or ENCRYPTION_KEY must be set');
    }

    // Try to parse as hex first (64 hex chars = 32 bytes)
    let keyBuffer;
    if (key.length === 64 && /^[0-9a-f]+$/i.test(key)) {
        // Valid hex string of correct length
        keyBuffer = Buffer.from(key, 'hex');
    } else {
        // Use PBKDF2 to derive a 32-byte key from any input
        // This ensures we always have a 32-byte key regardless of input format
        keyBuffer = crypto.pbkdf2Sync(key, 'pepper-calendar-salt', 100000, 32, 'sha256');
        console.warn('[GoogleCalendarToken] Encryption key was not 64-char hex string. Using PBKDF2 derivation.');
    }

    // Validate key length (must be exactly 32 bytes for AES-256)
    if (keyBuffer.length !== 32) {
        throw new Error(`Invalid encryption key length: expected 32 bytes, got ${keyBuffer.length}. For hex keys, use 64 hex characters.`);
    }

    return keyBuffer;
};

// Encrypt sensitive data
const encrypt = (text) => {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    return salt.toString('hex') + iv.toString('hex') + tag.toString('hex') + encrypted;
};

// Decrypt sensitive data
const decrypt = (encryptedText) => {
    if (!encryptedText || typeof encryptedText !== 'string') {
        throw new Error('Invalid encrypted text: must be a non-empty string');
    }

    // Validate minimum length
    const minLength = ENCRYPTED_POSITION * 2; // salt + iv + tag (minimum)
    if (encryptedText.length < minLength) {
        throw new Error(`Invalid encrypted text length: expected at least ${minLength} characters, got ${encryptedText.length}`);
    }

    try {
        const key = getEncryptionKey();

        // Extract components with validation
        const saltHex = encryptedText.slice(0, SALT_LENGTH * 2);
        const ivHex = encryptedText.slice(SALT_LENGTH * 2, TAG_POSITION * 2);
        const tagHex = encryptedText.slice(TAG_POSITION * 2, ENCRYPTED_POSITION * 2);
        const encrypted = encryptedText.slice(ENCRYPTED_POSITION * 2);

        // Validate hex strings
        if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(tagHex)) {
            throw new Error('Invalid encrypted text format: contains non-hexadecimal characters');
        }

        // Validate lengths
        if (saltHex.length !== SALT_LENGTH * 2 || ivHex.length !== IV_LENGTH * 2 || tagHex.length !== TAG_LENGTH * 2) {
            throw new Error(`Invalid encrypted text format: component length mismatch (salt: ${saltHex.length}, iv: ${ivHex.length}, tag: ${tagHex.length})`);
        }

        const salt = Buffer.from(saltHex, 'hex');
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');

        // Validate IV length (must be exactly 16 bytes for AES-256-GCM)
        if (iv.length !== IV_LENGTH) {
            throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
        }

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        // Provide more context in error message
        if (error.code === 'ERR_CRYPTO_INVALID_IV') {
            throw new Error(`Invalid initialization vector. This usually means the token was encrypted with a different key or is corrupted. Error: ${error.message}`);
        }
        if (error.code === 'ERR_CRYPTO_INVALID_TAG') {
            throw new Error(`Invalid authentication tag. The encrypted data may be corrupted or was encrypted with a different key. Error: ${error.message}`);
        }
        throw error;
    }
};

const googleCalendarTokenSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
            index: true,
        },
        accessToken: {
            type: String,
            required: true,
        },
        refreshToken: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        calendarId: {
            type: String,
            default: 'primary', // Primary calendar ID
        },
        syncEnabled: {
            type: Boolean,
            default: true,
        },
        lastSyncAt: {
            type: Date,
        },
        scope: {
            type: String,
            default: 'https://www.googleapis.com/auth/calendar',
        },
    },
    {
        timestamps: true,
    },
);

// Encrypt tokens before saving
googleCalendarTokenSchema.pre('save', function (next) {
    if (this.isModified('accessToken') && this.accessToken) {
        this.accessToken = encrypt(this.accessToken);
    }
    if (this.isModified('refreshToken') && this.refreshToken) {
        this.refreshToken = encrypt(this.refreshToken);
    }
    next();
});

// Decrypt tokens when retrieving
googleCalendarTokenSchema.methods.getAccessToken = function () {
    try {
        if (!this.accessToken) {
            console.error('Access token is missing');
            return null;
        }
        return decrypt(this.accessToken);
    } catch (error) {
        console.error('Error decrypting access token:', error);
        console.error('Token length:', this.accessToken?.length);
        console.error('Token preview:', this.accessToken?.substring(0, 50));
        // If decryption fails, the token is likely corrupted or encrypted with a different key
        // Return null so the system can attempt to refresh or re-authenticate
        return null;
    }
};

googleCalendarTokenSchema.methods.getRefreshToken = function () {
    try {
        if (!this.refreshToken) {
            console.error('Refresh token is missing');
            return null;
        }
        return decrypt(this.refreshToken);
    } catch (error) {
        console.error('Error decrypting refresh token:', error);
        console.error('Token length:', this.refreshToken?.length);
        console.error('Token preview:', this.refreshToken?.substring(0, 50));
        return null;
    }
};

// Check if token is expired
googleCalendarTokenSchema.methods.isExpired = function () {
    return this.expiresAt < new Date();
};

// Check if token needs refresh (refresh 5 minutes before expiry)
googleCalendarTokenSchema.methods.needsRefresh = function () {
    const fiveMinutes = 5 * 60 * 1000;
    return new Date(this.expiresAt.getTime() - fiveMinutes) < new Date();
};

const GoogleCalendarToken = mongoose.model('GoogleCalendarToken', googleCalendarTokenSchema, 'google_calendar_tokens');

export default GoogleCalendarToken;

