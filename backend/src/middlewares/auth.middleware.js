import { getCurrentUser, getSessionPayload } from '../lib/session.js';

export function authenticate(req, res, next) {
  try {
    const payload = getSessionPayload(req);
    req.auth = payload ? { userId: payload.sub, payload } : null;
    req.user = payload ? { id: payload.sub, _id: payload.sub, __sessionOnly: true } : null;
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

export async function requireAuth(req, res, next) {
  try {
    if (!req.auth && !req.user) {
      return res.status(401).json({ error: 'Please sign in to continue' });
    }

    if (!req.user || req.user.__sessionOnly) {
      req.user = await getCurrentUser(req);
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Please sign in to continue' });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || req.user.__sessionOnly) {
      return res.status(401).json({ error: 'Please sign in to continue' });
    }

    const hasRole = roles.some((role) => req.user.roles?.includes(role));

    if (!hasRole) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }

    return next();
  };
}
