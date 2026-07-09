import { getCurrentUser } from '../lib/session.js';

export async function authenticate(req, res, next) {
  try {
    const user = await getCurrentUser(req);
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Please sign in to continue' });
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Please sign in to continue' });
    }

    const hasRole = roles.some((role) => req.user.roles?.includes(role));

    if (!hasRole) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }

    next();
  };
}