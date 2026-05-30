import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerEscalation } from '../src/routes/escalation';

const policy = {
  id: 'p1',
  label: 'standard',
  tiers: [
    { id: 't0', label: 'patient', delayMinutes: 0, recipients: [{ id: 'pat', name: 'Pat', channel: 'push' }] },
    { id: 't1', label: 'spouse', delayMinutes: 15, recipients: [{ id: 'spouse', name: 'Spouse', channel: 'sms' }] },
  ],
};

const dose = {
  id: 'd1',
  medicationId: 'm1',
  scheduleId: 's1',
  dueAt: '2026-06-01T08:00:00.000Z',
  status: 'scheduled' as const,
};

async function buildApp() {
  const app = Fastify();
  await registerEscalation(app);
  return app;
}

describe('escalation routes', () => {
  it('pending returns expected alerts at dueAt', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/escalation/pending',
      payload: { policy, doses: [dose], now: dose.dueAt },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pendingCount).toBeGreaterThan(0);
    expect(body.alerts[0].tierId).toBe('t0');
    await app.close();
  });

  it('pending suppresses already-sent alerts', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/escalation/pending',
      payload: {
        policy,
        doses: [dose],
        now: dose.dueAt,
        alreadySent: [{ doseId: 'd1', tierId: 't0', recipientId: 'pat' }],
      },
    });
    expect(res.json().pendingCount).toBe(0);
    await app.close();
  });

  it('next returns the soonest upcoming tier', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/escalation/next',
      payload: { policy, dose, now: dose.dueAt },
    });
    expect(res.json().next.tierId).toBe('t1');
    await app.close();
  });

  it('rejects bad payloads', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/escalation/pending', payload: {} });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
