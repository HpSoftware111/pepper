import mongoose from 'mongoose';

const RecentThreadSchema = new mongoose.Schema(
  {
    threadId: String,
    summary: String,
    scenario: String,
    lastMessageAt: Date,
  },
  { _id: false },
);

const UserMemorySchema = new mongoose.Schema(
  {
    user_email: {
      type: String,
      unique: true,
      index: true,
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    facts: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    recentThreads: {
      type: [RecentThreadSchema],
      default: [],
    },
  },
  { timestamps: true, collection: 'user_memory' },
);

export default mongoose.models.UserMemory || mongoose.model('UserMemory', UserMemorySchema);

