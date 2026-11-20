import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tcProducts } from '../src/db/schema.js';
import { type TestContext, createTestApp } from './support/context.js';
import { resetDatabase, seedBelnco } from './support/database.js';
import { deskGet, deskPost } from './support/desk.js';
import { createUser, loginCookie } from './support/users.js';

// BEL.NCO as a second brand (docs/superpowers/specs/2026-11-20-belnco-brand-design.md): the database holds both
// catalogues, as it will once migration 0007 has run.
const PASSWORD = 'mot-de-passe-solide-2026';
const load = (file: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../../shared/test/fixtures', file), 'utf8')) as Array<
    Record<string, unknown> & { id: string }
  >;

let ctx: TestContext;
let admin: string;
let lina: string;
let linaUser: Awaited<ReturnType<typeof createUser>>;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedBelnco(ctx.db);
  await createUser(ctx.db, { username: 'direction', password: PASSWORD, role: 'admin' });
  linaUser = await createUser(ctx.db, { username: 'conseil.lina', password: PASSWORD, role: 'advisor', team: 'Alger' });
  admin = await loginCookie(ctx, 'direction', PASSWORD);
  lina = await loginCookie(ctx, 'conseil.lina', PASSWORD);
});

const touche = load('catalogue.json'), bel = load('belnco.json');
describe('bootstrap by desk', () => {
  it('only a desk announcing X-Desk-Brands gets the BEL.NCO rows', async () => {
    const old = await deskGet(ctx, '?compact=1', lina);
    expect(old.body.products.map((p: { id: string }) => p.id)).toEqual(touche.map((p) => p.id));
    const now = await deskGet(ctx, '?compact=1', lina, { 'X-Desk-Brands': '1' });
    expect(now.body.products.map((p: { id: string }) => p.id)).toEqual([...touche, ...bel].map((p) => p.id));
  });
  it('the login bootstrap follows the same header', async () => {
    const login = { action: 'login', username: 'conseil.lina', password: PASSWORD, bootstrap: true };
    const res = await deskPost(ctx, login, { headers: { 'X-Desk-Brands': '1' } });
    expect(res.body.bootstrap.products).toHaveLength(42);
    const old = await deskPost(ctx, login);
    expect(old.body.bootstrap.products.map((p: { id: string }) => p.id)).toEqual(touche.map((p) => p.id));
  });
  it('Gestion saves a BEL.NCO product with its brand, rules and belnco.com source', async () => {
    const product = { ...bel.find((p) => p.id === 'bel-retinol')!, price: 2000 };
    expect((await deskPost(ctx, { action: 'product', product }, { cookie: admin })).status).toBe(200);
    const [row] = await ctx.db.select().from(tcProducts).where(eq(tcProducts.id, 'bel-retinol'));
    expect(row!.data).toEqual(product);
  });
});
