import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema(
    {
        threadId: {
            type: String,
            required: true,
            index: true,
        },
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            index: true,
        },
        user_email: {
            type: String,
            index: true,
        },
        scenario: {
            type: String,
            index: true,
        },
        documentType: {
            type: String,
            enum: ['pdf', 'text', 'analysis', 'uploaded', 'extracted'],
            default: 'uploaded',
        },
        fileName: {
            type: String,
        },
        fileExtension: {
            type: String,
        },
        content: {
            type: String,
            default: '',
        },
        metadata: {
            pdf_content: String,
            pdf_resume: String,
            resultados: String,
            title: String,
            sentence_result: [mongoose.Schema.Types.Mixed],
            sentencia_list: [mongoose.Schema.Types.Mixed],
            evidence_checklist: [mongoose.Schema.Types.Mixed],
            evidencias_cumplen: [mongoose.Schema.Types.Mixed],
            evidencias_no_cumplen: [mongoose.Schema.Types.Mixed],
            constitution: String,
            articulo_result: [mongoose.Schema.Types.Mixed],
            constitucion: mongoose.Schema.Types.Mixed,
        },
        wordCount: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ['uploading', 'processing', 'ready', 'error'],
            default: 'ready',
        },
        error: String,
    },
    { timestamps: true, collection: 'documents' },
);

DocumentSchema.index({ threadId: 1, user_id: 1 });
DocumentSchema.index({ threadId: 1, scenario: 1 });
DocumentSchema.index({ user_email: 1, scenario: 1 });

export default mongoose.models.Document || mongoose.model('Document', DocumentSchema);

