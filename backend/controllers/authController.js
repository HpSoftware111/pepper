import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import SessionToken from '../models/SessionToken.js';
import PasswordResetToken from '../models/PasswordResetToken.js';
import { createAccessToken } from '../lib/auth.js';
import { sendMail } from '../lib/mailer.js';
import { getUserResourceUsage } from '../services/resourceTrackingService.js';

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
const RESET_TOKEN_TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES || 10);
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const buildUserResponse = (user) => ({
  id: user._id.toString(),
  email: user.email,
  displayName: user.displayName,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  address: user.address,
  city: user.city,
  state: user.state,
  zip: user.zip,
  role: user.role,
  avatarUrl: user.avatarUrl,
  status: user.status,
  emailVerified: Boolean(user.emailVerifiedAt),
});

const issueTokens = async (user, req) => {
  const accessToken = createAccessToken(user);
  const refreshToken = crypto.randomBytes(48).toString('hex');
  await SessionToken.create({
    userId: user._id,
    token: refreshToken,
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  return { accessToken, refreshToken };
};

const generateResetCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const obfuscateEmail = (email) => {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const maskedName = name.length <= 2 ? `${name[0]}*` : `${name[0]}***${name[name.length - 1]}`;
  return `${maskedName}@${domain}`;
};

export async function signup(req, res) {
  try {
    const { email, password, displayName, phone, firstName, lastName } = req.body;
    if (!email || !password || !(displayName || (firstName && lastName))) {
      return res.status(400).json({ error: 'Email, password and name are required' });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const resolvedDisplayName = displayName || `${firstName} ${lastName}`.trim();
    const user = await User.create({
      email: email.toLowerCase(),
      hashedPassword,
      displayName: resolvedDisplayName,
      firstName: firstName || resolvedDisplayName?.split(' ')[0],
      lastName: lastName || resolvedDisplayName?.split(' ').slice(1).join(' '),
      phone,
      emailVerifiedAt: new Date(),
    });
    const tokens = await issueTokens(user, req);
    return res.status(201).json({ user: buildUserResponse(user), tokens });
  } catch (error) {
    console.error('signup error', error);
    return res.status(500).json({ error: 'Unable to create account' });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() });
    if (!user || !user.hashedPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const valid = await bcrypt.compare(password, user.hashedPassword);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    user.lastLoginAt = new Date();
    await user.save();
    const tokens = await issueTokens(user, req);
    return res.json({ user: buildUserResponse(user), tokens });
  } catch (error) {
    console.error('login error', error);
    return res.status(500).json({ error: 'Unable to sign in' });
  }
}

export async function logout(req, res) {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await SessionToken.deleteOne({ token: refreshToken });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('logout error', error);
    return res.status(500).json({ error: 'Unable to logout' });
  }
}

export async function refreshToken(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }
    const stored = await SessionToken.findOne({ token: refreshToken });
    if (!stored || stored.expiresAt < new Date() || stored.revokedAt) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    const user = await User.findById(stored.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await SessionToken.deleteOne({ _id: stored._id });
    const tokens = await issueTokens(user, req);
    return res.json({ user: buildUserResponse(user), tokens });
  } catch (error) {
    console.error('refresh error', error);
    return res.status(500).json({ error: 'Unable to refresh session' });
  }
}

export async function me(req, res) {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get resource usage
    const resourceUsage = await getUserResourceUsage(req.user.userId);

    return res.json({
      user: buildUserResponse(user),
      resourceUsage,
    });
  } catch (error) {
    console.error('me error', error);
    return res.status(500).json({ error: 'Unable to load profile' });
  }
}

export async function updateProfile(req, res) {
  try {
    console.log('[profile][update] Request method:', req.method);
    console.log('[profile][update] Request headers:', req.headers['content-type']);
    console.log('[profile][update] Raw req.body:', req.body);
    console.log('[profile][update] req.body type:', typeof req.body);
    console.log('[profile][update] req.body keys:', req.body ? Object.keys(req.body) : 'no body');

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { displayName, firstName, lastName, phone, avatarUrl, address, city, state, zip } = req.body;

    console.log('[profile][update] Received payload:', { displayName, firstName, lastName, phone, address, city, state, zip });
    console.log('[profile][update] Current user data:', {
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName
    });

    // Update all fields - empty strings clear the field (set to undefined)
    if (displayName !== undefined && displayName !== null) {
      user.displayName = displayName.trim() || undefined;
    }
    if (firstName !== undefined && firstName !== null) {
      user.firstName = firstName.trim() || undefined;
    }
    if (lastName !== undefined && lastName !== null) {
      user.lastName = lastName.trim() || undefined;
    }
    if (phone !== undefined && phone !== null) {
      user.phone = phone.trim() || undefined;
    }
    if (address !== undefined && address !== null) {
      user.address = address.trim() || undefined;
    }
    if (city !== undefined && city !== null) {
      user.city = city.trim() || undefined;
    }
    if (state !== undefined && state !== null) {
      user.state = state.trim() || undefined;
    }
    if (zip !== undefined && zip !== null) {
      user.zip = zip.trim() || undefined;
    }
    if (avatarUrl !== undefined && avatarUrl !== null) {
      user.avatarUrl = avatarUrl.trim() || undefined;
    }

    await user.save();

    console.info('[profile][update] Profile updated for', user.email);
    console.log('[profile][update] Updated user data:', {
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName,
      address: user.address,
      city: user.city,
      state: user.state,
      zip: user.zip
    });

    return res.json({ user: buildUserResponse(user) });
  } catch (error) {
    console.error('[profile][update] error', error);
    return res.status(500).json({ error: 'Unable to update profile' });
  }
}

export async function googleAuth(req, res) {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Google ID token required' });
    }
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email?.toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Google payload missing email' });
    }
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        displayName: payload.name || email,
        firstName: payload.given_name,
        lastName: payload.family_name,
        avatarUrl: payload.picture,
        googleId: payload.sub,
        status: 'active',
        emailVerifiedAt: new Date(),
      });
    } else {
      user.googleId = payload.sub;
      user.avatarUrl = payload.picture || user.avatarUrl;
      user.lastLoginAt = new Date();
      await user.save();
    }
    const tokens = await issueTokens(user, req);
    return res.json({ user: buildUserResponse(user), tokens });
  } catch (error) {
    console.error('google auth error', error);
    return res.status(500).json({ error: 'Unable to authenticate with Google' });
  }
}

export async function requestPasswordReset(req, res) {
  try {
    const email = req.body.email?.toLowerCase();
    if (!email) {
      console.warn('[reset][request] Missing email');
      return res.status(400).json({ error: 'Email is required' });
    }
    console.info('[reset][request] Incoming request for', email);
    const user = await User.findOne({ email });
    if (!user) {
      console.info('[reset][request] No user for email, returning success to avoid enumeration');
      // respond success to avoid user enumeration
      return res.json({ success: true, message: 'If that email exists, we sent a code.' });
    }

    await PasswordResetToken.deleteMany({ userId: user._id });
    const code = generateResetCode();
    const codeHash = await bcrypt.hash(code, SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
    await PasswordResetToken.create({ userId: user._id, codeHash, expiresAt });

    await sendMail({
      to: email,
      subject: 'Pepper password reset code',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0b1225;">
          <p>Hi ${user.displayName || 'there'},</p>
          <p>Use the verification code below to reset your Pepper password.</p>
          <p style="font-size: 24px; letter-spacing: 8px; font-weight: bold; color: #0c8f74;">${code}</p>
          <p>This code expires in ${RESET_TOKEN_TTL_MINUTES} minutes.</p>
          <p>If you didn’t request a reset, you can ignore this email.</p>
          <p style="margin-top: 24px;">— Pepper Security</p>
        </div>`,
    });

    console.info('[reset][request] Sent code to', obfuscateEmail(email));
    return res.json({ success: true, message: `Code sent to ${obfuscateEmail(email)}` });
  } catch (error) {
    console.error('[reset][request] error', error);
    return res.status(500).json({ error: 'Unable to send reset code' });
  }
}

export async function verifyPasswordReset(req, res) {
  try {
    const email = req.body.email?.toLowerCase();
    const { code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      console.warn('[reset][verify] Missing email, code, or password');
      return res.status(400).json({ error: 'Email, code and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      console.warn('[reset][verify] No user found for email');
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    const token = await PasswordResetToken.findOne({ userId: user._id }).sort({ createdAt: -1 });
    if (!token || token.expiresAt < new Date()) {
      console.warn('[reset][verify] Token missing or expired for', email);
      return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
    }

    const isMatch = await bcrypt.compare(code, token.codeHash);
    if (!isMatch) {
      console.warn('[reset][verify] Invalid code for user', email);
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.hashedPassword = hashedPassword;
    await user.save();

    await PasswordResetToken.deleteMany({ userId: user._id });
    await SessionToken.deleteMany({ userId: user._id });

    console.info('[reset][verify] Password updated for', email);
    return res.json({ success: true });
  } catch (error) {
    console.error('[reset][verify] error', error);
    return res.status(500).json({ error: 'Unable to reset password' });
  }
}

export async function getInviteDetails(req, res) {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    const user = await User.findOne({ emailVerificationToken: token });
    if (!user) {
      return res.status(404).json({ error: 'Invite not found or already used' });
    }
    return res.json({
      email: user.email,
      displayName: user.displayName,
      status: user.status,
    });
  } catch (error) {
    console.error('[invite][details] error', error);
    return res.status(500).json({ error: 'Unable to load invite details' });
  }
}

export async function acceptInvite(req, res) {
  try {
    const { token, password, phone } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const user = await User.findOne({ emailVerificationToken: token });
    if (!user) {
      return res.status(400).json({ error: 'Invite is invalid or already used' });
    }
    user.hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    user.phone = phone || user.phone;
    user.status = 'active';
    user.emailVerifiedAt = new Date();
    user.emailVerificationToken = undefined;
    await user.save();
    const tokens = await issueTokens(user, req);
    return res.json({ user: buildUserResponse(user), tokens });
  } catch (error) {
    console.error('[invite][accept] error', error);
    return res.status(500).json({ error: 'Unable to accept invite' });
  }
}

