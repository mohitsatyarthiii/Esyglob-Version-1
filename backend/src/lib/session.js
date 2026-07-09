import { connectToDatabase } from '../config/database.js';
import { config } from '../config/env.js';
import { createToken, verifyToken } from './crypto.js';
import User from '../models/User.js';

export function setSessionCookie(res, userId) {
  const token = createToken(userId);

  res.cookie(config.sessionCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: config.sessionMaxAge * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.sessionCookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
  });
}

export function getTokenFromCookie(req) {
  return req.cookies?.[config.sessionCookie] || null;
}

export function getTokenFromHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.substring(7);
}

export function getToken(req) {
  return getTokenFromCookie(req) || getTokenFromHeader(req);
}

export function getSessionPayload(req) {
  const token = getToken(req);
  return verifyToken(token);
}

export async function getCurrentUser(req) {
  const payload = getSessionPayload(req);
  if (!payload) return null;

  await connectToDatabase();

  const user = await User.findById(payload.sub)
    .select('-passwordHash -__v')
    .lean();

  if (!user || !user.isActive || user.isBanned) return null;

  return serializeUser(user);
}

export async function getSession(req) {
  const user = await getCurrentUser(req);
  if (!user) return null;

  return {
    userId: user.id,
    user,
    roles: user.roles || [],
    primaryRole: user.primaryRole,
  };
}

export function serializeUser(user) {
  if (!user) return null;

  return {
    id: String(user._id || user.id),
    email: user.email,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    fullName: user.fullName || '',
    avatarUrl: user.avatarUrl || '',
    phone: user.phone || '',
    roles: user.roles || ['buyer'],
    primaryRole: user.primaryRole || user.roles?.[0] || 'buyer',
    isActive: user.isActive,
    isBanned: user.isBanned,
    hasCompletedOnboarding: Boolean(user.hasCompletedOnboarding),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}