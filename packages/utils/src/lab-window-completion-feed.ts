/**
 * Lab window completion feed.
 *
 * `appointment-followup-tracker` tracks recommended follow-ups
 * (visits, labs, imaging, etc) and surfaces them with a status
 * bucket. To MARK an item complete, the patient or caregiver has to
 * tap "done" in the UI — even when the underlying clinical event
 * already happened. For lab follow-ups specifically this is
 * particularly wasteful: when a lab result lands in the system
 * (LabResult from lab-window-tracker), we KNOW the draw was done,
 * and we should auto-complete the matching FollowupRequirement.
 *
 * This module is the bridge. Given:
 *   - the set of LabResult records (from the EHR feed),
 *   - the FollowupRequirement[] (kind='lab' subset),
 *
 * it produces FollowupCompletion entries the appointment-followup-
 * tracker pipeline can ingest unchanged. Match semantics:
 *
 *   - A lab result matches a follow-up when:
 *       follow-up.kind === 'lab' AND NOT yet completed,
 *       AND lab-code keyword(s) appear in follow-up.title
 *           (case-insensitive substring), or follow-up.medicationId
 *           equals lab-result.medicationId AND the result is the
 *           NEXT or OVERDUE due window.
 *       AND the result was drawn AFTER the recommendation was
 *           recorded (recommendedAt). A draw from before the
 *           recommendation cannot satisfy it.
 *       AND the draw is within [dueAt - leadDays, dueAt + graceDays]
 *           — a draw 6 months early was clearly not for THIS
 *           recommendation.
 *
 *   - Among multiple satisfying results, the EARLIEST qualifying
 *     draw on or after the recommendation date wins (clinicians
 *     usually count the first draw as "the" follow-up; subsequent
 *     draws in the window are surveillance).
 *
 * Pure / deterministic. No I/O.
 */

import { addDays, startOfDay } from './date';
import type {
  FollowupRequirement,
  FollowupCompletion,
  FollowupKind,
} from './appointment-followup-tracker';
import type { LabResult } from './lab-window-tracker';

export interface LabCompletionMatch {
  followupId: string;
  followupTitle: string;
  followupKind: FollowupKind;
  labCode: string;
  drawnAt: string;
  /** The match strategy: 'code-in-title', 'medication-id', or 'both'. */
  reason: 'code-in-title' | 'medication-id' | 'both';
}

export interface LabCompletionFeedOptions {
  /**
   * Days BEFORE dueAt that the draw is considered "for this follow-up"
   * if all other criteria match. Default 14 — covers the lead-time
   * patients often book labs with. Below this window the draw is
   * surveillance from an earlier cadence, not the actual
   * recommendation.
   */
  leadDays?: number;
  /**
   * Days AFTER dueAt within which a draw still completes the
   * recommendation. Default 60 — the same as the appointment-followup-
   * tracker grace window default.
   */
  graceDays?: number;
  /**
   * When true, look at follow-ups with NO recommendedAt anchor too
   * and treat draws on or before dueAt + graceDays as candidates
   * (skip the recommendedAt cutoff). Default true — many follow-ups
   * never get a recommendedAt populated and the alternative is they
   * never auto-complete.
   */
  matchWhenNoRecommendedAt?: boolean;
  /** Free-text note for the FollowupCompletion. Default "Auto-completed from lab result". */
  noteTemplate?: string;
  /**
   * Existing completion ids to skip. The cron caller passes the
   * already-completed set so we never double-complete and never
   * overwrite a manual completion with an auto one. Optional.
   */
  alreadyCompletedIds?: Iterable<string>;
}

export interface LabCompletionFeedResult {
  completions: FollowupCompletion[];
  matches: LabCompletionMatch[];
  /** Follow-ups examined but skipped (with reason). */
  skipped: { followupId: string; reason: string }[];
}

function parseIsoDate(s: string): Date | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y!, m! - 1, d!);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function deriveFollowupId(f: FollowupRequirement): string {
  if (f.id) return f.id;
  const slug = f.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `fu_${f.kind}_${f.dueAt}_${slug || 'untitled'}`;
}

function titleContainsLabCode(title: string, labCode: string): boolean {
  if (!labCode) return false;
  // Match the lab code as a word-ish substring. Case-insensitive.
  // Also accept the lab code with a leading slash, dash, or paren
  // — common ways it appears in clinic notes ("INR/coag", "INR-T").
  const lower = title.toLowerCase();
  const code = labCode.toLowerCase();
  if (!lower.includes(code)) return false;
  // Reject false positives where the code is a substring of an
  // unrelated word ("INR" inside "INRange" or "inkjet"). Require
  // a word boundary on BOTH sides — start/end of string counts as a
  // boundary. Anything else (a letter or digit immediately adjacent)
  // is treated as the code embedded inside a larger token.
  const idx = lower.indexOf(code);
  const before = idx === 0 ? '' : lower[idx - 1]!;
  const after = idx + code.length >= lower.length ? '' : lower[idx + code.length]!;
  const boundary = (c: string) => c === '' || !/[a-z0-9]/i.test(c);
  return boundary(before) && boundary(after);
}

function parseLabDate(value: string | Date): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return startOfDay(value);
  }
  // Treat YYYY-MM-DD strings as LOCAL calendar dates so a draw
  // labelled '2026-06-14' compares correctly against a follow-up
  // dueAt parsed the same way (both endpoints live in the same
  // local-date space). Otherwise UTC parsing in PDT pushes the
  // draw back one day and breaks earliest-wins.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y!, m! - 1, d!);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

/**
 * Build FollowupCompletion entries from a list of LabResult records
 * and a list of FollowupRequirement (kind='lab') items. Returns the
 * completions + a parallel `matches` list explaining each completion
 * and a `skipped` list explaining the lab-kind follow-ups that did
 * NOT auto-complete.
 *
 * Match rules in priority order:
 *   1. Already completed (caller-supplied set) -> skip silently.
 *   2. labCode keyword in title AND draw inside window -> match.
 *   3. medicationId equals AND draw inside window -> match.
 *   4. Earliest qualifying draw on or after the recommendation date
 *      wins when multiple results match.
 *
 * Non-lab kinds in the input are ignored (this module is
 * lab-specific). The caller is expected to merge the returned
 * completions with any pre-existing completion log before passing to
 * buildFollowupReport.
 */
export function buildLabCompletionFeed(
  followups: FollowupRequirement[],
  results: LabResult[],
  options: LabCompletionFeedOptions = {},
): LabCompletionFeedResult {
  const leadDays = options.leadDays ?? 14;
  const graceDays = options.graceDays ?? 60;
  const matchWhenNoRec = options.matchWhenNoRecommendedAt ?? true;
  const noteTemplate = options.noteTemplate ?? 'Auto-completed from lab result';
  const alreadyCompleted = new Set<string>(options.alreadyCompletedIds ?? []);

  const completions: FollowupCompletion[] = [];
  const matches: LabCompletionMatch[] = [];
  const skipped: { followupId: string; reason: string }[] = [];

  // Pre-parse results once and bucket by medicationId for the
  // medication-id matching path.
  type ParsedResult = {
    labCode: string;
    medicationId: string;
    drawnAt: Date;
    drawnAtIso: string;
  };
  const parsedResults: ParsedResult[] = [];
  for (const r of results) {
    const drawn = parseLabDate(r.drawnAt);
    if (!drawn) continue;
    parsedResults.push({
      labCode: r.labCode,
      medicationId: r.medicationId,
      drawnAt: drawn,
      drawnAtIso: toIsoDate(drawn),
    });
  }

  // Index by medicationId for fast lookup.
  const resultsByMed = new Map<string, ParsedResult[]>();
  for (const p of parsedResults) {
    let list = resultsByMed.get(p.medicationId);
    if (!list) {
      list = [];
      resultsByMed.set(p.medicationId, list);
    }
    list.push(p);
  }

  for (const f of followups) {
    if (f.kind !== 'lab') continue;
    const id = deriveFollowupId(f);
    if (alreadyCompleted.has(id)) {
      skipped.push({ followupId: id, reason: 'already-completed' });
      continue;
    }
    const due = parseIsoDate(f.dueAt);
    if (!due) {
      skipped.push({ followupId: id, reason: 'invalid-dueAt' });
      continue;
    }
    const windowStart = addDays(due, -leadDays);
    const windowEnd = addDays(due, graceDays);
    const recommendedAt = f.recommendedAt ? parseIsoDate(f.recommendedAt) : null;

    // Build candidate list. Each candidate is tagged with how it
    // matched so we can record the reason.
    type Candidate = ParsedResult & { reason: 'code-in-title' | 'medication-id' | 'both' };
    const candidates: Candidate[] = [];

    // Strategy 1: lab code in title.
    for (const p of parsedResults) {
      if (!titleContainsLabCode(f.title, p.labCode)) continue;
      candidates.push({ ...p, reason: 'code-in-title' });
    }

    // Strategy 2: medicationId match.
    if (f.medicationId) {
      const medResults = resultsByMed.get(f.medicationId) ?? [];
      for (const p of medResults) {
        // If we already added this exact result via strategy 1, promote
        // the reason to 'both' rather than push a duplicate.
        const existing = candidates.find(
          (c) => c.labCode === p.labCode && c.drawnAtIso === p.drawnAtIso,
        );
        if (existing) {
          existing.reason = 'both';
        } else {
          candidates.push({ ...p, reason: 'medication-id' });
        }
      }
    }

    if (candidates.length === 0) {
      skipped.push({ followupId: id, reason: 'no-matching-results' });
      continue;
    }

    // Filter by window + recommendedAt.
    const inWindow = candidates.filter((c) => {
      if (c.drawnAt.getTime() < windowStart.getTime()) return false;
      if (c.drawnAt.getTime() > windowEnd.getTime()) return false;
      if (recommendedAt) {
        if (c.drawnAt.getTime() < recommendedAt.getTime()) return false;
      } else if (!matchWhenNoRec) {
        return false;
      }
      return true;
    });

    if (inWindow.length === 0) {
      skipped.push({ followupId: id, reason: 'no-result-in-window' });
      continue;
    }

    // Earliest in-window draw wins (the first qualifying lab is THE
    // follow-up; later draws are surveillance).
    inWindow.sort((a, b) => a.drawnAt.getTime() - b.drawnAt.getTime());
    const winner = inWindow[0]!;

    completions.push({
      id,
      completedAt: winner.drawnAtIso,
      note: noteTemplate,
    });
    matches.push({
      followupId: id,
      followupTitle: f.title,
      followupKind: f.kind,
      labCode: winner.labCode,
      drawnAt: winner.drawnAtIso,
      reason: winner.reason,
    });
  }

  return { completions, matches, skipped };
}

/**
 * Convenience: merge auto-completions with caller-supplied
 * completions, with caller completions winning on id conflict
 * (manual entries are the source of truth). Returns a single sorted
 * array.
 */
export function mergeCompletions(
  manual: FollowupCompletion[],
  auto: FollowupCompletion[],
): FollowupCompletion[] {
  const byId = new Map<string, FollowupCompletion>();
  for (const a of auto) byId.set(a.id, a);
  for (const m of manual) byId.set(m.id, m); // manual wins
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
