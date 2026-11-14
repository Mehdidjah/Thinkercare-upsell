import { createHash, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';

export const DUMMY_SALT = '0123456789abcdef0123456789abcdef';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashPassword(password: string, saltHex: string): Promise<string> {
  return new Promise((resolve, reject) => {
    pbkdf2(password, Buffer.from(saltHex, 'hex'), 100_000, 32, 'sha256', (error, key) =>
      error ? reject(error) : resolve(key.toString('hex')),
    );
  });
}

export function newSaltHex(): string {
  return randomBytes(16).toString('hex');
}

export function newSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
