import { describeError } from './log.js';

it('logs the first line only, with the cause code', () => {
  const error = new Error('Failed query: select 1\nparams: secret-hash', { cause: { code: '23505' } });
  const line = describeError(error);
  expect(line).toBe('Error (cause 23505): Failed query: select 1');
  expect(line).not.toContain('secret');
});
