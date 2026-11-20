import { start } from './start.js';

const env = (migrateOnStart = true) => ({ databaseUrl: 'postgresql://u@h/db', port: 3000, migrateOnStart });

describe('start', () => {
  it('applies pending migrations before the API accepts requests', async () => {
    const steps: string[] = [];
    await start(env(), {
      migrate: async (url) => { steps.push('migrate ' + url); },
      listen: async (port) => { steps.push('listen ' + port); },
    });
    expect(steps).toEqual(['migrate postgresql://u@h/db', 'listen 3000']);
  });

  it('never listens when a migration fails (the running version keeps serving)', async () => {
    const steps: string[] = [];
    await expect(start(env(), {
      migrate: async () => { throw new Error('lock timeout'); },
      listen: async () => { steps.push('listen'); },
    })).rejects.toThrow('lock timeout');
    expect(steps).toEqual([]);
  });

  it('MIGRATE_ON_START=off skips the migrations', async () => {
    const steps: string[] = [];
    await start(env(false), { migrate: async () => { steps.push('migrate'); }, listen: async () => { steps.push('listen'); } });
    expect(steps).toEqual(['listen']);
  });
});
