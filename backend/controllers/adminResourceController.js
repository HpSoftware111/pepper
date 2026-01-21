/**
 * Admin Resource Management Controller
 * Handles resource usage monitoring and limits for admin users
 */

import User from '../models/User.js';
import ResourceUsageLog from '../models/ResourceUsageLog.js';
import {
  getUserResourceUsage,
  setResourceLimit,
  resetResourceUsage,
} from '../services/resourceTrackingService.js';

/**
 * GET /api/admin/resources
 * Get resource usage summary for all users
 */
export async function getAllUsersResourceUsage(req, res) {
  try {
    const users = await User.find({ status: 'active' }).select('email displayName firstName lastName');

    const usageSummary = await Promise.all(
      users.map(async (user) => {
        const resourceUsage = await getUserResourceUsage(user._id.toString());
        return {
          userId: user._id.toString(),
          email: user.email,
          displayName: user.displayName,
          firstName: user.firstName,
          lastName: user.lastName,
          resourceUsage,
        };
      })
    );

    return res.json({ users: usageSummary });
  } catch (error) {
    console.error('[admin][resources] error', error);
    return res.status(500).json({ error: 'Unable to load resource usage' });
  }
}

/**
 * GET /api/admin/resources/:userId
 * Get detailed resource usage for a specific user
 */
export async function getUserResourceUsageDetail(req, res) {
  try {
    const { id } = req.params;
    const { startDate, endDate, resourceType } = req.query;

    // Validate user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resourceUsage = await getUserResourceUsage(id);

    // Get detailed logs
    const query = { userId: id };
    if (resourceType) {
      query.resourceType = resourceType;
    }
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const logs = await ResourceUsageLog.find(query)
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    return res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      resourceUsage,
      logs,
    });
  } catch (error) {
    console.error('[admin][resources][detail] error', error);
    return res.status(500).json({ error: 'Unable to load resource usage detail' });
  }
}

/**
 * PATCH /api/admin/resources/:userId/limit
 * Set resource limit for a user
 * Body: { resourceType: string, limit: number }
 */
export async function setUserResourceLimit(req, res) {
  try {
    const { id } = req.params;
    const { resourceType, limit } = req.body;

    if (!resourceType || typeof limit !== 'number' || limit < 0) {
      return res.status(400).json({
        error: 'resourceType and limit (non-negative number) are required',
      });
    }

    // Validate user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await setResourceLimit(id, resourceType, limit);

    const resourceUsage = await getUserResourceUsage(id);

    return res.json({
      success: true,
      message: `Resource limit updated for ${resourceType}`,
      resourceUsage,
    });
  } catch (error) {
    console.error('[admin][resources][limit] error', error);
    return res.status(500).json({
      error: error.message || 'Unable to set resource limit',
    });
  }
}

/**
 * POST /api/admin/resources/:userId/reset
 * Reset resource usage for a user
 * Body: { resourceType?: string } (optional, defaults to 'all')
 */
export async function resetUserResourceUsage(req, res) {
  try {
    const { id } = req.params;
    const { resourceType = 'all' } = req.body;

    // Validate user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await resetResourceUsage(id, resourceType);

    const resourceUsage = await getUserResourceUsage(id);

    return res.json({
      success: true,
      message: `Resource usage reset for ${resourceType}`,
      resourceUsage,
    });
  } catch (error) {
    console.error('[admin][resources][reset] error', error);
    return res.status(500).json({
      error: error.message || 'Unable to reset resource usage',
    });
  }
}
