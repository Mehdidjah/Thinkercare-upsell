import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import AccountTable, { type AccountUser } from '../src/ui/AccountTable';

const direction = { id: 'direction', username: 'direction', label: 'Direction Touché', role: 'admin' };
const manager = { id: 'manager', username: 'manager', label: 'Manager Test', role: 'manager' };
const advisor = { id: 'advisor', username: 'advisor', label: 'Conseillère Test', role: 'advisor' };
const render = (user: AccountUser) => renderToStaticMarkup(<AccountTable user={user} users={[direction, manager, advisor]} onManage={() => {}} onRemove={() => {}}/>);

test('Manager cannot manage or remove Direction; removal sits beside other account actions', () => {
  const html = render(manager);
  expect(html).toContain('Compte protégé');
  expect(html).not.toContain('aria-label="Gérer l’accès de Direction Touché"');
  expect(html).not.toContain('aria-label="Supprimer l’utilisateur Direction Touché"');
  expect(html).not.toContain('aria-label="Supprimer l’utilisateur Manager Test"');
  expect(html).toContain('aria-label="Gérer l’accès de Conseillère Test"');
  expect(html).toContain('aria-label="Supprimer l’utilisateur Conseillère Test"');
  expect(html).toContain('data-label="Rôle">Manager</td>');
});
test('Direction can manage its own account and remove a manager', () => {
  const html = render(direction);
  expect(html).toContain('aria-label="Gérer l’accès de Direction Touché"');
  expect(html).not.toContain('aria-label="Supprimer l’utilisateur Direction Touché"');
  expect(html).toContain('aria-label="Supprimer l’utilisateur Manager Test"');
});
test('Advisor receives no management or removal buttons', () => {
  expect(render(advisor)).not.toContain('<button');
});
