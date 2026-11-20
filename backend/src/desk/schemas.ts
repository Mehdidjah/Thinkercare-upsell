import { z } from 'zod';
import { validMonth, MAX_ITEM_QUANTITY } from '@touche/domain';
import { frenchIssue } from '../common/validation-messages.js';

// Every validation message is French; DeskExceptionFilter adds the field label (M6).
z.config(z.locales.fr());
z.config({ customError: frenchIssue });

export const loginSchema = z
  .object({
    action: z.literal('login'),
    username: z.string().trim().toLowerCase().min(1).max(64),
    password: z.string().min(1).max(200),
    bootstrap: z.boolean().optional(),
  })
  .strict();

export const passwordSchema = z
  .object({
    action: z.literal('password'),
    current: z.string().min(1).max(200),
    next: z.string().min(1).max(200),
  })
  .strict();

export const productSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{2,60}$/),
    name: z.string().min(2).max(150),
    short: z.string().min(2).max(80),
    category: z.enum([
      'Soin ciblé',
      'Hydratant',
      'Protection solaire',
      'Nettoyant',
      'Sérum hydratant',
      'Shampoing',
      'Après-shampoing',
      'Soin cuir chevelu',
      'Nettoyant corps',
      'Soin local',
      'Pack',
      'Autre',
    ]),
    price: z.number().int().min(100).max(100000),
    image: z
      .string()
      .max(500)
      .refine(
        (s) =>
          !s ||
          s.startsWith('/assets/') ||
          /^https:\/\/cdn\.shopify\.com\//.test(s),
      ),
    source: z
      .string()
      .max(300)
      .refine((s) => !s || /^https:\/\/(www\.)?(touchelab\.com|belnco\.com)\//.test(s)),
    description: z.string().min(1).max(1200),
    concerns: z
      .array(
        z.enum([
          'acne',
          'blackheads',
          'oil',
          'marks',
          'red',
          'dry',
          'dehydration',
          'dull',
          'aging',
          'scars',
          'growth',
          'breakage',
          'fall',
          'hairdry',
          'scalpoil',
          'flakes',
          'scalpcomfort',
          'bodyspots',
          'bodydry',
        ]),
      )
      .max(19),
    skins: z
      .array(z.enum(['oily', 'mixed', 'normal', 'dry', 'unknown']))
      .max(5),
    active: z.boolean(),
    size: z.string().max(40),
    enabled: z.boolean(),
    recommendable: z.boolean(),
    review: z.enum(['draft', 'reviewed']),
    priceSource: z.string().max(150).optional(),
    domain: z.enum(['face', 'hair', 'body']).optional(),
    components: z
      .array(z.string().regex(/^[a-z0-9_-]{2,60}$/))
      .max(3)
      .optional(),
    ingredients: z
      .array(
        z.object({
          name: z.string().max(150),
          inci: z.string().max(600),
          role: z.string().max(600),
        }),
      )
      .max(12)
      .optional(),
    inciText: z.string().max(12000).optional(),
    formulaNote: z.string().max(1200).optional(),
    checkedAt: z.string().max(40).optional(),
    pitch: z.string().max(1600).optional(),
    usage: z.string().max(1600).optional(),
    cautions: z.array(z.string().max(1200)).max(12).optional(),
    fragrance: z.boolean().optional(),
    essentialOils: z.boolean().optional(),
    gentle: z.boolean().optional(),
    exfoliant: z.boolean().optional(),
    verificationRequired: z.string().max(1200).optional(),
    brand: z.enum(['touche', 'belnco']).optional(),
    excludes: z
      .array(z.string().regex(/^[a-z0-9_-]{2,60}$/))
      .max(5)
      .optional(),
    photosensitizing: z.boolean().optional(),
  })
  .strict();

export const productActionSchema = z
  .object({ action: z.literal('product'), product: productSchema })
  .strict();

export const clinicalSchema = z
  .object({
    action: z.literal('clinical'),
    validated: z.boolean(),
    by: z.string().trim().max(100),
  })
  .strict();

export const userSchema = z
  .object({
    action: z.literal('user'),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,40}$/),
    label: z.string().trim().min(2).max(80),
    password: z.string().min(1).max(200),
    role: z.enum(['advisor', 'cm', 'manager']).default('advisor'),
  })
  .strict();

export const resetUserSchema = z
  .object({
    action: z.literal('reset-user'),
    id: z.string().max(64),
    password: z.string().min(1).max(200),
  })
  .strict();

export const revealPasswordSchema = z.object({
  action: z.literal('user-password'),
  id: z.string().min(1).max(64),
  adminPassword: z.string().min(1).max(200),
}).strict();

export const userSettingsSchema = z
  .object({
    action: z.literal('user-settings'),
    id: z.string().max(64),
    label: z.string().trim().min(2).max(80),
    team: z.string().trim().max(60),
    active: z.boolean(),
    reporting_scope: z.enum(['own', 'team']),
    role: z.enum(['advisor', 'cm', 'manager']).optional(),
  })
  .strict();

export const removeUserSchema = z.object({
  action: z.literal('remove-user'),
  id: z.string().min(1).max(64),
}).strict();

// Calls: activity.server.ts lines 11-13 and 36, api.server.ts line 54.
const id = z.string().regex(/^[a-z0-9_-]{2,60}$/);
const quantities = z.record(id, z.number().int().min(1).max(MAX_ITEM_QUANTITY))
  .refine(value => Object.keys(value).length <= 32, 'Trop de références.');

export const proposalSchema = z
  .object({
    action: z.literal('present-offer'),
    id: z.string().uuid(),
    callId: z.string().uuid(),
    brand: z.enum(['touche', 'belnco']).optional(),
    baseId: id,
    baseIds: z.array(id).min(1).max(32).optional(),
    baseQuantities: quantities.optional(),
    quantities: quantities.optional(),
    upgradeId: id.optional(),
    productIds: z.array(id).min(1).max(32),
    tier: z.enum(['catalogue', 'duo', 'final']),
    delivery: z.number().int().min(0).max(10000).nullable(),
    agreedTotal: z.number().int().min(0).max(500000),
    verifiedProducts: z.array(id).max(32).optional(),
  })
  .strict();

export const contextSchema = z
  .object({
    version: z.literal(3),
    source: z.literal('manual'),
    customerStage: z.enum(['new', 'first_reorder', 'returning', 'unknown']),
    orderRef: z
      .string()
      .trim()
      .max(60)
      .regex(/^[A-Za-z0-9._#-]*$/),
    startedAt: z.string().datetime(),
    eligible: z.boolean(),
    acceptedProposalId: z.string().uuid().optional(),
    objections: z
      .array(
        z.enum([
          'budget',
          'only',
          'already',
          'efficacy',
          'reaction',
          'later',
          'many',
          'discount',
        ]),
      )
      .max(8),
    callbackAt: z.string().datetime().optional(),
    linkedCallId: z.string().uuid().optional(),
  })
  .strict();

export const saveCallSchema = z
  .object({
    action: z.literal('save-call'),
    id: z.string().uuid(),
    brand: z.enum(['touche', 'belnco']).optional(),
    baseId: z.string().max(60),
    baseIds: z.array(id).min(1).max(32).optional(),
    baseQuantities: quantities.optional(),
    quantities: quantities.optional(),
    upgradeId: z.string().max(60).optional(),
    agreedTotal: z.number().int().min(0).max(500000).optional(),
    productIds: z.array(z.string().max(60)).min(1).max(32),
    outcome: z.enum([
      'duo',
      'trio',
      'routine',
      'initial',
      'refused',
      'review',
      'noanswer',
      'callback',
    ]),
    tier: z.enum(['catalogue', 'duo', 'final']),
    delivery: z.number().int().min(0).max(10000).nullable(),
    consent: z.boolean(),
    checked: z.boolean(),
    refusal: z.enum([
      '',
      'budget',
      'already',
      'uninterested',
      'later',
      'other',
      'efficacy',
      'reaction',
      'many',
      'discount',
    ]),
    meta: contextSchema.optional(),
    verifiedProducts: z.array(z.string().max(60)).max(32).optional(),
  })
  .strict();

export const completeReminderSchema = z
  .object({ action: z.literal('complete-reminder'), callId: z.string().uuid() })
  .strict();

export const reopenReminderSchema = z
  .object({ action: z.literal('reopen-reminder'), id: z.string().uuid() })
  .strict();

export const voidCallSchema = z
  .object({
    action: z.literal('void-call'),
    id: z.string().uuid(),
    reason: z.string().trim().min(3).max(300),
  })
  .strict();

export const bonusRuleSchema = z
  .object({
    action: z.literal('bonus-rule'),
    month: z.string().refine(validMonth),
    threshold: z.number().int().min(1).max(10000),
    rateDzd: z.number().int().min(0).max(10000),
    mode: z.enum(['all_month', 'from_threshold', 'pending']),
    expectedVersion: z.number().int().min(0),
    confirmed: z.literal(true),
  })
  .strict();
