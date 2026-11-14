import { Controller, Get, Logger, Res } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import type { Response } from 'express';
import { sendJson } from '../common/http.js';
import { describeError } from '../common/log.js';
import type { Db } from '../db/schema.js';

@Controller('healthz')
export class HealthController {
  private readonly logger = new Logger('Health');

  constructor(@InjectDrizzle() private readonly db: Db) {}

  @Get()
  async check(@Res() res: Response): Promise<void> {
    try {
      await this.db.execute(sql`SELECT 1`);
      sendJson(res, { ok: true });
    } catch (error) {
      this.logger.error(describeError(error));
      sendJson(res, { ok: false }, 503);
    }
  }
}
