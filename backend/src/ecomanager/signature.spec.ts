import { createHmac } from 'node:crypto';
import { verifySignature } from './signature.js';

const SECRET = 'whsec-test-0123456789';
const BODY = '{"id":1763816,"reference":"TOU1763816"}';
const hmac = (encoding: 'hex' | 'base64') => createHmac('sha256', SECRET).update(BODY).digest(encoding);

describe('verifySignature', () => {
  it('accepts hex and base64 signatures', () => {
    expect(verifySignature(SECRET, BODY, hmac('hex'))).toBe(true);
    expect(verifySignature(SECRET, BODY, hmac('hex').toUpperCase())).toBe(true);
    expect(verifySignature(SECRET, BODY, hmac('base64'))).toBe(true);
    expect(verifySignature(SECRET, BODY, 'sha256=' + hmac('hex'))).toBe(true);
  });
  it('rejects a wrong or missing signature', () => {
    expect(verifySignature(SECRET, BODY, undefined)).toBe(false);
    expect(verifySignature(SECRET, BODY, '')).toBe(false);
    expect(verifySignature(SECRET, BODY + ' ', hmac('hex'))).toBe(false);
    expect(verifySignature('another-secret-0123', BODY, hmac('hex'))).toBe(false);
    expect(verifySignature(SECRET, BODY, 'not a signature')).toBe(false);
  });
});
