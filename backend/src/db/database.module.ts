import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ConfigModule } from '../config/config.module.js';
import { ENV, type Env } from '../config/env.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ENV],
      useFactory: (env: Env) => ({ drizzle, connection: env.databaseUrl }),
    }),
  ],
})
export class DatabaseModule {}
