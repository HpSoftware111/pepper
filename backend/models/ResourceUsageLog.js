import mongoose from 'mongoose';

/**
 * Resource Usage Log Model
 * Tracks detailed usage of expensive API resources for cost monitoring
 */
const resourceUsageLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      enum: ['voiceTranscriptions', 'aiChatTokens', 'whatsappMessages', 'calendarApiCalls', 'cpnuScrapes'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    cost: {
      type: Number,
      default: 0, // Optional cost tracking for future use
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      // Voice Transcription metadata
      audioDuration: Number,
      language: String,
      // AI Chat Tokens metadata
      inputTokens: Number,
      outputTokens: Number,
      model: String,
      // WhatsApp Messages metadata
      messageType: String, // 'text' or 'template'
      phoneNumber: String, // Masked for privacy
      // Calendar API metadata
      operation: String, // 'list', 'get', 'create', etc.
      // CPNU Scraping metadata
      radicado: String,
      success: Boolean,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
resourceUsageLogSchema.index({ userId: 1, timestamp: -1 });
resourceUsageLogSchema.index({ resourceType: 1, timestamp: -1 });
resourceUsageLogSchema.index({ userId: 1, resourceType: 1, timestamp: -1 });
resourceUsageLogSchema.index({ timestamp: -1 }); // For time-based queries

const ResourceUsageLog = mongoose.model('ResourceUsageLog', resourceUsageLogSchema);
export default ResourceUsageLog;
