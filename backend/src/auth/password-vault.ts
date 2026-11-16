import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DeskError } from '../common/http.js';

function keyBytes(key: string): Buffer {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('ACCOUNT_PASSWORD_KEY doit contenir 64 caractères hexadécimaux.');
  return Buffer.from(key, 'hex');
}

// Login always uses the one-way hash. This separate, authenticated encrypted
// copy is accessible only through the admin reauthentication endpoint.
export function sealPassword(userId: string, password: string, key?: string): string | null {
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(key), iv);
  cipher.setAAD(Buffer.from('touche-account:' + userId));
  const data = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function openPassword(userId: string, envelope: string, key?: string): string {
  if (!key) throw new DeskError(503, 'La consultation des mots de passe n’est pas configurée.');
  try {
    const [version, iv, tag, data, extra] = envelope.split('.');
    if (version !== 'v1' || !iv || !tag || !data || extra !== undefined) throw new Error('Invalid envelope');
    const decipher = createDecipheriv('aes-256-gcm', keyBytes(key), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from('touche-account:' + userId));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new DeskError(503, 'Ce mot de passe ne peut pas être consulté. Réinitialisez-le pour rétablir l’accès.');
  }
}
