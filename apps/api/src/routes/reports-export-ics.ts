import type { FastifyInstance } from 'fastify';
import { ExportService } from '../services/ExportService';
import type { IcsMedication } from '@med/utils';

/**
 * GET /reports/export/ics — iCalendar (.ics) export of medication schedules.
 *
 * Query parameters:
 *   from               ISO date, inclusive window start (default: today)
 *   to                 ISO date, inclusive window end (default: from + 30 days)
 *   alarmMinutesBefore Optional VALARM lead time
 *
 * The route delegates schedule and medication loading to the request's
 * dataloader (attached by the auth/data plugin in production). In tests we
 * accept an injected loader via app.decorate.
 */
export interface ScheduleExportLoader {
  loadForUser(userId: string): Promise<IcsMedication[]>;
}

declare module 'fastify' {
  interface FastifyInstance {
    scheduleExportLoader?: ScheduleExportLoader;
  }
}

export async function registerReportsExportIcs(app: FastifyInstance) {
  const svc = new ExportService();

  app.get(
    '/reports/export/ics',
    {
      schema: {
        tags: ['reports'],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string', format: 'date' },
            to: { type: 'string', format: 'date' },
            alarmMinutesBefore: { type: 'integer', minimum: 0, maximum: 1440 },
            timeZone: { type: 'string', minLength: 1, maxLength: 64 },
          },
        },
      },
    },
    async (req, reply) => {
      const q = req.query as { from?: string; to?: string; alarmMinutesBefore?: number; timeZone?: string };
      const from = q.from ? new Date(q.from) : startOfToday();
      const to = q.to ? endOfDay(new Date(q.to)) : addDays(from, 30);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return reply.code(400).send({ error: 'invalid_date' });
      }
      if (to.getTime() < from.getTime()) {
        return reply.code(400).send({ error: 'invalid_range' });
      }

      const loader = app.scheduleExportLoader;
      const userId = (req.user as { sub?: string } | undefined)?.sub ?? 'anonymous';
      const items: IcsMedication[] = loader ? await loader.loadForUser(userId) : [];

      const body = svc.buildCalendar(items, {
        from,
        to,
        alarmMinutesBefore: q.alarmMinutesBefore,
        timeZone: q.timeZone,
        calendarName: 'Med-Tracker schedule',
      });
      reply
        .header('content-type', 'text/calendar; charset=utf-8')
        .header('content-disposition', 'attachment; filename="med-tracker.ics"')
        .send(body);
    },
  );
}

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(d: Date): Date {
  const r = new Date(d.getTime());
  r.setUTCHours(23, 59, 59, 999);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}
