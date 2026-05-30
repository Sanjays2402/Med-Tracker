import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerSchedulesConflicts } from '../src/routes/schedules-conflicts';

function daily(id: string, medId: string, times: string[]) {
  return {
    medicationId: medId,
    schedule: {
      id,
      medicationId: medId,
      kind: 'daily',
      times,
      startsAt: '2026-01-01T00:00:00.000Z',
      enabled: true,
    },
  };
}

async function buildApp() {
  const app = Fastify();
  await registerSchedulesConflicts(app);
  return app;
}

describe('POST /schedules/conflicts', () => {
  it('returns an empty conflict list for a clean schedule', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/schedules/conflicts',
      payload: {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-01T23:59:59.000Z',
        meds: [daily('s1', 'm1', ['08:00'])],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(0);
    expect(body.conflicts).toEqual([]);
    await app.close();
  });

  it('reports duplicate dose conflict as critical', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/schedules/conflicts',
      payload: {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-01T23:59:59.000Z',
        meds: [daily('s1', 'm1', ['09:00']), daily('s2', 'm1', ['09:02'])],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.critical).toBeGreaterThanOrEqual(1);
    expect(body.conflicts.some((c: any) => c.kind === 'duplicate')).toBe(true);
    await app.close();
  });

  it('rejects an inverted range with 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/schedules/conflicts',
      payload: {
        from: '2026-01-02T00:00:00.000Z',
        to: '2026-01-01T00:00:00.000Z',
        meds: [],
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('applies spacing rules', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/schedules/conflicts',
      payload: {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-01T23:59:59.000Z',
        meds: [daily('s1', 'levothyroxine', ['08:00']), daily('s2', 'calcium', ['08:30'])],
        spacingRules: [
          { medicationA: 'levothyroxine', medicationB: 'calcium', minMinutes: 240, reason: 'Separate by 4 hours.' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.critical).toBeGreaterThanOrEqual(1);
    expect(body.conflicts[0].kind).toBe('spacing');
    await app.close();
  });
});
