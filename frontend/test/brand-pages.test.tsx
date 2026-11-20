import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { type Brand, type Product } from '@touche/domain';
import { Catalogue } from '../src/ui/pages/Catalogue';
import { Coverage } from '../src/ui/pages/Coverage';
import { Admin } from '../src/ui/pages/Admin';
import { type State } from '../src/ui/shared/types';

const load = (f: string) => JSON.parse(readFileSync(new URL('../../shared/test/fixtures/' + f, import.meta.url), 'utf8')) as Product[];
const touche = load('catalogue.json'), bel = load('belnco.json'), all = [...touche, ...bel];
const noop = () => {};
const catalogue = (products: Product[], brand: Brand) => renderToStaticMarkup(<Catalogue search="" setSearch={noop} scope="Tous" setScope={noop} products={products} inScope={() => true} setDetail={noop} brand={brand} setBrand={noop}/>);
const coverage = (products: Product[], brand: Brand) => renderToStaticMarkup(<Coverage search="" setSearch={noop} products={products} setDetail={noop} brand={brand} setBrand={noop}/>);
const pressed = (html: string) => html.match(/aria-pressed="true"[^>]*>(Touché|BEL\.NCO)</)?.[1];

test('Catalogue: « Marque » switches between the Touché and the BEL.NCO products', () => {
  const t = catalogue(all, 'touche'), b = catalogue(all, 'belnco');
  expect(t).toContain('role="group" aria-label="Marque"');
  expect([pressed(t), pressed(b)]).toEqual(['Touché', 'BEL.NCO']);
  expect(b).toContain('RETINOL COMPLEX SERUM');
  expect(b).not.toContain(`>${touche[0].name}<`);
  expect(b).toContain(`${bel.length} références`);
  expect(t).toContain(`>${touche[0].name}<`);
  expect(t).not.toContain('RETINOL COMPLEX SERUM');
  expect(t).toContain(`${touche.length} références`);
  // One brand only (an API without BEL.NCO): no switch, every product shown.
  expect(catalogue(touche, 'touche')).not.toContain('aria-label="Marque"');
});

test('Parcours produits: the same switch, each path within its brand', () => {
  const b = coverage(all, 'belnco'), t = coverage(all, 'touche');
  expect(pressed(b)).toBe('BEL.NCO');
  expect(b).toContain(`${bel.length} parcours`);
  expect(b).not.toContain(`>${touche[0].short}<`);
  expect(t).toContain(`${touche.length} parcours`);
  expect(coverage(touche, 'touche')).not.toContain('aria-label="Marque"');
});

test('Gestion: the catalogue table opens on Touché with a « Marque » switch, and a new product takes the brand shown', () => {
  const manager = { id: 'm', username: 'manager', label: 'Manager Test', role: 'manager' };
  const state = { user: manager, users: [manager], products: all, calls: [], clinical: { validated: false, by: '', at: '' } } as unknown as State;
  const html = renderToStaticMarkup(<Admin state={state} reload={async () => {}} notify={noop}/>);
  expect(html).toContain('role="group" aria-label="Marque"');
  expect(pressed(html)).toBe('Touché');
  expect(html).toContain(`${touche.length} produits`);
  expect(html).not.toContain('Modifier RETINOL COMPLEX SERUM');
  const admin = readFileSync(new URL('../src/ui/pages/Admin.tsx', import.meta.url), 'utf8');
  expect(admin).toMatch(/function newProduct\(\)\{open\(\{[^}]*\.\.\.\(brandView==='belnco'\?\{brand:'belnco'\}:\{\}\)/);
});
