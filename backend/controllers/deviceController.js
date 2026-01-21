import User from '../models/User.js';

const MAX_DEVICES = 2;

const normaliseDeviceType = (type) => {
  if (!type) return 'unknown';
  const value = String(type).toLowerCase();
  if (value.includes('mobile') || value.includes('ios') || value.includes('android')) return 'mobile';
  if (value.includes('pc') || value.includes('desktop') || value.includes('mac') || value.includes('windows')) return 'pc';
  return 'unknown';
};

const ensureDeviceArrays = (user) => {
  if (!Array.isArray(user.registeredDevices)) {
    user.registeredDevices = [];
  }
  if (!Array.isArray(user.deviceLogs)) {
    user.deviceLogs = [];
  }
};

const maskDeviceId = (id) => `${id?.slice(0, 6)}…${id?.slice(-4)}`;

export const registerDevice = async (req, res) => {
  try {
    const { deviceId, deviceType } = req.body || {};
    if (!deviceId || typeof deviceId !== 'string' || deviceId.length < 32) {
      return res.status(400).json({ error: 'deviceId is required' });
    }
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    ensureDeviceArrays(user);

    const normalisedType = normaliseDeviceType(deviceType);
    const existing = user.registeredDevices.find((d) => d.id === deviceId);
    if (existing) {
      existing.lastSeenAt = new Date();
      await user.save();
      return res.json({ success: true, status: 'exists', device: existing });
    }

    const currentCount = user.registeredDevices.length;
    if (currentCount >= MAX_DEVICES) {
      return res.status(403).json({ error: 'Device limit reached. Remove an existing device to add a new one.' });
    }

    const sameType = user.registeredDevices.find((d) => d.type === normalisedType);
    let replacement = false;
    if (sameType) {
      if (user.deviceReplacementCount >= (user.maxDeviceReplacements ?? 10)) {
        return res.status(403).json({ error: 'Device replacement limit reached. Contact support.' });
      }
      user.registeredDevices = user.registeredDevices.filter((d) => d.id !== sameType.id);
      user.deviceReplacementCount += 1;
      replacement = true;
    }

    user.registeredDevices.push({
      id: deviceId,
      type: normalisedType,
      addedAt: new Date(),
      lastSeenAt: new Date(),
    });

    user.deviceLogs.push({
      action: replacement ? 'replace' : 'register',
      deviceId,
      deviceType: normalisedType,
      ip: req.ip,
      userAgent: req.get('user-agent') || 'unknown',
      timestamp: new Date(),
    });
    if (user.deviceLogs.length > 50) {
      user.deviceLogs = user.deviceLogs.slice(-50);
    }

    await user.save();
    return res.json({ success: true, status: replacement ? 'replaced' : 'registered', device: user.registeredDevices.at(-1) });
  } catch (error) {
    console.error('registerDevice error', error);
    return res.status(500).json({ error: 'Unable to register device' });
  }
};

export const listDevices = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    ensureDeviceArrays(user);
    return res.json({
      devices: user.registeredDevices,
      replacementsUsed: user.deviceReplacementCount || 0,
      maxReplacements: user.maxDeviceReplacements || 10,
      logs: user.deviceLogs.slice(-20).reverse(),
    });
  } catch (error) {
    console.error('listDevices error', error);
    return res.status(500).json({ error: 'Unable to load devices' });
  }
};

export const removeDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    ensureDeviceArrays(user);
    const match = user.registeredDevices.find((d) => d.id === deviceId);
    if (!match) {
      return res.status(404).json({ error: 'Device not found' });
    }

    user.registeredDevices = user.registeredDevices.filter((d) => d.id !== deviceId);
    user.deviceReplacementCount = (user.deviceReplacementCount || 0) + 1;
    user.deviceLogs.push({
      action: 'delete',
      deviceId,
      deviceType: match.type,
      ip: req.ip,
      userAgent: req.get('user-agent') || 'unknown',
      timestamp: new Date(),
    });
    if (user.deviceLogs.length > 50) {
      user.deviceLogs = user.deviceLogs.slice(-50);
    }
    await user.save();
    return res.json({ success: true });
  } catch (error) {
    console.error('removeDevice error', error);
    return res.status(500).json({ error: 'Unable to remove device' });
  }
};

export const adminGetUserDevices = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    ensureDeviceArrays(user);
    return res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      devices: user.registeredDevices,
      logs: user.deviceLogs.slice(-50).reverse(),
      replacementsUsed: user.deviceReplacementCount || 0,
      maxReplacements: user.maxDeviceReplacements || 10,
    });
  } catch (error) {
    console.error('adminGetUserDevices error', error);
    return res.status(500).json({ error: 'Unable to load device data' });
  }
};

export const adminRemoveUserDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const { deviceId } = req.body || {};
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    ensureDeviceArrays(user);
    const match = user.registeredDevices.find((d) => d.id === deviceId);
    if (!match) {
      return res.status(404).json({ error: 'Device not found' });
    }
    user.registeredDevices = user.registeredDevices.filter((d) => d.id !== deviceId);
    user.deviceReplacementCount = (user.deviceReplacementCount || 0) + 1;
    user.deviceLogs.push({
      action: 'delete',
      deviceId,
      deviceType: match.type,
      ip: req.ip,
      userAgent: req.get('user-agent') || 'admin',
      timestamp: new Date(),
    });
    if (user.deviceLogs.length > 50) {
      user.deviceLogs = user.deviceLogs.slice(-50);
    }
    await user.save();
    return res.json({ success: true });
  } catch (error) {
    console.error('adminRemoveUserDevice error', error);
    return res.status(500).json({ error: 'Unable to remove device' });
  }
};

