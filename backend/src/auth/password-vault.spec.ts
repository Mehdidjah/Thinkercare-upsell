import { randomBytes } from 'node:crypto';
import { openPassword, sealPassword } from './password-vault.js';

const key = randomBytes(32).toString('hex');
it('encrypts with a fresh nonce and binds the password to its account', () => {
  const first = sealPassword('account-a', 'a-private-test-password', key)!;
  const second = sealPassword('account-a', 'a-private-test-password', key)!;
  expect(first).not.toBe(second);
  expect(first).not.toContain('a-private-test-password');
  expect(openPassword('account-a', first, key)).toBe('a-private-test-password');
  expect(() => openPassword('account-b', first, key)).toThrow(/ne peut pas être consulté/);
  expect(() => openPassword('account-a', first, randomBytes(32).toString('hex'))).toThrow(/ne peut pas être consulté/);
  const parts = first.split('.');
  parts[3] = Buffer.from('tampered ciphertext').toString('base64url');
  expect(() => openPassword('account-a', parts.join('.'), key)).toThrow(/ne peut pas être consulté/);
});
it('does not retain a recoverable password when viewing is unconfigured', () => {
  expect(sealPassword('account-a', 'a-private-test-password')).toBeNull();
  expect(() => openPassword('account-a', 'v1.iv.tag.data')).toThrow(/pas configurée/);
});
