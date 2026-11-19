import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

// Brand rule (DESIGN-SYSTEM.md §1.1): the platform is ThinkerCare. « Touché » only names the products.
const root = new URL('../../', import.meta.url);
function files(dir: string): string[] {
  const base = new URL(dir, root);
  return readdirSync(base).flatMap(name => {
    const path = dir + name;
    return statSync(new URL(path, root)).isDirectory() ? files(path + '/') : /\.(tsx?|html|css)$/.test(name) ? [path] : [];
  });
}
const sources = [...files('frontend/src/'), 'frontend/index.html', ...files('backend/src/common/')];
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

test('the platform is never called Touché Conseil', () => {
  for (const path of sources) {
    const text = read(path);
    for (const banned of ['Touché Conseil', 'TOUCHÉ CONSEIL', 'Touche_', '>touché<', 'touche-og.jpg']) assert.ok(!text.includes(banned), `${path} contains ${banned}`);
  }
});

test('the page title, meta and health endpoint name ThinkerCare', () => {
  const html = read('frontend/index.html');
  assert.match(html, /<title>ThinkerCare<\/title>/);
  assert.match(html, /<meta property="og:title" content="ThinkerCare" \/>/);
  assert.ok(read('backend/src/desk/desk.controller.ts').includes("app: 'ThinkerCare'"));
  assert.ok(read('backend/src/common/pages.ts').includes('<title>ThinkerCare</title>'));
});

test('every export file name starts with ThinkerCare_', () => {
  const ui = read('frontend/src/ui/Analytics.tsx') + read('frontend/src/ui/Commission.tsx');
  const names = [...ui.matchAll(/(?:download\(|a\.download=)[`']([A-Za-z]+)_/g)].map(m => m[1]);
  assert.ok(names.length >= 5, 'export names found');
  for (const name of names) assert.equal(name, 'ThinkerCare');
});

test('Touché still names the products and their official sources', () => {
  assert.ok(read('frontend/src/ui/shared/ProductFacts.tsx').includes('Source officielle Touché'));
  assert.ok(read('frontend/src/ui/pages/Protocol.tsx').includes('Fiches officielles Touché'));
});

test('the wordmark is the shared component everywhere it appears', () => {
  for (const path of ['frontend/src/ErrorBoundary.tsx', 'frontend/src/ui/App.tsx', 'frontend/src/ui/shell/Login.tsx', 'frontend/src/ui/shell/Sidebar.tsx', 'frontend/src/ui/shell/Topbar.tsx'])
    assert.ok(read(path).includes('<Wordmark'), path);
  assert.ok(read('frontend/src/ui/shared/Wordmark.tsx').includes('<span className="wordmark__thinker">Thinker</span><span className="wordmark__care">Care</span>'));
});
