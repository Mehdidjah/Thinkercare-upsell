import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * EcoManager signs each webhook with HMAC-SHA256 of the raw body (X-Ecomanager-Signature). The encoding is not
 * documented, so hex (any case, optional `sha256=`) and base64 are accepted; the comparison is constant-time.
 */
export function verifySignature(secret: string, rawBody: string, header: string | undefined): boolean {
  const given = header?.trim().replace(/^sha256=/i, '');
  if (!given) return false;
  const digest = createHmac('sha256', secret).update(rawBody).digest();
  const candidates = [/^[a-f0-9]{64}$/i.test(given) ? Buffer.from(given, 'hex') : null, Buffer.from(given, 'base64')];
  return candidates.some((buffer) => !!buffer && buffer.length === digest.length && timingSafeEqual(buffer, digest));
}
