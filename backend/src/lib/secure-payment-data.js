import crypto from 'crypto';

const ENCRYPTION_KEY =
  process.env.PAYMENT_ENCRYPTION_KEY ||
  process.env.AUTH_SECRET ||
  'esyglob-payment-key-32chars!!';

const ALGORITHM = 'aes-256-gcm';
const LEGACY_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function deriveKey() {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

export function encryptPaymentValue(text) {
  if (!text) return '';

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(), iv);

  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return `v2:${iv.toString('hex')}:${tag}:${encrypted}`;
}

export function decryptPaymentValue(encryptedText) {
  if (!encryptedText) return '';

  const parts = String(encryptedText).split(':');

  try {
    if (parts[0] === 'v2') {
      if (parts.length !== 4) return '';

      const [, ivHex, tagHex, encrypted] = parts;
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        deriveKey(),
        Buffer.from(ivHex, 'hex')
      );
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    if (parts.length !== 2) return '';

    const [ivHex, encrypted] = parts;
    const decipher = crypto.createDecipheriv(
      LEGACY_ALGORITHM,
      Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0')),
      Buffer.from(ivHex, 'hex')
    );

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return '';
  }
}

export function maskAccountNumber(accountNumber) {
  const str = String(accountNumber || '');
  if (str.length <= 4) return str;
  return '*'.repeat(str.length - 4) + str.slice(-4);
}

export function validateIfsc(ifsc) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(ifsc || '').trim().toUpperCase());
}

export function validateUpi(upiId) {
  return /^[\w.-]+@[\w.-]+$/.test(String(upiId || '').trim());
}
