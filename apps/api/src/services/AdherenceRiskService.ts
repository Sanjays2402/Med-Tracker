import type { Dose } from '@med/types';
import { rankRisk, scoreRisk, type RiskResult, type RiskScoringOptions } from '@med/utils';

/**
 * AdherenceRiskService keeps risk scoring callable from any route without
 * pulling the math into request handlers. Persistence-backed routes load
 * the dose history and hand it in here; the service stays storage agnostic.
 */
export class AdherenceRiskService {
  score(medicationId: string, doses: Dose[], options: RiskScoringOptions = {}): RiskResult {
    return scoreRisk(medicationId, doses, options);
  }

  rank(
    rows: { medicationId: string; doses: Dose[]; nextDueAt?: Date }[],
    options: Omit<RiskScoringOptions, 'nextDueAt'> = {},
  ): RiskResult[] {
    return rankRisk(rows, options);
  }
}
