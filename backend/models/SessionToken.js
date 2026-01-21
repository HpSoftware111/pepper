import mongoose from 'mongoose';

const sessionTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    userAgent: { type: String },
    ipAddress: { type: String },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date },
  },
  {
    timestamps: true,
  },
);

const SessionToken = mongoose.model('SessionToken', sessionTokenSchema, 'auth_sessions');
export default SessionToken;

