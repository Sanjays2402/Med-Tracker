/**
 * Dose instruction (sig) parser.
 *
 * Prescriptions arrive at the pharmacy and the app as free-text "sig"
 * strings: `"1 tab po qid prn pain"`, `"2 capsules by mouth twice daily
 * with food"`, `"30 units sc qhs"`. The patient-facing app needs to
 * normalise that into structured data:
 *
 *   - amountPerDose (e.g. 1, 2, 0.5),
 *   - dosesPerDay (or frequency: bid/tid/qid/q4h),
 *   - route (po, sl, sc, iv, im, pr, topical, inhaled),
 *   - asNeeded (prn) and reason ("for pain"),
 *   - food instruction (with-food / without-food / unspecified),
 *   - timing tokens (morning / evening / bedtime / before-meal),
 *   - a suggested Schedule kind + times (when frequency is deterministic).
 *
 * This is DELIBERATELY a deterministic vocabulary parser, not an LLM
 * call: the prescription parser is in the trust-critical path for
 * dosing and must be reproducible and auditable. Unknown tokens are
 * preserved in the `unparsed` array so the UI can prompt for review.
 *
 * Pure / deterministic. Returns a `confidence` in [0,1] for whether
 * the parse is safe to auto-apply or needs human review.
 */

import type { Schedule } from '@med/types';

export type Route =
  | 'po'        // oral / by mouth
  | 'sl'        // sublingual
  | 'sc'        // subcutaneous
  | 'iv'        // intravenous
  | 'im'        // intramuscular
  | 'pr'        // rectal
  | 'topical'
  | 'inhaled'
  | 'ophthalmic'
  | 'otic'
  | 'nasal';

export type FoodInstruction =
  | 'with-food'
  | 'without-food'
  | 'before-meal'
  | 'after-meal'
  | 'unspecified';

export type TimingTag =
  | 'morning'
  | 'midday'
  | 'evening'
  | 'bedtime'
  | 'before-breakfast'
  | 'before-meal'
  | 'after-meal';

export interface ParsedSig {
  /** Original input string, unchanged. */
  raw: string;
  /** Lowercased, whitespace-normalized form actually parsed. */
  normalized: string;
  /** Amount per dose (e.g. 1 tab, 2 caps, 0.5 mg). */
  amountPerDose: number | null;
  /** Unit of dose if explicit (`tab`, `cap`, `mg`, `mL`, `unit`). */
  amountUnit: string | null;
  /** Doses per day. Null if as-needed only or unknown. */
  dosesPerDay: number | null;
  /** Hours between doses (only for interval-style q4h / q6h / q8h / q12h). */
  intervalHours: number | null;
  /** Route of administration. */
  route: Route | null;
  /** True for prn (as-needed). */
  asNeeded: boolean;
  /** Free-text reason ("for pain", "for nausea"). */
  reason: string | null;
  food: FoodInstruction;
  /** Timing tags found in the sig (multiple allowed). */
  timing: TimingTag[];
  /** Tokens that did not map to a known vocabulary entry. */
  unparsed: string[];
  /**
   * Parse confidence in [0, 1]:
   *   - 1.0 = every meaningful token mapped and dosing is unambiguous,
   *   - 0.5-0.9 = partial parse (e.g. frequency known, route missing),
   *   - <0.5 = unsafe to auto-apply; show the parsed fields and require
   *     human confirmation.
   */
  confidence: number;
  /**
   * Suggested Schedule fragment. Only set when frequency could be
   * resolved. Omits id/medicationId/startsAt (caller fills these in).
   */
  scheduleSuggestion: ScheduleSuggestion | null;
}

export interface ScheduleSuggestion {
  kind: Schedule['kind'];
  times: string[];
  intervalHours?: number;
  enabled: true;
}

/** Per-frequency suggested clock times. Empty for `asNeeded`. */
const FREQUENCY_TIMES: Record<string, string[]> = {
  qd: ['08:00'],
  bid: ['08:00', '20:00'],
  tid: ['08:00', '14:00', '20:00'],
  qid: ['08:00', '12:00', '17:00', '22:00'],
  '5x': ['08:00', '11:00', '14:00', '17:00', '20:00'],
};

const FREQUENCY_DOSES: Record<string, number> = {
  qd: 1,
  bid: 2,
  tid: 3,
  qid: 4,
  '5x': 5,
};

const QHX_MAP: Array<{ pattern: RegExp; hours: number }> = [
  { pattern: /\bq\s*2\s*h\b/, hours: 2 },
  { pattern: /\bq\s*3\s*h\b/, hours: 3 },
  { pattern: /\bq\s*4\s*h\b/, hours: 4 },
  { pattern: /\bq\s*6\s*h\b/, hours: 6 },
  { pattern: /\bq\s*8\s*h\b/, hours: 8 },
  { pattern: /\bq\s*12\s*h\b/, hours: 12 },
];

const ROUTE_TOKENS: Record<string, Route> = {
  po: 'po',
  'by mouth': 'po',
  oral: 'po',
  orally: 'po',
  sl: 'sl',
  sublingual: 'sl',
  sc: 'sc',
  subq: 'sc',
  subcutaneous: 'sc',
  subcutaneously: 'sc',
  iv: 'iv',
  intravenous: 'iv',
  im: 'im',
  intramuscular: 'im',
  pr: 'pr',
  rectal: 'pr',
  rectally: 'pr',
  topical: 'topical',
  topically: 'topical',
  inh: 'inhaled',
  inhaled: 'inhaled',
  ophthalmic: 'ophthalmic',
  'in the eye': 'ophthalmic',
  otic: 'otic',
  'in the ear': 'otic',
  nasal: 'nasal',
  'in the nose': 'nasal',
};

const UNIT_TOKENS = new Set<string>([
  'tab', 'tabs', 'tablet', 'tablets',
  'cap', 'caps', 'capsule', 'capsules',
  'mg', 'mcg', 'g', 'ml', 'unit', 'units', 'puff', 'puffs', 'drop', 'drops',
  'spray', 'sprays', 'patch', 'patches', 'supp', 'suppository',
]);

const TIMING_MAP: Array<{ pattern: RegExp; tag: TimingTag; addTimes?: string[] }> = [
  { pattern: /\bqhs\b/, tag: 'bedtime', addTimes: ['22:00'] },
  { pattern: /\b(?:at\s+)?bedtime\b/, tag: 'bedtime', addTimes: ['22:00'] },
  { pattern: /\bqam\b/, tag: 'morning', addTimes: ['08:00'] },
  { pattern: /\b(?:in\s+the\s+)?morning\b/, tag: 'morning', addTimes: ['08:00'] },
  { pattern: /\bqpm\b/, tag: 'evening', addTimes: ['20:00'] },
  { pattern: /\b(?:in\s+the\s+)?evening\b/, tag: 'evening', addTimes: ['20:00'] },
  { pattern: /\b(?:at\s+)?(?:noon|midday)\b/, tag: 'midday', addTimes: ['12:00'] },
  { pattern: /\bac\b|\bbefore\s+meals?\b/, tag: 'before-meal' },
  { pattern: /\bpc\b|\bafter\s+meals?\b/, tag: 'after-meal' },
  { pattern: /\bbefore\s+breakfast\b/, tag: 'before-breakfast', addTimes: ['07:30'] },
];

const NUMBER_WORDS: Record<string, number> = {
  half: 0.5,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

const FREQUENCY_WORDS: Array<{ pattern: RegExp; key: keyof typeof FREQUENCY_TIMES }> = [
  // Longer / more-specific patterns first so "twice daily" wins over the
  // bare "daily" entry on qd.
  { pattern: /\bfive\s+times\s+(?:a\s+)?(?:day|daily)\b/, key: '5x' },
  { pattern: /\b(?:qid|four\s+times\s+(?:a\s+)?(?:day|daily))\b/, key: 'qid' },
  { pattern: /\b(?:tid|three\s+times\s+(?:a\s+)?(?:day|daily))\b/, key: 'tid' },
  { pattern: /\b(?:bid|twice\s+(?:a\s+)?(?:day|daily)|two\s+times\s+(?:a\s+)?day)\b/, key: 'bid' },
  { pattern: /\b(?:qd|qday|once\s+(?:a\s+)?(?:day|daily)|daily|every\s+day)\b/, key: 'qd' },
];

/** Normalize whitespace and lowercase; strip terminal punctuation. */
export function normalizeSig(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRoute(norm: string): { route: Route | null; consumed: string[] } {
  // Multi-word phrases first so "by mouth" wins over "by" + "mouth".
  const phrases = ['by mouth', 'in the eye', 'in the ear', 'in the nose'];
  for (const p of phrases) {
    if (norm.includes(p)) return { route: ROUTE_TOKENS[p]!, consumed: p.split(' ') };
  }
  const words = norm.split(' ');
  for (const w of words) {
    if (Object.prototype.hasOwnProperty.call(ROUTE_TOKENS, w)) {
      return { route: ROUTE_TOKENS[w]!, consumed: [w] };
    }
  }
  return { route: null, consumed: [] };
}

function extractAmount(norm: string): {
  amountPerDose: number | null;
  amountUnit: string | null;
  consumed: string[];
} {
  // Match "1 tab", "2 capsules", "0.5 mg", "10 units", "30 mL", or
  // "half tablet" / "one tab". Word-number variants come first.
  const tokens = norm.split(' ');
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i]!;
    const b = tokens[i + 1]!;
    const numeric = /^\d+(?:\.\d+)?$/.test(a) ? Number(a) : NUMBER_WORDS[a];
    if (numeric !== undefined && UNIT_TOKENS.has(b)) {
      return { amountPerDose: numeric, amountUnit: normalizeUnit(b), consumed: [a, b] };
    }
  }
  // Bare numeric (no unit): "1 po qid" -> assume tablets when route=po.
  for (const t of tokens) {
    if (/^\d+(?:\.\d+)?$/.test(t)) {
      return { amountPerDose: Number(t), amountUnit: null, consumed: [t] };
    }
    if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, t)) {
      return { amountPerDose: NUMBER_WORDS[t]!, amountUnit: null, consumed: [t] };
    }
  }
  return { amountPerDose: null, amountUnit: null, consumed: [] };
}

function normalizeUnit(u: string): string {
  const map: Record<string, string> = {
    tab: 'tab', tabs: 'tab', tablet: 'tab', tablets: 'tab',
    cap: 'cap', caps: 'cap', capsule: 'cap', capsules: 'cap',
    units: 'unit', drops: 'drop', puffs: 'puff', sprays: 'spray',
    patches: 'patch', supp: 'suppository',
  };
  return map[u] ?? u;
}

function extractFood(norm: string): { food: FoodInstruction; consumed: string[] } {
  if (/\bwith\s+food\b|\bwith\s+meals?\b/.test(norm))
    return { food: 'with-food', consumed: ['with', 'food'] };
  if (/\bwithout\s+food\b|\bon\s+an\s+empty\s+stomach\b/.test(norm))
    return { food: 'without-food', consumed: ['without', 'food'] };
  if (/\bbefore\s+meals?\b|\bac\b/.test(norm))
    return { food: 'before-meal', consumed: ['before', 'meals'] };
  if (/\bafter\s+meals?\b|\bpc\b/.test(norm))
    return { food: 'after-meal', consumed: ['after', 'meals'] };
  return { food: 'unspecified', consumed: [] };
}

function extractReason(norm: string): { reason: string | null; consumed: string[] } {
  // Common patterns:
  //   - "for pain", "for nausea", "for headache"
  //   - "prn pain", "prn rash" (reason directly after the prn token)
  // Stop the reason capture at a frequency / route / food / timing keyword
  // so "for pain qid" -> reason="pain", not "pain qid".
  const STOP_WORDS = '(?:every|qd|bid|tid|qid|qhs|qam|qpm|prn|po|sc|sl|im|iv|pr|topical|topically|inhaled|by|with|without|on|in|q\\d+h|daily|twice|three|four|five|each)';
  const forMatch = norm.match(
    new RegExp(`\\bfor\\s+([a-z][a-z\\s]{2,30}?)(?:\\s+${STOP_WORDS}\\b|$)`),
  );
  if (forMatch) {
    const reason = forMatch[1]!.trim();
    return { reason, consumed: ['for', ...reason.split(' ')] };
  }
  // "prn pain" / "prn nausea": single noun directly after prn.
  const prnMatch = norm.match(
    new RegExp(`\\bprn\\s+([a-z][a-z\\s]{2,30}?)(?:\\s+${STOP_WORDS}\\b|$)`),
  );
  if (prnMatch) {
    const reason = prnMatch[1]!.trim();
    return { reason, consumed: reason.split(' ') };
  }
  return { reason: null, consumed: [] };
}

function extractFrequency(norm: string): {
  key: keyof typeof FREQUENCY_TIMES | null;
  intervalHours: number | null;
  consumed: string[];
} {
  for (const fw of FREQUENCY_WORDS) {
    if (fw.pattern.test(norm)) {
      const match = norm.match(fw.pattern);
      return { key: fw.key, intervalHours: null, consumed: match ? match[0]!.split(' ') : [] };
    }
  }
  for (const q of QHX_MAP) {
    const m = norm.match(q.pattern);
    if (m) return { key: null, intervalHours: q.hours, consumed: m[0]!.split(' ') };
  }
  return { key: null, intervalHours: null, consumed: [] };
}

function extractTiming(norm: string): { timing: TimingTag[]; addTimes: string[]; consumed: string[] } {
  const tags: TimingTag[] = [];
  const addTimes: string[] = [];
  const consumed: string[] = [];
  for (const t of TIMING_MAP) {
    const m = norm.match(t.pattern);
    if (m) {
      if (!tags.includes(t.tag)) tags.push(t.tag);
      if (t.addTimes) for (const x of t.addTimes) if (!addTimes.includes(x)) addTimes.push(x);
      consumed.push(...m[0]!.split(' '));
    }
  }
  return { timing: tags, addTimes, consumed };
}

const NOISE_TOKENS = new Set<string>([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'at', 'on', 'to',
  'take', 'use', 'give', 'inject', 'apply', 'instill',
  'each', 'every', 'every-day', 'as', 'needed', 'directed',
  'is', 'are',
]);

/**
 * Parse a free-text sig into a `ParsedSig`. Never throws; unknown
 * tokens accumulate in `unparsed` and `confidence` decreases.
 */
export function parseSig(input: string): ParsedSig {
  const raw = input;
  const normalized = normalizeSig(input);
  if (!normalized) {
    return {
      raw,
      normalized,
      amountPerDose: null,
      amountUnit: null,
      dosesPerDay: null,
      intervalHours: null,
      route: null,
      asNeeded: false,
      reason: null,
      food: 'unspecified',
      timing: [],
      unparsed: [],
      confidence: 0,
      scheduleSuggestion: null,
    };
  }

  const consumed = new Set<string>();
  const consume = (xs: string[]) => xs.forEach((x) => consumed.add(x));

  const prn = /\bprn\b|\bas\s+needed\b/.test(normalized);
  if (prn) consume(['prn', 'as', 'needed']);

  const route = extractRoute(normalized);
  consume(route.consumed);

  const amount = extractAmount(normalized);
  consume(amount.consumed);

  const food = extractFood(normalized);
  consume(food.consumed);

  const freq = extractFrequency(normalized);
  consume(freq.consumed);

  const timing = extractTiming(normalized);
  consume(timing.consumed);

  const reason = extractReason(normalized);
  consume(reason.consumed);

  // dosesPerDay derivation
  let dosesPerDay: number | null = null;
  if (freq.key !== null) dosesPerDay = FREQUENCY_DOSES[freq.key] ?? null;
  else if (freq.intervalHours) dosesPerDay = Math.round(24 / freq.intervalHours);
  else if (timing.timing.length > 0 && !prn) {
    // Pure timing-based: "every morning and bedtime" = 2/day
    dosesPerDay = timing.addTimes.length || timing.timing.length;
  }

  // Schedule suggestion
  let scheduleSuggestion: ScheduleSuggestion | null = null;
  if (prn) {
    scheduleSuggestion = { kind: 'asNeeded', times: [], enabled: true };
  } else if (freq.intervalHours) {
    scheduleSuggestion = {
      kind: 'interval',
      times: [],
      intervalHours: freq.intervalHours,
      enabled: true,
    };
  } else if (freq.key) {
    const times = timing.addTimes.length > 0 && timing.addTimes.length === (FREQUENCY_DOSES[freq.key] ?? 0)
      ? [...timing.addTimes].sort()
      : (FREQUENCY_TIMES[freq.key] ?? []);
    scheduleSuggestion = {
      kind: 'daily',
      times: [...new Set(times)].sort(),
      enabled: true,
    };
  } else if (timing.addTimes.length > 0) {
    scheduleSuggestion = {
      kind: 'daily',
      times: [...new Set(timing.addTimes)].sort(),
      enabled: true,
    };
  }

  // Unparsed = tokens not consumed and not in NOISE_TOKENS list.
  const unparsed: string[] = [];
  for (const tok of normalized.split(' ')) {
    if (!tok) continue;
    if (consumed.has(tok)) continue;
    if (NOISE_TOKENS.has(tok)) continue;
    // Skip pure numbers that were part of a q-X-h pattern
    if (/^\d+$/.test(tok) && freq.intervalHours !== null) continue;
    unparsed.push(tok);
  }

  // Confidence: 1.0 baseline, subtract per missing/unparsed bit.
  let confidence = 1;
  if (amount.amountPerDose === null) confidence -= 0.2;
  if (dosesPerDay === null && !prn) confidence -= 0.3;
  if (route.route === null) confidence -= 0.15;
  confidence -= Math.min(0.4, unparsed.length * 0.1);
  if (confidence < 0) confidence = 0;
  confidence = Math.round(confidence * 100) / 100;

  return {
    raw,
    normalized,
    amountPerDose: amount.amountPerDose,
    amountUnit: amount.amountUnit,
    dosesPerDay,
    intervalHours: freq.intervalHours,
    route: route.route,
    asNeeded: prn,
    reason: reason.reason,
    food: food.food,
    timing: timing.timing,
    unparsed,
    confidence,
    scheduleSuggestion,
  };
}

/**
 * Render the parse back to a plain-English description (round-trip
 * sanity check for the UI: shows the user "we read this as ...").
 */
export function describeParsedSig(p: ParsedSig): string {
  if (p.confidence === 0 && p.normalized === '') return 'Empty instruction.';
  const parts: string[] = [];
  if (p.amountPerDose !== null) {
    const unit = p.amountUnit ?? (p.amountPerDose === 1 ? 'dose' : 'doses');
    parts.push(`${p.amountPerDose} ${unit}${p.amountPerDose === 1 || p.amountUnit ? '' : ''}`);
  }
  if (p.route) parts.push(routeLabel(p.route));
  if (p.asNeeded) parts.push('as needed');
  else if (p.intervalHours) parts.push(`every ${p.intervalHours} hours`);
  else if (p.dosesPerDay !== null) parts.push(frequencyLabel(p.dosesPerDay));
  if (p.timing.length > 0) parts.push(`(${p.timing.join(', ')})`);
  if (p.food !== 'unspecified') parts.push(p.food.replace('-', ' '));
  if (p.reason) parts.push(`for ${p.reason}`);
  return parts.join(' ').trim() || 'Unable to parse.';
}

function routeLabel(r: Route): string {
  const map: Record<Route, string> = {
    po: 'by mouth',
    sl: 'sublingual',
    sc: 'subcutaneous',
    iv: 'intravenous',
    im: 'intramuscular',
    pr: 'rectal',
    topical: 'topical',
    inhaled: 'inhaled',
    ophthalmic: 'in the eye',
    otic: 'in the ear',
    nasal: 'in the nose',
  };
  return map[r];
}

function frequencyLabel(n: number): string {
  switch (n) {
    case 1: return 'once a day';
    case 2: return 'twice a day';
    case 3: return 'three times a day';
    case 4: return 'four times a day';
    default: return `${n} times a day`;
  }
}
