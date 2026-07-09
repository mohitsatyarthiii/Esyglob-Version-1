import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.PAYMENT_ENCRYPTION_KEY || process.env.AUTH_SECRET || 'esyglob-payment-key-32chars!!';
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Encrypt sensitive payment value
 */
export function encryptPaymentValue(text) {
  if (!text) return '';

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY.slice(0, 32)),
    iv
  );

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive payment value
 */
export function decryptPaymentValue(encryptedText) {
  if (!encryptedText) return '';

  const parts = encryptedText.split(':');
  if (parts.length !== 2) return '';

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY.slice(0, 32)),
    iv
  );

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Mask account number (show last 4 digits)
 */
export function maskAccountNumber(accountNumber) {
  const str = String(accountNumber || '');
  if (str.length <= 4) return str;
  return '•'.repeat(str.length - 4) + str.slice(-4);
}

/**
 * Validate IFSC code format
 */
export function validateIfsc(ifsc) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
}

/**
 * Validate UPI ID format
 */
export function validateUpi(upiId) {
  return /^[\w.-]+@[\w]+$/.test(upiId);
}