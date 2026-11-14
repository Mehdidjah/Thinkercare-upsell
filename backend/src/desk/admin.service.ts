import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq, sql } from 'drizzle-orm';
import { hashPassword, newSaltHex } from '../auth/crypto.js';
import { DeskError } from '../common/http.js';
import type { Db } from '../db/schema.js';
import { tcAudit, tcProducts, tcSessions, tcSettings, tcUsers } from '../db/schema.js';
import { auditRow } from './audit.js';
import type { DeskUser } from './desk.types.js';
import {
  clinicalSchema,
  productActionSchema,
  resetUserSchema,
  userSchema,
  userSettingsSchema,
} from './schemas.js';

@Injectable()
export class AdminService {
  constructor(@InjectDrizzle() private readonly db: Db) {}

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

  async setClinical(_user: DeskUser, body: unknown): Promise<{ ok: true }> {
    const v = clinicalSchema.parse(body);
    if (v.validated && v.by.length < 2) {
      throw new DeskError(400, 'Indiquez le responsable ayant effectivement validé le protocole.');
    }
    await this.db
      .update(tcSettings)
      .set({
        data: {
          validated: v.validated,
          by: v.by,
          at: new Date().toISOString(),
          version: 3,
        },
      })
      .where(eq(tcSettings.id, 'clinical'));
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
    await this.db.transaction(async (tx) => {
      await tx.insert(tcUsers).values({
        id: randomUUID(),
        username: v.username,
        label: v.label,
        role: 'advisor',
        salt,
        password_hash,
      });
      await tx.insert(tcAudit).values(auditRow(user, 'account.created', v.username));
    });
    return { ok: true };
  }

  async resetUser(user: DeskUser, body: unknown): Promise<{ ok: true }> {
    const v = resetUserSchema.parse(body);
    const [target] = await this.db
      .select({ role: tcUsers.role })
      .from(tcUsers)
      .where(eq(tcUsers.id, v.id))
      .limit(1);
    if (!target || target.role === 'admin') {
      throw new DeskError(
        400,
        'Utilisez le changement de votre propre mot de passe pour la direction.',
      );
    }
    const salt = newSaltHex();
    const password_hash = await hashPassword(v.password, salt);
    await this.db.transaction(async (tx) => {
      await tx.update(tcUsers).set({ salt, password_hash }).where(eq(tcUsers.id, v.id));
      await tx.insert(tcAudit).values(auditRow(user, 'account.password_reset', v.id));
      await tx.delete(tcSessions).where(eq(tcSessions.user_id, v.id));
    });
    return { ok: true };
  }

  async updateUserSettings(user: DeskUser, body: unknown): Promise<{ ok: true }> {
    if (user.role !== 'admin') throw new DeskError(403, 'Accès direction requis.');
    const v = userSettingsSchema.parse(body);
    const [target] = await this.db
      .select({ id: tcUsers.id, role: tcUsers.role })
      .from(tcUsers)
      .where(eq(tcUsers.id, v.id))
      .limit(1);
    if (!target) throw new DeskError(404, 'Compte introuvable.');
    if (target.role === 'admin' && !v.active) {
      throw new DeskError(400, 'Le compte direction ne peut pas être désactivé ici.');
    }
    if (target.role !== 'admin' && v.reporting_scope !== 'own') {
      throw new DeskError(
        400,
        'Une conseillère accède uniquement à sa progression personnelle. Le pilotage des équipes est réservé à la direction.',
      );
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(tcUsers)
        .set({
          label: v.label,
          team: v.team,
          active: v.active ? 1 : 0,
          reporting_scope: v.reporting_scope,
        })
        .where(eq(tcUsers.id, v.id));
      await tx.insert(tcAudit).values(
        auditRow(user, 'account.updated', v.id, {
          active: v.active,
          team: v.team,
          reporting_scope: v.reporting_scope,
        }),
      );
      if (!v.active) await tx.delete(tcSessions).where(eq(tcSessions.user_id, v.id));
    });
    return { ok: true };
  }
}
