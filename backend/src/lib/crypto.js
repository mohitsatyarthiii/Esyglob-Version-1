import crypto from 'crypto';
import { config } from '../config/env.js';

export function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64url');
}

export function base64UrlDecode(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function sign(value) {
  return crypto
    .createHmac('sha256', config.authSecret)
    .update(value)
    .digest('base64url');
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');

  const hash = await new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      config.hashIterations,
      config.hashKeyLength,
      config.hashDigest,
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey.toString('base64url'));
      }
    );
  });

  return `pbkdf2:${config.hashIterations}:${salt}:${hash}`;
}

export async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;

  const [scheme, iterations, salt, hash] = storedHash.split(':');

  if (scheme !== 'pbkdf2' || !iterations || !salt || !hash) {
    return false;
  }

  const iterationCount = Number(iterations);

  if (!Number.isInteger(iterationCount) || iterationCount <= 0) {
    return false;
  }

  const candidate = await new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      iterationCount,
      config.hashKeyLength,
      config.hashDigest,
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey.toString('base64url'));
      }
    );
  });

  if (candidate.length !== hash.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(candidate),
    Buffer.from(hash)
  );
}

export function createToken(userId) {
  const payload = {
    sub: String(userId),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + config.sessionMaxAge,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  if (token.length > 4096) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload);

  if (!signature || signature.length !== expectedSignature.length) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));

    if (!payload.sub || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
