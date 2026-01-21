import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/**
 * MongoDB connection utility
 * Reuses connection from Tutelas system
 */
let cachedConnection = null;

export async function connectDB() {
  if (cachedConnection) {
    return cachedConnection;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    cachedConnection = conn;
    console.log('✅ MongoDB connected');
    return conn;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

export function getDB() {
  if (!cachedConnection) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return mongoose.connection.db;
}

