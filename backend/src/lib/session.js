import { connectToDatabase } from '../config/database.js';
import { config } from '../config/env.js';
import { createToken, verifyToken } from './crypto.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

export function setSessionCookie(res, userId) {
  const token = createToken(userId);

  res.cookie(config.sessionCookie, token, {
    httpOnly: true,
    sameSite: config.sessionSameSite,
    secure: config.sessionSecure,
    maxAge: config.sessionMaxAge * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.sessionCookie, {
    httpOnly: true,
    sameSite: config.sessionSameSite,
    secure: config.sessionSecure,
    path: '/',
  });
}

export function getTokenFromCookie(req) {
  return req.cookies?.[config.sessionCookie] || null;
}

export function getTokenFromHeader(req) {
  const authHeader = req.headers.authorization;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader || '');
  return match?.[1]?.trim() || null;
}

export function getToken(req) {
  return getTokenFromHeader(req) || getTokenFromCookie(req);
}

export function getSessionPayload(req) {
  const token = getToken(req);
  return verifyToken(token);
}

export async function getCurrentUser(req) {
  if (req.currentUser) return req.currentUser;
  if (req.user && !req.user.__sessionOnly) return req.user;

  const payload = getSessionPayload(req);
  if (!payload) return null;
  if (!mongoose.Types.ObjectId.isValid(payload.sub)) return null;

  await connectToDatabase();

  const user = await User.findById(payload.sub)
    .select('-passwordHash -__v')
    .lean()
    .exec();

  if (!user || !user.isActive || user.isBanned) return null;

  req.currentUser = serializeUser(user);
  return req.currentUser;
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

  const id = String(user._id || user.id);

  return {
    id,
    _id: id,
    userId: id,
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
