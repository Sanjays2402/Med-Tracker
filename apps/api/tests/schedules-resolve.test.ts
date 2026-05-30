import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerSchedulesResolve } from '../src/routes/schedules-resolve';

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
  await registerSchedulesResolve(app);
  return app;
}

describe('POST /schedules/resolve', () => {
  it('returns proposals for a clustered set', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/schedules/resolve',
      payload: {
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-01T23:59:59.000Z',
        clusterThreshold: 4,
        clusterWindowMinutes: 15,
        meds: [
          daily('s1', 'a', ['08:00']),
          daily('s2', 'b', ['08:00']),
          daily('s3', 'c', ['08:05']),
          daily('s4', 'd', ['08:10']),
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBeGreaterThan(0);
    expect(body.proposals.length).toBe(body.count);
    await app.close();
  });

  it('rejects an inverted range', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/schedules/resolve',
      payload: {
        from: '2026-06-02T00:00:00.000Z',
        to: '2026-06-01T00:00:00.000Z',
        meds: [daily('s1', 'a', ['08:00'])],
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns zero proposals for a clean schedule', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/schedules/resolve',
      payload: {
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-01T23:59:59.000Z',
        meds: [daily('s1', 'a', ['08:00']), daily('s2', 'b', ['14:00'])],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().count).toBe(0);
    await app.close();
  });
});
