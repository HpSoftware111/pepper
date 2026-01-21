import mongoose from 'mongoose';

const AttachmentSchema = new mongoose.Schema(
  {
    name: String,
    ext: String,
    url: String,
  },
  { _id: false },
);

const MessageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    text: {
      type: String,
      default: '',
    },
    threadId: {
      type: String,
      index: true,
      required: true,
    },
    scenario: {
      type: String,
      index: true,
    },
    user_email: {
      type: String,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    prompt: String,
    reply: String,
    attachments: [AttachmentSchema],
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { collection: 'messages' },
);

export default mongoose.models.Message || mongoose.model('Message', MessageSchema);

