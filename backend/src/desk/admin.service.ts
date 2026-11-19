import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq, sql } from 'drizzle-orm';
import { hashPassword, newSaltHex } from '../auth/crypto.js';
import { sealPassword } from '../auth/password-vault.js';
import { ENV, type Env } from '../config/env.js';
import { DeskError } from '../common/http.js';
import { canManageWorkspace, canManageAccount, canRemoveAccount, isFrontline } from '@touche/domain';
import type { Db, Tx } from '../db/schema.js';
import { tcAudit, tcProducts, tcSessions, tcSettings, tcUsers } from '../db/schema.js';
import { auditRow } from './audit.js';
import type { DeskUser } from './desk.types.js';
import {
  clinicalSchema,
  productActionSchema,
  resetUserSchema,
  userSchema,
  userSettingsSchema,
  removeUserSchema,
} from './schemas.js';

@Injectable()
export class AdminService {
  constructor(@InjectDrizzle() private readonly db: Db, @Inject(ENV) private readonly env: Env) {}

  async upsertProduct(user: DeskUser, body: unknown): Promise<{ ok: true }> {
    const { product } = productActionSchema.parse(body);
    const components = product.components || [];
    if (components.includes(product.id) || new Set(components).size !== components.length) {
      throw new DeskError(400, 'Composition de pack invalide.');
    }
    if (product.category === 'Pack' && product.recommendable && components.length < 2) {
      throw new DeskError(400, 'Renseignez les composants vérifiés avant d’autoriser ce pack.');
    }
    await this.db.transaction(async (tx) => {
      await tx
        .insert(tcProducts)
        .values({ id: product.id, data: product })
        .onConflictDoUpdate({
          target: tcProducts.id,
          set: { data: sql`excluded.data`, updated_at: sql`now()` },
        });
      await tx.insert(tcAudit).values(
        auditRow(user, 'catalogue.updated', product.id, {
          price: product.price,
          enabled: product.enabled,
        }),
      );
    });
    return { ok: true };
  }

  async setClinical(user: DeskUser, body: unknown): Promise<{ ok: true }> {
    const v = clinicalSchema.parse(body);
    if (v.validated && v.by.length < 2) {
      throw new DeskError(400, 'Indiquez le responsable ayant effectivement validé le protocole.');
    }
    const data = { validated: v.validated, by: v.by, at: new Date().toISOString(), version: 3 };
    await this.db.transaction(async (tx) => {
      const [previous] = await tx
        .select({ data: tcSettings.data })
        .from(tcSettings)
        .where(eq(tcSettings.id, 'clinical'))
        .for('update');
      await tx.update(tcSettings).set({ data }).where(eq(tcSettings.id, 'clinical'));
      // Who validated or withdrew the protocol, and what it replaced, stays traceable.
      await tx.insert(tcAudit).values(
        auditRow(user, 'clinical.updated', 'clinical', {
          validated: v.validated,
          by: v.by,
          previous: previous?.data ?? null,
        }),
      );
    });
    return { ok: true };
  }

  async createUser(user: DeskUser, body: unknown): Promise<{ ok: true }> {
    const v = userSchema.parse(body);
    const existing = await this.db
      .select({ id: tcUsers.id })
      .from(tcUsers)
      .where(eq(tcUsers.username, v.username))
      .limit(1);
    if (existing.length) throw new DeskError(400, 'Cet identifiant existe déjà.');
    const salt = newSaltHex();
    const password_hash = await hashPassword(v.password, salt);
    const id = randomUUID();
    await this.db.transaction(async (tx) => {
      await this.requireManager(tx, user);
      await tx.insert(tcUsers).values({
        id,
        username: v.username,
        label: v.label,
        role: v.role,
        salt,
        password_hash,
        password_ciphertext: sealPassword(id, v.password, this.env.accountPasswordKey),
        password_updated_at: new Date(),
      });
      await tx.insert(tcAudit).values(auditRow(user, 'account.created', v.username, { role: v.role }));
    });
    return { ok: true };
  }

  private async requireManager(tx: Tx, user: DeskUser) {
    const [actor] = await tx.select().from(tcUsers).where(eq(tcUsers.id, user.id)).for('update');
    if (!actor?.active || actor.deleted_at || !canManageWorkspace(actor)) {
      throw new DeskError(403, 'Accès direction requis.');
    }
    return actor;
  }

  async resetUser(user: DeskUser, body: unknown): Promise<{ ok: true }> {
    const v = resetUserSchema.parse(body);
    const salt = newSaltHex();
    const password_hash = await hashPassword(v.password, salt);
    await this.db.transaction(async (tx) => {
      const actor = await this.requireManager(tx, user);
      const [target] = await tx.select().from(tcUsers).where(eq(tcUsers.id, v.id)).for('update');
      if (target?.deleted_at) throw new DeskError(404, 'Compte introuvable.');
      if (target && !canManageAccount(actor, target)) {
        throw new DeskError(403, 'Le compte direction est protégé.');
      }
      if (!target || target.role === 'admin') {
        throw new DeskError(400, 'Utilisez le changement de votre propre mot de passe pour la direction.');
      }
      await tx.update(tcUsers).set({
        salt, password_hash,
        password_ciphertext: sealPassword(v.id, v.password, this.env.accountPasswordKey),
        password_updated_at: new Date(),
      }).where(eq(tcUsers.id, v.id));
      await tx.insert(tcAudit).values(auditRow(user, 'account.password_reset', v.id));
      await tx.delete(tcSessions).where(eq(tcSessions.user_id, v.id));
    });
    return { ok: true };
  }

  async updateUserSettings(user: DeskUser, body: unknown): Promise<{ ok: true }> {
    if (!canManageWorkspace(user)) throw new DeskError(403, 'Accès direction requis.');
    const v = userSettingsSchema.parse(body);
    await this.db.transaction(async (tx) => {
      const actor = await this.requireManager(tx, user);
      const [target] = await tx.select().from(tcUsers).where(eq(tcUsers.id, v.id)).for('update');
      if (!target || target.deleted_at) throw new DeskError(404, 'Compte introuvable.');
      if (!canManageAccount(actor, target)) throw new DeskError(403, 'Le compte direction est protégé.');
      if (target.role === 'admin' && !v.active) {
        throw new DeskError(400, 'Le compte direction ne peut pas être désactivé ici.');
      }
      if (target.role === 'admin' && v.role) {
        throw new DeskError(403, 'Le rôle direction ne peut pas être modifié ici.');
      }
      const role = v.role ?? target.role;
      if (target.id === actor.id && (!v.active || role !== target.role)) {
        throw new DeskError(403, 'Vous ne pouvez pas retirer votre propre accès.');
      }
      if (isFrontline(role) && v.reporting_scope !== 'own') {
        throw new DeskError(400, 'Une conseillère accède uniquement à sa progression personnelle. Le pilotage des équipes est réservé à la direction.');
      }
      await tx.update(tcUsers).set({
        label: v.label, team: v.team, active: v.active ? 1 : 0,
        reporting_scope: v.reporting_scope, role,
      }).where(eq(tcUsers.id, v.id));
      await tx.insert(tcAudit).values(auditRow(user, 'account.updated', v.id, {
        active: v.active, team: v.team, reporting_scope: v.reporting_scope, role,
      }));
      if (!v.active || role !== target.role) await tx.delete(tcSessions).where(eq(tcSessions.user_id, v.id));
    });
    return { ok: true };
  }

  async removeUser(user: DeskUser, body: unknown): Promise<{ ok: true }> {
    const v = removeUserSchema.parse(body);
    await this.db.transaction(async (tx) => {
      const actor = await this.requireManager(tx, user);
      const [target] = await tx.select().from(tcUsers).where(eq(tcUsers.id, v.id)).for('update');
      if (!target || target.deleted_at) throw new DeskError(404, 'Compte introuvable.');
      if (!canRemoveAccount(actor, target)) {
        throw new DeskError(403, target.id === actor.id
          ? 'Vous ne pouvez pas supprimer votre propre compte.' : 'Le compte direction est protégé.');
      }
      // Keep the account identity for historical reporting; erase access and saved credentials.
      await tx.update(tcUsers).set({
        active: 0, deleted_at: new Date(), salt: newSaltHex(),
        password_hash: randomBytes(32).toString('hex'), password_ciphertext: null,
      }).where(eq(tcUsers.id, v.id));
      await tx.delete(tcSessions).where(eq(tcSessions.user_id, v.id));
      await tx.insert(tcAudit).values(auditRow(user, 'account.removed', v.id, {
        username: target.username, label: target.label, role: target.role,
      }));
    });
    return { ok: true };
  }
}
