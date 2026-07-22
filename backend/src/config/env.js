import dotenv from 'dotenv';
dotenv.config();

const requiredEnvVars = ['MONGODB_URI', 'AUTH_SECRET'];

requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const authSecret = process.env.AUTH_SECRET;

if (isProduction && authSecret.length < 32) {
  throw new Error('AUTH_SECRET must be at least 32 characters in production');
}

function parseCorsOrigin(value) {
  if (!value || value === '*') return isProduction ? [] : true;
  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function wildcardOriginPattern(value) {
  const escaped = value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^.]+');
  return new RegExp(`^${escaped}$`, 'i');
}

export function isCorsOriginAllowed(origin) {
  if (!origin || config.corsOrigin === true) return true;
  return config.corsOrigin.some((allowed) => allowed === origin || (allowed.includes('*') && wildcardOriginPattern(allowed).test(origin)));
}

export const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv,
  isProduction,
  mongodbUri: process.env.MONGODB_URI,
  authSecret,
  sessionCookie: process.env.SESSION_COOKIE_NAME || 'esyglob_session',
  sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE_SECONDS, 10) || 60 * 60 * 24 * 30,
  sessionSameSite: process.env.SESSION_SAME_SITE || (isProduction ? 'none' : 'lax'),
  sessionSecure: process.env.SESSION_SECURE
    ? process.env.SESSION_SECURE === 'true'
    : isProduction,
  hashIterations: parseInt(process.env.HASH_ITERATIONS, 10) || 120000,
  hashKeyLength: 64,
  hashDigest: 'sha512',
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN || 'http://localhost:5173'),
  jsonLimit: process.env.JSON_LIMIT || '1mb',
  formLimit: process.env.FORM_LIMIT || '1mb',
  mongoMaxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE, 10) || 50,
  mongoMinPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE, 10) || 5,
};
