import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

// The design system's token-only rule (DESIGN-SYSTEM.md §4.5): raw values live in tokens.css only.
const dir = new URL('../src/styles/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.css') && f !== 'tokens.css' && f !== 'index.css');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const banned: [RegExp, string][] = [
  [/#[0-9a-fA-F]{3,8}\b/, 'raw hex colour (or id selector)'],
  [/\b(rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(/, 'raw colour function'],
  [/font-family\s*:(?!\s*(var\(--font-sans\)|inherit)\s*;)/, 'font-family outside tokens'],
  [/font-size\s*:\s*[\d.]/, 'literal font-size'],
  [/font-weight\s*:\s*\d/, 'literal font-weight'],
  [/(box-shadow|border-radius|z-index)\s*:[ \t]*(?![ \t]|var\(|0\b|none\b|inherit\b|inset 0 0 0 1px var\(|inset \d+px 0 0 var\()[^;]+;/, 'literal shadow/radius/z-index'],
  [/transition(-property)?\s*:\s*all\b/, 'transition: all'],
  [/outline\s*:\s*(none|0)\b/, 'outline removed'],
  [/!important/, '!important'],
  [/@import\s+url\(\s*["']?https?:/, 'remote @import'],
];

test('the styles folder holds every file of the system, in cascade order', () => {
  const index = readFileSync(new URL('index.css', dir), 'utf8');
  const order = ['tokens', 'base', 'components', 'shell', 'login', 'call', 'catalogue', 'pilotage', 'admin'];
  const imports = [...index.matchAll(/@import\s+"\.\/([a-z]+)\.css";/g)].map(m => m[1]);
  assert.deepEqual(imports, order);
  assert.match(index, /^@layer tokens, base, components, shell, areas, utilities;/m);
  for (const name of order) assert.ok(existsSync(new URL(name + '.css', dir)), name);
  assert.ok(!existsSync(new URL('../src/styles.css', import.meta.url)), 'the old minified stylesheet is gone');
  assert.ok(readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8').includes("import './styles/index.css';"));
});

for (const file of files) test(`${file} uses tokens only`, () => {
  const css = strip(readFileSync(new URL(file, dir), 'utf8'));
  const allowImportant = file === 'base.css'; // .sr-only and [hidden] only
  for (const [re, why] of banned) {
    if (allowImportant && why === '!important') continue;
    assert.ok(!re.test(css), `${file}: ${why}: ${css.match(re)?.[0]}`);
  }
});

test('each file wraps its rules in its own cascade layer', () => {
  const layers: Record<string, string> = { 'tokens.css': 'tokens', 'base.css': 'base', 'components.css': 'components', 'shell.css': 'shell' };
  for (const file of [...files, 'tokens.css']) {
    const css = strip(readFileSync(new URL(file, dir), 'utf8')).trim();
    assert.ok(css.startsWith(`@layer ${layers[file] ?? 'areas'} {`), file);
  }
});

test('no type token is below 12px and only weights 400 and 600 exist', () => {
  const tokens = readFileSync(new URL('tokens.css', dir), 'utf8');
  for (const [, rem] of tokens.matchAll(/--text-[a-z-]+:\s*([\d.]+)rem/g)) assert.ok(Number(rem) >= 0.75, `token ${rem}rem < 12px`);
  const weights = [...tokens.matchAll(/--font-weight-[a-z]+:\s*(\d+)/g)].map(m => Number(m[1]));
  assert.deepEqual([...new Set(weights)].sort(), [400, 600]);
});

test('no font size is set inside a media query except touch inputs', () => {
  for (const file of files) {
    const css = strip(readFileSync(new URL(file, dir), 'utf8'));
    for (const block of css.matchAll(/@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)) {
      for (const rule of block[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/font-size/.test(rule[2])) continue;
        assert.match(rule[2], /font-size\s*:\s*var\(--text-input-touch\)/, `${file}: ${rule[1].trim()} changes text size in a media query`);
      }
    }
  }
});

test('the old uppercase micro labels are gone from the UI', () => {
  const walk = (url: URL): string[] => readdirSync(url, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(new URL(e.name + '/', url)) : e.name.endsWith('.tsx') ? [readFileSync(new URL(e.name, url), 'utf8')] : []);
  const sources = walk(new URL('../src/', import.meta.url)).join('\n');
  assert.ok(!/className="micro"/.test(sources), 'className="micro"');
  assert.ok(!/className="small-badge"/.test(sources), 'className="small-badge"');
});
