import type { Drug } from '@med/types';
import { classifyInteractions, maxSeverity, type ScoredInteraction, type SeverityLevel } from '@med/utils';

/**
 * InteractionService wraps the drug catalog and applies the severity engine to a
 * user's active medication list. It hides catalog plumbing from route handlers
 * and returns ranked, deduplicated results with summary stats useful for UI
 * badges and caregiver digests.
 */
export interface InteractionLookup {
  byIds(ids: string[]): Drug[];
}

export interface InteractionReport {
  interactions: ScoredInteraction[];
  counts: Record<SeverityLevel, number>;
  highest: SeverityLevel | null;
  checkedDrugIds: string[];
  unknownDrugIds: string[];
}

export class InteractionService {
  constructor(private readonly catalog: InteractionLookup) {}

  classifyByIds(drugIds: string[]): InteractionReport {
    const unique = Array.from(new Set(drugIds));
    const drugs = this.catalog.byIds(unique);
    const known = new Set(drugs.map((d) => d.id));
    const unknownDrugIds = unique.filter((id) => !known.has(id));
    const interactions = classifyInteractions(drugs);
    const counts: Record<SeverityLevel, number> = { minor: 0, moderate: 0, major: 0, contraindicated: 0 };
    for (const i of interactions) counts[i.severity] += 1;
    return {
      interactions,
      counts,
      highest: maxSeverity(interactions),
      checkedDrugIds: unique,
      unknownDrugIds,
    };
  }
}
