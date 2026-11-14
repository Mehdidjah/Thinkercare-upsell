import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Product } from '@touche/domain';
import { snapshot } from './catalogue.js';

const all = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../../shared/test/fixtures/catalogue.json'),
    'utf8',
  ),
) as Product[];
const byId = (id: string) => all.find((p) => p.id === id)!;

describe('snapshot', () => {
  it("resolves a pack's components in components order", () => {
    const s = snapshot(byId('packpousse'), all);
    expect(s).toEqual({
      id: 'packpousse',
      name: 'Pack Pousse et Croissance',
      price: 3250,
      quantity: 1,
      category: 'Pack',
      components: [
        {
          id: 'shpousse',
          name: 'Shampooing Pousse et Croissance',
          price: 1900,
          quantity: 1,
          category: 'Shampoing',
        },
        {
          id: 'conditioner',
          name: 'Après-Shampooing Densité',
          price: 1700,
          quantity: 1,
          category: 'Après-shampoing',
        },
      ],
    });
  });
  it('drops unknown component ids', () => {
    const pack: Product = {
      ...byId('packpousse'),
      components: ['inconnu', 'conditioner', 'shpousse'],
    };
    expect(snapshot(pack, all).components!.map((c) => c.id)).toEqual(['conditioner', 'shpousse']);
  });
  it('gives no components for a product that is not a pack', () => {
    const s = snapshot(byId('antiacne'), all);
    expect(s.components).toEqual([]);
    expect(s).toMatchObject({ id: 'antiacne', price: 1800, quantity: 1 });
  });
});
