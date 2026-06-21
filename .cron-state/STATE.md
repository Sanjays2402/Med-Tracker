# Med-Tracker autoship state

Branch: `feature/autoship` (off `main`)

This file is Cake (cron)'s only persistent memory between 20-min ticks. Update at
the end of every tick.

## Conventions

- Each tick ships up to 5 vertical feature slices, one commit per slice.
- Commit identity: Cake (cron) <51058514+Sanjays2402@users.noreply.github.com>
- No emoji in commit messages.
- Each new utility lives in `packages/utils/src/<feature>.ts`, tests in
  `packages/utils/tests/<feature>.test.ts`, and is re-exported from
  `packages/utils/src/index.ts`.
- Run the full quality gate ONCE per tick: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Repo state notes (read first)

- **pnpm store is on `/Volumes/Projects/.pnpm-store`** (config set explicitly
  because the root volume `/` was at 100%). Do not change.
- **node_modules is on `/Volumes/Projects/Med-Tracker/node_modules`** (the
  project volume); a fresh `pnpm install --prefer-offline --ignore-scripts`
  on tick 1 took ~11 minutes due to network re-downloads. Subsequent ticks
  should hit the store and be near-instant.
- **Pre-existing baseline failures on `main` (NOT to be blamed on autoship
  ticks; reproduced by running typecheck on main directly):**
  - `@med/config` typecheck: missing `@types/node` (4 errors in `src/index.ts`).
  - `@med/db` typecheck: missing `@types/node` + Prisma client type drift
    (Prisma 7 removed the `PrismaClient` / `Prisma` named exports the code
    depends on; 14 errors across `src/client.ts` + `src/seed.ts`).
  - `@med/utils` typecheck: ~18 errors in `src/taper-plan.ts` +
    `src/titration.ts` (strict undefined narrowing not satisfied; predates
    autoship).
  - `@med/ui` test suite: 228/228 fail with "ReferenceError: React is not
    defined" (the components were authored before the React 17+ automatic
    JSX runtime was enforced; missing `vitest.config.ts` jsx settings, or
    needs explicit `import React`).
  - Many `@med/web` tsx imports referencing missing local files.
- Autoship features must pass their own typecheck + tests in isolation
  (verified per tick via `pnpm --filter @med/utils test` and tsc on the
  new files).
- Do NOT push red code that you yourself introduced. If the existing
  baseline gates fail through no fault of the tick, ship anyway and log
  it here.

## Roadmap

Status legend: `[ ]` todo, `[x]` shipped (tick / SHA), `[~]` in progress, `[!]` skipped/blocked.

### Tier 1 — pure utilities (packages/utils)

1. [x] `renewal-window` — Insurance renewal eligibility (tick 1 / c571a7f).
2. [x] `missed-dose-replan` — Re-plan next safe dose after a miss (tick 1 / 017535d).
3. [x] `dose-rounding` — Round computed doses to dispensable strengths (tick 1 / 4f6e2df).
4. [x] `streak-rescue` — Detect at-risk streaks (tick 1 / 19d5df9).
5. [x] `pharmacy-hours` — Pharmacy hours resolver (tick 1 / 6e174b1).
6. [x] `notification-batcher` — Coalesce multiple due reminders inside a small window into one notification (tick 2 / 8facf2b).
7. [x] `dose-history-aggregator` — Group dose history into day/week/month buckets with status counts (tick 2 / 67a446b).
8. [x] `bp-log` — Blood-pressure paired-reading log with hypertension classification (tick 2 / 439ca7b).
9. [x] `weight-trend` — Rolling 7d/30d weight trend with EMA + outlier rejection (tick 3 / 3ade8e7).
10. [x] `glucose-log` — Pre/post-prandial glucose log with in-range %, hypo/hyper flags (tick 2 / 14b59ba).
11. [x] `prn-budget` — As-needed (PRN) usage budget tracker (e.g. max 4 doses / 24h) (tick 2 / 966a513).
12. [x] `regimen-summary` — Plain-language regimen summary: counts, timing buckets, top hubs (tick 4 / 6adaa92, +2e5511d fix).
13. [x] `dose-streak-by-med` — Per-medication streak (not just overall) with longest-streak history (tick 3 / 9b929d0).
14. [x] `pill-burden` — Daily pill burden (count + total mg / mL) for de-prescribing review (tick 3 / 580dedd).
15. [x] `pharmacy-distance-pick` — Pick closest open pharmacy given lat/lng + hours + carries-drug list (tick 3 / d242169).
16. [x] `interaction-pair-search` — Fast lookup of pair severity across full drug list (memoised classifier) (tick 4 / 33f69ff).
17. [x] `dose-adherence-trend` — Linear-fit adherence trend (slope, intercept, projected 30d %) (tick 3 / 044406f).
18. [x] `reminder-snooze-policy` — Snooze policy: max snoozes, escalation, auto-skip after N misses (tick 4 / 4d333c4).
19. [x] `vacation-overrides` — Per-day schedule overrides for vacations / travel days (tick 4 / 9fff87d).
20. [x] `medication-history-import` — Import external history (CSV) into normalized doses with dedup (tick 4 / 6274a75).
21. [x] `dose-time-drift` — Detect chronic time-shifting (08:00 doses creeping to 10:00) and surface as a soft alert (tick 5 / 700a65f).
22. [x] `caregiver-permission-matrix` — Per-caregiver capability matrix (view/edit/log per medication) (tick 5 / fd20e05).
23. [x] `insurance-tier-pick` — Choose cheapest covered alternative across plan tiers (uses cost-alternatives) (tick 5 / f3fa325).
24. [ ] `dose-confirmation-photo-meta` — Validate confirmation photo metadata (size, timestamp drift, dimensions).
25. [ ] `pill-image-fingerprint` — Compute perceptual fingerprint hash for pill-identifier matching.
26. [x] `regimen-change-diff` — Diff two snapshots of a regimen (added / removed / dose-changed meds) (tick 5 / 7e54a51).
27. [x] `caregiver-summary-rollup` — Roll up multiple patients' adherence into a household digest (tick 5 / 02d181f).
28. [x] `medication-name-fuzzy-match` — Fuzzy match a typed med name against the drug catalog (Damerau-Levenshtein + brand/generic alias) (tick 6 / fb307a1).
29. [x] `dose-time-suggest` — Suggest optimal times given quiet hours, meal windows, and existing schedules (composes with quiet-hours + food-windows) (tick 6 / 9ef22b1).
30. [x] `caregiver-share-token` — Generate / verify HMAC-SHA-256 caregiver share tokens with optional expiry and scope payload (tick 6 / 47e9dab + 1ddaa48 fix).
31. [ ] `medication-conflict-resolver` — Resolve conflicts between two medication records merged from different sources (e.g. EHR + manual entry).
32. [x] `pill-cutter-plan` — Plan tablet splitting for a non-dispensable strength (e.g. 5mg from 10mg scored tablets), respecting scored flag (tick 6 / 988c180).
33. [x] `adverse-event-log` — Patient-reported adverse event log with severity classification + temporal proximity to last dose (tick 6 / 3a4773a).

### Tier 1B — fresh roadmap (refill after tick 6)

34. [ ] `medication-conflict-resolver` — Merge conflicts when the same medication arrives from EHR + manual entry; pick which fields win, surface manual review queue.
35. [ ] `dose-confirmation-photo-meta` — Validate confirmation photo metadata (size, EXIF timestamp drift vs dueAt, min dimensions).
36. [ ] `pill-image-fingerprint` — Compute perceptual hash (aHash/dHash) for pill-identifier image matching; pure pixel math, no native deps.
37. [x] `refill-cost-projector` — Project annual cost across the regimen given current copays, refill cadence, and an optional plan-change date (tick 7 / e824fd7).
38. [x] `caregiver-event-feed` — Stream of dose / refill / adverse-event entries for a caregiver, paginated, deny-aware via permission-matrix (tick 7 / bc90168).
39. [x] `lab-window-tracker` — Track lab-test windows for medications that require periodic monitoring (warfarin INR, statin LFT, lithium level), with overdue / upcoming flags (tick 7 / f637675).
40. [ ] `prescription-fill-history` — Normalize pharmacy fill history (NDC + days_supply + fill_date) into a continuous-coverage map, surface gaps.
41. [ ] `pdc-by-medication` — Per-medication Proportion of Days Covered metric, the FDA-style adherence number caregivers and PBMs ask for.
42. [x] `dose-instruction-parser` — Parse free-text "sig" strings ("1 tab po qid prn pain") into structured Schedule + amountPerDose; deterministic vocabulary, no LLM (tick 7 / 1c9bbe6).
43. [x] `temperature-excursion-log` — Log + classify cold-chain excursions for refrigerated meds (insulin, biologics) using cold-chain.ts rules (tick 7 / 82bfe32).
44. [ ] `med-list-print-layout` — Generate a paginated, print-ready medication list (one row per med, with refill date / prescriber / strength); pure layout math, no rendering.
45. [ ] `caregiver-notification-throttle` — Throttle caregiver notifications so a noisy day doesn't trigger 20 pings; coalesce by severity tier.

### Tier 1C — fresh roadmap (refill after tick 7)

46. [ ] `prescriber-directory` — Normalize prescriber records (NPI dedup, name fuzzy-match), surface "which doctor prescribes what" rollup.
47. [ ] `drug-class-coverage` — Per-class coverage check across the regimen ("you have 2 statins but no antiplatelet") for cardio-risk review.
48. [ ] `pharmacy-fill-reconciliation` — Reconcile pharmacy fill events against expected supplyRemaining; surface short/over-fills and dispensing errors.
49. [ ] `dose-batch-export` — Export a date-range slice of dose events as FHIR MedicationAdministration JSON; pure shape translation, no network.
50. [ ] `regimen-printable-summary` — Wallet-card data layout (name / strength / route / sig / prescriber / pharmacy) sized to fit a 3.5x2" card.
51. [ ] `dose-import-csv` — Import dose history from common pharmacy CSV formats (Walgreens / CVS layouts) with column auto-mapping.
52. [ ] `interaction-time-spacer` — Suggest minimum time gap between two interacting meds (e.g. levothyroxine + calcium) and check existing schedules against it.
53. [ ] `caregiver-notification-throttle-policy` — Tier-aware notification throttler that batches non-urgent pings and rate-limits caregiver pages.
54. [ ] `appointment-prep-checklist` — Generate a structured pre-visit checklist (current meds, recent labs, reported AEs) given last-visit + upcoming-visit dates.
55. [ ] `regimen-load-score` — Composite regimen-burden score (pill count + dosing frequency + monitoring cadence + cost) for de-prescribing prioritization.

### Tier 2 — UI / app slices (web + ui pkg)

(Pulled forward only after Tier 1 momentum is established. Note: the
`@med/ui` test suite is currently red on baseline — fix the React JSX
runtime issue before adding UI features so new components don't get
buried under pre-existing failures.)

## Tick log

- 2026-06-20 22:14 PDT — tick 7: 5 features shipped.
  Commits: 1c9bbe6 dose-instruction-parser, e824fd7 refill-cost-projector,
  f637675 lab-window-tracker, 82bfe32 temperature-excursion-log,
  bc90168 caregiver-event-feed.
  Gate: 834/834 tests pass in `@med/utils` (104 new this tick:
  32+22+18+15+17). Lint + build placeholder ok. `@med/utils` typecheck
  baseline = 43 errors identical to start-of-tick (1 adherence-risk +
  1 date + 1 ics + 15 schedule-resolver + 8 taper-plan + 17 titration);
  zero new errors introduced by tick 7. `pnpm -r test` confirms
  `@med/ui` 228/228 JSX runtime failures unchanged from baseline.
  Refilled roadmap (Tier 1C) with 10 new candidates (#46-#55).

  Notes:
  - `dose-instruction-parser` is the first @med/utils module designed
    explicitly to AVOID an LLM. Sig parsing is on the trust-critical
    dosing path; every output must be reproducible and auditable.
    Frequency patterns are ordered longest-first so "twice daily"
    wins over the bare "daily" entry on qd — a subtle bug the test
    suite caught immediately. Stop-word lists prevent "for pain qid"
    from leaking the qid token into the reason field. Reason
    extraction supports both `for X` and `prn X` constructions
    (a common second variant on real sigs). Confidence is reported
    in [0, 1] so the UI can route low-confidence parses to human
    review instead of auto-applying them. The `unparsed` array
    surfaces every token the parser couldn't map; future enrichments
    should add tokens to NOISE_TOKENS rather than silently swallow.
  - `refill-cost-projector` does the cadence-anchor math carefully:
    if firstFillAt is in the past, it walks forward by daysSupply
    steps to land on or after `from` WITHOUT drifting cadence. A
    naive `from` reset would have introduced systematic over-counting
    for chronic patients with old anchor dates. Plan-change support
    runs a phantom "without plan change" projection so the savings
    delta is exact, and `preChangeCents` / `postChangeCents` are
    exposed separately for the UI's split bar chart. All math is in
    cents to avoid float drift; formatCentsUsd handles display.
  - `lab-window-tracker` introduces a status-rank ladder (overdue >
    due-soon > no-history > on-track > not-due-yet) so the per-
    medication rollup always headlines the most actionable item.
    requireBaseline + baselineDueDays handle the "must draw a
    baseline LFT within 2 weeks of starting a statin" case: when the
    grace window expires with no result, the window flips from
    no-history to overdue so it actually surfaces. The flat list is
    sorted by daysUntilDue ascending so the most-overdue item is
    always row 1; future trackers with similar "due-by-date"
    semantics should match this convention.
  - `temperature-excursion-log` composes with computeColdChainStatus
    rather than reimplementing budget math. Per-entry severity
    classifier uses fixed bands relative to spec.maxAllowedC
    (within-fridge <= 8C, mild <= nominal, severe >= 85% of max,
    over-max > max). budgetCostHours uses the same
    temperatureDerating function cold-chain.ts uses, so there is
    NO drift between the UI chip ("severe") and the underlying
    discard math ("overheat"). Stable IDs (start__end__temp-to-0.1)
    make form re-submissions idempotent. Validation rejects bad
    dates, end-before-start, and out-of-plausible-range temperatures
    with a per-index error so the UI can report "1 added, 2
    duplicates skipped, 1 rejected".
  - `caregiver-event-feed` is the second major consumer of
    caregiver-permission-matrix (after caregiver-summary-rollup
    composing with caregiver-digest). The fixed KIND_CAPABILITY map
    is the bridge: each event kind needs a specific capability, and
    `canCaregiverDo(matrix, capability, medicationId)` does the
    deny-wins / per-medication lookup the matrix already implements.
    Pagination is cursor-based — `${occurredAt}|${id}` — because
    offset-based pagination becomes incorrect when new events are
    appended at the head. Stable tie-break by id descending. Malformed
    cursors degrade to the first page silently. collectCaregiverFeed
    has a 1000-page safety bound so a bad cursor cannot spin forever.

- 2026-06-20 01:42 PDT — tick 1: bootstrap + 5 features shipped.
  Commits: c571a7f renewal-window, 017535d missed-dose-replan,
  4f6e2df dose-rounding, 19d5df9 streak-rescue, 6e174b1 pharmacy-hours.
  Gate: 305/305 tests pass in `@med/utils` (49 new + 256 existing);
  full `pnpm typecheck` fails on pre-existing `@med/config`, `@med/db`,
  `@med/ui`, `@med/utils/titration.ts` errors that reproduce on main
  with no autoship changes applied.

- 2026-06-20 05:13 PDT — tick 2: 5 features shipped.
  Commits: 8facf2b notification-batcher, 67a446b dose-history-aggregator,
  439ca7b bp-log, 14b59ba glucose-log, 966a513 prn-budget.
  Gate: 368/368 tests pass in `@med/utils` (63 new + 305 existing);
  `@med/utils typecheck` baseline = 43 errors identical to origin/main,
  zero new errors introduced by tick 2 (verified by checking out
  `origin/main` packages/utils and recounting). Lint + build remain
  placeholder echo in this package.

  Notes:
  - Both `bp-log` and `glucose-log` exported `SummaryOptions`; renamed
    to `BpSummaryOptions` and `GlucoseSummaryOptions` to keep
    `export *` re-exports unambiguous. Future tickets adding more
    summary utilities should follow the `<Module>SummaryOptions`
    pattern.
  - Test dates: avoid `new Date('YYYY-MM-DD')` which parses as UTC
    midnight; on PDT it lands on the prior local day and breaks the
    aggregator's local-time bucketing. Use `new Date(2026, 5, 15)`
    (Y, monthIndex, day) instead. Documented in
    `tests/dose-history-aggregator.test.ts`.

- 2026-06-20 08:17 PDT — tick 3: 5 features shipped.
  Commits: 3ade8e7 weight-trend, 9b929d0 dose-streak-by-med,
  580dedd pill-burden, d242169 pharmacy-distance-pick,
  044406f dose-adherence-trend.
  Gate: 448/448 tests pass in `@med/utils` (80 new this tick: 16+12+19+17+16);
  full `pnpm -r test` shows `@med/ui` 228/228 failures unchanged from
  baseline (React JSX runtime missing — confirmed reproduces on
  origin/main by re-running tests with main's `packages/utils` checked
  out). `@med/utils typecheck` baseline still 43 errors, all in
  pre-existing files (titration, taper-plan, schedule-resolver,
  adherence-risk, ics, date) — zero new errors from tick 3.

  Notes:
  - `weight-trend` MAD outlier detection needed a fallback: pure MAD
    is zero on a near-constant window, so a single outlier scored 0
    deviation. Falls back to `mean(nonZeroDeviations) / 8` so a 72 ->
    200 spike trips the `>= madFactor * scale` threshold. Future
    summarizers with similar "robust scale on near-constant data"
    needs should consider the same fallback.
  - `pill-burden` uses a small `parseStrength` helper (exported) to
    coerce "500 mg" / "5 mL" / "100 mcg" / "0.5 g" into canonical
    units. Reusable for other modules needing strength parsing.
  - `pharmacy-distance-pick` composes with `pharmacy-hours.ts` and
    introduces a clean `haversineDistanceKm` (exported) for
    distance math elsewhere (refill-batching could weight by it).
  - `dose-adherence-trend` composes directly with
    `dose-history-aggregator.ts` — pass a `DoseAggregation` straight
    in. r2 floor (`minR2: 0.1` default) prevents bouncing series
    from producing false trends. Useful precedent: future
    "trend" utilities should expose both a slope AND an r2-based
    confidence gate.

- 2026-06-20 13:42 PDT — tick 4: 5 features shipped + 1 fixup.
  Commits: 6adaa92 regimen-summary, 33f69ff interaction-pair-search,
  4d333c4 reminder-snooze-policy, 9fff87d vacation-overrides,
  6274a75 medication-history-import, 2e5511d fix (rename
  regimen-summary's TimeBucket to RegimenTimeBucket to resolve
  re-export collision with pill-burden).
  Gate: 542/542 tests pass in `@med/utils` (94 new this tick:
  16+22+17+17+22). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to origin/main; zero
  new errors introduced by tick 4 (verified by grep of tsc output
  against the 5 new module file names — no hits). No other
  package imports the new modules so `@med/ui` baseline
  failures (228/228 JSX runtime) are unaffected.

  Notes:
  - `pill-burden` already exports `TimeBucket` (4 buckets:
    morning/midday/evening/bedtime). `regimen-summary` needed a
    different 5-bucket set (adds explicit `afternoon` and
    `overnight`) and the two are semantically different windows,
    so renamed `regimen-summary`'s type to `RegimenTimeBucket`
    rather than collapsing them. Future modules with a "time of
    day" bucket type should add a module-prefixed name to avoid
    re-export collisions; the `@med/utils` index re-exports
    everything with `export *` so name clashes break typecheck.
  - `medication-history-import` initially used a round-to-bucket
    dedup key on the timestamp, which produced false negatives
    at bucket boundaries (08:04 -> bucket 0, 08:06 -> bucket 10
    with 5-min tolerance both miss each other). Switched to a
    per-med list of `{ ms, index }` with abs-diff <= tolerance
    check. Slightly slower (O(rows-per-med)) but exact at the
    boundary; for human-scale histories the cost is invisible.
  - `interaction-pair-search` composes with `interaction-severity`
    by calling `classifyInteractions` once at index time, plus
    on-demand 2-drug runs for candidates outside the active list.
    Cache hits are written so a repeat query is O(1). Stays in
    lockstep with SEVERITY_RULES — no duplicate rules.
  - `vacation-overrides` operates on `DoseInstance[]` (a small
    `{ medicationId, dueAt: Date }` tuple) so it composes with
    `expandSchedule` output without dragging the full Dose Zod
    type through. Per-med overrides win over regimen-wide ones
    for the same date; that lets a "fasting day" skip everything
    except a critical seizure med via a more-specific override.
  - `reminder-snooze-policy` exposes a `snoozeLadder()` preview
    helper so the settings UI can show "5, 10, 20 minutes" for
    the user's chosen factor/cap. Total-elapsed `autoSkipAfterMinutes`
    is a belt-and-braces cap independent of snooze count.

- 2026-06-20 16:27 PDT — tick 5: 5 features shipped.
  Commits: 700a65f dose-time-drift, 7e54a51 regimen-change-diff,
  fd20e05 caregiver-permission-matrix, f3fa325 insurance-tier-pick,
  02d181f caregiver-summary-rollup.
  Gate: 624/624 tests pass in `@med/utils` (82 new this tick:
  15+16+20+15+16). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to origin/main; zero
  new errors introduced by tick 5 (verified by listing the unique
  error files: taper-plan, titration, schedule-resolver,
  adherence-risk, date, ics — none of the 5 new tick-5 modules
  appear). `@med/ui` 228/228 JSX runtime failures unchanged from
  baseline.

- 2026-06-20 19:27 PDT — tick 6: 5 features shipped + 1 fixup.
  Commits: fb307a1 medication-name-fuzzy-match, 9ef22b1 dose-time-suggest,
  47e9dab caregiver-share-token, 988c180 pill-cutter-plan,
  3a4773a adverse-event-log, 1ddaa48 fix (Uint8Array<ArrayBufferLike>
  on crypto.subtle + DoseHistoryEntry name collision).
  Gate: 730/730 tests pass in `@med/utils` (106 new this tick:
  25+19+21+18+23). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to start-of-tick (1
  adherence-risk + 1 date + 1 ics + 15 schedule-resolver + 8
  taper-plan + 17 titration); zero new errors introduced by tick 6
  after the fixup commit. `pnpm -r test` confirms `@med/ui`
  228/228 JSX runtime failures unchanged from baseline.
  Refilled roadmap (Tier 1B) with 12 new candidates (#34-#45).

  Notes:
  - `medication-name-fuzzy-match` uses Damerau-Levenshtein (single-edit
    transposition cost) so common typos like `metforimn` resolve to
    `metformin`. Class is scored at 0.7 weight so a class-name typo
    can never outrank a real generic/brand match. A small prefix bonus
    (capped 0.05) helps single-letter queries surface a useful list
    without letting an exact match be displaced. Three thresholds:
    `minScore` (default 0.55) for the visible list, `acceptScore`
    (default 0.8) for the auto-select path via `bestDrugMatch`, and
    `prefixBonus` toggle. Normalization strips dosage-form suffixes
    (XL, ER, HCL) BEFORE distance is computed so "Metformin XR"
    matches "Metformin" exactly.
  - `dose-time-suggest` is the first @med/utils module that COMPOSES
    quiet-hours + food-windows + existing doses in one decision. Per-
    slot penalties are typed (`SuggestionPenaltyKind`) so the UI can
    render expandable "why this time?" panels. ER/required-food rule
    uses a graceful fallback: even when avoidance is mathematically
    impossible (e.g. 3 doses + 9h quiet window), the suggester picks
    the least-bad anchor instead of throwing. Spacing-too-tight is
    soft so dosesPerDay=1 always produces a result.
  - `caregiver-share-token` uses `globalThis.crypto.subtle` not
    `node:crypto` to stay isomorphic (Node 18+ AND browser) WITHOUT
    requiring `@types/node`. HMAC-SHA-256 with a base64url-encoded
    JSON payload `{v, sid, scp, iat, exp?}`. Scopes are encoded as
    2-char codes (vm/va/vr) to keep tokens compact. The verification
    result is a discriminated union so the API can distinguish
    malformed / bad-version / signature-mismatch / expired /
    not-yet-valid / secret-too-short without leaking the difference
    to an unauthenticated edge. Secret must be >= 32 bytes; constant-
    time signature comparison; 60s clock-skew tolerance on iat.
    Future utilities that touch crypto.subtle should reuse the
    `asBufferSource(b: Uint8Array): ArrayBuffer` shim — TS 5.7+
    rejects raw `Uint8Array<ArrayBufferLike>` as a `BufferSource`
    because `ArrayBufferLike` could be `SharedArrayBuffer`. The shim
    copies into a fresh `ArrayBuffer`.
  - `pill-cutter-plan` complements dose-rounding rather than
    duplicating it. dose-rounding picks across multiple strengths;
    pill-cutter-plan specialises on splitting a SINGLE strength with
    strict safety rules: only `scored` allows halves, only `scored +
    crossScored` allows quarters, ER tablets NEVER split. Default 5%
    deviation cap (tighter than dose-rounding's 10%) because real-
    world execution of splits is more error-prone. ER warnings on
    tablets the plan does NOT use are surfaced as informational but
    do NOT block feasibility — the user can still take the non-ER
    options safely.
  - `adverse-event-log` is the per-EVENT companion to
    side-effect-correlation (which is a corpus-level signal).
    Severity comes from MAX(tag severity, patient-severity threshold).
    Escalation rule is intentionally narrow: life-threatening always,
    major only when at least one suspect medication is within the
    proximity window — prevents nuisance escalations for major
    events that pre-date any current medication. IDs are deterministic
    from (onsetAt, sorted tags) so re-importing the same event from
    external sources is idempotent.
  - Fixup commit caught two issues:
    (a) Uint8Array<ArrayBufferLike> not assignable to BufferSource on
        TS 5.7+ for crypto.subtle calls. Fixed via the asBufferSource
        shim documented above.
    (b) `DoseHistoryEntry` name collision when both adverse-event-log
        and dose-history-aggregator are re-exported via `export *`
        from index.ts. Renamed adverse-event-log's type to
        `AdverseDoseHistoryEntry` — same precedent as tick 4's
        `RegimenTimeBucket` rename. The `<Module>Foo` convention now
        has multiple uses: future modules adding an existing-name
        type should prefix the module name to avoid breaking the
        index re-export.

  Notes:
  - `dose-time-drift` filters by medicationId at the per-med
    entrypoint AND in the multi-med entrypoint groups before
    calling computeDoseTimeDrift; reports are sorted by confidence
    descending so the UI surfaces actionable rows first. Noise
    clipping (default 240 min) keeps the median robust without
    discarding the sample (count is preserved). When sample size
    is below minSamples, direction='insufficient' and message
    cites the actual count.
  - `regimen-change-diff` normalizes schedules through a sorted-
    key (sorted times, sorted daysOfWeek, kind, interval, cron,
    enabled) so reordered times do NOT register as a change. A
    kind change (daily -> interval) shows up as both a
    schedules-removed and schedules-added diff entry, which the
    UI bullet renderer surfaces clearly. The `fields` allow-list
    lets callers restrict to a subset when only certain fields
    are interesting (e.g. dashboard cares about strength +
    schedules, refill page cares about supply only).
  - `caregiver-permission-matrix` uses deny-wins-over-grant
    semantics so a medication marked deny=['view-medications'] is
    invisible even if the global scope grants view-medications.
    Expired shares return a matrix with expired=true and ALL
    helpers short-circuit to false / empty (no leaking access via
    the per-medication map). Capability vocabulary is explicit:
    no implicit "admin" capability. Scope -> capability map is
    typed against `NonNullable<CaregiverShare['scopes']>[number]`
    so adding a new scope in @med/types is a type error here
    until handled.
  - `insurance-tier-pick` charges fullPriceCents while the
    patient's remaining deductible could cover the full fill,
    falling back to copay once the deductible cannot. This is an
    approximation (an exact tracker would partial-bill the first
    fill); the 'deductible-applies' flag discloses it. Tiebreak
    on equal cost prefers offerings WITHOUT prior-auth /
    step-therapy flags. Mail-order + daysSupply >= 90 produces
    both 'mail-order-discount' and 'ninety-day-pack' flags so
    the UI can compose a "Switch to mail order for $X less"
    nudge.
  - `caregiver-summary-rollup` composes directly with
    composeCaregiverDigest's DigestInput type so callers can
    fan-out a single SQL query into both per-patient emails and
    a combined household summary. Singular/plural is hand-rolled
    (no Intl.PluralRules) so the messages render the same in
    every environment. attentionMedications are sorted by PDC
    ascending and capped at perPatientMissedLimit with an
    "and N more" tail.
