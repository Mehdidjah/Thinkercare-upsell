import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tcProposals } from '../src/db/schema.js';
import type { DeskUser } from '../src/desk/desk.types.js';
import { insertCall } from './support/calls.js';
import { type TestContext, createTestApp } from './support/context.js';
import { resetDatabase } from './support/database.js';
import { deskGet } from './support/desk.js';
import { createUser, loginCookie } from './support/users.js';

const PASSWORD = 'mot-de-passe-solide-2026';
let ctx: TestContext;
let admin: string;
let lina: string;
let linaUser: DeskUser;
let saraUser: DeskUser;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx.db);
  await createUser(ctx.db, {
    username: 'direction',
    password: PASSWORD,
    role: 'admin',
  });
  linaUser = await createUser(ctx.db, {
    username: 'conseil.lina',
    password: PASSWORD,
    role: 'advisor',
  });
  saraUser = await createUser(ctx.db, {
    username: 'conseil.sara',
    password: PASSWORD,
    role: 'advisor',
  });
  admin = await loginCookie(ctx, 'direction', PASSWORD);
  lina = await loginCookie(ctx, 'conseil.lina', PASSWORD);
});

const day = '&from=2026-11-14&to=2026-11-14';

describe('pilotage analytics', () => {
  it('an adviser gets 403 even for their own data', async () => {
    const res = await deskGet(
      ctx,
      `?action=analytics${day}&operator=${linaUser.id}`,
      lina,
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'Le pilotage est réservé à la direction.',
    });
  });

  it('a period over 366 days is 400', async () => {
    const res = await deskGet(
      ctx,
      '?action=analytics&from=2026-01-01&to=2027-01-02',
      admin,
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Choisissez une période valide de 366 jours maximum.',
    });
  });

  it('period uses Algiers days: 23:30Z on 13 Nov belongs to 14 Nov', async () => {
    const id = await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: new Date('2026-11-13T23:30:00Z'),
    });
    const in14 = await deskGet(
      ctx,
      '?action=analytics&from=2026-11-14&to=2026-11-14',
      admin,
    );
    expect(in14.body.calls.map((c: { id: string }) => c.id)).toEqual([id]);
    const in13 = await deskGet(
      ctx,
      '?action=analytics&from=2026-11-13&to=2026-11-13',
      admin,
    );
    expect(in13.body.calls).toEqual([]);
  });

  it('calls keep the D1 row shape', async () => {
    const withMeta = await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: new Date('2026-11-14T10:00:00Z'),
      order_ref: 'A1',
    });
    const noMeta = await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: new Date('2026-11-14T09:00:00Z'),
      order_ref: null,
    });
    const res = await deskGet(ctx, `?action=analytics${day}`, admin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      timeZone: 'Africa/Algiers',
      source: 'manual',
      schemaVersion: 3,
      from: '2026-11-14',
      to: '2026-11-14',
      nextCursor: null,
    });
    const [a, b] = res.body.calls;
    expect(a.id).toBe(withMeta);
    expect(Object.keys(a).sort()).toEqual(
      [
        'id',
        'user_id',
        'operator',
        'created_at',
        'outcome',
        'base_id',
        'products',
        'catalogue_total',
        'base_total',
        'offered_total',
        'delivery',
        'tier',
        'extra',
        'refusal',
        'pilot',
        'callback_done',
        'meta',
        'proposals',
        'voided_at',
        'voided_by',
        'voided_by_label',
        'void_reason',
      ].sort(),
    );
    expect(a).toMatchObject({ voided_at: null, voided_by: null, voided_by_label: null, void_reason: null });
    expect(a.created_at.endsWith('Z')).toBe(true);
    expect(a.callback_done).toBe(0);
    expect(a.meta).toEqual({
      version: 3,
      orderRef: 'A1',
      customerStage: 'new',
      eligible: true,
    });
    expect(b.id).toBe(noMeta);
    expect(b.callback_done).toBeNull();
    expect(b.meta).toEqual({});
    expect(b.proposals).toEqual([]);
  });

  it('proposals are attached to their call in creation order', async () => {
    const callId = await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: new Date('2026-11-14T10:00:00Z'),
    });
    const p2 = randomUUID();
    const p1 = randomUUID();
    for (const [id, at] of [
      [p2, '2026-11-14T09:50:00Z'],
      [p1, '2026-11-14T09:40:00Z'],
    ] as const) {
      await ctx.db.insert(tcProposals).values({
        id,
        call_id: callId,
        user_id: linaUser.id,
        created_at: new Date(at),
        snapshot: { id, call_id: callId } as never,
      });
    }
    const res = await deskGet(ctx, `?action=analytics${day}`, admin);
    expect(
      res.body.calls[0].proposals.map((p: { id: string }) => p.id),
    ).toEqual([p1, p2]);
  });

  it('cursor pagination returns every call exactly once', async () => {
    await ctx.db.execute(sql`
      INSERT INTO tc_calls (id, user_id, operator, created_at, outcome, base_id, products, catalogue_total, base_total, offered_total, tier, extra)
      SELECT 'call-' || lpad(g::text, 5, '0'), ${linaUser.id}, 'Test',
             ${'2026-11-14T08:00:00Z'}::timestamptz + ((g / 3) * interval '1 minute'),
             'duo', 'antiacne', '[]'::jsonb, 3300, 1800, 3000, 'duo', 1200
      FROM generate_series(1, ${1203}::int) AS g`);
    const ids: string[] = [];
    const sizes: number[] = [];
    let cursor: string | null = null;
    do {
      const res = await deskGet(
        ctx,
        `?action=analytics${day}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        admin,
      );
      expect(res.status).toBe(200);
      sizes.push(res.body.calls.length);
      ids.push(...res.body.calls.map((c: { id: string }) => c.id));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(sizes).toEqual([500, 500, 203]);
    expect(ids.length).toBe(1203);
    expect(new Set(ids).size).toBe(1203);
  });

  it('the operator filter narrows to one adviser', async () => {
    await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: new Date('2026-11-14T10:00:00Z'),
    });
    await insertCall(ctx.db, {
      user_id: saraUser.id,
      created_at: new Date('2026-11-14T11:00:00Z'),
    });
    const res = await deskGet(
      ctx,
      `?action=analytics${day}&operator=${saraUser.id}`,
      admin,
    );
    expect(res.body.calls.map((c: { user_id: string }) => c.user_id)).toEqual([
      saraUser.id,
    ]);
  });

  it('malformed cursor and operator are 400', async () => {
    const bad = await deskGet(
      ctx,
      `?action=analytics${day}&cursor=nope`,
      admin,
    );
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'Page invalide.' });
    const op = await deskGet(
      ctx,
      `?action=analytics${day}&operator=${'x'.repeat(81)}`,
      admin,
    );
    expect(op.status).toBe(400);
    expect(op.body).toEqual({ error: 'Filtre invalide.' });
  });

  it('an impossible cursor date is 400, not a database error', async () => {
    const res = await deskGet(
      ctx,
      `?action=analytics${day}&cursor=${encodeURIComponent('2026-02-30T10:00:00.000Z|abc')}`,
      admin,
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Page invalide.' });
  });
});
