import { adherenceForMedication, adherenceSummary, type RefillEvent, type AdherenceWindow, type AdherenceMetrics, type AdherenceSummary } from '@med/utils';

export interface AdherenceQuery {
  medicationIds: string[];
  refills: RefillEvent[];
  window: AdherenceWindow;
  threshold?: number;
}

/**
 * ReportService produces the adherence numbers shown on the dashboard, in
 * monthly reports, and in caregiver digests. It exposes both single-drug
 * MPR/PDC and a summary across the user's regimen so the same service can
 * back /reports/adherence and /reports/monthly without re-deriving math in
 * each route.
 */
export class ReportService {
  adherence(query: AdherenceQuery): AdherenceMetrics[] {
    return query.medicationIds.map((id) => adherenceForMedication(id, query.refills, query.window));
  }

  adherenceSummary(query: AdherenceQuery): AdherenceSummary {
    return adherenceSummary(query.medicationIds, query.refills, query.window, {
      threshold: query.threshold,
    });
  }

  monthly(query: Omit<AdherenceQuery, 'window'> & { year: number; month: number }): AdherenceSummary {
    const start = new Date(Date.UTC(query.year, query.month - 1, 1));
    const end = new Date(Date.UTC(query.year, query.month, 0));
    return this.adherenceSummary({ ...query, window: { start, end } });
  }
}
