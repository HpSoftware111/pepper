import express from 'express';
import {
    getAuthUrl,
    handleCallback,
    getConnectionStatus,
    disconnect,
    clearAllTokens,
    forceReconnect,
    getEvents,
    createEvent,
    updateEvent,
    deleteEvent,
} from '../controllers/calendarController.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// OAuth endpoints
router.get('/auth-url', requireAuth, getAuthUrl);
router.get('/callback', handleCallback); // No auth required - called by Google OAuth redirect

// Connection management
router.get('/status', requireAuth, getConnectionStatus);
router.post('/disconnect', requireAuth, disconnect);
router.post('/force-reconnect', requireAuth, forceReconnect); // Force reconnection by clearing user's tokens
router.post('/clear-all-tokens', clearAllTokens); // For testing - clears all tokens (dev only)

// Event operations
router.get('/events', requireAuth, getEvents);
router.post('/events', requireAuth, createEvent);
router.put('/events/:eventId', requireAuth, updateEvent);
router.delete('/events/:eventId', requireAuth, deleteEvent);

export default router;

