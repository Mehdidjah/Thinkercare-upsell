import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { productSchema } from './schemas.js';

const bel = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../shared/test/fixtures/belnco.json'), 'utf8'));

describe('productSchema and BEL.NCO', () => {
  it('accepts every seeded BEL.NCO row as it is', () => {
    for (const p of bel) expect(productSchema.parse(p)).toEqual(p);
  });
  it('accepts belnco.com and touchelab.com pages only, and known brands only', () => {
    const p = bel[0];
    expect(productSchema.safeParse({ ...p, source: 'https://www.belnco.com/products/x' }).success).toBe(true);
    expect(productSchema.safeParse({ ...p, source: 'https://belnco.com.evil.dz/x' }).success).toBe(false);
    expect(productSchema.safeParse({ ...p, brand: 'shein' }).success).toBe(false);
    expect(productSchema.safeParse({ ...p, excludes: ['Bad Id'] }).success).toBe(false);
  });
});
