import type { ItemSnapshot, Product, Proposal } from '@touche/domain';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const tcUsers = pgTable(
  'tc_users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull().unique(),
    label: text('label').notNull(),
    role: text('role').notNull(),
    salt: text('salt').notNull(),
    password_hash: text('password_hash').notNull(),
    password_ciphertext: text('password_ciphertext'),
    password_updated_at: timestamptz('password_updated_at'),
    created_at: timestamptz('created_at').notNull().defaultNow(),
    active: integer('active').notNull().default(1),
    deleted_at: timestamptz('deleted_at'),
    team: text('team').notNull().default(''),
    reporting_scope: text('reporting_scope').notNull().default('own'),
  },
  (t) => [check('tc_users_role_check', sql`${t.role} IN ('admin','manager','advisor','cm')`)],
);

export const tcSessions = pgTable(
  'tc_sessions',
  {
    token_hash: text('token_hash').primaryKey(),
    user_id: text('user_id')
      .notNull()
      .references(() => tcUsers.id),
    expires_at: timestamptz('expires_at').notNull(),
    // Sign-in time, for the absolute session cap; null for sessions opened before migration 0004.
    created_at: timestamptz('created_at'),
  },
  (t) => [index('tc_session_expiry').on(t.expires_at)],
);

export const tcThrottle = pgTable('tc_throttle', {
  bucket: text('bucket').primaryKey(),
  count: integer('count').notNull(),
  expires_at: timestamptz('expires_at').notNull(),
});

export const tcProducts = pgTable('tc_products', {
  id: text('id').primaryKey(),
  position: integer('position').generatedByDefaultAsIdentity(),
  data: jsonb('data').$type<Product>().notNull(),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
});

export const tcSettings = pgTable('tc_settings', {
  id: text('id').primaryKey(),
  data: jsonb('data').notNull(),
});

export const tcCalls = pgTable(
  'tc_calls',
  {
    id: text('id').primaryKey(),
    user_id: text('user_id').notNull(),
    operator: text('operator').notNull(),
    created_at: timestamptz('created_at').notNull(),
    outcome: text('outcome').notNull(),
    base_id: text('base_id').notNull(),
    products: jsonb('products').$type<ItemSnapshot[]>().notNull(),
    catalogue_total: integer('catalogue_total').notNull(),
    base_total: integer('base_total').notNull(),
    offered_total: integer('offered_total').notNull(),
    delivery: integer('delivery'),
    tier: text('tier').notNull(),
    extra: integer('extra').notNull(),
    refusal: text('refusal').notNull().default(''),
    pilot: integer('pilot').notNull().default(1),
    // A voided call stays recorded but no longer counts anywhere (null while active).
    voided_at: timestamptz('voided_at'),
    voided_by: text('voided_by'),
    void_reason: text('void_reason'),
  },
  (t) => [index('tc_calls_created').on(t.created_at)],
);

export const tcCallMeta = pgTable(
  'tc_call_meta',
  {
    call_id: text('call_id')
      .primaryKey()
      .references(() => tcCalls.id),
    data: jsonb('data').notNull(),
    callback_at: timestamptz('callback_at'),
    callback_done: integer('callback_done').notNull().default(0),
    order_ref: text('order_ref').notNull().default(''),
    customer_stage: text('customer_stage').notNull().default('unknown'),
    team: text('team').notNull().default(''),
    version: integer('version').notNull().default(3),
  },
  (t) => [
    index('tc_meta_callback').on(t.callback_at, t.callback_done),
    index('tc_meta_reference').on(t.order_ref),
  ],
);

export const tcProposals = pgTable(
  'tc_proposals',
  {
    id: text('id').primaryKey(),
    call_id: text('call_id').notNull(),
    user_id: text('user_id').notNull(),
    created_at: timestamptz('created_at').notNull(),
    snapshot: jsonb('snapshot').$type<Proposal>().notNull(),
  },
  (t) => [
    index('tc_proposals_call').on(t.call_id, t.created_at),
    index('tc_proposals_user_date').on(t.user_id, t.created_at),
  ],
);

export const tcAudit = pgTable(
  'tc_audit',
  {
    id: text('id').primaryKey(),
    user_id: text('user_id').notNull(),
    action: text('action').notNull(),
    target: text('target').notNull(),
    at: timestamptz('at').notNull(),
    detail: jsonb('detail').notNull().default({}),
  },
  (t) => [index('tc_audit_at').on(t.at)],
);

export const tcExternalSales = pgTable(
  'tc_external_sales',
  {
    source: text('source').notNull(),
    external_order_id: text('external_order_id').notNull(),
    local_call_id: text('local_call_id'),
    customer_key: text('customer_key'),
    ordered_at: timestamptz('ordered_at'),
    delivered_at: timestamptz('delivered_at'),
    collected_at: timestamptz('collected_at'),
    remitted_at: timestamptz('remitted_at'),
    updated_at: timestamptz('updated_at'),
    status: text('status').notNull().default('unknown'),
    amount_dzd: integer('amount_dzd'),
    returned_dzd: integer('returned_dzd'),
    payload_version: integer('payload_version').notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.source, t.external_order_id] })],
);

// One active accepted add-on per dossier reference. Voiding the sale keeps its row (voided_at set)
// and frees the reference for the correct sale.
export const tcAcceptedDossiers = pgTable(
  'tc_accepted_dossiers',
  {
    order_ref: text('order_ref').notNull(),
    call_id: text('call_id').primaryKey().unique(),
    user_id: text('user_id').notNull(),
    voided_at: timestamptz('voided_at'),
  },
  (t) => [uniqueIndex('tc_accepted_dossiers_active_ref').on(t.order_ref).where(sql`voided_at IS NULL`)],
);

export const tcBonusRules = pgTable(
  'tc_bonus_rules',
  {
    month: text('month').primaryKey(),
    threshold: integer('threshold').notNull(),
    rate_dzd: integer('rate_dzd').notNull(),
    mode: text('mode').notNull(),
    version: integer('version').notNull().default(1),
    updated_by: text('updated_by').notNull().default(''),
    updated_at: timestamptz('updated_at').notNull(),
  },
  (t) => [
    check('tc_bonus_rules_threshold_check', sql`${t.threshold} > 0`),
    check('tc_bonus_rules_rate_check', sql`${t.rate_dzd} >= 0`),
    check('tc_bonus_rules_mode_check', sql`${t.mode} IN ('pending','all_month','from_threshold')`),
  ],
);

export type Db = NodePgDatabase;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
