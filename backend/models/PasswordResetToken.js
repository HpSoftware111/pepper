import mongoose from 'mongoose';

const passwordResetTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  {
    timestamps: true,
  },
);

const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema, 'password_reset_tokens');
export default PasswordResetToken;


