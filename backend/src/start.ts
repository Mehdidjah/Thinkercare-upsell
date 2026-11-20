/**
 * Start order of the API: pending database migrations first, then accept requests. A new version therefore
 * never serves a request before its columns exist, whether or not the host runs a pre-deploy step; migrations
 * are additive, so the version still running keeps working meanwhile. A failed migration stops the start
 * (nothing listens) instead of serving with a missing column.
 */
export async function start(
  env: { databaseUrl: string; port: number; migrateOnStart: boolean },
  steps: { migrate: (databaseUrl: string) => Promise<void>; listen: (port: number) => Promise<void> },
): Promise<void> {
  if (env.migrateOnStart) await steps.migrate(env.databaseUrl);
  await steps.listen(env.port);
}
