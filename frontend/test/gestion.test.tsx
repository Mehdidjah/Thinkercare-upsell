import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { type Product } from '@touche/domain';
import AccountManagement, { CreatedAccess, unsavedChanges } from '../src/ui/AccountManagement';
import { Admin } from '../src/ui/pages/Admin';
import { type State } from '../src/ui/shared/types';

const ui = (path: string) => readFileSync(new URL('../src/ui/' + path, import.meta.url), 'utf8');
const manager = { id: 'm', username: 'manager', label: 'Manager Test', role: 'manager' };
const product = (id: string, name: string, category: string): Product => ({ id, name, short: name, category, domain: 'face', components: [], price: 1500, image: '', source: '', description: '', concerns: [], skins: [], active: false, size: '', enabled: true, recommendable: true, review: 'ok' } as unknown as Product);
const state = { user: manager, users: [manager], products: [product('spf', 'Sérum SPF 50', 'Protection solaire'), product('shp', 'Shampoing doux', 'Shampoing')], calls: [], clinical: { validated: false, by: '', at: '' } } as unknown as State;

test('the identifier pattern is valid under the v flag and its hint is linked (E5)', () => {
  const html = renderToStaticMarkup(<AccountManagement user={manager} users={[manager]} passwordViewingEnabled reload={async () => {}} notify={() => {}} />);
  const pattern = html.match(/pattern="([^"]+)"/)![1];
  const re = new RegExp('^(?:' + pattern + ')$', 'v');
  expect(re.test('conseil.lina')).toBe(true);
  expect(re.test('conseil-lina_2')).toBe(true);
  expect(re.test('Lina')).toBe(false);
  const hint = html.match(/aria-describedby="([^"]+)"/)![1];
  expect(html).toContain(`<small id="${hint}" class="field__help">3 à 40 caractères`);
});

test('Gestion has a section index and a catalogue search built on searchIds (F2)', () => {
  const html = renderToStaticMarkup(<Admin state={state} reload={async () => {}} notify={() => {}} />);
  expect(html).toContain('aria-label="Sections de Gestion"');
  for (const [id, label] of [['admin-catalogue-title', 'Catalogue'], ['admin-protocol-title', 'Protocole'], ['admin-accounts-title', 'Accès']]) {
    expect(html).toContain(`<a href="#${id}">${label}</a>`);
    expect(html).toContain(`id="${id}"`);
  }
  expect(html).toContain('<span class="sr-only">Rechercher dans le catalogue</span>');
  expect(html).toContain('2 produits');
  expect(ui('pages/Admin.tsx')).toContain('const ids=searchIds(state.products,query)');
});

test('product dialog errors stay inside the dialog and unsaved edits ask before closing (PN3, PN8)', () => {
  const admin = ui('pages/Admin.tsx');
  expect(admin).toContain('{editError&&<p className="notice notice--danger admin-dialog__error" role="alert">');
  expect(admin).toMatch(/async function saveProduct\(event:FormEvent\)\{[^]*?catch\(e\)\{setEditError\(/);
  expect(admin).toContain("JSON.stringify(edit)!==original&&!(await confirm({title:'Abandonner les modifications ?'");
  expect((admin.match(/void closeEdit\(\)/g) || []).length).toBe(3); // Escape, ✕ and « Annuler »
  const accounts = ui('AccountManagement.tsx');
  expect(accounts).toContain("(accessDirty || passwordDraft) && !(await confirm({ title: 'Abandonner les modifications ?'");
  expect(accounts).toContain('body: <p>{unsavedChanges(account.label, accessDirty, passwordDraft)}</p>,');
  expect((accounts.match(/void closeAccount\(\)/g) || []).length).toBe(2); // Escape and ✕
  expect(ui('AccountPassword.tsx')).toContain("onDraft?.(replacement !== '')");
});

test('a new account shows its identifier and password once, with « Copier » (F2)', () => {
  const accounts = ui('AccountManagement.tsx');
  expect(accounts).toContain('setCreated({ label, username, password });');
  expect(accounts).toContain('<Icon name="copy"/>Copier</button>');
  expect(accounts).toContain('ils ne seront plus affichés ici.');
});

test('the discard question names what is unsaved: the access, the new password or both (pages-4)', () => {
  expect(unsavedChanges('Lina', true, false)).toBe('Les modifications de l’accès de Lina ne sont pas enregistrées.');
  expect(unsavedChanges('Lina', false, true)).toBe('Le nouveau mot de passe de Lina n’est pas enregistré.');
  expect(unsavedChanges('Lina', true, true)).toBe('Les modifications de l’accès et le nouveau mot de passe de Lina ne sont pas enregistrés.');
});

test('saving the access with a new password typed says so inside the dialog, not in a toast behind it (pages-4)', () => {
  const accounts = ui('AccountManagement.tsx');
  expect(accounts).toContain("if (draftRef.current) setAccessSaved(true);\n          else { setAccount(null); notify('Accès et équipe mis à jour.'); }");
  expect(accounts).toContain("{accessSaved && accessOf(account) === opened && <p className=\"notice notice--success\" role=\"status\">");
  expect(accounts).toContain("Accès et équipe mis à jour.{passwordDraft ? ' Le nouveau mot de passe n’est pas encore enregistré.' : ''}");
  // Reopening the dialog or closing it forgets the notice.
  expect(accounts).toContain('setPasswordDraft(false); setAccessSaved(false); setOpened(accessOf(target));');
  expect(accounts).toContain('setAccount(null); setError(\'\'); setPasswordDraft(false); setAccessSaved(false);');
});

test('a new account’s identifier and password stay out of every live region, for 5 minutes at most (pages-2)', () => {
  const html = renderToStaticMarkup(<CreatedAccess created={{ label: 'Lina', username: 'conseil.lina', password: 'S3cret-xyz' }} copied="Identifiant et mot de passe copiés." passwordViewingEnabled onCopy={() => {}} onHide={() => {}} />);
  expect(html).toContain('<dd>conseil.lina</dd>');
  expect(html).toContain('<dd>S3cret-xyz</dd>');
  expect(html).not.toMatch(/role="(status|alert|log)"|aria-live/);
  const accounts = ui('AccountManagement.tsx');
  expect(accounts).toContain("announce('Compte créé : identifiant et mot de passe affichés une fois');");
  expect(accounts).not.toMatch(/admin-created"[^>]*role=/);
  expect(accounts).toContain('window.setTimeout(() => setCreated(null), 5 * 60_000)');
  expect(accounts).toContain("useEffect(() => () => { setCreated(null); setCopied(''); }, []);");
});
