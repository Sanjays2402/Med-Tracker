import { buildIcs, type IcsMedication, type IcsOptions } from '@med/utils';

/**
 * ExportService produces user-facing exports of medication data. Today it
 * covers iCalendar (RFC 5545) schedule exports. CSV, PDF, and JSON exports
 * for adherence reporting are handled by their own routes which delegate to
 * lower-level helpers.
 *
 * The service is intentionally stateless so it can be reused from both HTTP
 * handlers and background jobs (for example, emailing a refreshed calendar
 * file to a caregiver).
 */
export class ExportService {
  /**
   * Build a calendar file from the supplied medications and their schedules.
   * The caller resolves the medication and schedule rows from the database
   * so this service stays free of persistence concerns.
   */
  buildCalendar(items: IcsMedication[], options: IcsOptions): string {
    return buildIcs(items, options);
  }
}
