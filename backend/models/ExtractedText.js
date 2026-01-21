import mongoose from 'mongoose';

const ExtractedTextSchema = new mongoose.Schema(
    {
        textId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        userEmail: {
            type: String,
            required: true,
            index: true,
        },
        source: {
            type: String,
            enum: ['voice', 'file'],
            required: true,
            index: true,
        },
        sourceName: {
            type: String,
            required: true,
        },
        extractedText: {
            type: String,
            required: true,
            default: '',
        },
        metadata: {
            duration: {
                type: Number, // Duration in seconds (for voice recordings)
            },
            fileSize: {
                type: Number, // File size in bytes (for file uploads)
            },
            fileType: {
                type: String, // MIME type or file extension
            },
            wordCount: {
                type: Number,
                default: 0,
            },
            language: {
                type: String, // Detected language code (e.g., 'es', 'en', 'pt')
            },
            fileName: {
                type: String, // Original filename (for file uploads)
            },
            meetingTitle: {
                type: String, // Meeting title (for voice recordings)
            },
        },
        status: {
            type: String,
            enum: ['processing', 'ready', 'error'],
            default: 'ready',
            index: true,
        },
        error: {
            type: String, // Error message if status is 'error'
        },
    },
    { timestamps: true, collection: 'extracted_texts' },
);

// Compound indexes for efficient queries
ExtractedTextSchema.index({ userId: 1, createdAt: -1 });
ExtractedTextSchema.index({ userId: 1, source: 1 });
ExtractedTextSchema.index({ userEmail: 1, createdAt: -1 });
ExtractedTextSchema.index({ status: 1, createdAt: -1 });

// Pre-save hook to generate textId if not provided
ExtractedTextSchema.pre('save', function (next) {
    if (!this.textId) {
        this.textId = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    // Calculate word count if not provided
    if (this.extractedText && !this.metadata.wordCount) {
        const matches = this.extractedText.trim().match(/\S+/g);
        this.metadata.wordCount = matches ? matches.length : 0;
    }
    next();
});

export default mongoose.models.ExtractedText || mongoose.model('ExtractedText', ExtractedTextSchema);

