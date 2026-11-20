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
test('Apports & primes CSV export names each account role so CM and Call center rows can be told apart', () => {
  const start = commission.indexOf('function exportTable()');
  const exportTable = commission.slice(start, commission.indexOf('\n', start)); // the whole one-line function
  assert.ok(exportTable.includes("'Compte','Rôle','Équipe'"), 'CSV header has a Rôle column right after Compte');
  assert.ok(exportTable.includes('p.label,accountRoleLabel(p.role),p.team'), 'each CSV row writes the role label (Call center, CM, Manager, Direction)');
});
test('Closing the call offers a way back to the answers, and going back keeps the routine', () => {
  // The call-close section lives in call/CallClose.tsx since the call screen was split into components.
  const callClose = ui('call/CallClose.tsx');
  const close = callClose.slice(callClose.indexOf('className="card call-close"'));
  const backButton = close.slice(0, close.indexOf('call-close__outcomes'));
  assert.ok(/!saved&&<button[^>]*className="link-btn"[^>]*disabled=\{busy\}[^>]*onClick=\{\(\)=>toStep\(1\)\}[^>]*><Icon name="back"[^>]*\/>Besoin de la cliente<\/button>/.test(backButton), 'call-close shows a "← Besoin de la cliente" back button while the call is not saved');
  assert.ok(/const changeProfile=\(patch:Partial<Profile>\)=>\{if\(!profileChanges\(profile,patch\)\)return;/.test(app), 'changeProfile ignores taps that do not change an answer, so the added products and ticks survive going back');
  assert.ok(/import \{[^}]*\bprofileChanges\b[^}]*\} from '@touche\/domain'/.test(app), 'profileChanges imported from @touche/domain');
});
test('Account form offers every member role from MEMBER_ROLES', () => {
  const accounts = readFileSync(new URL('../src/ui/AccountManagement.tsx', import.meta.url), 'utf8');
  assert.ok(/import \{[^}]*\bMEMBER_ROLES\b[^}]*\} from '@touche\/domain'/.test(accounts), 'MEMBER_ROLES imported from @touche/domain');
  assert.equal((accounts.match(/MEMBER_ROLES\.map\(/g) || []).length, 2, 'create form and edit dialog both list MEMBER_ROLES');
  assert.ok(!/<option\s+value=["'](advisor|manager)["']/.test(accounts), 'no hard-coded role <option>');
});
test('Questionnaire says which answers still block "Construire la routine"', () => {
  assert.ok(/import \{[^}]*\bmissingAnswers\b[^}]*\} from '@touche\/domain'/.test(app), 'missingAnswers imported from @touche/domain');
  const question = ui('call/Question.tsx').slice(ui('call/Question.tsx').indexOf('function Question('));
  assert.ok(question.includes(`<section className="call-question card" id={'question-'+n} tabIndex={-1}>`), 'each Question section gets id="question-<n>" and can take focus (E6)');
  assert.ok(callView.includes('{step===1&&<StepNeeds/>}'), 'step 1 renders the questionnaire step');
  const step1 = ui('call/StepNeeds.tsx');
  const actions = step1.slice(step1.indexOf('<div className="call-actions">'));
  assert.ok(app.includes('missing=missingAnswers(profile,base)'), 'hint is computed from missingAnswers(profile,base)');
  assert.ok(/const \{[^}]*\bmissing\b[^}]*\}=useCall\(\)/.test(step1), 'step 1 reads that computed hint from the call model');
  // A targeted stop replaces the list of missing answers: they no longer matter (MEDREADY).
  assert.ok(actions.includes(':missing.length>0&&<p className="call-missing" role="status">Pour construire la routine, répondez à : {missing.map('), 'hint rendered in the step 1 action bar while answers are missing');
  assert.ok(actions.includes('className="link-btn call-missing__link"') && actions.includes('type="button"'), 'each missing answer is a button');
  // Clicking scrolls to its question (without smooth scrolling when motion is reduced) and moves focus there (E6).
  assert.ok(actions.includes("reveal(document.getElementById('question-'+"), 'clicking reveals its question');
  const reveal = ui('call/reveal.ts');
  assert.ok(reveal.includes("matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'") && reveal.includes('target.focus({preventScroll:true})'));
  // The questions block the routine, never the targeted check (MEDREADY).
  assert.ok(actions.includes('disabled={!blocked&&!ready}') && step1.includes('ready=questionsReady(profile,base)'), 'button rule');
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
  assert.ok(step2.includes('>Voir la fiche<') && !step2.includes('Ingrédients & argumentaire') && !step2.includes('>Fiche<'), 'product details remain accessible, under one label (F4)');
  assert.ok(step2.includes('Confirmer : la cliente le demande, compatibilité vérifiée') && step2.includes('>Annuler<'), 'requested products retain warning confirmation');
  // Every original and added product is checked; an added row is checked without itself (B5).
  assert.ok(app.includes('manualAddCheck(activeBase!,added?companions.filter(c=>c.id!==p.id):companions,'), 'checks include every original and added product');
  const railFile = ui('call/RoutineRail.tsx');
  const rail = railFile.slice(railFile.indexOf('<aside className="call-rail"'));
  assert.ok(rail.length > 0 && railFile.includes('<aside className="call-rail"'));
  assert.ok(rail.includes("requestedIds.includes(p.id)?'Demandé par la cliente':`Complément ${adds.indexOf(p.id)+1}`"));
  assert.ok(rail.includes('removeComplement(p.id)'));
  // Removing an addition also drops its « Demandé par la cliente » label (the transition lives in call/callState.ts).
  assert.ok(ui('call/callState.ts').includes('requestedIds:d.requestedIds.filter(x=>x!==id)'));
  const css = styles('call.css'), components = styles('components.css');
  for (const rule of ['.call-picker__list {', '.call-product {', '.call-product[data-state="blocked"] {', '.call-product[data-state="check"] {', '.call-product__confirm {']) assert.ok(css.includes(rule), rule);
  assert.ok(components.includes('.tag--warning {'), 'requested products that need a check carry a warning tag');
  assert.ok(/\.call-picker__list:focus-visible \{/.test(css));
});
test('Every catalogue image file exists', () => {
  const catalogue = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/catalogue.json', import.meta.url), 'utf8'));
  for (const p of catalogue) assert.ok(existsSync(new URL('../public' + p.image, import.meta.url)), p.id);
});

test('the order lookup is only requested when the server lists the store of the call’s brand', () => {
  const app = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
  assert.ok(app.includes('requestJson(orderLookupQuery(start.reference,brand))'), 'App asks the API for the order, in the call’s store');
  assert.ok(app.includes('const orderCheckOn=orderCheckEnabled(state?.features,d.brand);'), 'the lookup is behind the store’s feature (order-check, order-check-bel)');
  assert.ok(app.includes('const brand=current().brand,start=startCheck(raw,brand),prev=checkNow();'), 'a reference is read against the call’s brand');
  assert.ok(app.includes('},[d.orderRef,d.brand,orderCheckOn]);'), 'a brand change checks the dossier again');
});

test('a check made for one brand never counts for the other', () => {
  const app = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
  assert.ok(app.includes("const checkNow=():OrderCheck=>checkBrand.current===current().brand?orderCheckRef.current:{reference:'',status:'idle'};"), 'the check on screen counts only for the brand it was made for');
  assert.ok(app.includes('if(current().brand!==brand||'), 'an answer arriving after a brand change is dropped');
  assert.ok(/if\(start\.status!=='checking'\)\{if\(stale\|\|/.test(app) && app.includes("if(stale)setCheck({reference:start.reference,status:'idle'},d.brand);"), 'a brand change drops the other store’s check at once');
  const ready = app.slice(app.indexOf('async function orderReady('), app.indexOf('async function orderReady(') + 300);
  assert.ok(ready.includes('let check=checkNow();'), 'a save never relies on the other store’s check');
});


test('no call moves to a later step without its dossier reference (and, with EcoManager, a known order)', () => {
  const app = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
  const go = app.slice(app.indexOf('async function goStep('), app.indexOf('async function goStep(') + 700);
  assert.ok(app.includes('const toStep=(n:number)=>{void goStep(n);};'), 'every step change goes through goStep');
  assert.ok(go.includes('advanceBlocker(now,n)'), 'a missing reference stops the move');
  assert.ok(go.includes('focusOrderRef()'), 'and takes the adviser to the field');
  assert.ok(/orderCheckOn&&[^;]*await orderReady\(\)/.test(go), 'with EcoManager on, an unknown order stops it too');
});

test('call context fields line up on shared rows', () => {
  const css = readFileSync(new URL('../src/styles/call.css', import.meta.url), 'utf8');
  assert.ok(/\.call-context__grid > label \{[^}]*grid-template-rows: subgrid/.test(css), 'label, control and help share rows');
  assert.ok(/\.call-context__fields \{[^}]*container: call-fields \/ inline-size/.test(css), 'the layout follows the space the fields have');
});
