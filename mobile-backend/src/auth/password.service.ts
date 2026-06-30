import { Injectable } from '@nestjs/common';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';

const ITERATIONS = 120000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

@Injectable()
export class PasswordService {
  hash(password: string) {
    const salt = randomBytes(16).toString('base64url');
    const derived = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
    return `pbkdf2:${ITERATIONS}:${salt}:${derived.toString('base64url')}`;
  }

  verify(password: string, stored?: string | null) {
    if (!stored) {
      return false;
    }

    if (this.isBcrypt(stored)) {
      return bcrypt.compareSync(password, stored);
    }

    const parsed = this.parse(stored);

    if (!parsed) {
      return false;
    }

    const expected = pbkdf2Sync(password, parsed.salt, parsed.iterations, parsed.keyLength, DIGEST);
    const actual = parsed.hash;

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private parse(stored: string) {
    const parts = stored.split(':');

    if (parts.length === 2) {
      const hash = Buffer.from(parts[1], 'hex');
      return {
        iterations: ITERATIONS,
        salt: parts[0],
        hash,
        keyLength: hash.length,
      };
    }

    if (parts.length === 3 && /^\d+$/.test(parts[0])) {
      const hash = Buffer.from(parts[2], 'hex');
      return {
        iterations: Number(parts[0]),
        salt: parts[1],
        hash,
        keyLength: hash.length,
      };
    }

    if (parts.length === 4 && parts[0] === 'pbkdf2' && /^\d+$/.test(parts[1])) {
      const hash = Buffer.from(parts[3], 'base64url');
      return {
        iterations: Number(parts[1]),
        salt: parts[2],
        hash,
        keyLength: hash.length,
      };
    }

    return null;
  }

  private isBcrypt(stored: string) {
    return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(stored);
  }
}
