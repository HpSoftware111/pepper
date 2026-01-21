/**
 * Resource Tracking Service
 * Tracks and manages usage of expensive API resources
 */

import User from '../models/User.js';
import ResourceUsageLog from '../models/ResourceUsageLog.js';

const RESOURCE_TYPES = [
  'voiceTranscriptions',
  'aiChatTokens',
  'whatsappMessages',
  'calendarApiCalls',
  'cpnuScrapes',
];

/**
 * Initialize resource usage structure for a user
 * @param {Object} user - User document
 */
function initializeResourceUsage(user) {
  if (!user.resourceUsage) {
    user.resourceUsage = {
      voiceTranscriptions: { used: 0, limit: 0, lastResetAt: new Date() },
      aiChatTokens: { used: 0, limit: 0, lastResetAt: new Date() },
      whatsappMessages: { used: 0, limit: 0, lastResetAt: new Date() },
      calendarApiCalls: { used: 0, limit: 0, lastResetAt: new Date() },
      cpnuScrapes: { used: 0, limit: 0, lastResetAt: new Date() },
    };
  } else {
    // Ensure all resource types exist
    RESOURCE_TYPES.forEach((type) => {
      if (!user.resourceUsage[type]) {
        user.resourceUsage[type] = { used: 0, limit: 0, lastResetAt: new Date() };
      }
      // Ensure all fields exist
      if (typeof user.resourceUsage[type].used !== 'number') {
        user.resourceUsage[type].used = 0;
      }
      if (typeof user.resourceUsage[type].limit !== 'number') {
        user.resourceUsage[type].limit = 0;
      }
      if (!user.resourceUsage[type].lastResetAt) {
        user.resourceUsage[type].lastResetAt = new Date();
      }
    });
  }
}

/**
 * Track resource usage for a user
 * @param {string} userId - User ID
 * @param {string} resourceType - Type of resource ('voiceTranscriptions', 'aiChatTokens', etc.)
 * @param {number} amount - Amount consumed
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<{success: boolean, used: number, limit: number, remaining: number, isUnlimited: boolean}>}
 */
export async function trackResourceUsage(userId, resourceType, amount, metadata = {}) {
  try {
    if (!RESOURCE_TYPES.includes(resourceType)) {
      throw new Error(`Invalid resource type: ${resourceType}`);
    }

    if (typeof amount !== 'number' || amount < 0) {
      throw new Error(`Invalid amount: ${amount}. Must be a non-negative number.`);
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Initialize resourceUsage if not exists
    initializeResourceUsage(user);

    // Update usage count
    const resource = user.resourceUsage[resourceType];
    resource.used = (resource.used || 0) + amount;
    resource.lastResetAt = resource.lastResetAt || new Date();

    // Calculate remaining (0 limit means unlimited)
    const remaining = resource.limit > 0 
      ? Math.max(0, resource.limit - resource.used)
      : Infinity;

    // Save user
    await user.save();

    // Log detailed usage (async, don't block)
    ResourceUsageLog.create({
      userId,
      resourceType,
      amount,
      metadata,
    }).catch((err) => {
      console.error(`[ResourceTracking] Error logging usage for ${resourceType}:`, err);
      // Don't throw - logging failure shouldn't break the operation
    });

    return {
      success: true,
      used: resource.used,
      limit: resource.limit,
      remaining,
      isUnlimited: resource.limit === 0,
    };
  } catch (error) {
    console.error(`[ResourceTracking] Error tracking ${resourceType}:`, error);
    throw error;
  }
}

/**
 * Check if user has available resources
 * @param {string} userId - User ID
 * @param {string} resourceType - Type of resource
 * @param {number} amount - Amount needed (default: 1)
 * @returns {Promise<{allowed: boolean, used: number, remaining: number, limit: number, isUnlimited: boolean}>}
 */
export async function checkResourceAvailability(userId, resourceType, amount = 1) {
  try {
    if (!RESOURCE_TYPES.includes(resourceType)) {
      console.warn(`[ResourceTracking] Invalid resource type: ${resourceType}`);
      return { allowed: true, remaining: Infinity, limit: 0, isUnlimited: true };
    }

    const user = await User.findById(userId);
    if (!user || !user.resourceUsage) {
      // Default: unlimited if user doesn't exist or has no resource tracking
      return { allowed: true, remaining: Infinity, limit: 0, isUnlimited: true };
    }

    initializeResourceUsage(user);

    const resource = user.resourceUsage[resourceType];
    if (!resource) {
      return { allowed: true, remaining: Infinity, limit: 0, isUnlimited: true };
    }

    // 0 limit means unlimited
    if (resource.limit === 0) {
      return {
        allowed: true,
        used: resource.used || 0,
        remaining: Infinity,
        limit: 0,
        isUnlimited: true,
      };
    }

    const used = resource.used || 0;
    const remaining = Math.max(0, resource.limit - used);
    const allowed = remaining >= amount;

    return {
      allowed,
      used,
      remaining,
      limit: resource.limit,
      isUnlimited: false,
    };
  } catch (error) {
    console.error(`[ResourceTracking] Error checking ${resourceType}:`, error);
    // Fail open - allow operation if check fails
    return { allowed: true, remaining: Infinity, limit: 0, isUnlimited: true };
  }
}

/**
 * Get user resource usage summary
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Resource usage summary
 */
export async function getUserResourceUsage(userId) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.resourceUsage) {
      // Return default structure
      return {
        voiceTranscriptions: { used: 0, limit: 0, remaining: Infinity, isUnlimited: true },
        aiChatTokens: { used: 0, limit: 0, remaining: Infinity, isUnlimited: true },
        whatsappMessages: { used: 0, limit: 0, remaining: Infinity, isUnlimited: true },
        calendarApiCalls: { used: 0, limit: 0, remaining: Infinity, isUnlimited: true },
        cpnuScrapes: { used: 0, limit: 0, remaining: Infinity, isUnlimited: true },
      };
    }

    initializeResourceUsage(user);

    const usage = {};
    for (const resourceType of RESOURCE_TYPES) {
      const resource = user.resourceUsage[resourceType];
      const remaining = resource.limit > 0 
        ? Math.max(0, resource.limit - (resource.used || 0))
        : Infinity;
      
      usage[resourceType] = {
        used: resource.used || 0,
        limit: resource.limit || 0,
        remaining,
        isUnlimited: resource.limit === 0,
        lastResetAt: resource.lastResetAt,
      };
    }

    return usage;
  } catch (error) {
    console.error('[ResourceTracking] Error getting usage:', error);
    throw error;
  }
}

/**
 * Reset user resource usage (for monthly/annual resets)
 * @param {string} userId - User ID
 * @param {string} resourceType - Optional: specific resource type, or 'all' for all resources
 * @returns {Promise<void>}
 */
export async function resetResourceUsage(userId, resourceType = 'all') {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    initializeResourceUsage(user);

    if (resourceType === 'all') {
      // Reset all resources
      for (const type of RESOURCE_TYPES) {
        user.resourceUsage[type].used = 0;
        user.resourceUsage[type].lastResetAt = new Date();
      }
    } else {
      // Reset specific resource
      if (!RESOURCE_TYPES.includes(resourceType)) {
        throw new Error(`Invalid resource type: ${resourceType}`);
      }
      const resource = user.resourceUsage[resourceType];
      if (resource) {
        resource.used = 0;
        resource.lastResetAt = new Date();
      }
    }

    await user.save();
  } catch (error) {
    console.error('[ResourceTracking] Error resetting usage:', error);
    throw error;
  }
}

/**
 * Set resource limit for a user (admin function)
 * @param {string} userId - User ID
 * @param {string} resourceType - Resource type
 * @param {number} limit - New limit (0 = unlimited)
 * @returns {Promise<void>}
 */
export async function setResourceLimit(userId, resourceType, limit) {
  try {
    if (!RESOURCE_TYPES.includes(resourceType)) {
      throw new Error(`Invalid resource type: ${resourceType}`);
    }

    if (typeof limit !== 'number' || limit < 0) {
      throw new Error(`Invalid limit: ${limit}. Must be a non-negative number.`);
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    initializeResourceUsage(user);

    user.resourceUsage[resourceType].limit = limit;
    await user.save();
  } catch (error) {
    console.error('[ResourceTracking] Error setting limit:', error);
    throw error;
  }
}
