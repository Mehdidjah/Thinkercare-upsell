import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
test('Dashboard direction guarded in rendering', () => { assert.ok(app.includes("view==='results'&&state.user.role==='admin'")); assert.ok(app.includes("view==='contributions'&&state.user.role==='admin'")); });
test('Own progress mounted on calls and dashboard', () => assert.equal((app.match(/<PersonalProgress /g) || []).length, 2));
test('Every catalogue image file exists', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/catalogue.json', import.meta.url), 'utf8'));
  for (const p of catalogue) assert.ok(existsSync(new URL('../public' + p.image, import.meta.url)), p.id);
});
