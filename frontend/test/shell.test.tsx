import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { Sidebar, navItems } from '../src/ui/shell/Sidebar';
import { type State } from '../src/ui/shared/types';

const titles: Record<string, string> = { coverage: 'Parcours produits', call: 'Appel guidé', catalogue: 'Catalogue', results: 'Pilotage', progress: 'Ma progression', contributions: 'Apports & primes', protocol: 'Protocole', admin: 'Gestion', account: 'Mon compte' };
const state = (role: string) => ({ user: { id: 'u', username: 'u', label: 'Nadia B.', role }, products: [], calls: [], clinical: { validated: false, by: '', at: '' }, users: [] }) as unknown as State;
const render = (role: string, view: string) => renderToStaticMarkup(<Sidebar state={state(role)} view={view} setView={() => {}} titles={titles} signingOut={false} signOut={async () => {}} />);

test('the phone bar keeps at most four destinations plus « Plus »', () => {
  for (const manager of [true, false]) {
    const { items, phone, more } = navItems(manager);
    expect(phone.length).toBeLessThanOrEqual(4);
    expect([...phone, ...more].sort()).toEqual([...items].sort());
  }
  expect(navItems(true).phone).toEqual(['results', 'contributions', 'call', 'admin']);
  expect(navItems(false).phone).toEqual(['call', 'progress', 'catalogue', 'coverage']);
  const html = render('admin', 'results');
  expect((html.match(/data-phone="true"/g) || []).length).toBe(4);
  expect(html).toContain('aria-haspopup="dialog"');
});

test('navigation items are named by their visible label, with the current page marked', () => {
  const html = render('advisor', 'coverage');
  const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
  expect(nav).not.toContain('aria-label="Parcours produits"');
  expect(nav).toMatch(/aria-current="page"[^>]*><svg[^]*?<span class="shell-nav__full">Parcours produits<\/span><span class="shell-nav__short">Parcours<\/span><span class="tooltip" aria-hidden="true">Parcours produits<\/span>/);
  expect((nav.match(/aria-current="page"/g) || []).length).toBe(1);
  expect(html).toContain('Espace conseil');
  expect(render('admin', 'results')).toContain('>Direction</p>');
});

test('Mon compte is its own view, reached from the account card', () => {
  expect(render('advisor', 'account')).toMatch(/class="shell-account" aria-current="page"/);
  const app = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
  expect(app).toContain("{view==='account'&&<Account state={state} reload={load}/>}");
  expect(app).toContain("{view==='admin'&&canManageWorkspace(state.user)&&<Admin");
});

test('every view change sets the tab title, scrolls to the top and focuses the h1', () => {
  const app = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
  expect(app).toContain("document.title=(state?TITLES[view]+' – ':'')+'ThinkerCare'");
  expect(app).toContain('window.scrollTo(0,0)');
  expect(app).toContain("document.querySelector<HTMLElement>('#contenu h1')");
});

test('the phone bar shows « Plus » while hiding the destinations it holds', () => {
  const css = readFileSync(new URL('../src/styles/shell.css', import.meta.url), 'utf8');
  expect(css).toContain('.shell-nav__list > li:not([data-phone]):not(.shell-nav__plus) { display: none; }');
  expect(css).toContain('.shell-nav__list > .shell-nav__plus { display: block; }');
});
