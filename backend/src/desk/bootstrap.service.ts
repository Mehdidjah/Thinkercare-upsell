import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { asc, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/schema.js';
import { tcCalls, tcSettings, tcUsers } from '../db/schema.js';
import { loadProducts } from './catalogue.js';
import type { DeskUser } from './desk.types.js';

@Injectable()
export class BootstrapService {
  constructor(@InjectDrizzle() private readonly db: Db) {}

  async get(user: DeskUser) {
    const admin = user.role === 'admin';
    const [products, calls, settings, users] = await Promise.all([
      loadProducts(this.db),
      admin
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
            })
            .from(tcUsers)
            .orderBy(asc(tcUsers.created_at))
        : Promise.resolve([]),
    ]);
    const data = settings[0]?.data as Record<string, unknown> | undefined;
    const clinical = data
      ? { ...data, validated: data.version === 3 && !!data.validated }
      : { validated: false, by: '', at: '' };
    return { user, products, calls, clinical, users };
  }
}
