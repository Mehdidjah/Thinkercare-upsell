import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
const commission = readFileSync(new URL('../src/ui/Commission.tsx', import.meta.url), 'utf8');
test('Dashboard direction guarded in rendering', () => { assert.ok(app.includes("view==='results'&&state.user.role==='admin'")); assert.ok(app.includes("view==='contributions'&&state.user.role==='admin'")); });
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
test('Step 3 lets the adviser add a product the customer asks for, below the suggestions', () => {
  assert.ok(/import \{[^}]*\bmanualAddCheck\b[^}]*\} from '@touche\/domain'/.test(app), 'manualAddCheck imported from @touche/domain');
  const step2 = app.slice(app.indexOf('{step===2&&base&&<>'), app.indexOf('<aside className="routine-rail">'));
  const list = step2.indexOf('<div className="recommendations">');
  const empty = step2.indexOf('Pas d’ajout pertinent dans cette sélection.');
  const section = step2.indexOf('<section className="customer-request"');
  const details = step2.indexOf('<summary>Références à vérification spécifique</summary>');
  assert.ok(list > 0 && empty > list && section > empty && details > section, 'order: suggestions, empty state, customer request, verification details');
  const request = step2.slice(section, details);
  assert.ok(step2.includes('{!blocked&&count<3&&<section className="customer-request"'), 'shown only when no review is required and the routine has room');
  assert.ok(request.includes('<h2>Elle sait déjà ce qu’elle veut ?</h2>'), 'section heading');
  assert.ok(request.includes('Ajoutez le produit qu’elle demande, même s’il n’est pas suggéré. Les règles de sécurité restent appliquées : trois soins maximum, pas de doublon, allergies déclarées.'), 'explanation');
  assert.ok(request.includes('aria-label="Rechercher un produit demandé par la cliente"') && request.includes('placeholder="Rechercher un produit du catalogue…"'), 'own search field');
  assert.ok(request.includes('>Suggéré<'), '"Suggéré" tag on products that are also suggested');
  assert.ok(request.includes('Confirmer : la cliente le demande, compatibilité vérifiée'), 'confirmation button text');
  assert.ok(request.includes('>Annuler<'), 'cancel button');
  assert.ok(app.includes('manualAddCheck(activeBase,companions,'), 'each row is checked against the active base, other original products and additions');
  const rail = app.slice(app.indexOf('<aside className="routine-rail">'));
  assert.ok(rail.includes("requestedIds.includes(p.id)?'DEMANDÉ PAR LA CLIENTE':`COMPLÉMENT ${adds.indexOf(p.id)+1}`"), 'rail labels a requested complement');
  assert.ok(rail.includes('setRequestedIds(a=>a.filter(x=>x!==p.id))'), 'removing it from the routine forgets the request');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  for (const rule of ['.customer-request{', '.request-row{', '.request-row.blocked{', '.request-tag{', '.request-confirm{']) assert.ok(css.includes(rule), rule);
  assert.ok(/\.customer-request [^{}]*:focus-visible\{/.test(css), 'visible focus ring in the section');
});
test('Every catalogue image file exists', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/catalogue.json', import.meta.url), 'utf8'));
  for (const p of catalogue) assert.ok(existsSync(new URL('../public' + p.image, import.meta.url)), p.id);
});
