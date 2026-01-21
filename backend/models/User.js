import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ['pc', 'mobile', 'legacy', 'unknown'], default: 'unknown' },
    addedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const deviceLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: ['register', 'replace', 'delete'], required: true },
    deviceId: { type: String, required: true },
    deviceType: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    hashedPassword: { type: String },
    displayName: { type: String, required: true },
    firstName: { type: String },
    lastName: { type: String },
    phone: { type: String },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    zip: { type: String },
    role: { type: String, enum: ['user', 'admin', 'attorney'], default: 'user' },
    avatarUrl: { type: String },
    googleId: { type: String, index: true },
    status: { type: String, enum: ['active', 'invited', 'disabled'], default: 'active' },
    lastLoginAt: { type: Date },
    stripeCustomerId: { type: String, index: true },
    emailVerifiedAt: { type: Date },
    emailVerificationToken: { type: String },
    maxDeviceReplacements: { type: Number, default: 10 },
    deviceReplacementCount: { type: Number, default: 0 },
    registeredDevices: { type: [deviceSchema], default: [] },
    deviceLogs: { type: [deviceLogSchema], default: [] },
    metadata: {
      firmName: { type: String },
      barNumber: { type: String },
    },
    // Resource Usage Tracking
    resourceUsage: {
      voiceTranscriptions: {
        used: { type: Number, default: 0 },
        limit: { type: Number, default: 0 }, // 0 = unlimited
        lastResetAt: { type: Date, default: Date.now },
      },
      aiChatTokens: {
        used: { type: Number, default: 0 },
        limit: { type: Number, default: 0 },
        lastResetAt: { type: Date, default: Date.now },
      },
      whatsappMessages: {
        used: { type: Number, default: 0 },
        limit: { type: Number, default: 0 },
        lastResetAt: { type: Date, default: Date.now },
      },
      calendarApiCalls: {
        used: { type: Number, default: 0 },
        limit: { type: Number, default: 0 },
        lastResetAt: { type: Date, default: Date.now },
      },
      cpnuScrapes: {
        used: { type: Number, default: 0 },
        limit: { type: Number, default: 0 },
        lastResetAt: { type: Date, default: Date.now },
      },
    },
  },
  {
    timestamps: true,
  },
);

const User = mongoose.model('User', userSchema, 'users');
export default User;

