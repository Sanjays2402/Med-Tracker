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

34. [x] `medication-conflict-resolver` — Merge conflicts when the same medication arrives from EHR + manual entry; pick which fields win, surface manual review queue (tick 9 / fa14d62).
35. [ ] `dose-confirmation-photo-meta` — Validate confirmation photo metadata (size, EXIF timestamp drift vs dueAt, min dimensions).
36. [ ] `pill-image-fingerprint` — Compute perceptual hash (aHash/dHash) for pill-identifier image matching; pure pixel math, no native deps.
37. [x] `refill-cost-projector` — Project annual cost across the regimen given current copays, refill cadence, and an optional plan-change date (tick 7 / e824fd7).
38. [x] `caregiver-event-feed` — Stream of dose / refill / adverse-event entries for a caregiver, paginated, deny-aware via permission-matrix (tick 7 / bc90168).
39. [x] `lab-window-tracker` — Track lab-test windows for medications that require periodic monitoring (warfarin INR, statin LFT, lithium level), with overdue / upcoming flags (tick 7 / f637675).
40. [x] `prescription-fill-history` — Normalize pharmacy fill history (NDC + days_supply + fill_date) into a continuous-coverage map, surface gaps (tick 8 / edd16b9).
41. [x] `pdc-by-medication` — Per-medication Proportion of Days Covered metric, the FDA-style adherence number caregivers and PBMs ask for (tick 8 / fe4eb39).
42. [x] `dose-instruction-parser` — Parse free-text "sig" strings ("1 tab po qid prn pain") into structured Schedule + amountPerDose; deterministic vocabulary, no LLM (tick 7 / 1c9bbe6).
43. [x] `temperature-excursion-log` — Log + classify cold-chain excursions for refrigerated meds (insulin, biologics) using cold-chain.ts rules (tick 7 / 82bfe32).
44. [ ] `med-list-print-layout` — Generate a paginated, print-ready medication list (one row per med, with refill date / prescriber / strength); pure layout math, no rendering.
45. [ ] `caregiver-notification-throttle` — Throttle caregiver notifications so a noisy day doesn't trigger 20 pings; coalesce by severity tier.

### Tier 1C — fresh roadmap (refill after tick 7)

46. [x] `prescriber-directory` — Normalize prescriber records (NPI dedup, name fuzzy-match), surface "which doctor prescribes what" rollup (tick 8 / b1f3202).
47. [x] `drug-class-coverage` — Per-class coverage check across the regimen ("you have 2 statins but no antiplatelet") for cardio-risk review (tick 8 / 32b0a4f).
48. [x] `pharmacy-fill-reconciliation` — Reconcile pharmacy fill events against expected supplyRemaining; surface short/over-fills and dispensing errors (tick 8 / d8ba29b).
49. [ ] `dose-batch-export` — Export a date-range slice of dose events as FHIR MedicationAdministration JSON; pure shape translation, no network.
50. [ ] `regimen-printable-summary` — Wallet-card data layout (name / strength / route / sig / prescriber / pharmacy) sized to fit a 3.5x2" card.
51. [ ] `dose-import-csv` — Import dose history from common pharmacy CSV formats (Walgreens / CVS layouts) with column auto-mapping.
52. [x] `interaction-time-spacer` — Suggest minimum time gap between two interacting meds (e.g. levothyroxine + calcium) and check existing schedules against it (tick 9 / 14c150a).
53. [ ] `caregiver-notification-throttle-policy` — Tier-aware notification throttler that batches non-urgent pings and rate-limits caregiver pages.
54. [ ] `appointment-prep-checklist` — Generate a structured pre-visit checklist (current meds, recent labs, reported AEs) given last-visit + upcoming-visit dates.
55. [ ] `regimen-load-score` — Composite regimen-burden score (pill count + dosing frequency + monitoring cadence + cost) for de-prescribing prioritization.

### Tier 1D — fresh roadmap (refill after tick 8)

56. [ ] `medication-name-spell-suggest` — One-letter typo suggester for the rxnorm catalog; produces "did you mean X?" suggestions distinct from the broader fuzzy match.
57. [ ] `dose-reminder-quiet-hours-override` — Per-medication exception to global quiet-hours (e.g. seizure rescue meds always ring through).
58. [x] `caregiver-handoff-summary` — Structured handoff summary for shift-change between caregivers (last 24h doses, alerts, meds added/removed) (tick 10 / 5f73ce0).
59. [x] `pdc-trend` — Track PDC over rolling 90/180/365-day windows so the dashboard can show whether adherence is trending up or down (tick 9 / 1d912f9).
60. [ ] `fill-history-csv-import` — Import a pharmacy fill history CSV (column auto-map) into PharmacyFillEvent[]; feeds prescription-fill-history + pdc-by-medication directly.
61. [x] `regimen-snapshot-archive` — Snapshot a regimen at a moment in time (e.g. for legal records); produces a stable signed JSON blob (tick 10 / afcf06f).
62. [x] `drug-class-coverage-bundles-builder` — Compose custom bundle expectations from condition codes (ICD-10 -> classes) so the patient gets a personalised "what's missing" check (tick 9 / 2ed2101).
63. [x] `dose-late-escalation-policy` — Define multi-tier escalation: 5min reminder -> 30min caregiver ping -> 2h family call, all configurable per medication (tick 10 / b4e0081).
64. [x] `inventory-low-stock-forecast` — Per-medication "this lot runs out on YYYY-MM-DD" forecast that composes inventory-ledger + refill-forecast (tick 9 / f26d1ad).
65. [ ] `prescriber-contact-card` — Format a prescriber's contact info (name + specialty + phone + fax + NPI) into a wallet-printable vCard-like block.

### Tier 1E — fresh roadmap (refill after tick 9)

66. [x] `appointment-followup-tracker` — Track recommended follow-up appointments from clinic notes (`see in 3 months`, lab follow-up) with due dates and overdue flagging (tick 11 / c1a333d).
67. [x] `medication-refusal-log` — Per-dose refusal log (patient declined, sleeping, NPO for procedure) with reason codes that feed adherence-risk's denominator handling (tick 11 / 603d16a).
68. [ ] `dose-confirmation-photo-meta` — Validate confirmation photo metadata (size, EXIF timestamp drift vs dueAt, min dimensions).
69. [ ] `pill-image-fingerprint` — Compute perceptual hash (aHash/dHash) for pill-identifier image matching; pure pixel math, no native deps.
70. [ ] `prescription-renewal-window` — Compose renewal-window with prescriber-directory to surface "your atorvastatin Rx expires in 14d AND your prescriber requires an annual visit; book one" in a single nudge.
71. [ ] `caregiver-notification-throttle-policy` — Tier-aware notification throttler that batches non-urgent pings and rate-limits caregiver pages.
72. [ ] `medication-conflict-history` — Persistent log of past conflict-resolver decisions so the manual review queue stays append-only and adjudications can be audited.
73. [x] `regimen-load-trend` — Track regimen-load-score over time (30/90/180 day windows) so the de-prescribing review can show "burden has climbed 40% in 6 months" (tick 11 / 0057b41).
74. [x] `dose-batch-export` — Export a date-range slice of dose events as FHIR MedicationAdministration JSON; pure shape translation, no network (tick 11 / c7a414c).
75. [ ] `appointment-prep-text-export` — Format an AppointmentChecklist as a wallet-pocket print layout (sized to 3.5x2") for the front-desk handoff.
76. [x] `appointment-prep-checklist` — Generate a structured pre-visit checklist (current meds, recent labs, reported AEs) given last-visit + upcoming-visit dates (tick 10 / 157ab4a).
77. [x] `regimen-load-score` — Composite regimen-burden score (pill count + dosing frequency + monitoring cadence + cost) for de-prescribing prioritization (tick 10 / 265bb49).

### Tier 1F — fresh roadmap (refill after tick 10)

78. [x] `prescriber-contact-card` — Wallet-printable prescriber contact block plus vCard 4.0 export; phone normalised to E.164 (tick 11 / 3ce449c).
79. [x] `appointment-prep-text-export` — Wallet-pocket print layout for AppointmentChecklist (40 col x 10 line, urgency-ordered) (tick 12 / 381f648).
80. [x] `medication-refusal-trend` — Rolling-window refusal trend (30/90/180d) with independent tolerability sub-stream and rising-tolerability lead flag (tick 12 / 0cc677e).
81. [ ] `dose-export-csv` — CSV companion to dose-batch-export for pharmacy-CSV-compatible round-trips.
82. [x] `followup-overdue-digest` — Caregiver weekly digest composer for FollowupReport with urgency-ordered phrasing and null short-circuit on silent weeks (tick 12 / fc3f82a).
83. [x] `lab-window-completion-feed` — Auto-complete lab-kind FollowupRequirement from LabResult; both code-in-title + medicationId match strategies with window + recommendedAt gating (tick 12 / 13c4a9d).
84. [x] `prescriber-contact-roster-print` — Multi-page 1-card-per-prescriber roster with specialty grouping, US Letter / A4 sizing parameters, form-feed page separators (tick 12 / 75867f3).
85. [ ] `refusal-reason-suggest` — Suggest a likely refusal reason given dose context (time-of-day matches sleeping window; date matches a known procedure date).

### Tier 1G — fresh roadmap (refill after tick 12)

86. [ ] `dose-export-csv` — CSV companion to dose-batch-export for pharmacy-CSV-compatible round-trips. Walgreens / CVS column layouts; null for missing fields rather than empty strings.
87. [ ] `refusal-reason-suggest` — Suggest a likely refusal reason given dose context (time-of-day matches sleeping window; date matches a known procedure date) so the patient UI defaults the reason picker.
88. [ ] `followup-digest-html` — HTML render of FollowupDigest (table + status chips) parallel to caregiver-digest-html when that lands; same null short-circuit semantics.
89. [ ] `refusal-trend-summary-html` — HTML chart payload for medication-refusal-trend windows (per-medication sparkline data, ready for the dashboard chart component).
90. [ ] `lab-window-completion-feed-csv-import` — Import a pharmacy lab-result CSV into LabResult[] feed for direct lab-window-completion-feed chaining.
91. [ ] `regimen-snapshot-archive-restore` — Restore a regimen from a signed snapshot envelope (round-trip companion to regimen-snapshot-archive); verify signature before producing the restore plan.
92. [ ] `prescriber-roster-print-html` — HTML/CSS companion to prescriber-contact-roster-print using grid layout for browser print preview without a monospace font requirement.
93. [ ] `appointment-prep-html-export` — Print-friendly HTML/CSS variant of appointment-prep-checklist (full-page) parallel to the text export.
94. [ ] `dose-confirmation-photo-meta` — Validate confirmation photo metadata (size, EXIF timestamp drift vs dueAt, min dimensions).
95. [ ] `pill-image-fingerprint` — Compute perceptual hash (aHash/dHash) for pill-identifier image matching; pure pixel math, no native deps.
96. [ ] `medication-conflict-history` — Persistent log of past conflict-resolver decisions so the manual review queue stays append-only and adjudications can be audited.
97. [ ] `caregiver-notification-throttle-policy` — Tier-aware notification throttler that batches non-urgent pings and rate-limits caregiver pages.
98. [ ] `dose-reminder-quiet-hours-override` — Per-medication exception to global quiet-hours (e.g. seizure rescue meds always ring through).
99. [ ] `medication-name-spell-suggest` — One-letter typo suggester for the rxnorm catalog; produces "did you mean X?" suggestions distinct from the broader fuzzy match.
100. [ ] `fill-history-csv-import` — Import a pharmacy fill history CSV (column auto-map) into PharmacyFillEvent[]; feeds prescription-fill-history + pdc-by-medication directly.



(Pulled forward only after Tier 1 momentum is established. Note: the
`@med/ui` test suite is currently red on baseline — fix the React JSX
runtime issue before adding UI features so new components don't get
buried under pre-existing failures.)

## Tick log

- 2026-06-21 13:51 PDT — tick 12: 5 features shipped.
  Commits: 0cc677e medication-refusal-trend, fc3f82a followup-overdue-digest,
  13c4a9d lab-window-completion-feed, 381f648 appointment-prep-text-export,
  75867f3 prescriber-contact-roster-print.
  Gate: 1466/1466 tests pass in `@med/utils` (146 new this tick:
  32+31+32+26+25). Lint + build placeholder ok. `@med/utils` typecheck
  baseline = 43 errors identical to start-of-tick; zero new errors
  introduced by tick 12. `pnpm -r test` confirms `@med/ui` 228/228 JSX
  runtime failures unchanged from baseline. SECOND clean tick in a row
  (no fixup commits) — module-domain-noun prefix discipline holding.
  Refilled roadmap (Tier 1G) with 15 new candidates (#86-#100).

  Notes:
  - This tick was deliberately a "composition" tick — every module
    composes on at least one prior module rather than introducing a
    brand-new domain. The pattern that's emerged is: foundation
    module ships in an earlier tick (medication-refusal-log,
    appointment-followup-tracker, prescriber-contact-card,
    appointment-prep-checklist), then a follow-on tick adds the
    trend / digest / cross-cut / print layer. This keeps each
    module small and revertible while making the surface area
    feel genuinely useful for downstream UI work.
  - `medication-refusal-trend` mirrors pdc-trend / regimen-load-
    trend's structural decisions but with a CRITICAL semantic
    inversion: rising density = bad (more refusals climbing) vs
    pdc-trend where rising = good. The per-direction labels are
    "rising / falling / stable / insufficient" — distinct verb
    choice from "improving / declining" so the dashboard can
    render the same chart component without label confusion.
    Added a tolerability sub-stream (nausea + side-effect) tracked
    INDEPENDENTLY of total density because the actionable signal
    is the tolerability subset, not the total — a patient with 5
    "sleeping" refusals and 0 nausea refusals is a schedule
    problem, not a tolerability problem. The risingTolerability
    lead flag (recent >= 2 AND share >= 0.4) is strictly weaker
    than the de-prescribing candidate threshold in medication-
    refusal-log (recent >= 3 AND share >= 0.5) — by design, so
    the UI sees the soft alert before the harder candidate flag
    trips and the prescriber has lead time.
  - `followup-overdue-digest` adopts a deliberate null-short-
    circuit behaviour that's NOT in caregiver-digest.ts: silent
    weeks return null instead of producing an "everything's fine"
    body. The justification: caregivers have inbox fatigue, and
    a "no actionable items" email teaches them to delete unread
    on sight, which they will then do to the actionable ones too.
    Cron callers use hasFollowupDigest as a cheap predicate
    BEFORE composing to avoid the unnecessary SMTP call entirely.
    Subject/body opener leads with the most-overdue item by title
    — that's the line caregivers act on; the seventh line of an
    email is never read. SMS variant exists separately (160-char
    target) for caregivers without email; same null behaviour.
    Past-grace flag triggers an extra "may need re-referral"
    advisory in the body since those items were missed long
    enough that the clinical team may need to re-engage.
  - `lab-window-completion-feed` is the FIRST cross-module
    "auto-bridge" — when a LabResult lands we already KNOW the
    draw happened and should not require the patient to also tap
    "done" on the corresponding FollowupRequirement. Match logic
    is intentionally STRICT to avoid silent mis-completion:
    word-boundary substring on title (NOT plain substring — "INR"
    cannot match "INRange"), draw must fall inside
    [dueAt - leadDays, dueAt + graceDays], draw must be on or
    after recommendedAt when present, earliest qualifying draw
    wins (first lab IS the follow-up; subsequent draws in window
    are surveillance). Manual completions ALWAYS win over auto
    via the mergeCompletions helper — auto can never overwrite
    a clinician's adjudication. Critical bug-fix in development:
    initial implementation used `new Date()` for YYYY-MM-DD
    strings which produces UTC midnight and shifts the draw back
    one day in PDT — causing earliest-wins to pick the wrong
    candidate. The cure is a local-date parser matching the
    appointment-followup-tracker's parseIsoDate (both endpoints
    must live in the same local-date space).
  - `appointment-prep-text-export` is the wallet-pocket (3.5x2",
    40 col x 10 line) counterpart to appointment-prep-checklist's
    full-page text rendering. Layout is RIGOROUSLY priority-
    ordered: name -> visit info -> counts row -> urgent rows ->
    optional footer. The counts row ("Meds X  Adv Y  Labs Z  Rfl
    W") is sacrosanct under truncation — it's the highest-density
    single line on the card. Urgent rows show worst-lab (overdue
    beats due-soon), top adverse event when severity >= major
    (minor/moderate filtered OUT because they don't change front-
    desk routing), and urgent refills under 3 days of supply.
    "OUT" shorthand for daysOfSupplyLeft <= 0 — patients should
    NOT be the audience for negative-day-supply math, identical
    to the appointment-prep-checklist text rendering rule.
  - `prescriber-contact-roster-print` is the multi-page roster
    layout for prescriber-contact-card. The packer keeps a
    specialty group on one page when it fits the remaining slot
    count — a group that doesn't fit pushes to the next page
    rather than splitting mid-group. (A group that exceeds one
    page CAN split; that's a fallback for unusual roster sizes,
    not the common path.) Default sizing is US Letter
    (80 col x 60 row) at 35 col x 10 line cards = 10 cards/page
    in a 2x5 grid. All sizing parameterised so A4 (84x64) +
    narrower printer profiles work. serializeRoster joins multi-
    page output with form-feed (\x0c) for direct lpr piping.
  - Second clean tick in a row (no fixup commits). The pattern
    of prefixing new module types with the module's domain noun
    is now fully reflexive — every new export this tick used a
    module-prefixed name where any generic name (Result, Window,
    Trend, Event, Card) could have collided:
    RefusalTrendDirection (not TrendDirection), FollowupDigest
    (not Digest), LabCompletionFeedResult (not Result),
    AppointmentTextExport (not TextExport), ContactRoster (not
    Roster). The 5-tick rename history (4/6/8/9/10) appears to
    have ended; ticks 11 + 12 have both been zero-fixup.


- 2026-06-21 10:33 PDT — tick 11: 5 features shipped.
  Commits: 3ce449c prescriber-contact-card, c1a333d appointment-followup-tracker,
  603d16a medication-refusal-log, 0057b41 regimen-load-trend,
  c7a414c dose-batch-export.
  Gate: 1320/1320 tests pass in `@med/utils` (157 new this tick:
  29+34+34+23+37). Lint + build placeholder ok. `@med/utils` typecheck
  baseline = 43 errors identical to start-of-tick; zero new errors
  introduced by tick 11. `pnpm -r test` confirms `@med/ui` 228/228 JSX
  runtime failures unchanged from baseline. NO fixup commits this
  tick — first clean tick since tick 7. Refilled roadmap (Tier 1F)
  with 8 new candidates (#78-#85).

  Notes:
  - `prescriber-contact-card` is the wallet-printable counterpart to
    prescriber-directory. Phone normalisation promotes 10-digit US
    numbers to +1 E.164 in the `.e164` field (separate from the
    raw `.digits` form) so saved-to-contacts cards dial correctly
    from outside the US. The `renderVcard` output is a strict RFC
    6350 (vCard 4.0) subset: BEGIN/END envelope, structured N
    field split on the comma in displayName, `tel:` URIs using the
    E.164 form (NOT digits — that distinction matters for iOS
    Contacts importing the file), CRLF line endings, lines folded
    at 75 chars per spec. `renderWalletCard` produces an 8-line
    max plain-text block sized for a 3.5x2" business card (32 col,
    ellipsis-truncated). Warnings accumulate on the card object so
    the UI can surface "phone number is not 10 digits" / "NPI
    failed Luhn validation" without throwing. `warnOnMissingContact`
    is true by default but disable-able for legal-record exports
    where you want the card row even when no contact is on file.
  - `appointment-followup-tracker` deliberately stays independent
    of lab-window-tracker — that module handles recurring cadence
    (warfarin INR every 28d), this one handles one-shot scheduled
    follow-ups. Composing them at the dashboard layer is the right
    granularity; folding them into one module would tangle two
    different "due-by-date" semantics. Per-kind warn windows
    default to lab=7d, referral=21d (longer scheduling lead time),
    visit/imaging/vaccination/procedure/other=14d. `graceDays`
    (default 60) keeps overdue items overdue (vs. expired) but
    escalates the message wording so the UI can render a different
    chip color without losing the status bucket. Completion wins
    over cancellation when both rows arrive for the same id —
    "we did it anyway" is the more actionable record. The
    `deriveFollowupFromRecommendation` helper translates clinic-
    shorthand offsets ("3 months", "6 weeks", "14 days") into
    absolute dueAt; day-of-month clips when the target month is
    shorter (Jan 31 + 1 month -> Feb 28). Explicit dueAt wins over
    relative offsets; within offsets days > weeks > months precedence.
  - `medication-refusal-log` introduces the FIRST exclusion-aware
    adherence path in @med/utils. The REFUSAL_EXCLUDED_REASONS set
    is narrow on purpose (npo, prescriber-paused, out-of-supply) —
    the patient had NO honest opportunity to take those doses, so
    counting them as misses is statistical noise, not adherence
    signal. `sleeping` is deliberately NOT excluded — a sleep-time
    miss is a real adherence problem that should drive a schedule
    change conversation, not a free pass. REFUSAL_TOLERABILITY_
    REASONS = {nausea, side-effect} drives the de-prescribing
    candidate flag (default: recent count >= 3 AND tolerability
    share >= 0.5). computeAdherenceWithRefusals returns BOTH
    strict (what PBMs ask for) and honest (what the patient and
    prescriber should look at). When honest denominator collapses
    to zero (every dose was an NPO day), we report honest=1 — the
    dashboard does NOT alert on a "no opportunity to fail" window.
    Validation never throws; per-row error collection lets the UI
    surface bad rows without losing the rest of the batch.
  - `regimen-load-trend` mirrors pdc-trend's structural decisions
    so the dashboard can render both with the same chart component.
    Critical inversion: positive delta in PDC = improving (good);
    positive delta here = RISING burden = bad. Per-component
    direction is exposed so the "what drove the climb?" panel can
    say "dosing rising while pills hold steady" — the single most
    actionable de-prescribing tell. The distinct-days gate is the
    important guard: a single snapshot replicated across 3
    overlapping windows is NOT a trend, even though it has 3 real
    points; the guard requires >= 2 distinct day-timestamps in the
    largest window. We do NOT recompute scores from inputs —
    snapshots are the authoritative input because historical
    pill-burden / cost state isn't preserved at runtime. Each
    window's number is the MEAN of in-window snapshots, not the
    latest snapshot inside the window — mean is robust against
    single-day spikes like a deductible reset that doesn't
    represent steady-state burden.
  - `dose-batch-export` is the FIRST interop-export module in
    @med/utils. FHIR R4 MedicationAdministration is the canonical
    healthcare answer for "patient took medication X at time Y";
    the alternative (custom JSON) loses round-trip fidelity with
    any EHR. Bundle type is `'collection'`, NOT `'transaction'` —
    a collection is a read-only export; transaction would instruct
    the receiving FHIR server to ingest, which we explicitly do
    NOT want (the consumer should re-wrap on their side if they
    want ingestion). Status mapping is the documented R4 one:
    taken/late -> completed (late gets a note annotation); skipped
    -> not-done + statusReason 'patient-skipped'; missed ->
    not-done + statusReason 'missed'; scheduled -> in-progress
    (dropped by default because exports normally ship realised
    history). Route mapping uses HL7 v3 RouteOfAdministration
    codes via the form -> route table (tablet/capsule/liquid/
    powder=PO; injection=IM; patch/cream=TD; etc). Entries sorted
    by effectiveDateTime asc for stable diffable output. The
    `fullUrlBase` option allows callers to emit canonical URIs
    when the export will live on a known FHIR server.
  - First clean tick since tick 7 — no name collisions, no
    type-narrowing fixups, no rename commits. The pattern of
    prefixing new module types with the module's domain noun
    (PrescriberPhoneNumber, FollowupRequirement, RegimenLoadWindow,
    RefusalValidationResult, FhirMedicationAdministration) has
    fully internalised — every new export this tick used a
    module-prefixed name where any generic name (Result, Window,
    Trend, Event) could have collided. The lesson from ticks 4 /
    6 / 8 / 9 / 10 was the right one and is now reflexive.


- 2026-06-21 07:35 PDT — tick 10: 5 features shipped + 1 fixup.
  Commits: 157ab4a appointment-prep-checklist, 265bb49 regimen-load-score,
  5f73ce0 caregiver-handoff-summary, b4e0081 dose-late-escalation-policy,
  afcf06f regimen-snapshot-archive, 0e185c0 fix (ValidationResult/Error
  rename to EscalationValidationResult/Error).
  Gate: 1163/1163 tests pass in `@med/utils` (116 new this tick:
  20+21+23+28+24). Lint + build placeholder ok. `@med/utils` typecheck
  baseline = 43 errors identical to start-of-tick after the fixup commit;
  zero new errors introduced by tick 10. `pnpm -r test` confirms `@med/ui`
  228/228 JSX runtime failures unchanged from baseline. Refilled
  roadmap (Tier 1E) with 12 new candidates (#66-#77 — but #76 +
  #77 are also marked shipped since they pull tick 10 work forward
  into the index for easy reference).

  Notes:
  - `appointment-prep-checklist` is the first @med/utils module
    intended for a PRINTOUT workflow. The text-block renderer
    composes 6 sections (medications / adverse / labs / refills /
    questions / vitals) with section omission when empty so the
    one-page printout stays tight. Adverse events use a strict
    lastVisit boundary (only events with onsetAt > lastVisitIso) —
    this filter is what makes the "since-last-visit delta" useful
    instead of a full history dump. Labs filter to overdue +
    due-soon ONLY; on-track and not-due-yet items are silently
    dropped because the clinician already has the cadence in
    their system. The hasOverdueLabs / hasUrgentRefills flags
    drive the dashboard banner color (red if either is true).
    refillsNeeded items render as "OUT" when daysOfSupplyLeft <= 0
    rather than a negative number — patients should NOT be the
    audience for negative-day-supply math.
  - `regimen-load-score` produces a 0..100 composite score from
    five components with sensible defaults: dosing 0.30, pills
    0.25, monitoring 0.20, cost 0.15, prn 0.10. The lab
    overdue-penalty table (overdue 0.50, due-soon 0.15, no-history
    0.25, on-track 0, not-due-yet 0) was tuned so "no history yet"
    is heavier than "due soon" — a baseline that should exist but
    doesn't is a bigger gap than a known cadence approaching. Weight
    normalisation re-scales any positive sum and falls back to
    defaults on an all-zero set, so callers cannot accidentally
    collapse the score. The summary names the top 2 weighted-
    contribution drivers, NOT raw component scores — this matches
    the UI's "what drove this number" tooltip semantics. Non-finite
    + negative inputs clamp to zero (NaN admins, -5 med count) so a
    partial-data dashboard render still completes instead of
    throwing. A previous attempt to type DEFAULT_WEIGHTS with `as
    const` narrowed each field to its literal value and made
    normalizeWeights's return type unassignable; explicit `Weights`
    interface is the fix and the prescription for future "fall
    back to defaults" patterns.
  - `caregiver-handoff-summary` is the asynchronous COMPLEMENT to
    shift-handoff.ts. shift-handoff produces a real-time check-list
    transcript with a 12h lookahead for two caregivers physically
    swapping shifts; this module produces a 4-6 sentence narrative
    paragraph for retrospective handoffs (overnight aide -> day
    aide, on-call sibling -> primary caregiver). Events outside
    [windowStart, windowEnd] are silently dropped — the caller
    passes a wide net and this filter is the canonical bound.
    Dose events use actedAt when present (late doses logged this
    window but due earlier still count), falling back to dueAt.
    The narrative is constructed sentence-by-sentence with a fixed
    template so it reads naturally across edge cases (zero-dose
    window, no adverse events, single-medication regimen). PRN
    rollup deduplicates reasons in observation order rather than
    alphabetising — preserves the patient's actual narrative.
  - `dose-late-escalation-policy` is the declarative LAYER above
    caregiver-escalation.ts (which is the runtime that fires
    alerts). Validator returns { ok, errors } with stable error
    codes (negative-delay, duplicate-delay, expire-before-delay,
    no-recipients, etc) so the UI maps codes to messages without
    parsing strings. Four presets (default / critical-rescue /
    low-touch / controlled-substance) materialise from
    PRESET_TEMPLATES + caller-supplied recipients per tier id;
    template tiers without recipients are dropped, so a patient
    can opt into a 3-tier rescue without naming an emergency-
    services contact and still get the first 3. Simulator is a
    pure preview function — does NOT consult dispatch state. I
    initially added an `expired` flag to SimulationTierEvent so
    the UI could render "would have fired but expired", but the
    validator forbids expireMinutes <= delayMinutes which makes
    `expired` dead code under valid inputs. Removed; the doc
    string now explicitly notes that expireMinutes is a
    runtime-only safety net. Builder copies recipient arrays so
    caller-side mutation cannot leak into the runtime artifact.
  - `regimen-snapshot-archive` is the second @med/utils module to
    touch globalThis.crypto.subtle (after caregiver-share-token).
    Reuses the same asBufferSource shim for TS 5.7+
    Uint8Array<ArrayBufferLike> handling and the same 32-char
    minimum secret length. The envelope binds payload + takenAt +
    snapshotId via the sign material so tampering with ANY of
    the three invalidates the signature; the separate payloadHash
    catches blind payload edits without needing the secret (so a
    quick integrity check is cheap). canonicalStringify uses
    recursive sorted-key JSON so identical regimens with
    different input order produce identical hash + signature —
    items are sorted by medicationId; schedules within each item
    are sorted by scheduleId; times within each schedule are
    sorted lexicographically. Verification returns a discriminated
    union with 5 specific failure reasons (malformed, bad-version,
    signature-mismatch, payload-tampered, secret-too-short). The
    diff helper does shallow added/removed/strength-changed
    detection only — schedule-level diff is left to
    regimen-change-diff which has richer kind-aware semantics.
  - The fixup (0e185c0) is the fifth `<Module>Foo` rename in the
    autoship history:
    - tick 4: RegimenTimeBucket vs pill-burden's TimeBucket
    - tick 6: AdverseDoseHistoryEntry vs dose-history-aggregator's
    - tick 8: PharmacyFillEvent vs refill-cost-projector's FillEvent
    - tick 9: PdcTrendDirection vs weight-trend's TrendDirection
    - tick 10: EscalationValidationResult/Error vs food-windows's
      ValidationResult
    The pattern is settled: prefix the NEW module's type with its
    domain noun. food-windows ValidationResult has shipped for
    many ticks and renaming it would break consumers. Generic
    type names (Result / Error / Bucket / Event / Direction) are
    the recurring danger zone — future modules with similar
    semantics should default to a domain prefix at first-write
    rather than fixing the collision post-hoc.

- 2026-06-21 04:29 PDT — tick 9: 5 features shipped + 1 fixup.
  Commits: 1d912f9 pdc-trend, fa14d62 medication-conflict-resolver,
  14c150a interaction-time-spacer, f26d1ad inventory-low-stock-forecast,
  2ed2101 drug-class-coverage-bundles-builder, 53a3d2f fix (TrendDirection
  rename + .sort() destructure narrowing).
  Gate: 1047/1047 tests pass in `@med/utils` (112 new this tick:
  17+22+22+19+32). Lint + build placeholder ok. `@med/utils` typecheck
  baseline = 43 errors identical to start-of-tick after the fixup commit;
  zero new errors introduced by tick 9. `pnpm -r test` confirms `@med/ui`
  228/228 JSX runtime failures unchanged from baseline. Roadmap has 14
  unstarted items across Tier 1B/1C/1D — no refill needed (threshold <5).

  Notes:
  - `pdc-trend` runs computePdc once per window (default 90/180/365d)
    with an explicit measurementStart/measurementEnd so gap counting
    is scoped properly — the per-medication natural window default in
    prescription-fill-history would distort PDC numerators across the
    trend stack. Direction = improving/declining/stable/insufficient
    classified by delta = latestPdc - baselinePdc against a
    stableBandDelta (default 0.05 = 5pp). Slope = OLS over
    (windowDays, pdc). The "latest=shortest, baseline=longest"
    convention is the inverse of what slope sign suggests: declining
    trend gives positive slope (PDC rises as windowDays rises, older
    windows healthier than newer). Both signs surface to the UI.
  - `medication-conflict-resolver` uses an explicit per-field
    precedence map with sensible defaults (pharmacy > ehr > caregiver
    > manual > import). Non-empty ALWAYS beats empty — this is the
    right default for partial EHR imports that would otherwise blank
    out pharmacy-curated fields. Same-tier disagreement on a
    SUBSTANTIVE field (strength, dosesPerRefill, drugId, dates,
    active, form) breaks deterministically (newest first, then alpha)
    AND surfaces a manualReview entry so a human can adjudicate.
    Non-substantive field disagreement (e.g. name casing variants)
    merges silently. resolveAll() groups records by
    medicationId|drug:drugId and resolves each cluster.
  - `interaction-time-spacer` introduces the first @med/utils module
    whose curated rule table addresses a TIMING problem rather than
    a co-administration problem. 6 rules cover the canonical
    clinical scenarios: levothyroxine+cation (4h, levo first),
    tetracycline+cation (2h symmetric), fluoroquinolone+cation (2h,
    fq first), bisphosphonate+food (1h, bisphosphonate first),
    cholestyramine+bound drugs (4h symmetric), PPI+azole (2h). The
    `gapDirection: 'a-before-b'` semantics matters — the rule fires
    bidirectionally for conflict detection but the action string
    tells the patient which drug to take first. detectSpacingConflicts
    expands each medication's enabled schedules and finds the NEAREST
    opposite-drug dose for each scheduled time; severity bands on
    observedGapMinutes / requiredGapMinutes against minorRatio (default
    0.75 = within 75% of required gap is minor; below is major).
  - `inventory-low-stock-forecast` is the first module that JOINs
    inventory-ledger and refill-forecast. The key insight is that
    refill-forecast operates on a SCALAR supplyRemaining and has no
    concept of lot expiry — silently folding expiring lots into
    supplyRemaining over-counts days-of-supply. This module walks
    available lots in FEFO order using inventory-ledger's
    summarizeLots() and CAPS each lot's contribution at
    floor(daysUntilExpiry * dailyUsage). Units that cannot be
    consumed before expiry surface as totalUnitsWasted so the
    dashboard can prompt the patient to refill BEFORE expensive
    waste accrues (the inverse of the usual out-of-supply alert).
    PRN regimens (dailyUsage=0) return infinite supply and a null
    runOutDate but still report per-lot exhaustion at expiry as
    the worst-case projection.
  - `drug-class-coverage-bundles-builder` is the first module to
    introduce ICD-10 -> condition mapping. 10 conditions (cad,
    hfref, dm2, copd, asthma, ckd, mdd, gerd, afib, htn) with
    prefix-match ICD-10 routing (I50.4* HFrEF vs I50.3* HFpEF
    correctly distinguished; HFpEF intentionally omitted as
    pharmacotherapy is less settled). Each condition contributes
    required classes, preferSingle hints, AND an AVOID list.
    buildBundleFromConditions unions required across conditions
    and collects avoid rules; a class that is REQUIRED by one
    condition AND AVOIDED by another (DM2 metformin vs CKD)
    surfaces in `conflicts` with both sides cited so the
    prescriber sees the tension directly. Result extends
    BundleExpectation so it feeds computeCoverage(meds, bundle)
    unchanged.
  - The fixup (53a3d2f) is the fourth `<Module>Foo` rename in the
    autoship history:
    - tick 4: RegimenTimeBucket vs pill-burden's TimeBucket
    - tick 6: AdverseDoseHistoryEntry vs dose-history-aggregator's
    - tick 8: PharmacyFillEvent vs refill-cost-projector's FillEvent
    - tick 9: PdcTrendDirection vs weight-trend's TrendDirection
    Same prescription as the previous cases: prefix the NEW module's
    type with its domain noun ("Pdc", "Pharmacy", "Adverse",
    "Regimen") rather than touching the older type. The `@med/utils`
    index re-exports everything via `export *`, so any name clash
    breaks build at the index level — and the cure is always rename
    the newcomer.
  - The fixup ALSO caught a second-class TS strict pattern: `const
    [a, b] = [x, y].sort()` cannot narrow to `[string, string]`
    because Array.sort() returns Array<T> (length isn't preserved
    in the static type). The cure is explicit `sorted[0]!` /
    `sorted[1]!` indexing. Future modules that need a sorted-pair
    destructure should use the explicit-index pattern rather than
    relying on tuple destructuring.

- 2026-06-21 00:54 PDT — tick 8: 5 features shipped + 1 fixup.
  Commits: b1f3202 prescriber-directory, 32b0a4f drug-class-coverage,
  edd16b9 prescription-fill-history, fe4eb39 pdc-by-medication,
  d8ba29b pharmacy-fill-reconciliation, da40f27 fix (FillEvent ->
  PharmacyFillEvent rename to avoid re-export collision with
  refill-cost-projector's FillEvent).
  Gate: 935/935 tests pass in `@med/utils` (101 new this tick:
  25+23+23+13+17). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to start-of-tick after
  the fixup commit; zero new errors introduced by tick 8. `pnpm -r
  test` confirms `@med/ui` 228/228 JSX runtime failures unchanged
  from baseline. Refilled roadmap (Tier 1D) with 10 new candidates
  (#56-#65).

  Notes:
  - `prescriber-directory` learned a structural lesson the hard way:
    `stripDecorations` collapses commas, which means the inner check
    for "Smith, Jane"-form names had to happen BEFORE the strip, not
    after. The fix: detect the comma in the raw string and parse the
    two halves separately, falling through to "Jane Smith"-form only
    when the right-of-comma side is empty after decoration strip
    (handles "Jane Smith, MD" correctly). NPI validation uses the
    CMS spec Luhn-mod-10 on the 80840-prefixed string; bad checksums
    still collapse on the NPI key so a typo in the last digit doesn't
    create a phantom new prescriber, but the entry is flagged
    npiValid=false. NPI-less records merge into matching NPI buckets
    when canonical name + specialty agree (or when one specialty is
    blank). The display-name aliases array carries every observed
    variant — a real-world feature because patient records spell the
    same doctor three ways across pharmacy/EHR/manual entries.
  - `drug-class-coverage` introduces the `BUNDLES` map (4 curated
    chronic-disease bundles: CAD secondary prevention, HFrEF, DM2,
    COPD). Each bundle declares its required classes as either a
    single `code` or an `anyOf` list — the latter handles ACE-I/ARB
    equivalence and LABA/LAMA bronchodilator choice cleanly. The
    `preferSingle` list flags duplicates of classes where two
    typically indicates a de-prescribing review (two statins, two
    SSRIs) without flagging legitimately-stacked combos like two
    diabetes meds. CLASS_DEFINITIONS uses substring matching against
    drug.class, generic, brand, and warnings so wording variants
    ("ACE-Inhibitor", "Angiotensin-Converting Enzyme Inhibitor",
    "ace inhibitor") all classify, AND combo drugs (amlodipine +
    benazepril) end up in BOTH classes. Substring match is a
    deliberate looseness; if a future drug catalog needs strict
    matching, the matchers list can be tightened per-class without
    changing call sites.
  - `prescription-fill-history` is the cornerstone of the new
    refill-coverage analytics stack. The "extend, don't reset" rule
    is the non-obvious win: when a 30-day fill arrives on day 20 of
    an existing 30-day fill's coverage, the tail extends by 30 days
    (patient is stockpiling) rather than starting a fresh 30-day
    interval that overlaps. This naturally caps coverage at 1.0 per
    day, which is the FDA-PQA definition of PDC's numerator. The
    initial bug was a classic: `intervals.length === 0` worked as the
    "first iteration" sentinel only when the first fill DID NOT
    start a new run, but the second fill always evaluated against
    intervals.length===0 too (since I only push at run-boundary).
    Fixed with an explicit `initialized` flag. Second subtler bug:
    default windowEnd used max fillEnd across the regimen, which
    gives a medication whose fills end early a phantom trailing gap
    caused by an unrelated longer-tail medication. Switched to a
    per-medication default window — shared windows are still
    available when the caller passes both bounds. This is the right
    default for "did patient X run out of medication Y?" but the
    explicit-window path is what the PDC computer uses.
  - `pdc-by-medication` is the FDA Star Rating adherence metric.
    Composes directly on prescription-fill-history with an explicit
    shared measurement window — the per-medication window default
    would distort PDC numerators. Anchor date = first fill at or
    after the measurement start; denominator = anchor through period
    end inclusive; numerator = denominator minus gap days inside
    that range. Stockpiling caps at 1.0 naturally because of the
    "extend, don't reset" rule (this is the entire reason PDC was
    designed). Custom adherentThreshold defaults to 0.80 per CMS Star
    spec. The medicationClasses argument enables class-level rollup
    so the dashboard can compute a "diabetes PDC" by averaging
    metformin + sglt2; medications listed in classes but with no
    in-period fills count toward noFillCount with pdc=0, so the
    class rollup is honest about documentation gaps. pdcBand
    bucketing matches CMS Star colour bands (>=0.90 excellent,
    >=0.80 good, >=0.50 watch, <0.50 critical).
  - `pharmacy-fill-reconciliation` walks pharmacy fill events
    against the expected supply trajectory and classifies each fill
    into one of {duplicate, short-fill, over-fill, late-refill,
    early-refill, ok}. Classification ORDER matters: duplicate wins
    (POS double-charge dedupe), then quantity mismatches (most
    actionable for cost-recovery and patient education), then
    timing flags. I initially had timing first and the short-fill
    test failed because the second fill arrived exactly when supply
    ran out — flagged as late instead of short. The reorder is the
    right design choice: a partial fill that LATER causes a late
    refill is still primarily a partial-fill problem. daysLate is
    computed against the prior fill's scheduled run-out (lastFill +
    expectedUnits/dailyUsage), so an on-time fill exactly when
    supply hits zero classifies as 'ok', not 'late' — matches how
    pharmacy QA actually thinks about this. Early-refill uses
    safeRefillDaysOfSupply (default 7) to catch the PBM fraud-
    screening pattern (refilling with 21 days still on hand). PRN
    medications (dailyUsage=0) have infinite days-of-supply so
    late-refill never triggers for them.
  - The fixup (da40f27) is the third example of the
    `<Module>Foo` rename pattern established in earlier ticks:
    - tick 4: RegimenTimeBucket vs pill-burden's TimeBucket
    - tick 6: AdverseDoseHistoryEntry vs dose-history-aggregator's
    - tick 8: PharmacyFillEvent vs refill-cost-projector's FillEvent
    Rule of thumb for the next collision: prefix the NEW module's
    type with its domain noun ("Pharmacy", "Adverse", "Regimen")
    rather than touching the older type. The `@med/utils` index
    uses `export *` everywhere, so the test (and the cure) is
    always the same.

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
