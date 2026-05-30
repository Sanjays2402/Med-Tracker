import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerCaregiversIdDigest } from '../src/routes/caregivers-id-digest';

const payload = {
  patient: { name: 'Jane Doe', display: 'Mom' },
  weekStart: '2026-01-01',
  weekEnd: '2026-01-07',
  adherence: {
    perMedication: [
      { medicationId: 'a', windowDays: 7, daysCovered: 7, daysSupplied: 7, pdc: 1, mpr: 1, mprCapped: 1, gaps: [] },
    ],
    averagePdc: 1,
    averageMpr: 1,
    adherentCount: 1,
    nonAdherentCount: 0,
    threshold: 0.8,
  },
  medicationNames: { a: 'Atorvastatin' },
  missedDoses: [],
};

async function buildApp() {
  const app = Fastify();
  await registerCaregiversIdDigest(app);
  return app;
}

describe('POST /caregivers/:id/digest', () => {
  it('returns subject, text body, and stats', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/caregivers/share-1/digest',
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.subject).toContain('Mom');
    expect(body.text).toContain('Atorvastatin');
    expect(body.stats.averagePdcPct).toBe(100);
    await app.close();
  });

  it('rejects payload missing required fields', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/caregivers/share-1/digest',
      payload: { patient: { name: 'x' } },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
