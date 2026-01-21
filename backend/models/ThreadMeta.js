import mongoose from 'mongoose';

const ShortHistorySchema = new mongoose.Schema(
  {
    role: String,
    content: String,
    at: Date,
  },
  { _id: false },
);

const ThreadMetaSchema = new mongoose.Schema(
  {
    threadId: {
      type: String,
      required: true,
      index: true,
    },
    user_email: {
      type: String,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    scenario: {
      type: String,
      index: true,
    },
    title: {
      type: String,
      default: '',
    },
    summary: {
      type: String,
      default: '',
    },
    shortHistory: {
      type: [ShortHistorySchema],
      default: [],
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    tokensApprox: Number,
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true, collection: 'thread_meta' },
);

ThreadMetaSchema.index({ threadId: 1, scenario: 1 }, { unique: true });

export default mongoose.models.ThreadMeta || mongoose.model('ThreadMeta', ThreadMetaSchema);

