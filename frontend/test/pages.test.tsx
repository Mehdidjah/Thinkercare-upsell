import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { REVIEW_SITUATIONS, type Product } from '@touche/domain';
import { Catalogue } from '../src/ui/pages/Catalogue';
import { Coverage } from '../src/ui/pages/Coverage';
import { Protocol } from '../src/ui/pages/Protocol';

const products = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/catalogue.json', import.meta.url), 'utf8')) as Product[];
const app = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
const titles = Object.fromEntries([...app.match(/const TITLES[^=]*=\{([^}]+)\}/)![1].matchAll(/(\w+):'([^']+)'/g)].map(m => [m[1], m[2]]));
const catalogue = (search: string, canManage?: boolean) => renderToStaticMarkup(<Catalogue search={search} setSearch={() => {}} scope="Tous" setScope={() => {}} products={products} inScope={() => true} setDetail={() => {}} brand="touche" setBrand={() => {}} canManage={canManage} />);
const coverage = (search: string) => renderToStaticMarkup(<Coverage search={search} setSearch={() => {}} products={products} setDetail={() => {}} brand="touche" setBrand={() => {}} />);
const protocol = renderToStaticMarkup(<Protocol clinical={{ validated: false, by: '', at: '' }} />);
const h1 = (html: string) => html.match(/<h1[^>]*>([^<]+)<\/h1>/)![1];

test('each page’s h1 is the view title; the motto moves to the lead (PN6)', () => {
  expect(h1(catalogue(''))).toBe(titles.catalogue);
  expect(h1(coverage(''))).toBe(titles.coverage);
  expect(h1(protocol)).toBe(titles.protocol);
  expect(protocol).toContain('<p>Précis, utile, proportionné.');
});

test('Catalogue and Parcours search with synonyms and word by word (searchIds)', () => {
  const sun = catalogue('crème solaire');
  expect(sun).not.toContain('Aucune référence ne correspond');
  expect(sun).toMatch(/SPF|solaire/i);
  expect(coverage('shampooing')).not.toContain('Aucun parcours ne correspond');
});

test('Parcours has a result count and an empty state with a reset (PN4)', () => {
  expect(coverage('')).toContain(`>${products.length} parcours</p>`);
  const none = coverage('zzzz introuvable');
  expect(none).toContain('Aucun parcours ne correspond à « zzzz introuvable ».');
  expect(none).toContain('>Réinitialiser la recherche</button>');
  expect(none).toContain(`0 parcours sur ${products.length}`);
});

test('only roles that can open Gestion are told prices are edited there (COPYBONUS)', () => {
  expect(catalogue('')).not.toContain('modifiables dans Gestion');
  expect(catalogue('', true)).toContain('modifiables dans Gestion');
});

test('Protocole: version 3 and the priority situations from REVIEW_SITUATIONS (X9)', () => {
  expect(protocol).toContain('Version 3');
  expect(protocol).toContain('Protocole v3 à valider');
  expect(protocol).not.toMatch(/[Vv]ersion 2|v2 à valider/);
  for (const [, label] of REVIEW_SITUATIONS) expect(protocol).toContain(`<li>${label}</li>`);
});

test('dead code is gone (DEAD)', () => {
  expect(existsSync(new URL('../src/ui/shared/outcomes.ts', import.meta.url))).toBe(false);
});

test('Protocole: the BEL.NCO section and its official source; the catalogue names both brands', () => {
  expect(protocol).toContain('<h2>08. BEL.NCO</h2>');
  expect(protocol).toContain('jamais ensemble dans la même routine');
  expect(protocol).toContain('orienter vers un professionnel de santé');
  expect(protocol).toContain('href="https://belnco.com/collections/all"');
  expect(protocol).toContain('Fiches officielles BEL.NCO');
  // Owner correction: the sizes are read on the labels, so the protocol never says they are missing.
  expect(protocol).not.toContain('Contenances non indiquées');
  expect(protocol.indexOf('<h2>07. Données et validation</h2>')).toBeLessThan(protocol.indexOf('<h2>08. BEL.NCO</h2>'));
  expect(catalogue('')).toContain('les références Touché et BEL.NCO, avec leurs photos officielles');
});

test('Protocol: BEL.NCO double cleansing is the oil then the gel, chosen separately (the ritual left the catalogue)', () => {
  expect(protocol).toContain('Le double nettoyage associe la Centella Cleansing Oil, sur peau sèche, puis le Centella Cleansing Gel, sur peau mouillée.');
  expect(protocol).not.toContain('DOUBLE cleansing ritual');
});
