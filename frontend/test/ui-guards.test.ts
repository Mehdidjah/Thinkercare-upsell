import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const ui = (path: string) => readFileSync(new URL('../src/ui/' + path, import.meta.url), 'utf8');
const styles = (file: string) => readFileSync(new URL('../src/styles/' + file, import.meta.url), 'utf8');
const app = ui('App.tsx');
const commission = ui('Commission.tsx');
const callView = ui('call/CallView.tsx');
test('Dashboard direction guarded in rendering', () => { assert.ok(app.includes("view==='results'&&canManageWorkspace(state.user)")); assert.ok(app.includes("view==='contributions'&&canManageWorkspace(state.user)")); });
test('Own progress mounted on calls and dashboard', () => assert.equal((app.match(/<PersonalProgress /g) || []).length, 2));
test('Both upsell-rule footnotes count added products and cover an initial pack of 2', () => {
  const card = commission.slice(commission.indexOf('export function ProgressCard'), commission.indexOf('export function PersonalProgress'));
  const dashboard = commission.slice(commission.indexOf('export function ContributionDashboard'));
  for (const [name, part] of [['Ma progression', card], ['Apports & primes', dashboard]]) {
    assert.ok(part.includes('Chaque produit ajouté à la commande initiale'), name);
    assert.ok(part.includes('pack de 2'), name);
  }
});
test('Apports & primes treats CM accounts like call-center accounts', () => {
  assert.ok(/import \{[^}]*\bisFrontline\b[^}]*\} from '@touche\/domain'/.test(commission), 'isFrontline imported from @touche/domain');
  const dashboard = commission.slice(commission.indexOf('export function ContributionDashboard'));
  // Estimated monthly total, CSV prime column, account caption and prime cell each ask isFrontline(p.role).
  assert.ok((dashboard.match(/isFrontline\(p\.role\)/g) || []).length >= 4, 'isFrontline(p.role) in all four prime sites');
  assert.ok(!/role\s*===\s*'advisor'\s*\?\s*\(\s*p\.monthly\.bonus/.test(dashboard), "estimated total must not sum advisors only (p.role==='advisor'?(p.monthly.bonus…)");
  assert.ok(!/role\s*!==\s*'advisor'\s*\?\s*'Non concerné'/.test(dashboard), "prime column and cell must not mark CMs 'Non concerné' (p.role!=='advisor'?'Non concerné'…)");
  assert.ok(!/role\s*!==\s*'advisor'\s*\?\s*'Compte '/.test(dashboard), "account caption must not hide a CM's bonus progress (p.role!=='advisor'?'Compte '…)");
});
test('Account form offers every member role from MEMBER_ROLES', () => {
  const accounts = ui('AccountManagement.tsx');
  assert.ok(/import \{[^}]*\bMEMBER_ROLES\b[^}]*\} from '@touche\/domain'/.test(accounts), 'MEMBER_ROLES imported from @touche/domain');
  assert.equal((accounts.match(/MEMBER_ROLES\.map\(/g) || []).length, 2, 'create form and edit dialog both list MEMBER_ROLES');
  assert.ok(!/<option\s+value=["'](advisor|manager)["']/.test(accounts), 'no hard-coded role <option>');
});
test('Questionnaire says which answers still block "Construire la routine"', () => {
  assert.ok(/import \{[^}]*\bmissingAnswers\b[^}]*\} from '@touche\/domain'/.test(app), 'missingAnswers imported from @touche/domain');
  const question = ui('call/Question.tsx').slice(ui('call/Question.tsx').indexOf('function Question('));
  assert.ok(question.includes(`<section className="call-question card" id={'question-'+n}>`), 'each Question section gets id="question-<n>"');
  assert.ok(callView.includes('{step===1&&<StepNeeds/>}'), 'step 1 renders the questionnaire step');
  const step1 = ui('call/StepNeeds.tsx');
  const actions = step1.slice(step1.indexOf('<div className="call-actions">'));
  assert.ok(app.includes('missing=missingAnswers(profile,base)'), 'hint is computed from missingAnswers(profile,base)');
  assert.ok(/const \{[^}]*\bmissing\b[^}]*\}=useCall\(\)/.test(step1), 'step 1 reads that computed hint from the call model');
  assert.ok(actions.includes('{missing.length>0&&<p className="call-missing" role="status">Pour construire la routine, répondez à : {missing.map('), 'hint rendered in the step 1 action bar while answers are missing');
  assert.ok(actions.includes('className="link-btn call-missing__link"') && actions.includes('type="button"'), 'each missing answer is a button');
  assert.ok(actions.includes("document.getElementById('question-'+") && actions.includes("scrollIntoView({behavior:'smooth',block:'center'})"), 'clicking scrolls to its question');
  assert.ok(actions.includes('disabled={!questionsReady(profile,base)}'), 'button rule unchanged');
  const css = styles('call.css');
  for (const rule of ['.call-missing {', '.call-missing__link {', '.call-missing__link:focus-visible {']) assert.ok(css.includes(rule), rule);
});
test('Step 3 combines suggested and requested products without bypassing compatibility checks', () => {
  assert.ok(callView.includes('{step===2&&base&&<StepRoutine base={base}/>}'), 'step 3 renders the routine step');
  const routine = ui('call/StepRoutine.tsx');
  // Step 3 = the routine step plus every call component it imports (the rail is separate, as before).
  const parts = [...routine.matchAll(/from '\.\/(\w+)'/g)].map((m) => m[1]).filter((name) => name !== 'callModel');
  const step2 = [routine, ...parts.map((name) => ui('call/' + name + '.tsx'))].join('\n');
  assert.equal((step2.match(/<section className="card call-picker"/g) || []).length, 1);
  assert.equal((routine.match(/<ProductPicker\b/g) || []).length, 1);
  assert.ok(!step2.includes('className="recommendations"') && !step2.includes('className="customer-request"'));
  assert.ok(routine.includes('{!blocked&&<ProductPicker/>}') && ui('call/ProductPicker.tsx').includes('return <section className="card call-picker"'), 'only shown when additions are allowed');
  assert.ok(step2.includes('aria-label="Rechercher un produit à ajouter"'), 'one search for both sources');
  assert.ok(step2.includes('>Suggéré<'), 'recommendations are labelled');
  assert.ok(step2.includes('Ingrédients & argumentaire'), 'product details remain accessible');
  assert.ok(step2.includes('Confirmer : la cliente le demande, compatibilité vérifiée') && step2.includes('>Annuler<'), 'requested products retain warning confirmation');
  assert.ok(app.includes('manualAddCheck(activeBase,companions,'), 'checks include every original and added product');
  const railFile = ui('call/RoutineRail.tsx');
  const rail = railFile.slice(railFile.indexOf('<aside className="call-rail"'));
  assert.ok(rail.length > 0 && railFile.includes('<aside className="call-rail"'));
  assert.ok(rail.includes("requestedIds.includes(p.id)?'Demandé par la cliente':`Complément ${adds.indexOf(p.id)+1}`"));
  assert.ok(rail.includes('removeComplement(p.id)'));
  assert.ok(app.includes('setRequestedIds(a=>a.filter(x=>x!==id))'));
  const css = styles('call.css'), components = styles('components.css');
  for (const rule of ['.call-picker__list {', '.call-product {', '.call-product[data-state="blocked"] {', '.call-product[data-state="check"] {', '.call-product__confirm {']) assert.ok(css.includes(rule), rule);
  assert.ok(components.includes('.tag--warning {'), 'requested products that need a check carry a warning tag');
  assert.ok(/\.call-picker__list:focus-visible \{/.test(css));
});
test('Every catalogue image file exists', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/catalogue.json', import.meta.url), 'utf8'));
  for (const p of catalogue) assert.ok(existsSync(new URL('../public' + p.image, import.meta.url)), p.id);
});
