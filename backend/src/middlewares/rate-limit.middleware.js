const rateLimitStore = new Map();
const MAX_RATE_LIMIT_KEYS = 10000;

/**
 * Simple in-memory rate limiter middleware
 * @param {Object} options - { windowMs, max, keyPrefix }
 */
export function rateLimiter(options = {}) {
  const { windowMs = 60 * 1000, max = 30, keyPrefix = 'rl' } = options;

  return (req, res, next) => {
    const key = `${keyPrefix}:${req.user?._id || req.ip || 'anonymous'}`;
    const now = Date.now();
    
    let entry = rateLimitStore.get(key);
    
    if (!entry || now - entry.windowStart > windowMs) {
      entry = { count: 0, windowStart: now };
      rateLimitStore.set(key, entry);
    }

    entry.count++;
    if (rateLimitStore.size > MAX_RATE_LIMIT_KEYS) {
      pruneRateLimitStore(now);
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil((entry.windowStart + windowMs) / 1000));

    if (entry.count > max) {
      return res.status(429).json({
        error: 'Too many requests. Please slow down and try again.',
        retryAfter: Math.ceil((entry.windowStart + windowMs - now) / 1000),
      });
    }

    next();
  };
}

// Clean up old entries every 5 minutes
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  pruneRateLimitStore(now);
}, 300000);
cleanupTimer.unref?.();

function pruneRateLimitStore(now = Date.now()) {
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.windowStart > 300000) {
      rateLimitStore.delete(key);
    }
  }

  while (rateLimitStore.size > MAX_RATE_LIMIT_KEYS) {
    const oldestKey = rateLimitStore.keys().next().value;
    if (!oldestKey) break;
    rateLimitStore.delete(oldestKey);
  }
}

export default rateLimiter;
