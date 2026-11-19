import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import AccountManagement from '../src/ui/AccountManagement';

const direction = { id: 'direction', username: 'direction', label: 'Direction Touché', role: 'admin' };
const manager = { id: 'manager', username: 'manager', label: 'Manager Test', role: 'manager' };
const render = (user: typeof direction) => renderToStaticMarkup(
  <AccountManagement user={user} users={[direction, manager]} passwordViewingEnabled={false} reload={async () => {}} notify={() => {}}/>);

test.each([['direction', direction], ['manager', manager]])('create form offers Call center, CM and Manager in order for %s', (_n, user) => {
  const html = render(user);
  const a = html.indexOf('<option value="advisor"'), c = html.indexOf('<option value="cm"'), m = html.indexOf('<option value="manager"');
  expect(a).toBeGreaterThan(-1);
  expect(c).toBeGreaterThan(a);
  expect(m).toBeGreaterThan(c);
  expect(html).toMatch(/<option value="advisor"[^>]*>Call center<\/option>/);
  expect(html).toMatch(/<option value="cm"[^>]*>CM<\/option>/);
  expect(html).toMatch(/<option value="manager"[^>]*>Manager<\/option>/);
  expect(html).toContain('Call center, CM ou Manager');
  expect(html).not.toContain('Conseillère</option>');
});
