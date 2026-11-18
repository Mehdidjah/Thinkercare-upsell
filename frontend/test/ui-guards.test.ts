import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
const commission = readFileSync(new URL('../src/ui/Commission.tsx', import.meta.url), 'utf8');
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
test('Questionnaire says which answers still block "Construire la routine"', () => {
  assert.ok(/import \{[^}]*\bmissingAnswers\b[^}]*\} from '@touche\/domain'/.test(app), 'missingAnswers imported from @touche/domain');
  const question = app.slice(app.indexOf('function Question('));
  assert.ok(question.includes(`<section className="question" id={'question-'+n}>`), 'each Question section gets id="question-<n>"');
  const step1 = app.slice(app.indexOf('{step===1&&<>'), app.indexOf('{step===2&&'));
  const actions = step1.slice(step1.indexOf('<div className="step-actions">'));
  assert.ok(app.includes('missing=missingAnswers(profile,base)'), 'hint is computed from missingAnswers(profile,base)');
  assert.ok(actions.includes('{missing.length>0&&<p className="missing-answers" role="status">Pour construire la routine, répondez à : {missing.map('), 'hint rendered in the step 1 action bar while answers are missing');
  assert.ok(actions.includes('className="missing-link"') && actions.includes('type="button"'), 'each missing answer is a button');
  assert.ok(actions.includes("document.getElementById('question-'+") && actions.includes("scrollIntoView({behavior:'smooth',block:'center'})"), 'clicking scrolls to its question');
  assert.ok(actions.includes('disabled={!questionsReady(profile,base)}'), 'button rule unchanged');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  for (const rule of ['.missing-answers{', '.missing-link{', '.missing-link:focus-visible{']) assert.ok(css.includes(rule), rule);
});
test('Step 3 combines suggested and requested products without bypassing compatibility checks', () => {
  const step2 = app.slice(app.indexOf('{step===2&&base&&<>'), app.indexOf('<aside className="routine-rail">'));
  assert.equal((step2.match(/<section className="product-picker"/g) || []).length, 1);
  assert.ok(!step2.includes('className="recommendations"') && !step2.includes('className="customer-request"'));
  assert.ok(step2.includes('{!blocked&&<section className="product-picker"'), 'only shown when additions are allowed');
  assert.ok(step2.includes('aria-label="Rechercher un produit à ajouter"'), 'one search for both sources');
  assert.ok(step2.includes('>Suggéré<'), 'recommendations are labelled');
  assert.ok(step2.includes('Ingrédients & argumentaire'), 'product details remain accessible');
  assert.ok(step2.includes('Confirmer : la cliente le demande, compatibilité vérifiée') && step2.includes('>Annuler<'), 'requested products retain warning confirmation');
  assert.ok(app.includes('manualAddCheck(activeBase,companions,'), 'checks include every original and added product');
  const rail = app.slice(app.indexOf('<aside className="routine-rail">'));
  assert.ok(rail.includes("requestedIds.includes(p.id)?'DEMANDÉ PAR LA CLIENTE':`COMPLÉMENT ${adds.indexOf(p.id)+1}`"));
  assert.ok(rail.includes('removeComplement(p.id)'));
  assert.ok(app.includes('setRequestedIds(a=>a.filter(x=>x!==id))'));
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  for (const rule of ['.product-picker{', '.request-row{', '.request-row.blocked{', '.request-tag{', '.request-confirm{']) assert.ok(css.includes(rule), rule);
  assert.ok(/\.product-picker [^{}]*:focus-visible\{/.test(css));
});
test('Every catalogue image file exists', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/catalogue.json', import.meta.url), 'utf8'));
  for (const p of catalogue) assert.ok(existsSync(new URL('../public' + p.image, import.meta.url)), p.id);
});
