import mongoose from 'mongoose';

// Deadline sub-schema
const deadlineSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
        },
        due_date: {
            type: Date,
            required: true,
        },
        case_id: {
            type: String,
            required: true,
        },
        owner: {
            type: String,
            required: true,
        },
        completed: {
            type: Boolean,
            default: false,
        },
    },
    { _id: false }
);

// Last document sub-schema
const lastDocumentSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        uploaded_at: {
            type: Date,
            required: true,
        },
        type: {
            type: String,
            default: 'document',
        },
    },
    { _id: false }
);

// Next action sub-schema
const nextActionSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            default: '',
        },
        priority: {
            type: String,
            enum: ['urgent', 'pending', 'normal'],
            default: 'pending',
        },
    },
    { _id: false }
);

// Last action sub-schema (similar to deadlineSchema)
// Separate fields: title (Actuacion) and date (Fecha de actuacion)
const lastActionSchema = new mongoose.Schema(
    {
        title: {
            type: String, // "Actuacion" - description/title (e.g., "Fijacion Estado")
            required: false,
        },
        date: {
            type: Date, // "Fecha de actuacion" - date (e.g., 2025-12-16)
            required: false,
        },
    },
    { _id: false }
);

// Parties sub-schema
const partiesSchema = new mongoose.Schema(
    {
        plaintiff: {
            type: String,
            default: '',
        },
        defendant: {
            type: String,
            default: '',
        },
        other: {
            type: [String],
            default: [],
        },
    },
    { _id: false }
);

// Main Master Case Document schema
const masterCaseDocumentSchema = new mongoose.Schema(
    {
        case_id: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },
        parties: {
            type: partiesSchema,
            required: true,
        },
        case_type: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: ['new', 'review', 'in_progress', 'appeals', 'pending_decision', 'closed'],
            default: 'new',
            index: true,
        },
        deadlines: {
            type: [deadlineSchema],
            default: [],
        },
        last_documents: {
            type: [lastDocumentSchema],
            default: [],
        },
        next_actions: {
            type: [nextActionSchema],
            default: [],
        },
        summary: {
            type: String,
            default: '',
        },
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        user_email: {
            type: String,
            required: true,
            index: true,
            lowercase: true,
            trim: true,
        },
        mcd_file_path: {
            type: String,
            default: '',
        },
        // Metadata
        source: {
            type: String,
            enum: ['document', 'questionnaire', 'manual'],
            default: 'manual',
        },
        source_document_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Document',
        },
        // CPNU Integration Fields
        radicado_cpnu: {
            type: String,
            trim: true,
            validate: {
                validator: function (v) {
                    return !v || /^\d{23}$/.test(v); // 23 digits only
                },
                message: 'Radicado must be exactly 23 digits'
            }
        },
        linked_cpnu: {
            type: Boolean,
            default: false,
            index: true,
        },
        cpnu_bootstrap_done: {
            type: Boolean,
            default: false,
        },
        cpnu_bootstrap_at: {
            type: Date,
        },
        cpnu_bootstrap_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        cpnu_last_fecha_registro: {
            type: String, // Store as string to match CPNU format
        },
        cpnu_last_sync_at: {
            type: Date,
        },
        cpnu_last_sync_status: {
            type: String,
            enum: ['success', 'error', 'no_changes'],
            default: null,
        },
        cpnu_actuaciones: [{
            fecha_registro: String,
            descripcion: String,
            fecha_actuacion: String,
        }],
        cpnu_clase_proceso: {
            type: String, // Clase de Proceso from CPNU (placeholder field)
        },
        court: {
            type: String, // Court / Judicial Office (can be set from CPNU)
        },
        last_action: {
            type: lastActionSchema, // Last action object with title (Actuacion) and date (Fecha de actuacion)
            default: null,
        },
        attorney: {
            type: String, // Attorney (can be set from CPNU Sujetos Procesales)
        },
        // Soft delete fields
        is_deleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deleted_at: {
            type: Date,
        },
        deleted_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    {
        timestamps: true,
        collection: 'master_case_documents',
    }
);

// Indexes for efficient queries
// Partial unique index: only enforce uniqueness for non-deleted cases per user
// This allows multiple soft-deleted cases with the same case_id for the same user
// Note: is_deleted defaults to false in the schema, so all documents will have this field
masterCaseDocumentSchema.index(
    { case_id: 1, user_id: 1 },
    {
        unique: true,
        partialFilterExpression: { is_deleted: false }
    }
);
masterCaseDocumentSchema.index({ user_email: 1, status: 1 });
masterCaseDocumentSchema.index({ user_id: 1, status: 1 });
masterCaseDocumentSchema.index({ 'deadlines.due_date': 1 });
masterCaseDocumentSchema.index({ updatedAt: -1 });
masterCaseDocumentSchema.index({ linked_cpnu: 1, cpnu_bootstrap_done: 1, is_deleted: 1 });

// Pre-save hook to ensure case_id is uppercase if it follows pattern
masterCaseDocumentSchema.pre('save', function (next) {
    if (this.case_id && /^[A-Z]{3}-\d+$/.test(this.case_id)) {
        this.case_id = this.case_id.toUpperCase();
    }
    next();
});

export default mongoose.models.MasterCaseDocument ||
    mongoose.model('MasterCaseDocument', masterCaseDocumentSchema);

