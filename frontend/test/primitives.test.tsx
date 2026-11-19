import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { Button } from '../src/ui/shared/Button';
import { ChoiceGroup } from '../src/ui/shared/ChoiceGroup';
import { DisabledReason } from '../src/ui/shared/DisabledReason';
import { Dialog } from '../src/ui/shared/Dialog';
import { ConfirmProvider } from '../src/ui/shared/Confirm';
import { NotificationsProvider } from '../src/ui/shell/Notifications';

const options = [{ id: 'oily', label: 'Grasse' }, { id: 'dry', label: 'Sèche', description: 'Tiraillements' }, { id: 'none', label: 'Aucun soin adapté', exclusive: true }];

test('Button: variants, busy and disabled-with-reason stay focusable', () => {
  expect(renderToStaticMarkup(<Button variant="primary" onClick={() => {}}>Comprendre le besoin</Button>))
    .toBe('<button type="button" class="btn btn--primary">Comprendre le besoin</button>');
  expect(renderToStaticMarkup(<Button variant="secondary" size="sm" block onClick={() => {}}>Copier</Button>)).toContain('class="btn btn--secondary btn--sm btn--block"');
  const busy = renderToStaticMarkup(<Button busy busyLabel="Enregistrement…" onClick={() => {}}>Enregistrer</Button>);
  expect(busy).toContain('aria-busy="true"');
  expect(busy).toContain('Enregistrement…');
  const blocked = renderToStaticMarkup(<Button reasonId="why" blocked onClick={() => {}}>Enregistrer le duo accepté</Button>);
  expect(blocked).toContain('aria-disabled="true"');
  expect(blocked).toContain('aria-describedby="why"');
  expect(blocked).not.toContain(' disabled=""');
  expect(blocked).toContain('<svg'); // lock icon
});

test('DisabledReason lists what is missing and what is done', () => {
  const html = renderToStaticMarkup(<DisabledReason id="why" title="Pour enregistrer l’accord :" items={[{ label: 'Offre présentée', done: true }, { label: 'Cochez « Accord de la cliente »', done: false }]} />);
  expect(html).toContain('id="why"');
  expect(html).toContain('class="reason"');
  expect(html).toContain('data-done="true"');
  expect(html).toContain('data-done="false"');
  expect(html).toContain('Pour enregistrer l’accord :');
});

test('ChoiceGroup: single choice is a radio group, multiple choice uses checkboxes', () => {
  const single = renderToStaticMarkup(<ChoiceGroup kind="single" name="skin" legend="Quel est votre type de peau ?" options={options} value="dry" onChange={() => {}} />);
  expect(single).toMatch(/^<fieldset class="choice-group" data-kind="single"/);
  expect(single).toContain('<legend class="choice-group__legend">Quel est votre type de peau ?</legend>');
  expect((single.match(/type="radio"/g) || []).length).toBe(3);
  expect((single.match(/checked=""/g) || []).length).toBe(1);
  expect(single).toContain('Un seul choix');
  const multi = renderToStaticMarkup(<ChoiceGroup kind="multi" name="routine" legend="Ce qu’elle utilise déjà" options={options} value={['oily']} onChange={() => {}} />);
  expect((multi.match(/type="checkbox"/g) || []).length).toBe(3);
  expect(multi).toContain('Plusieurs choix possibles');
  expect(multi).toContain('data-exclusive="true"');
  expect(multi).toContain('<p class="choice-group__status" role="status" aria-live="polite"></p>');
});

test('Dialog renders a native dialog named by its title', () => {
  const html = renderToStaticMarkup(<Dialog open onClose={() => {}} labelledBy="t"><h2 id="t">Titre</h2></Dialog>);
  expect(html).toMatch(/^<dialog class="dialog dialog--dialog" aria-labelledby="t"/);
  expect(html).toContain('<div class="dialog__frame"><h2 id="t">Titre</h2></div>');
});

test('Notifications mount one polite region and one alert region before any message', () => {
  const html = renderToStaticMarkup(<NotificationsProvider><ConfirmProvider><p>App</p></ConfirmProvider></NotificationsProvider>);
  expect(html).toContain('<section class="toast-region" aria-label="Notifications">');
  expect(html).toContain('<div class="toast-stack" role="status" aria-live="polite"></div>');
  expect(html).toContain('<div class="toast-stack" role="alert"></div>');
  expect(html).toContain('<p class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>');
});

function sources(dir: URL): [string, string][] {
  return readdirSync(dir).flatMap(name => {
    const url = new URL(name, dir);
    return statSync(url).isDirectory() ? sources(new URL(name + '/', dir)) : /\.tsx?$/.test(name) ? [[url.pathname, readFileSync(url, 'utf8')] as [string, string]] : [];
  });
}
const all = sources(new URL('../src/', import.meta.url));

test('no window.confirm, no hand-made modal backdrop, no second toast component', () => {
  for (const [path, text] of all) {
    expect(/(^|[^.\w])confirm\(\s*['"`]/.test(text), path + ' calls window.confirm').toBe(false);
    expect(text.includes('modal-backdrop'), path + ' uses modal-backdrop').toBe(false);
    if (!path.endsWith('/shared/Dialog.tsx')) expect(/<dialog[\s>]/.test(text), path + ' renders <dialog> outside Dialog.tsx').toBe(false);
    expect(/role="dialog"/.test(text), path + ' fakes a dialog').toBe(false);
  }
  expect(existsSync(new URL('../src/ui/shell/Toast.tsx', import.meta.url))).toBe(false);
});

test('the notification and confirmation providers wrap the app once', () => {
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  expect(main).toContain('<NotificationsProvider><ConfirmProvider><Desk /></ConfirmProvider></NotificationsProvider>');
  expect(all.filter(([, t]) => t.includes('<NotificationsProvider>')).length).toBe(1);
});
