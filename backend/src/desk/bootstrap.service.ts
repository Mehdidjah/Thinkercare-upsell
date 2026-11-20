import { canManageWorkspace } from '@touche/domain';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import type { Db } from '../db/schema.js';
import { tcCalls, tcSettings, tcUsers } from '../db/schema.js';
import { loadProducts } from './catalogue.js';
import type { DeskUser } from './desk.types.js';
import { VOID_WINDOW_MINUTES, featuresFor } from './features.js';

@Injectable()
export class BootstrapService {
  constructor(@InjectDrizzle() private readonly db: Db, @Inject(ENV) private readonly env: Env) {}

  async get(user: DeskUser, includeCalls = true) {
    const admin = canManageWorkspace(user);
    const [products, calls, settings, users] = await Promise.all([
      loadProducts(this.db),
      admin && includeCalls
        ? this.db.select().from(tcCalls).orderBy(desc(tcCalls.created_at)).limit(1000)
        : Promise.resolve([]),
      this.db
        .select({ data: tcSettings.data })
        .from(tcSettings)
        .where(eq(tcSettings.id, 'clinical'))
        .limit(1),
      admin
        ? this.db
            .select({
              id: tcUsers.id,
              username: tcUsers.username,
              label: tcUsers.label,
              role: tcUsers.role,
              active: tcUsers.active,
              team: tcUsers.team,
              reporting_scope: tcUsers.reporting_scope,
              password_available: sql<boolean>`${tcUsers.password_ciphertext} IS NOT NULL`,
              password_updated_at: tcUsers.password_updated_at,
            })
            .from(tcUsers)
            .where(isNull(tcUsers.deleted_at))
            .orderBy(asc(tcUsers.created_at))
        : Promise.resolve([]),
    ]);
    const data = settings[0]?.data as Record<string, unknown> | undefined;
    const clinical = data
      ? { ...data, validated: data.version === 3 && !!data.validated }
      : { validated: false, by: '', at: '' };
    return {
      user,
      products,
      calls,
      clinical,
      users,
      password_viewing_enabled: admin && !!this.env.accountPasswordKey,
      features: featuresFor(this.env),
      void_window_minutes: VOID_WINDOW_MINUTES,
    };
  }
}
