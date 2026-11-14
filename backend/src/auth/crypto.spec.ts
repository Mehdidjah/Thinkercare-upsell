import { hashPassword, newSaltHex, newSessionToken, safeEqualHex, sha256Hex } from './crypto.js';
import { readSessionToken, sessionCookie } from './session.js';

it('PBKDF2 hash is byte-compatible with the legacy accounts', async () => expect(await hashPassword('Touché-2026-direction!', '0123456789abcdef0123456789abcdef')).toBe('7baf5bc003348084535b2583042d7c16d0829cb3c960f350c50ebf60ddbbf480'));
it('sha256Hex', () => expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
it('token and salt formats', () => { expect(newSessionToken()).toMatch(/^[a-f0-9]{64}$/); expect(newSaltHex()).toMatch(/^[a-f0-9]{32}$/); });
it('safeEqualHex', () => { expect(safeEqualHex('ab', 'ab')).toBe(true); expect(safeEqualHex('ab', 'ac')).toBe(false); expect(safeEqualHex('ab', 'abc')).toBe(false); });
it('cookie strings', () => { expect(sessionCookie('a'.repeat(64))).toBe(`__Host-touche-session=${'a'.repeat(64)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`); expect(readSessionToken(`x=1; __Host-touche-session=${'b'.repeat(64)}`)).toBe('b'.repeat(64)); });
