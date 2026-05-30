import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerReportsExportIcs, type ScheduleExportLoader } from '../src/routes/reports-export-ics';
import type { IcsMedication } from '@med/utils';

const sampleItems: IcsMedication[] = [
  {
    medication: {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Lisinopril',
      strength: '10mg',
      form: 'tablet',
      instructions: 'Morning with water.',
    },
    schedule: {
      id: '22222222-2222-2222-2222-222222222222',
      medicationId: '11111111-1111-1111-1111-111111111111',
      kind: 'daily',
      times: ['09:00'],
      startsAt: '2026-01-01T00:00:00.000Z',
      enabled: true,
    } as any,
  },
];

function buildApp(loader: ScheduleExportLoader | undefined) {
  const app = Fastify();
  if (loader) (app as any).scheduleExportLoader = loader;
  // Stub the rate limit tier helper. The real plugin is registered by
  // src/server.ts; this isolated test only exercises the ICS route.
  (app as any).rateLimitTier = () => ({});
  return registerReportsExportIcs(app).then(() => app);
}

describe('GET /reports/export/ics', () => {
  it('returns text/calendar with VEVENTs for the window', async () => {
    const app = await buildApp({ loadForUser: async () => sampleItems });
    const res = await app.inject({ method: 'GET', url: '/reports/export/ics?from=2026-01-01&to=2026-01-03' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.headers['content-disposition']).toContain('med-tracker.ics');
    const body = res.body;
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('SUMMARY:Lisinopril 10mg');
    // 3 days x 1 time = 3 events
    expect((body.match(/BEGIN:VEVENT/g) ?? []).length).toBe(3);
    await app.close();
  });

  it('rejects invalid date range', async () => {
    const app = await buildApp({ loadForUser: async () => [] });
    const res = await app.inject({ method: 'GET', url: '/reports/export/ics?from=2026-02-01&to=2026-01-01' });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns an empty calendar when no schedules are loaded', async () => {
    const app = await buildApp({ loadForUser: async () => [] });
    const res = await app.inject({ method: 'GET', url: '/reports/export/ics?from=2026-01-01&to=2026-01-07' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('BEGIN:VCALENDAR');
    expect(res.body).not.toContain('BEGIN:VEVENT');
    await app.close();
  });

  it('respects an explicit timeZone for HH:MM expansion', async () => {
    const app = await buildApp({ loadForUser: async () => sampleItems });
    // 09:00 in America/Los_Angeles on 2026-01-15 (PST, UTC-8) is 17:00 UTC.
    const res = await app.inject({
      method: 'GET',
      url: '/reports/export/ics?from=2026-01-15&to=2026-01-15&timeZone=America/Los_Angeles',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('DTSTART:20260115T170000Z');
    await app.close();
  });

  it('includes VALARM when alarmMinutesBefore is positive', async () => {
    const app = await buildApp({ loadForUser: async () => sampleItems });
    const res = await app.inject({
      method: 'GET',
      url: '/reports/export/ics?from=2026-01-01&to=2026-01-01&alarmMinutesBefore=15',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('BEGIN:VALARM');
    expect(res.body).toContain('TRIGGER:-PT15M');
    await app.close();
  });
});
