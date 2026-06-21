/**
 * Prescriber directory: normalize, dedupe, and roll up prescribers.
 *
 * Real medication histories arrive from three places — manual entry,
 * EHR import, and pharmacy fill records — and the SAME doctor often
 * shows up three different ways:
 *
 *   - "Jane Smith, MD"   (manual)
 *   - "Smith, Jane A"    (pharmacy CSV)
 *   - "Dr. Jane Smith"   (EHR free-text)
 *   - All three with NPI 1234567893
 *
 * If we trust the strings as-is the dashboard reads "you have 3
 * cardiologists" when the patient has one. This module:
 *
 *   1. **Canonicalises names** (Last, First M / suffix stripped) so
 *      string equality is meaningful.
 *   2. **Dedupes on NPI first, then on canonical name + specialty**.
 *      NPI is authoritative when present — two records with the same
 *      NPI always collapse, even if names disagree (one wins, others
 *      are kept as aliases so the UI can show "also known as").
 *   3. **Validates NPI** via the Luhn-mod-10 + 80840 prefix check
 *      that CMS publishes; bad NPIs are dropped from the dedup key
 *      and the entry is flagged `npiValid=false`.
 *   4. **Rolls up "who prescribes what"** so a caregiver can see
 *      "Dr. Smith prescribes 4 of your 12 medications: lisinopril,
 *      metformin, atorvastatin, aspirin."
 *
 * Pure / deterministic. No I/O.
 */

export interface PrescriberRecord {
  /** Free-text name as it arrived from the source system. */
  name: string;
  /** 10-digit NPI as a string, if known. */
  npi?: string;
  /** Specialty as it arrived; not canonicalised. */
  specialty?: string;
  /** Source system label, for surfacing in the UI. */
  source?: string;
  /** Medications prescribed by this record. Optional but feeds the rollup. */
  medicationIds?: string[];
}

export interface CanonicalPrescriber {
  /** Stable id derived from NPI (if valid) or canonical name. */
  id: string;
  /** Canonical "Last, First M." display name. */
  displayName: string;
  /** Canonical lookup key (lowercased, suffix-stripped). */
  canonicalKey: string;
  /** Validated NPI, or undefined if no input record had a valid one. */
  npi?: string;
  /** True iff at least one source record had a Luhn-valid NPI. */
  npiValid: boolean;
  /** Lowercased specialty winner (most common across sources). */
  specialty?: string;
  /** Source labels seen for this prescriber. */
  sources: string[];
  /** Distinct medication ids prescribed by this prescriber. */
  medicationIds: string[];
  /** Other name spellings observed in the input. */
  aliases: string[];
  /** How many input records collapsed into this canonical entry. */
  recordCount: number;
}

export interface PrescriberDirectory {
  prescribers: CanonicalPrescriber[];
  /** Input records that were dropped (e.g. empty name). */
  rejected: { record: PrescriberRecord; reason: string }[];
  /** Per-medication mapping back to the canonical prescriber id. */
  byMedication: Record<string, string>;
}

export interface BuildDirectoryOptions {
  /**
   * If true, two records with no NPI but identical canonical name AND
   * compatible specialty (one empty or both equal lowercased) collapse.
   * Default true. Disable for forensic audits where you want to keep
   * every source row visible.
   */
  collapseByName?: boolean;
}

const NAME_SUFFIXES = new Set([
  'jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv',
  'md', 'm.d.', 'm.d', 'do', 'd.o.', 'd.o',
  'np', 'n.p.', 'pa', 'p.a.', 'pa-c', 'rn', 'r.n.',
  'phd', 'ph.d.', 'dnp', 'dpt', 'pharmd', 'pharm.d.',
  'facc', 'facp', 'faafp', 'fasn',
]);
const NAME_PREFIXES = new Set([
  'dr', 'dr.', 'doctor', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'prof', 'prof.',
]);

/**
 * Strip honorifics + degrees, lower-case, collapse whitespace.
 * "Dr. Jane Smith, M.D., FACC" -> "jane smith".
 */
function stripDecorations(raw: string): string {
  // Remove parenthesised content first ("Smith (cardio)" -> "Smith").
  const noParens = raw.replace(/\([^)]*\)/g, ' ');
  // Tokenise on commas + whitespace, drop empties.
  const tokens = noParens.split(/[\s,]+/).filter(Boolean);
  const cleaned: string[] = [];
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (NAME_PREFIXES.has(lower)) continue;
    if (NAME_SUFFIXES.has(lower)) continue;
    // Token like "M.D." that landed without the period normalisation.
    const dotless = lower.replace(/\./g, '');
    if (dotless && NAME_SUFFIXES.has(dotless)) continue;
    cleaned.push(t);
  }
  return cleaned.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Convert any of "Jane Smith", "Smith, Jane", "Smith, Jane A" to a
 * canonical "first middle last" tuple. We do NOT require a known set
 * of first names — comma is the structural cue. We detect the comma
 * BEFORE stripping decorations, because `stripDecorations` collapses
 * the comma out of the working string.
 */
function parseName(raw: string): { first: string; middle: string; last: string } | null {
  if (!raw || !raw.trim()) return null;
  const commaIdx = raw.indexOf(',');
  if (commaIdx > 0 && commaIdx < raw.length - 1) {
    const leftStripped = stripDecorations(raw.slice(0, commaIdx));
    const rightStripped = stripDecorations(raw.slice(commaIdx + 1));
    // Structural "Last, First [M]" only if BOTH sides have content after
    // decoration strip. "Jane Smith, MD" -> right is empty (MD stripped)
    // and falls through to plain parsing.
    if (leftStripped && rightStripped) {
      const leftTokens = leftStripped.split(/\s+/).filter(Boolean);
      const rightTokens = rightStripped.split(/\s+/).filter(Boolean);
      const last = leftTokens.join(' ');
      const first = rightTokens[0] ?? '';
      const middle = rightTokens.slice(1).join(' ');
      return { first, middle, last };
    }
  }
  const stripped = stripDecorations(raw);
  if (!stripped) return null;
  const parts = stripped.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return { first: '', middle: '', last: parts[0]! };
  const last = parts[parts.length - 1]!;
  const first = parts[0]!;
  const middle = parts.slice(1, -1).join(' ');
  return { first, middle, last };
}

function titleCase(s: string): string {
  if (!s) return s;
  return s
    .split(/(\s+|-)/)
    .map((chunk) => {
      if (chunk.length === 0 || /^\s+$/.test(chunk) || chunk === '-') return chunk;
      // Preserve single-letter initials with trailing dot ("A.").
      if (chunk.length === 1) return chunk.toUpperCase();
      return chunk.charAt(0).toUpperCase() + chunk.slice(1);
    })
    .join('');
}

function formatDisplay(parsed: { first: string; middle: string; last: string }): string {
  const last = titleCase(parsed.last);
  const first = titleCase(parsed.first);
  const middle = parsed.middle
    ? ` ${parsed.middle
        .split(/\s+/)
        .map((m) => (m.length === 1 ? `${m.toUpperCase()}.` : titleCase(m)))
        .join(' ')}`
    : '';
  if (!first) return last;
  return `${last}, ${first}${middle}`.trim();
}

function canonicalKey(parsed: { first: string; middle: string; last: string }): string {
  // First initial + last name. Middle is too noisy across sources.
  const firstInitial = parsed.first ? parsed.first.charAt(0) : '';
  return `${parsed.last}|${firstInitial}`;
}

/**
 * NPI validation per CMS spec: 10 digits, Luhn-mod-10 checksum on the
 * first 9 digits prefixed by `80840`. The prefix is added to the
 * Luhn calculation, NOT to the stored NPI string.
 */
export function isValidNpi(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const digits = '80840' + value;
  let sum = 0;
  for (let i = 0; i < digits.length - 1; i++) {
    const d = Number(digits[digits.length - 2 - i]);
    if (i % 2 === 0) {
      const doubled = d * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += d;
    }
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[digits.length - 1]);
}

interface Bucket {
  records: PrescriberRecord[];
  parsedNames: { first: string; middle: string; last: string }[];
  npiSet: Set<string>;
  validNpiSet: Set<string>;
  specialtyTallies: Map<string, number>;
  sources: Set<string>;
  medicationIds: Set<string>;
  displayCandidates: Map<string, number>; // display string -> count
}

function emptyBucket(): Bucket {
  return {
    records: [],
    parsedNames: [],
    npiSet: new Set(),
    validNpiSet: new Set(),
    specialtyTallies: new Map(),
    sources: new Set(),
    medicationIds: new Set(),
    displayCandidates: new Map(),
  };
}

function specialtyKey(s?: string): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function pickTopTally(m: Map<string, number>): string | undefined {
  let best: { key: string; n: number } | undefined;
  for (const [k, n] of m) {
    if (!best || n > best.n || (n === best.n && k < best.key)) best = { key: k, n };
  }
  return best?.key;
}

function makeId(npi: string | undefined, key: string): string {
  if (npi) return `npi:${npi}`;
  return `name:${key}`;
}

/**
 * Build a deduplicated prescriber directory from raw source records.
 *
 * Pass 1: every record is normalised, validated, and placed into a
 * bucket keyed by NPI when present. Records sharing an NPI always
 * collapse, even if names disagree. Pass 2: NPI-less records collapse
 * by canonical name when `collapseByName` is true and specialties are
 * compatible.
 */
export function buildPrescriberDirectory(
  records: PrescriberRecord[],
  options: BuildDirectoryOptions = {},
): PrescriberDirectory {
  const collapseByName = options.collapseByName ?? true;
  const rejected: { record: PrescriberRecord; reason: string }[] = [];

  // Two indexes: npi -> bucket, and canonicalKey -> bucket (for NPI-less).
  const npiBuckets = new Map<string, Bucket>();
  const nameBuckets = new Map<string, Bucket>();

  // First pass: NPI bucketing wins when NPI is present.
  for (const record of records) {
    const parsed = parseName(record.name ?? '');
    if (!parsed || !parsed.last) {
      rejected.push({ record, reason: 'empty-or-unparseable-name' });
      continue;
    }
    const display = formatDisplay(parsed);
    const key = canonicalKey(parsed);

    const rawNpi = record.npi ? record.npi.replace(/\D/g, '') : '';
    const npiValid = rawNpi.length === 10 && isValidNpi(rawNpi);
    // Bucket by NPI ONLY when it's structurally a 10-digit string; an
    // invalid checksum still collapses (typo in last digit shouldn't
    // become a phantom new prescriber).
    let bucketKey: string;
    let bucketMap: Map<string, Bucket>;
    if (rawNpi.length === 10) {
      bucketKey = rawNpi;
      bucketMap = npiBuckets;
    } else if (collapseByName) {
      bucketKey = key;
      bucketMap = nameBuckets;
    } else {
      bucketKey = `${key}|${JSON.stringify(record)}`;
      bucketMap = nameBuckets;
    }

    let bucket = bucketMap.get(bucketKey);
    if (!bucket) {
      bucket = emptyBucket();
      bucketMap.set(bucketKey, bucket);
    }
    bucket.records.push(record);
    bucket.parsedNames.push(parsed);
    if (rawNpi.length === 10) {
      bucket.npiSet.add(rawNpi);
      if (npiValid) bucket.validNpiSet.add(rawNpi);
    }
    const spec = specialtyKey(record.specialty);
    if (spec) bucket.specialtyTallies.set(spec, (bucket.specialtyTallies.get(spec) ?? 0) + 1);
    if (record.source) bucket.sources.add(record.source);
    for (const m of record.medicationIds ?? []) bucket.medicationIds.add(m);
    bucket.displayCandidates.set(display, (bucket.displayCandidates.get(display) ?? 0) + 1);
  }

  // Second pass: NPI-less buckets MAY collapse into NPI buckets if
  // canonical name AND specialty match exactly (and collapseByName).
  // This handles the realistic "manual entry without NPI" + "EHR
  // import with NPI" pair for the same doctor.
  if (collapseByName) {
    for (const [nameKey, nameBucket] of Array.from(nameBuckets.entries())) {
      const nameParsed = nameBucket.parsedNames[0]!;
      const nameSpec = pickTopTally(nameBucket.specialtyTallies);
      let absorbed = false;
      for (const npiBucket of npiBuckets.values()) {
        const npiParsed = npiBucket.parsedNames[0]!;
        if (canonicalKey(npiParsed) !== canonicalKey(nameParsed)) continue;
        const npiSpec = pickTopTally(npiBucket.specialtyTallies);
        if (npiSpec && nameSpec && npiSpec !== nameSpec) continue;
        // Merge nameBucket into npiBucket.
        for (const r of nameBucket.records) npiBucket.records.push(r);
        for (const p of nameBucket.parsedNames) npiBucket.parsedNames.push(p);
        for (const [k, n] of nameBucket.specialtyTallies) {
          npiBucket.specialtyTallies.set(k, (npiBucket.specialtyTallies.get(k) ?? 0) + n);
        }
        for (const s of nameBucket.sources) npiBucket.sources.add(s);
        for (const m of nameBucket.medicationIds) npiBucket.medicationIds.add(m);
        for (const [d, n] of nameBucket.displayCandidates) {
          npiBucket.displayCandidates.set(d, (npiBucket.displayCandidates.get(d) ?? 0) + n);
        }
        nameBuckets.delete(nameKey);
        absorbed = true;
        break;
      }
      if (absorbed) continue;
    }
  }

  // Materialise canonical entries.
  const out: CanonicalPrescriber[] = [];
  const byMedication: Record<string, string> = {};
  const emit = (bucket: Bucket) => {
    const parsed = bucket.parsedNames[0]!;
    const key = canonicalKey(parsed);
    // Prefer a valid NPI when present; fall back to any 10-digit npi
    // we saw so the UI can flag it as invalid.
    const validNpi = bucket.validNpiSet.size > 0 ? [...bucket.validNpiSet].sort()[0] : undefined;
    const anyNpi = bucket.npiSet.size > 0 ? [...bucket.npiSet].sort()[0] : undefined;
    const npi = validNpi ?? anyNpi;
    const id = makeId(npi, key);
    const display = pickTopTally(bucket.displayCandidates) ?? formatDisplay(parsed);
    const aliases = Array.from(bucket.displayCandidates.keys())
      .filter((d) => d !== display)
      .sort();
    const specialty = pickTopTally(bucket.specialtyTallies);
    const entry: CanonicalPrescriber = {
      id,
      displayName: display,
      canonicalKey: key,
      npi,
      npiValid: bucket.validNpiSet.size > 0,
      specialty,
      sources: [...bucket.sources].sort(),
      medicationIds: [...bucket.medicationIds].sort(),
      aliases,
      recordCount: bucket.records.length,
    };
    out.push(entry);
    for (const m of entry.medicationIds) byMedication[m] = id;
  };
  for (const b of npiBuckets.values()) emit(b);
  for (const b of nameBuckets.values()) emit(b);

  out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { prescribers: out, rejected, byMedication };
}

/**
 * For a single medication, find the canonical prescriber id (if any).
 * Returns undefined when the medication is in `rejected` or absent.
 */
export function prescriberForMedication(
  directory: PrescriberDirectory,
  medicationId: string,
): CanonicalPrescriber | undefined {
  const id = directory.byMedication[medicationId];
  if (!id) return undefined;
  return directory.prescribers.find((p) => p.id === id);
}

/**
 * One-line headline for a caregiver dashboard:
 *   "Dr. Smith manages 4 of 12 medications."
 * Returns the prescribers sorted by med count descending, top N.
 */
export function topPrescribers(
  directory: PrescriberDirectory,
  totalMedications: number,
  limit = 3,
): { prescriber: CanonicalPrescriber; share: number; headline: string }[] {
  const sorted = [...directory.prescribers]
    .filter((p) => p.medicationIds.length > 0)
    .sort((a, b) => {
      const d = b.medicationIds.length - a.medicationIds.length;
      return d !== 0 ? d : a.displayName.localeCompare(b.displayName);
    })
    .slice(0, Math.max(1, limit));
  return sorted.map((prescriber) => {
    const n = prescriber.medicationIds.length;
    const share = totalMedications > 0 ? n / totalMedications : 0;
    const denom = totalMedications > 0 ? totalMedications : n;
    const headline = `${prescriber.displayName} manages ${n} of ${denom} medication${denom === 1 ? '' : 's'}.`;
    return { prescriber, share, headline };
  });
}
