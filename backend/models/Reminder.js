import mongoose from 'mongoose';

const reminderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    due: {
      type: Date,
      required: true,
      index: true, // Index for efficient querying by due date
    },
    owner: {
      type: String,
      default: 'Pepper reminder',
      trim: true,
    },
    completed: {
      type: Boolean,
      default: false,
      index: true,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'reminders',
  }
);

// Compound index for efficient queries
reminderSchema.index({ userId: 1, completed: 1, due: 1 });
reminderSchema.index({ userId: 1, due: 1 });

const Reminder = mongoose.models.Reminder || mongoose.model('Reminder', reminderSchema);

export default Reminder;

