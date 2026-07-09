import dotenv from 'dotenv';
dotenv.config();

const requiredEnvVars = ['MONGODB_URI', 'AUTH_SECRET'];

requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

export const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI,
  authSecret: process.env.AUTH_SECRET,
  sessionCookie: 'esyglob_session',
  sessionMaxAge: 60 * 60 * 24 * 30, // 30 days
  hashIterations: 120000,
  hashKeyLength: 64,
  hashDigest: 'sha512',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
};