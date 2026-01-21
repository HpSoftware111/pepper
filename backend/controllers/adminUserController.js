import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User.js';
import { stripe } from '../lib/stripe.js';
import { sendMail } from '../lib/mailer.js';

const SALT_ROUNDS = 12;

const buildAdminUserResponse = (user) => ({
  id: user._id.toString(),
  email: user.email,
  displayName: user.displayName,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  role: user.role,
  status: user.status,
  emailVerified: Boolean(user.emailVerifiedAt),
  stripeCustomerId: user.stripeCustomerId,
  createdAt: user.createdAt,
});

const ensureDeviceArrays = (user) => {
  if (!Array.isArray(user.registeredDevices)) {
    user.registeredDevices = [];
  }
  if (!Array.isArray(user.deviceLogs)) {
    user.deviceLogs = [];
  }
};

export async function listUsers(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const users = await User.find().sort({ createdAt: -1 }).limit(limit);
    return res.json({ users: users.map(buildAdminUserResponse) });
  } catch (error) {
    console.error('[admin][users][list] error', error);
    return res.status(500).json({ error: 'Unable to load users' });
  }
}

export async function createUser(req, res) {
  try {
    const { email, password, firstName, lastName, phone, role = 'user' } = req.body;
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Email, password, first name, and last name are required' });
    }
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const normalizedEmail = email.toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    let stripeCustomerId = null;
    if (stripe) {
      try {
        const customer = await stripe.customers.create({
          email: normalizedEmail,
          name: `${firstName} ${lastName}`.trim(),
          phone,
          metadata: { source: 'pepper-admin-invite' },
        });
        stripeCustomerId = customer.id;
      } catch (stripeError) {
        console.error('[admin][users][create] stripe error', stripeError);
        return res.status(502).json({ error: 'Unable to create Stripe customer' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = await User.create({
      email: normalizedEmail,
      hashedPassword,
      displayName: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      phone,
      role,
      status: 'invited',
      stripeCustomerId,
      emailVerificationToken: verificationToken,
      maxDeviceReplacements: 10,
      deviceReplacementCount: 0,
      registeredDevices: [],
      deviceLogs: [],
    });

    const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'
      }/verify-email?token=${verificationToken}&email=${encodeURIComponent(normalizedEmail)}`;

    await sendMail({
      to: normalizedEmail,
      subject: 'Activate your Pepper workspace',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0b1225;">
          <p>Hi ${firstName},</p>
          <p>You've been invited to Pepper 2.0. Use the button below to activate your account and set a password.</p>
          <p style="margin: 24px 0;">
            <a href="${verifyUrl}" style="background:#0bd1a9;color:#071024;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">
              Activate Pepper
            </a>
          </p>
          <p>If the button doesn't work, copy and paste this URL into your browser:</p>
          <p style="word-break:break-all;color:#0c8f74;">${verifyUrl}</p>
          <p style="margin-top:24px;">— The Pepper team</p>
        </div>
      `,
    });

    if (process.env.SIGNUP_ALERT_EMAIL) {
      await sendMail({
        to: process.env.SIGNUP_ALERT_EMAIL,
        subject: 'New Pepper user invite',
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0b1225;">
            <p>New user created from the admin console:</p>
            <ul>
              <li><strong>Name:</strong> ${firstName} ${lastName}</li>
              <li><strong>Email:</strong> ${normalizedEmail}</li>
              <li><strong>Role:</strong> ${role}</li>
              <li><strong>Phone:</strong> ${phone || 'n/a'}</li>
              <li><strong>Stripe customer:</strong> ${stripeCustomerId || 'n/a'}</li>
            </ul>
          </div>
        `,
      });
    }

    return res.status(201).json({ user: buildAdminUserResponse(user) });
  } catch (error) {
    console.error('[admin][users][create] error', error);
    return res.status(500).json({ error: 'Unable to create user' });
  }
}

export async function getUserDetail(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    ensureDeviceArrays(user);
    return res.json({
      user: buildAdminUserResponse(user),
      devices: user.registeredDevices,
      logs: (user.deviceLogs || []).slice(-50).reverse(),
      replacementsUsed: user.deviceReplacementCount || 0,
      maxReplacements: user.maxDeviceReplacements || 10,
    });
  } catch (error) {
    console.error('[admin][users][detail] error', error);
    return res.status(500).json({ error: 'Unable to load user detail' });
  }
}

export async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone, role, status, password, maxDeviceReplacements } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (role && !['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (status && !['active', 'invited', 'disabled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (firstName) {
      user.firstName = firstName;
    }
    if (lastName) {
      user.lastName = lastName;
    }
    if (phone !== undefined) {
      user.phone = phone;
    }
    if (role) {
      user.role = role;
    }
    if (status) {
      user.status = status;
    }
    if (firstName || lastName) {
      user.displayName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.displayName;
    }
    if (password) {
      user.hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    }
    if (maxDeviceReplacements !== undefined && typeof maxDeviceReplacements === 'number' && maxDeviceReplacements >= 0) {
      user.maxDeviceReplacements = maxDeviceReplacements;
    }

    await user.save();
    return res.json({ user: buildAdminUserResponse(user) });
  } catch (error) {
    console.error('[admin][users][update] error', error);
    return res.status(500).json({ error: 'Unable to update user' });
  }
}

export async function disableUser(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.status = 'disabled';
    user.registeredDevices = [];
    await user.save();
    return res.json({ success: true });
  } catch (error) {
    console.error('[admin][users][disable] error', error);
    return res.status(500).json({ error: 'Unable to update user status' });
  }
}

