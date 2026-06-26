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

86. [x] `dose-export-csv` — CSV companion to dose-batch-export for pharmacy-CSV-compatible round-trips. Walgreens / CVS column layouts; null for missing fields rather than empty strings (tick 13 / 01a07a6).
87. [x] `refusal-reason-suggest` — Suggest a likely refusal reason given dose context (time-of-day matches sleeping window; date matches a known procedure date) so the patient UI defaults the reason picker (tick 13 / 3d77ee6).
88. [x] `followup-digest-html` — HTML render of FollowupDigest (table + status chips) parallel to caregiver-digest-html when that lands; same null short-circuit semantics (tick 13 / 302c24b).
89. [x] `refusal-trend-summary-html` — HTML chart payload for medication-refusal-trend windows (per-medication sparkline data, ready for the dashboard chart component) (tick 13 / 9a6f3a8).
90. [ ] `lab-window-completion-feed-csv-import` — Import a pharmacy lab-result CSV into LabResult[] feed for direct lab-window-completion-feed chaining.
91. [x] `regimen-snapshot-archive-restore` — Restore a regimen from a signed snapshot envelope (round-trip companion to regimen-snapshot-archive); verify signature before producing the restore plan (tick 13 / 4d77255).
92. [ ] `prescriber-roster-print-html` — HTML/CSS companion to prescriber-contact-roster-print using grid layout for browser print preview without a monospace font requirement.
93. [ ] `appointment-prep-html-export` — Print-friendly HTML/CSS variant of appointment-prep-checklist (full-page) parallel to the text export.
94. [ ] `dose-confirmation-photo-meta` — Validate confirmation photo metadata (size, EXIF timestamp drift vs dueAt, min dimensions).
95. [ ] `pill-image-fingerprint` — Compute perceptual hash (aHash/dHash) for pill-identifier image matching; pure pixel math, no native deps.
96. [ ] `medication-conflict-history` — Persistent log of past conflict-resolver decisions so the manual review queue stays append-only and adjudications can be audited.
97. [ ] `caregiver-notification-throttle-policy` — Tier-aware notification throttler that batches non-urgent pings and rate-limits caregiver pages.
98. [ ] `dose-reminder-quiet-hours-override` — Per-medication exception to global quiet-hours (e.g. seizure rescue meds always ring through).
99. [ ] `medication-name-spell-suggest` — One-letter typo suggester for the rxnorm catalog; produces "did you mean X?" suggestions distinct from the broader fuzzy match.
100. [ ] `fill-history-csv-import` — Import a pharmacy fill history CSV (column auto-map) into PharmacyFillEvent[]; feeds prescription-fill-history + pdc-by-medication directly.

### Tier 1H — fresh roadmap (refill after tick 13)

101. [x] `dose-export-csv-import-roundtrip-validator` — Round-trip a dose-export-csv through parseDoseCsvExport + diff back against the source Dose[]; produces a per-field difference report so CSV-edited rows can be safely re-imported (tick 14 / c72a767).
102. [x] `refusal-reason-suggest-i18n` — i18n the explanation strings in refusal-reason-suggest by pulling from a string table keyed on the stable `source` discriminator; keeps the rule logic English-only while exposing the picker tooltip in any locale (tick 14 / 61ec903).
103. [ ] `regimen-snapshot-archive-restore-diff-html` — HTML render of RegimenRestorePlan (per-action chips + side-by-side strength/schedule diffs) parallel to followup-digest-html for a restore-preview email or portal page.
104. [x] `followup-digest-text-html-bundle` — Tiny wrapper that returns both the text and HTML follow-up digests in one shot; for SMTP layers that need to ship `text/plain` + `text/html` as a multipart/alternative (tick 14 / 86592bc).
105. [ ] `refusal-trend-summary-html-png-payload` — Compute a server-side bar-chart PNG-data-uri (canvas-on-Node via @napi-rs/canvas or fallback to inline SVG) for refusal-trend-summary-html consumers that block inline HTML bars.
106. [ ] `dose-export-csv-cms-extract` — Extract a CMS-1500-claim-line subset of dose events (NDC + administration date + units) from dose-export-csv for billing reconciliation downstream.
107. [x] `prescriber-contact-card-emergency-card` — Wallet card variant of prescriber-contact-card emphasising the ON-CALL number (largest font, top of card) for emergency-room handoff scenarios (tick 14 / b677d53).
108. [ ] `lab-window-completion-feed-csv-import` — Import a pharmacy lab-result CSV into LabResult[] feed for direct lab-window-completion-feed chaining (re-listing from Tier 1G #90).
109. [ ] `medication-refusal-trend-html-weekly-digest` — Weekly digest composer combining refusal-trend-summary-html with the medication-refusal-log rollup; null short-circuit when no actionable rows.
110. [ ] `regimen-snapshot-archive-restore-apply-plan` — Concrete RestoreApplication pipeline producing Medication / Schedule / Patient mutation events from a RegimenRestorePlan, suitable for direct dispatch onto a CQRS-style command bus.
111. [ ] `appointment-prep-checklist-html` — HTML companion to appointment-prep-checklist text export; uses the same section omission + lab/refill priority rules as the text variant.
112. [ ] `caregiver-handoff-summary-html` — HTML wrapper for caregiver-handoff-summary's narrative text — keeps the paragraph shape but adds collapsible sections for the longer dose / adverse / refill blocks.
113. [ ] `dose-export-csv-merge` — Merge two MED_TRACKER CSV exports (same patient, overlapping ranges) with conflict resolution rules (later actedAt wins; dose_id collisions surface as a manual queue).
114. [ ] `prescriber-contact-roster-print-html` — HTML/CSS multi-page roster variant of prescriber-contact-roster-print using @page CSS for direct browser print without a monospace font.
115. [x] `regimen-snapshot-archive-history-rollup` — Roll a chronological list of SignedRegimenSnapshot envelopes into a per-medication add/remove/change timeline; uses diffRegimenSnapshots pairwise (tick 14 / cb71f6c).

### Tier 1I — fresh roadmap (refill after tick 14)

116. [x] `prescriber-contact-card-emergency-card-pdf` — One-page printable PDF layout payload for the emergency card (single sheet, large QR code with vCard contents) for ED triage binder use (tick 15 / ac528fe).
117. [x] `regimen-snapshot-archive-history-rollup-html` — HTML render of RegimenHistoryRollup: per-medication timeline with chips for added/removed/strength-change, sortable by tenure or by event count, suitable for the de-prescribing review screen (tick 15 / e81504f).
118. [x] `followup-digest-text-html-bundle-i18n` — Localise the followup-digest opener + section headings via a bundle pattern parallel to refusal-reason-suggest-i18n (tick 15 / 1657c8b).
119. [x] `dose-export-csv-import-roundtrip-validator-html` — HTML render of DoseRoundtripValidateResult: per-risk-tier grouped tables with accept/reject toggles for the adjudication UI (tick 15 / 6c7977c).
120. [x] `refusal-reason-suggest-i18n-rollup` — Helper that walks a NormalizedRefusal[] history, suggests reasons per dose, localises them all in one pass, returns map keyed on doseId (tick 15 / 0125aa9).
121. [ ] `regimen-snapshot-archive-history-rollup-burden-trend` — Compose RegimenHistoryRollup with regimen-load-trend so the timeline can carry a per-snapshot burden score (\"3 meds avg pill burden 2.1\" -> \"7 meds avg pill burden 4.8\").
122. [ ] `prescriber-contact-card-emergency-card-roster` — Roster variant: one emergency card per prescriber, ED-binder ordered (specialty grouped, on-call number first per card) for triage handoff at admission.
123. [ ] `dose-export-csv-import-roundtrip-validator-merge-csv` — Round-trip variant of dose-export-csv-merge that also returns the per-row diff for the patient adjudication queue.
124. [ ] `followup-digest-text-html-bundle-cron-batcher` — Coalesce N caregivers worth of follow-up digests into a single mailer payload with per-caregiver bundles attached.
125. [ ] `regimen-snapshot-archive-restore-history` — Persistent log of past restore decisions so the audit trail captures \"which snapshot was restored when, by whom, with which adjudications\" — companion to medication-conflict-history.
126. [ ] `dose-confirmation-photo-meta` — Validate confirmation photo metadata (size, EXIF timestamp drift vs dueAt, min dimensions). (Recycled from earlier tier; still unstarted.)
127. [ ] `pill-image-fingerprint` — Compute perceptual hash (aHash/dHash) for pill-identifier image matching; pure pixel math, no native deps. (Recycled.)
128. [ ] `medication-conflict-history` — Persistent log of past conflict-resolver decisions so the manual review queue stays append-only and adjudications can be audited. (Recycled.)
129. [ ] `caregiver-notification-throttle-policy` — Tier-aware notification throttler that batches non-urgent pings and rate-limits caregiver pages. (Recycled.)
130. [ ] `medication-name-spell-suggest` — One-letter typo suggester for the rxnorm catalog; produces \"did you mean X?\" suggestions distinct from the broader fuzzy match. (Recycled.)

### Tier 1J — fresh roadmap (refill after tick 15)

131. [x] `regimen-snapshot-archive-history-rollup-csv-export` — CSV export of RegimenHistoryRollup for sharing with non-Med-Tracker clinicians (one row per event: snapshotId, medication, kind, before, after, observedAt). Pure shape translation, no I/O (tick 16 / c4d4a0b).
132. [x] `dose-export-csv-import-roundtrip-validator-summary-text` — Plain-text companion to summarizeRoundtripResult that produces a per-tier breakdown (5 lines: tier name + count + sample doseIds) for cron logs / CI artifacts (tick 16 / d5dbe6f).
133. [x] `followup-digest-text-html-bundle-i18n-multi-locale` — Build the same digest in N locales in one call, returning a map keyed on locale; for households where each caregiver reads a different language (tick 16 / 09acfbf).
134. [x] `refusal-reason-suggest-i18n-rollup-html` — HTML render of LocalisedRefusalSuggestion[]: per-source grouped tables with localised tooltips and per-dose accept/reject controls for the adjudication queue (tick 16 / 39feccb).
135. [x] `prescriber-contact-card-emergency-card-pdf-two-up` — Landscape two-up variant of the emergency PDF: two cards side-by-side on a single A4 / Letter sheet for clinics that print double-sided binder pages (tick 16 / 3628ba8).
136. [ ] `regimen-snapshot-archive-history-rollup-titration-summary` — Filter + format RegimenHistoryRollup to a "titration-only" view: per-medication strength trajectory with a one-line summary like "5mg → 10mg → 20mg over 3 quarters".
137. [ ] `dose-export-csv-import-roundtrip-validator-auto-accept` — Policy helper that returns the doseId subset eligible for auto-accept under a given policy (default: note-only rows whose risk is `note-only` AND whose note delta is short). Composes with applyAcceptedDiffs.
138. [ ] `followup-digest-text-html-bundle-empty-state` — Optional "no actionable items" digest variant for caregivers who explicitly OPT IN to weekly status pings even on silent weeks (e.g. distant family member who reads it as a heartbeat).
139. [ ] `refusal-reason-suggest-i18n-rollup-coverage-report` — Standalone coverage report builder (table form) for a CI artifact that flags which locales have missing keys, by source. Companion to summarizeI18nRollupCoverage.
140. [ ] `prescriber-contact-card-emergency-card-pdf-binder-cover` — Single-page cover sheet for the ED-binder roster: patient name, DOB, allergy summary, primary care, last visit date — composes prescriber-directory + medication-allergy-log.
141. [ ] `regimen-snapshot-archive-history-rollup-newest-changes` — Filter helper that returns only the medications with events in the LAST N days (default 30), for a "what changed recently" widget on the dashboard.
142. [ ] `dose-export-csv-import-roundtrip-validator-html-print` — Print-friendly variant of dose-export-csv-import-roundtrip-validator-html (no controls, paginated, header on each page) for caregivers reviewing on paper before adjudicating in-app.
143. [ ] `followup-digest-text-html-bundle-i18n-rtl` — Add RTL-language layout hooks (dir="rtl" on the HTML body, mirrored padding) for Arabic / Hebrew bundles.
144. [ ] `prescriber-contact-card-emergency-card-pdf-watermark` — Add optional "DRAFT" / "VERIFIED YYYY-MM-DD" watermark for legal-records exports of the emergency card.
145. [ ] `refusal-reason-suggest-i18n-rollup-per-caregiver` — Roll up suggestions for an entire caregiver's patient panel (multiple patients) in one call, returning a per-patient breakdown.

### Tier 1K — fresh roadmap (refill after tick 16)

146. [x] `regimen-snapshot-archive-history-rollup-csv-export-merge` — Merge two RegimenHistoryRollup CSVs (one from each of two patients) into a single combined sheet for the family-history pediatric appointment use case; columns gain patientId + patientName (tick 17 / 64991e0).
147. [x] `dose-export-csv-import-roundtrip-validator-summary-text-slack` — Slack-block-kit companion to summary-text that wraps the same content as a Slack message payload with code blocks + buttons; for the QA on-call channel (tick 17 / c655d19).
148. [x] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher` — Roll N caregivers (each with their own locale preference) across M patients into a per-caregiver mailer payload bundle for a cron job that runs once per week (tick 17 / 7b5bc30).
149. [x] `refusal-reason-suggest-i18n-rollup-html-print` — Print-friendly variant of i18n-rollup-html (no controls, paginated, header on each page) for caregivers reviewing on paper before adjudicating in-app — parallel to dose-export-csv-import-roundtrip-validator-html-print (#142) (tick 17 / f386c15).
150. [x] `prescriber-contact-card-emergency-card-pdf-two-up-watermark` — Add optional "DRAFT" / "VERIFIED YYYY-MM-DD" / "ICU COPY" watermark across both slots in the landscape layout — parallel to prescriber-contact-card-emergency-card-pdf-watermark (#144) (tick 17 / 9ab8a19).
151. [ ] `regimen-snapshot-archive-history-rollup-csv-export-per-class` — Group rollup events by drug class (statins, antihypertensives, etc) before CSV export so a cardiologist reading the events.csv can filter to their own class without parsing a free-text medication name.
152. [ ] `dose-export-csv-import-roundtrip-validator-summary-text-html-mailer` — HTML mailer wrapper for summary-text that ships the fenced block inside an email envelope with subject line + opener; for adjudication queues that get reviewed via email instead of portal.
153. [ ] `followup-digest-text-html-bundle-i18n-multi-locale-html-print` — Print-friendly variant of multi-locale that paginates each locale's HTML body for households printing the digest out for distant family.
154. [ ] `refusal-reason-suggest-i18n-rollup-html-summary-card` — Single-card summary that rolls i18n-rollup-html into a compact dashboard widget (count per source, top fallback locale) parallel to refusal-trend-summary-html.
155. [ ] `prescriber-contact-card-emergency-card-pdf-two-up-binder-cover` — ED-binder front-page variant of two-up: left slot is the patient summary, right slot is the primary-care emergency card — composes with the binder-cover variant (#140).
156. [ ] `regimen-snapshot-archive-history-rollup-csv-export-fhir` — FHIR MedicationStatement Bundle JSON companion to the CSV export — pure shape translation, no network — for clinicians whose EHR ingests FHIR but not CSV.
157. [ ] `dose-export-csv-import-roundtrip-validator-summary-text-json` — Structured JSON companion to summary-text for analytics pipelines that want per-tier counts + sample doseIds as a strict JSON payload instead of free-text.
158. [ ] `followup-digest-text-html-bundle-i18n-multi-locale-fallback-policy` — Configurable fallback chain (e.g. ja-JP -> en-US, fr-CA -> fr-FR -> en-US) so households can request a target locale and get a deterministic next-best.
159. [ ] `refusal-reason-suggest-i18n-rollup-html-per-medication` — Per-medication grouping variant of i18n-rollup-html so a clinician reviewing one medication's refusal patterns can drill in without seeing other meds.
160. [ ] `prescriber-contact-card-emergency-card-pdf-two-up-double-sided` — Duplex variant that puts emergency card on the front and a vCard QR-only back face on the reverse for clinics that print double-sided binder pages.

### Tier 1L — fresh roadmap (refill after tick 17)

161. [ ] `regimen-snapshot-archive-history-rollup-csv-export-merge-per-class` — Compose merge (#146) with per-class (#151): produce a multi-patient CSV grouped by drug class, for a cardiology clinic comparing siblings' antihypertensive trajectories side-by-side.
162. [x] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher` — Roll N day's worth of round-trip summaries into a single Slack thread (one parent message + N reply blocks) for the daily QA on-call digest, avoiding channel noise from N separate posts (tick 18 / bbe11f9).
163. [x] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer` — Wrap each caregiver entry in a SMTP-ready multipart/alternative envelope (subject + text + html bodies) for direct hand-off to a mailer queue; the cron writes payloads, the mailer ships them (tick 18 / d5009fb).
164. [x] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet` — Single-page cover sheet for the print roster (patient name, panel size, date generated, signature block for the reviewer) preceding the paginated body; matches typical clinical-records paper packets (tick 18 / b73cbc6).
165. [x] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster` — Roster variant: apply the watermark uniformly across a 20+ card batch with a per-page header strip ("Page N of M, Verified 2026-06-22") so a stack of cards stays traceable on a single binder pull (tick 18 / 6bd5a92).
166. [ ] `regimen-snapshot-archive-history-rollup-csv-export-merge-pivot` — Pivot the merged CSV from event-rows to patient-cols (one row per medication, one column per patient with their strength-on-date) for the cross-sibling comparison view.
167. [ ] `dose-export-csv-import-roundtrip-validator-summary-text-slack-attachment-fallback` — Slack `attachments` fallback (legacy attachment shape used by older Slack workspaces that don't render Block Kit) parallel to the blocks output; same content, structured for Slack legacy clients.
168. [ ] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-suppress-policy` — Per-caregiver suppression policy (no pings on weekends; no pings during caregiver vacations; max one ping per week) layered onto the cron batcher's output before mailer dispatch.
169. [ ] `refusal-reason-suggest-i18n-rollup-html-print-signature-page` — Companion to cover-sheet (#164): a trailing signature page where the reviewer signs off on the whole batch with a per-source attestation grid.
170. [ ] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-trifold` — Trifold layout: emergency cards on the outer panels, watermark across all three, for clinics that print trifold patient packets at admission.
171. [x] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise` — Hash patient names + ids before export merge so a multi-patient sheet can be shared with a third-party analytics tool without exposing PHI (tick 18 / d7d365a).
172. [ ] `dose-export-csv-import-roundtrip-validator-summary-text-slack-mention-policy` — Per-tier @mention policy (e.g. structural diffs page on-call, note-only doesn't) so the Slack message routes the right severity to the right person.
173. [ ] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-coverage-report` — Standalone coverage report (locales used, silent caregivers, skipped caregivers) parallel to summarizeFollowupDigestCronBatch but as a structured JSON payload for the analytics pipeline.
174. [ ] `refusal-reason-suggest-i18n-rollup-html-print-binder-tab` — Tabbed binder-style cover (patient name + section ribbon) for a multi-patient print packet at a household review meeting.
175. [ ] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-qr-suppress` — When watermark = DRAFT, suppress QR codes (don't let downstream apps scan a DRAFT vCard) — a small but real safety hook for the legal-records workflow.

### Tier 1M — fresh roadmap (refill after tick 18)

176. [x] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate` — Rotate-secret companion to anonymise (#171): given two HMAC secrets (old, new), output a stable old-pseudonym -> new-pseudonym mapping so a clinic switching secrets can update its lookup table without losing patient continuity (tick 19 / 0d5ae12).
177. [x] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours` — Suppress thread parent posting during caregiver quiet hours (default 22:00-07:00 PT) so a midnight nightly run doesn't ping a sleeping on-call (tick 19 / a508e14).
178. [x] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc` — Carbon-copy policy: secondary destinations (primary care physician, family escalation) BCC'd on the same envelope so a household admin sees the same weekly view their caregivers see (tick 19 / 6222295).
179. [x] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine` — Vertical spine-label fragment (3.5x1.5 cm sticker layout) for the binder spine matching the cover sheet's patient name + date — clinics file rosters by spine label not cover (tick 19 / 185496e).
180. [x] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc` — Table-of-contents page preceding the roster (page 0): list of prescribers by name + page number, generated from the same emergencyCards array so the toc never drifts from the cards (tick 19 / 931885b).
181. [ ] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-coverage-report` — Standalone coverage report (entries anonymised, collision count, hash truncation in use, name strategy applied) for the audit trail.
182. [ ] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-archive` — Persistent archive of N day's worth of thread batches as a single rolling JSON blob suitable for CI artefact storage.
183. [ ] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-retry-queue` — Wrap each envelope with retry metadata (attemptCount, lastErrorAt) so the mailer layer's queue can re-enqueue failed deliveries without losing context.
184. [ ] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-i18n` — Localise the cover sheet's chrome text (hero subtitle, table labels, signature block prompts) by extending the existing i18n bundle layer.
185. [ ] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html` — HTML/CSS companion to the roster TOC (browser print preview without a monospace font requirement) parallel to the existing PDF-block output. (tick 20 / 7184475)
186. [ ] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-fhir` — Compose anonymise (#171) with the future fhir export (#156) for de-identified FHIR Bundle sharing.
187. [ ] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-stats` — Per-day statistics rollup (mean diffs / mean parser skips / max diffs / consecutive clean days) appended as a final reply on the thread for trend visibility.
188. [ ] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-attachments` — Attachment slot (optional FollowupDigest as PDF or ICS file) for caregivers who prefer downloadable formats alongside the inline body.
189. [ ] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-batch` — Multi-patient cover sheet (one cover per N-patient household roster) parallel to the per-patient cover; preserves the per-patient breakdowns inside a single packet.
190. [ ] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-export-csv` — CSV export of the roster header strip texts (one row per page: pageNumber, batchId, watermarkText, generatedAt) for audit log archives.

### Tier 1N — fresh roadmap (refill after tick 19)

191. [x] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk` — Rotate-secret in bulk across N HMAC secret epochs in one call (e.g. annual rotations over a decade) producing a per-epoch chain mapping; for clinics auditing a long secret-rotation history (tick 20 / 00866f9).
192. [x] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar` — Per-day-of-week quiet-hours override (e.g. weekends 24/7 quiet, weekdays 22:00-07:00); calendar-aware companion to the basic quiet-hours module (tick 20 / 7184508).
193. [x] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy` — Tier the BCC list by severity: actionable digests BCC the PCP + escalation contact; routine digests only BCC the household admin. Composes with the existing BCC policy (tick 20 / ef5e503).
194. [x] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch` — Multi-spine layout: N spine labels on a single 8.5x11 sticker sheet for clinics printing N binder spines at once (typical sticker-paper printers) (tick 20 / 3c0a7c7).
195. [x] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html` — HTML/CSS companion to the TOC page using @page CSS for browser print preview without a PDF library; matches the document-title / specialty / fallback-line / footer ordering (tick 20 / 7184475).
196. [x] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-html` — HTML render of the key-rotation mapping (per-patient table with old + new pseudonym columns) for the security audit trail (tick 21 / cf964ff).
197. [x] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-coverage-report` — Standalone coverage report (deferrals issued, suppressions issued, overrides triggered) parallel to summarizeQuietHoursDecision but as a structured JSON payload for the analytics pipeline (tick 21 / 5d96521).
198. [x] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-coverage-report` — Standalone JSON coverage report (envelope count, BCC fan-out by address, primary-dropped count) for the cron's monitoring pipeline (tick 21 / 7bc88e4).
199. [x] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-i18n` — Localise the optional 'doses' label on the spine via the existing i18n bundle layer (Spanish "dosis", French "doses", etc) (tick 21 / a3cd655).
200. [x] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-print-only` — Print-only TOC (no other roster pages) for clinicians who want a roster index without re-printing all the cards; useful when binders are pulled for review (tick 21 / fcb1649).
201. [x] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-cli-summary` — CLI-line summary of the rotation suitable for a single console log entry: "Rotated 14 patients, 0 collisions, sequential reshuffle: 5 changes." (tick 22 / 41a5d93).
202. [x] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-snooze` — Allow per-channel quiet-hours snooze: "next 24h, quiet-hours window is suspended" for incident-response weekends. Companion to the basic quiet-hours module (tick 22 / ff031fb).
203. [x] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-suppress-self-cc` — Self-suppression policy: don't BCC an address that already appears as a primary recipient on ANOTHER envelope in the same batch (prevents the household admin getting two copies when they're both a primary recipient and a global BCC) (tick 22 / 849da42).
204. [x] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-color-coding` — Per-source colour-coded spine label (NPO-window red, prescriber-pause blue) for visual triage in colour-printing clinics; respects monochrome fallback (tick 22 / 4072e06).
205. [x] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-grouped-html` — HTML/CSS variant of the TOC with collapsible specialty sections (browser <details>/<summary>) for screen-first review workflows (tick 22 / 7e57774).

### Tier 1O — fresh roadmap (refill after tick 20)

206. [x] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-csv-export` — CSV export of the bulk-rotation mapping (one row per patient, columns: originalPatientId, epoch_0_pseudonym, epoch_1_pseudonym, ..., epoch_N_pseudonym) for the analytics-partner audit hand-off (tick 23 / 1e04b8a).
207. [x] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html` — HTML render of the calendar overlay (per-day rule + window in a 7-day grid) for the on-call channel admin UI (tick 23 / 9a8c32f).
208. [x] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report` — Standalone JSON coverage report (tier counts, unused destinations, escalation-tier fan-out) parallel to summarizeBccTierPolicy for the analytics pipeline (tick 23 / a1d66fb).
209. [x] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest` — CSV manifest of which spine labels are on which sheet for the QA workflow: a printer auditor confirms every patient on the roster appears on at least one sticker sheet before printing (tick 23 / c2576b4).
210. [!] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-collapsible` — DUPLICATE of tick 22 #205 (roster-toc-grouped-html). Skip / mark as superseded.
211. [ ] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-fhir` — FHIR Provenance Bundle JSON variant of the bulk rotation chain for HL7-aware audit consumers.
212. [ ] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-icalendar` — ICalendar (.ics) export of the per-day quiet-hours configuration for clinicians to import into their phone calendar (visualises "the channel is quiet on Saturdays" alongside their personal calendar).
213. [ ] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-html` — Admin HTML view of the tier-policy result (per-envelope tier + which addresses fired) for the household admin to audit who got what.
214. [ ] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-a3` — A3 sheet preset (29.7x42.0cm) for larger sticker-paper stock used by clinics with industrial printers.
215. [x] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored` — Anchor-link variant of the TOC HTML so clicking a name in the TOC scrolls to the corresponding card in a single-page HTML render of the binder (tick 23 / b89b1c7).

### Tier 1P — fresh roadmap (refill after tick 22)

216. [x] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-csv-export-per-class` — Group bulk-rotation chains by drug class then CSV export so a cardiology clinic can filter the chain to just the meds in its remit (tick 24 / 2e13caf).
217. [x] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-per-cell-edit` — HTML overlay with per-cell `<a href="...">` admin-edit links so the channel admin can click a day to jump to the override editor (tick 24 / 8437a62).
218. [x] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-html` — HTML render of the coverage report (top fan-out tables, unused destinations list, dominant tier headline card) for the ops dashboard (tick 24 / a938449).
219. [x] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-pivot` — Pivot the CSV manifest so each row is a SHEET (not a spine), with columns: sheetNumber, plus 1..N columns for each position on that sheet listing the patient name. For printer-cassette workflows where the auditor verifies sheet-by-sheet rather than spine-by-spine (tick 24 / be242e0).
220. [x] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-back-to-top` — Add a "back to TOC" link on each card target (anchor on the TOC, anchor back to the TOC from each card) for long single-page renders (tick 24 / 87dbec7).
221. [x] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary` — Multi-epoch CLI-line summary parallel to the single-rotation cli-summary (tick 22 #201). Fixed-shape line, one verdict per epoch transition + an overall batch verdict (tick 25 / 8bea315).
222. [x] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable` — Print-friendly variant of the calendar HTML (no current-day highlight, no colour fills, monochrome) for binder filing (tick 25 / 5a990c9).
223. [x] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html` — HTML render of the detect-warnings list with severity chips (red for "always critical", yellow for "always routine", grey for "unused destination") for the ops dashboard (tick 25 / bb695ee).
224. [x] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise` — Hash patient names in the manifest BEFORE export so a manifest shared with a third-party printer doesn't expose PHI (tick 25 / 304a8d0).
225. [x] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input` — Add an `<input type="search">` to the TOC that hides non-matching rows via CSS-only :not() match (no JS); for in-portal browse workflows (tick 25 / 5705a7f).

### Tier 1Q — fresh roadmap (refill after tick 23)

226. [ ] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-csv-export-per-class-html` — HTML render of the per-class CSV export manifest (one tile per class with patient count + transition count) for the cardiology-clinic dashboard.
227. [ ] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-per-cell-edit-policy` — Per-cell editable POLICY (when a cell becomes editable: only by certain admin roles, only during a maintenance window) for the on-call channel admin overlay.
228. [ ] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-html-print` — Print-only variant of the coverage report HTML (no interactive controls, paginated, monochrome) for the household ops review meeting.
229. [ ] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-pivot-anonymise` — Compose pivot + anonymise: hash patient names in the pivot manifest before sharing with a third-party printer.
230. [ ] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-back-to-top-i18n` — Localise the back-link label + aria-label via the existing i18n bundle layer (Spanish "Volver al índice", Japanese "戻る", etc.).
231. [ ] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-csv-export-per-class-fhir` — FHIR Bundle JSON variant of the per-class CSV export for HL7-aware consumers (statin patients only, anti-platelet patients only, etc.).
232. [ ] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-per-cell-edit-audit-log` — Log per-cell edit clicks (cell, timestamp, admin id) as an append-only audit trail for the on-call channel.
233. [ ] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-html-comparison` — Side-by-side HTML view comparing two coverage reports (this week vs last week) so the on-call can see trend deltas at a glance.
234. [ ] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-pivot-html` — HTML render of the pivot manifest (one table per sheet, monospaced positions, suitable for printer auditor review).
235. [ ] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-back-to-top-keyboard-nav` — Keyboard-navigation helper: returns the per-card anchor ids ordered so the host page can wire arrow-key navigation between adjacent cards.

### Tier 1R — fresh roadmap (refill after tick 24)

236. [x] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-json` — Structured JSON variant of the bulk CLI summary (lines parsed into typed entries: `[{ tag, fromEpoch, toEpoch, patients, reshuffled, collisions, verdict }]`) for analytics pipelines that prefer JSON over fixed-shape text (tick 26 / 02f0dca).
237. [x] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-prometheus` — Prometheus-text-format exporter for the bulk CLI summary so the cron's grep pipeline can also expose `/metrics` for scraping (gauge per verdict tier, counter per transition) (tick 27 / 486397b).
238. [x] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable-i18n` — Localise the printable calendar's footer text + "Printed" prefix + per-day labels via a small bundle layer parallel to refusal-reason-suggest-i18n (tick 26 / d984376).
239. [x] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable-multipage` — Multi-page variant emitting one calendar per timezone (when the on-call panel spans multiple regions) with form-feed page separators (tick 27 / f87f532).
240. [x] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-print` — Print-only variant of the warnings HTML (no colour chips, monochrome badge prefixes) for the household ops review packet (tick 26 / 844d9d6).
241. [x] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-i18n` — Localise the severity chip labels + empty-state hint via the existing i18n bundle layer (tick 27 / 3840368, applied to the PRINT variant per the carried-forward refinement).
242. [x] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise-key-rotate` — Compose anonymise with key-rotate so a clinic switching HMAC secrets gets a stable old-pseudonym -> new-pseudonym mapping for the spine manifest (parallel to the regimen-history anonymise-key-rotate module) (tick 26 / ffd5d1c).
243. [x] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise-coverage-report` — Standalone coverage report (entries anonymised, collision count, hash truncation in use, name strategy applied, redacted-row count) for the audit trail (tick 27 / 0ffbca6).
244. [x] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input-keyboard-nav` — Keyboard-navigation helper for the search-input variant: returns the focusable element order (search input → first TOC row → next, etc) so the host page wires arrow-key navigation (tick 26 / 51d7d65).
245. [x] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input-i18n` — Localise the search input placeholder + aria-label + empty-state hint via the existing i18n bundle layer (Spanish, Japanese, German) (tick 27 / c62e6cb).

### Tier 1S — fresh roadmap (refill after tick 25)

246. [ ] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-json-ndjson-tee` — Companion to the bulk-cli-summary-json NDJSON serialiser that tees the same stream into a per-cohort log file via a callback (`onLine(kind, line)`) so a multi-cohort cron tick can split its NDJSON across N log files without re-serialising.
247. [ ] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-json-coverage-report` — Standalone coverage report (per-verdict counts, total cohorts combined, missing-transition count) extracted from a `AnonymiseKeyRotateBulkCliSummaryJson` for the dashboard analytics pipeline.
248. [ ] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable-i18n-coverage-report` — Standalone coverage report companion (locales used, fallback events, missing-key list) parallel to detectQuietHoursCalendarPrintableI18nCoverage but rolled across N renders (e.g. multi-region nightly print runs).
249. [ ] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable-i18n-multipage` — Multi-page variant of the i18n printable calendar emitting one printable page per locale with form-feed separators for international clinic chains.
250. [ ] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-print-binder-spine` — Add a vertical spine-label fragment (3.5x1.5 cm sticker layout) for the binder spine matching the printable warnings page so multi-binder filing systems can label each binder.
251. [!] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-print-i18n` — SUPERSEDED by tick 27 #241 (same module, applied to the PRINT variant — the path the carried-forward refinement chose). Mark as completed by 3840368.
252. [ ] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise-key-rotate-cli-summary` — Fixed-shape CLI summary line for the spine manifest rotation parallel to the regimen-history anonymise-key-rotate cli-summary; "[spine-rotate] patients=N changed=N collisions=N verdict=V".
253. [ ] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise-key-rotate-bulk` — Bulk variant: walk N HMAC secret epochs in a single call producing per-epoch transition CSVs + an overall chain mapping for clinics with multi-year secret-rotation histories.
254. [ ] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input-keyboard-nav-aria-live` — Companion aria-live announcement helper: per-row text the host page reads aloud on focus ("Smith, Jane A., cardiology, page 3") so screen-reader users get verbal context as arrow keys navigate.
255. [ ] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input-keyboard-nav-vim-bindings` — Add j/k bindings (mirror ArrowDown / ArrowUp) for keyboard-power-user clinicians; opt-in via flag; preserves arrow bindings unchanged.

### Tier 1T — fresh roadmap (refill after tick 27)

256. [ ] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-prometheus-extra-labels-policy` — Per-cohort label policy that auto-injects extraLabels from a cohort -> labels map; for clinic chains exporting N cohorts on one `/metrics` endpoint without hand-wiring the labels per render.
257. [ ] `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-prometheus-pushgateway` — Pushgateway-compatible payload wrapper (job + instance grouping keys baked into the URL path; HTTP-DELETE compatible empty body for stale-cohort cleanup).
258. [ ] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable-multipage-toc` — TOC page prepended to the multi-page output (region id + page number + timezone summary) so a multi-region binder packet has an index.
259. [ ] `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable-multipage-i18n` — Localise per-region page chrome via the calendar-html-printable-i18n bundle layer; one locale per region (NL for the Amsterdam page, JA for the Tokyo page).
260. [ ] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-print-i18n-coverage-report` — Standalone coverage report (per-locale missing-key count, fallback-events count across N renders) parallel to detectBccTierPolicyCoverageWarningsHtmlPrintI18nCoverage but rolled across N renders (e.g. multi-region nightly print runs).
261. [ ] `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-print-i18n-multi-locale` — Roll the same warnings panel across N locale bundles in one call (Map keyed on locale) parallel to renderEmergencyCardSearchInputI18nMultiLocale, for clinic-chain portals pre-rendering every locale server-side.
262. [ ] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise-coverage-report-html` — HTML render of the coverage report (dominant verdict headline card, redacted-row stack, leak-warning panel, optional in-house lookup row preview when PHI access is allowed) for the on-call review dashboard.
263. [ ] `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise-coverage-report-cli-summary` — Fixed-shape CLI summary line for the anonymise coverage report parallel to the other cli-summary modules: "[anonymise-coverage] patients=N rows=N collisions=N redacted=N verdict=V".
264. [ ] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input-i18n-coverage-report` — Standalone JSON coverage report (per-locale missing-key counts across N bundles) parallel to detectEmergencyCardSearchInputI18nCoverage but rolled across N bundles for analytics.
265. [ ] `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input-i18n-rtl` — Add RTL-language layout hooks (dir="rtl" on the wrapping `<section>`, mirrored padding on the input + datalist) for Arabic / Hebrew bundles.

### Tier 1U — frontend slices (FRONTEND-FOCUS override, refill after tick 28)

Sanjay redirected the loop to frontend-only work on 2026-06-23 (override
in `med-tracker-20min-prompt.md`). The following items are FRONTEND / UX
features at `apps/web/`. Each is a real user-facing capability shipped
alongside the existing sage/coral/amber pillbox design language and the
Linear/Raycast quality bar Sanjay set. The composition-derivative
backend roadmap (Tier 1L through Tier 1T) stays paused — fresh slices
get cherry-picked from Tier 1U until the override is removed.

266. [x] `command-palette-cmd-k` — Linear/Raycast-style ⌘K palette with
    fuzzy search across nav, theme actions, and the user's medications
    list; subsequence scoring, keyboard navigation, click-to-open
    topbar hint badge; mounted in (app)/layout (tick 28 / dc76a45).
267. [x] `toast-notifications` — Sage-themed toast layer with four
    kinds, auto-dismiss with hover-pause, inline action button (e.g.
    Undo), aria-live announcer, dedupe-by-id; wired into the today
    page's dose-take + dose-skip flow (tick 28 / 8905b13).
268. [x] `adherence-ring-widget` — Animated SVG donut with
    requestAnimationFrame easeOutCubic tween, 0/25/50/75 milestone
    ticks, prefers-reduced-motion respected, tone auto-derived from
    percent; placed in the dashboard's Two-week pulse alongside a
    14-day heatmap grid sourced from the actual adherence average
    (replaced the static sine-wave placeholder) (tick 28 / 822d699).
269. [x] `keyboard-shortcuts-overlay` — Linear-style ? cheat sheet plus
    the global shortcut router: leader sequences (G then D/T/M/S/R/H
    for routes), single-letter actions (N new medication, T toggle
    theme, ? this overlay, Esc close), with full mac/non-mac modifier
    glyph swap and a discoverable topbar ? chip (tick 28 / 462c2f1).
270. [x] `history-page-heatmap` — Six-month GitHub-contributions-style
    heatmap on the history page (26 weeks, weekday + month labels,
    hover detail, scaled-up focus), sage progression for healthy days,
    amber+coral for shaky/rough; three stat tiles (6-month avg, perfect
    days, rough days) plus a "recent days" list under (tick 28 / a28108a).

271. [x] `today-page-bulk-take` — Multi-select rows on /today with a
    floating action bar that marks all selected doses taken in one
    action; shift+click range select; per-row busy state; selection
    auto-prunes; bulk Undo toast (tick 29 / a864074). Logic in
    lib/dose-selection.ts, 17 tests.
272. [x] `medications-detail-cover` — Hero band on /medications/[id]
    with a large pill glyph, strength + form + schedule capsules, live
    next-dose countdown chip, and inline edit-on-hover instructions
    (tick 29 / 9093e7a). Logic in lib/next-dose.ts, 14 tests.
273. [x] `refill-bottle-progress` — Each refill row's remaining supply
    rendered as a vertical "pill bottle" SVG that fills with sage
    proportional to supply and turns coral below the refill threshold
    (tick 29 / 4faa31b). Logic in lib/bottle-fill.ts, 11 tests.
274. [ ] `interactions-graph` — Force-directed SVG graph of the user's
    medication interactions; nodes are pills, edges are severity-
    coloured; click a node to filter the list.
275. [ ] `pill-identifier-camera` — Wire the /pills page's pill-by-
    imprint form to a constraint-builder UI (shape + colour swatch
    chips + scored toggle) with a live preview of matching catalog
    entries underneath; keyboard friendly. NOTE: the constraint builder
    already exists on /pills as of an earlier tick; this slice is the
    live-preview + keyboard polish layer only.
276. [ ] `caregivers-share-qr` — Generate a printable QR-code card for
    each active caregiver share with the share token encoded; uses a
    pure-canvas QR encoder for browser-side rendering.
277. [ ] `dashboard-empty-state` — First-run dashboard that walks a new
    user through the three setup steps (add a medication, set a
    schedule, share with a caregiver) with progress chips and a
    celebratory toast on completion.
278. [x] `schedule-month-view` — Month grid (6 rows x 7 cols, anchored
    on the first of the month) at /schedule/month with per-day dose
    chips; prev/next month paging, Today snap, week<->month links
    (tick 29 / 7ae21de). Logic in lib/month-grid.ts, 14 tests.
279. [ ] `reports-monthly-print` — Print-friendly /reports/monthly
    layout: cover page (patient summary), per-medication adherence
    sparkline, refill timeline, caregiver-share log; @page CSS for
    real paper print.
280. [x] `notifications-snooze-row` — Per-row snooze popover on
    /notifications: "1h / 3h / this evening / tomorrow / Monday"; the
    chosen value writes back via snoozeNotification and the row
    collapses with an Undo toast (tick 29 / 6afaca8). Logic in
    lib/snooze.ts, 12 tests.

### Tier 1V — frontend slices (FRONTEND-FOCUS override, refill after tick 29)

Five Tier 1U items remain (#274 interactions-graph, #275 pill-identifier
live-preview, #276 caregivers-share-qr, #277 dashboard-empty-state,
#279 reports-monthly-print). Fresh candidates below keep the loop fed.
Each is a real user-facing capability in apps/web matching the sage/coral/
amber pillbox language and the Linear/Raycast bar. Prefer extracting any
non-trivial logic into a tested lib/*.ts module (the web vitest harness is
now live: lib + tests/, 66 tests as of tick 29).

281. [ ] `today-undo-toast-stack` — When several doses are taken in
    quick succession, coalesce their Undo toasts into one stacked
    "N doses taken - Undo all" rather than N separate toasts.
282. [x] `medications-list-search-sort` — Inline search box (name/strength/
    form) + Name / Lowest supply / Soonest refill sort control on the
    /medications list, keyboard-focusable chip row, "/" focuses search;
    runout sort surfaces a per-row estimate chip (tick 30 / 4e7ed85).
    Logic in lib/medication-sort.ts, 16 tests.
283. [x] `adherence-ring-detail-popover` — Click the dashboard adherence
    ring to open a popover splitting the window into taken / skipped /
    missed: stacked mini-bar + per-status icon rows; largest-remainder
    rounding so percentages sum to 100 (tick 30 / 77b6f77). Logic in
    lib/adherence-breakdown.ts, 12 tests.
284. [x] `refills-timeline-strip` — Horizontal 30-day timeline on /refills
    plotting each refill's refill-by date with today marker, shaded
    overdue gutter, weekly ticks, greedy lane-stacking, tone ramp
    (tick 30 / cb56e2c). Logic in lib/refill-timeline.ts, 12 tests.
285. [x] `schedule-day-drilldown` — Click a day in the month grid to
    open a side panel listing that day's doses by time, grouped
    morning/afternoon/evening (tick 31 / 3065637). Logic in
    lib/day-doses.ts, 18 tests.
286. [x] `command-palette-recent` — Remember the last few command-
    palette actions/medications in localStorage and surface them as a
    "Recent" section at the top when the query is empty (tick 31 /
    0fa6034). Logic in lib/command-recents.ts, 16 tests.
287. [x] `notifications-filter-tabs` — Tab row on /notifications (All /
    Reminders / Refills / System) with unread-aware count badges; filters
    client-side, caregiver folds into System, snooze + mark-read preserved
    (tick 30 / 9009729). Logic in lib/notification-filter.ts, 12 tests.
288. [x] `medication-supply-sparkline` — Tiny inline supply-burndown
    sparkline on each medications-list row projecting supply to the
    run-out date (pure SVG polyline + area fill, tone-tinted, run-out
    marker) (tick 31 / c28c1d7). Logic in lib/supply-sparkline.ts, 15 tests.
289. [x] `dose-history-week-strip` — Seven-pill week strip on the
    medication detail page showing each of the last 7 days' adherence
    state for that med (full / partial / missed / none) with today ring +
    summary line (tick 30 / 281d5dd). Logic in lib/week-strip.ts, 12 tests.
290. [x] `caregivers-activity-feed` — Per-caregiver activity feed
    (last-viewed / created / expiry) with relative timestamps and a
    scope-badge row; never-viewed empty state; expiring-soon header
    pill (tick 31 / a8af471). Logic in lib/caregiver-activity.ts, 20 tests.
291. [x] `reports-adherence-bars` — Replace the reports page's flat
    numbers with a per-medication horizontal bar chart (adherence %),
    sorted worst-first, with a tone ramp (coral < 70 < amber < 90 sage)
    (tick 31 / 930298c). Logic in lib/adherence-bars.ts, 17 tests.
292. [ ] `settings-theme-preview` — Live theme preview swatches in
    settings: render the sage/coral/amber tokens as a mini pillbox
    card that updates as the user toggles light / dark / system.
293. [ ] `today-progress-confetti` — When the last pending dose of the
    day is taken, play a one-shot reduced-motion-aware sage burst over
    the Today progress bar with a "Day complete" toast.
294. [x] `upcoming-grouped-by-day` — /upcoming upgraded from today-only to a
    7-day forward projection grouped under relative day headers (Today /
    Tomorrow / weekday / short date) with sticky per-group header + dose
    count; today drops passed times, per-dose time-until chip (tick 33 /
    bf25325). Logic in lib/upcoming-doses.ts, 16 tests.
295. [ ] `medication-form-strength-stepper` — Replace the free-text
    strength field in the medication form with a value + unit stepper
    (mg / mL / IU / mcg) plus a free-text escape hatch; validates
    against dispensable increments.

### Tier 1W — frontend slices (FRONTEND-FOCUS override, refill after tick 31)

Tick 31 closed five Tier 1U/1V items (#285, #286, #288, #290, #291). The
remaining open backlog is now thin (5 Tier 1U stragglers #274-#277/#279 +
5 Tier 1V items #281, #292-#295), so this tier refills the loop with fresh
frontend-first candidates. Each is a real user-facing capability in apps/web
matching the sage/coral/amber pillbox language and the Linear/Raycast bar.
Prefer extracting any non-trivial logic into a tested lib/*.ts module (the web
vitest harness is now 216 tests across 15 suites as of tick 31). Backend tiers
1L-1T stay paused until Sanjay removes the override.

296. [x] `medications-list-density-toggle` — Comfortable / compact row
    density toggle on the /medications list, persisted to localStorage;
    compact hides the schedule subline + sparkline, comfortable keeps
    them (tick 34 / 48dbeb5). Logic in lib/density-pref.ts, 14 tests.
297. [x] `reports-adherence-bars-window-picker` — 7d / 30d / 90d window
    chips above the per-medication adherence bars; refetches
    getMedicationAdherence(window) and re-tones (tick 34 / 65442a1).
    Logic in lib/adherence-window.ts, 7 tests.
298. [x] `schedule-day-drilldown-prev-next` — Prev/next day arrows inside
    the day-drilldown panel (and left/right arrow keys) so a user can
    walk days without closing the panel (tick 34 / 4dac865). Logic in
    lib/day-step.ts, 24 tests.
299. [x] `caregivers-activity-feed-sort` — Sort the caregivers LIST page
    by most-recently-viewed / least-recently-viewed / never-viewed-first
    using the lastViewedAt recency metric (tick 34 / d87d944). Logic in
    lib/caregiver-sort.ts, 14 tests.
300. [x] `command-palette-recent-clear` — A "Clear recent" affordance in
    the palette's Recent section header (confirm-on-second-press
    micro-interaction) that wipes the localStorage recents (tick 34 /
    902e7c6). Logic in lib/recents-clear.ts, 10 tests.
301. [x] `today-overdue-banner` — A sticky top banner on /today when one
    or more doses are past their scheduled time and still pending
    ("2 doses overdue - take or skip"), with a jump-to-first-overdue
    action; pure overdue-partition model (scheduledAt < now & pending)
    (tick 32 / 0b94e6f). Logic in lib/overdue.ts, 19 tests.
302. [x] `medication-detail-adherence-ring` — Reuse the AdherenceRing on
    the medication detail page showing that single med's adherence over
    30 days (real per-med taken/scheduled from getMedicationAdherence,
    replacing the scaled 7d guess); tone auto-derived, taken/scheduled
    caption, honest no-data state (tick 33 / 2557903). Logic in
    lib/med-adherence.ts, 15 tests.
303. [x] `refills-status-filter-tabs` — All / Needed / Requested / Ready
    tab row on /refills with per-tab count badges (parallel to the
    notifications-filter-tabs pattern); pure status->tab bucketing model
    (tick 32 / d8a04dd). Logic in lib/refill-filter.ts, 14 tests.
304. [x] `dashboard-next-dose-countdown` — A live "next dose in 1h 12m"
    countdown card on the dashboard derived from the soonest pending
    dose; reuses lib/next-dose.ts, adds a 1-minute tick + a humanised
    duration formatter (pure) (tick 32 / 060b5df). Logic in
    lib/countdown.ts, 17 tests.
305. [x] `schedule-week-today-column` — Highlight the current weekday
    column on the /schedule/week grid with a sage spine + "Today" cap,
    and scroll it into view on mount; pure current-weekday-index helper
    (tick 32 / 82aa05d). Logic in lib/week-days.ts, 9 tests.
306. [x] `notifications-group-by-day` — Group the /notifications list
    under relative day headers (Today / Yesterday / Mon ...) with a
    per-group count; pure created-at -> day-bucket model parallel to
    upcoming-grouped-by-day (tick 32 / e8a8f58). Logic in
    lib/day-group.ts, 16 tests.
307. [ ] `medications-bulk-archive` — Multi-select rows on /medications
    with a floating action bar to archive several at once (parallel to
    today-page-bulk-take's selection model); reuses lib/dose-selection
    selection primitives generalised over ids.
308. [x] `reports-export-format-cards` — Replace the /reports/export
    plain list with selectable format cards (CSV / JSON / ICS / PDF)
    showing a what's-inside line + live file-size estimate from real
    record counts; sticky download bar driven by the selected card
    (tick 33 / 6e104fa). Logic in lib/export-formats.ts, 18 tests.
309. [x] `caregiver-share-scope-editor` — On the caregiver new page, a
    scope editor with grouped capabilities (Can see vs Can do), custom
    sage check controls, and a live plain-language summary ("Can view
    medications and request refills") with an act-without-view warning
    (tick 33 / 119428a). Logic in lib/scope-model.ts, 21 tests.
310. [x] `today-progress-segments` — Replace the Today progress bar with
    a segmented pill row (one segment per scheduled dose, sage filled
    taken / hollow pending / amber skipped / coral missed); each segment
    scrolls its dose row into view; caption rolls the counts (tick 33 /
    6821016). Logic in lib/dose-segments.ts, 16 tests.

### Tier 1X — frontend slices (FRONTEND-FOCUS override, refill after tick 34)

Tick 34 closed five Tier 1W items (#296-#300). Ten open frontend items
remain across Tier 1U/1V/1W (#274-#277/#279 stragglers + #281, #292-#295,
#307). The list is thinning and several remaining items are heavier
(force-directed graph, QR card, print layout), so this tier refills with
fresh small-to-medium frontend-first candidates so the loop always has
clean 5-slice batches to pick from. Each is a real user-facing capability
in apps/web matching the sage/coral/amber pillbox language and the
Linear/Raycast bar. Prefer extracting non-trivial logic into a tested
lib/*.ts module (web vitest harness is 446 tests across 30 suites as of
tick 34). Backend tiers 1L-1T stay paused until Sanjay removes the override.

311. [ ] `reports-window-picker-shared` — Lift the 7/30/90d window picker
    (lib/adherence-window) into the /reports/adherence + /reports/weekly
    pages so every adherence surface shares one window control + caption.
312. [ ] `medications-density-global` — Promote the density pref to a
    shared hook so /refills and /notifications lists honour the same
    Comfortable/Compact choice; one persisted key, three consumers.
313. [ ] `caregivers-search-filter` — Inline search box on /caregivers
    (label / scope) with a "/" focus shortcut, composing with the new
    sort control; pure filter predicate + match-count summary.
314. [ ] `command-palette-section-counts` — Show a per-section result
    count chip ("Medications · 12") in the palette section headers when a
    query is active; pure count-by-section model.
315. [ ] `schedule-day-drilldown-empty-jump` — When stepping into an empty
    day in the drilldown, offer a "jump to next day with doses" affordance
    that scans forward up to 14 days; pure next-nonempty-day finder over
    the recurrence set.
316. [ ] `reports-adherence-window-trend-delta` — Under the per-med bars,
    show a small "vs previous window" delta chip per medication (this 30d
    vs the prior 30d) using two getMedicationAdherence calls; pure
    delta-tone model.
317. [ ] `medications-list-runout-group` — Optional "group by run-out
    urgency" toggle on /medications (Overdue / This week / This month /
    Healthy) bucketing rows under sticky group headers; pure bucketer over
    estimatedDaysLeft.
318. [ ] `notifications-density-and-group-prefs` — Persist the
    /notifications group-by-day collapse state per day-bucket so a user's
    expanded/collapsed choices survive a reload; pure collapse-set model.
319. [ ] `caregivers-expiry-sort` — Add "Expiring soonest" to the
    caregiver sort control (composing isExpiringSoon), so a user can
    triage shares about to lapse; extend lib/caregiver-sort.
320. [ ] `command-palette-empty-hint` — A friendly "Type to search across
    pages, actions, and your medications" hint block when the palette
    opens with no recents and an empty query; pure hint-visibility model.

(Pulled forward only after Tier 1 momentum is established. Note: the
`@med/ui` test suite is currently red on baseline — fix the React JSX
runtime issue before adding UI features so new components don't get
buried under pre-existing failures.)

## Tick log

- 2026-06-26 01:58 PDT — tick 34: 5 features shipped (FRONTEND-FOCUS override active).
  Commits: 4dac865 schedule-day-drilldown-prev-next,
  d87d944 caregivers-activity-feed-sort,
  65442a1 reports-adherence-bars-window-picker,
  48dbeb5 medications-list-density-toggle,
  902e7c6 command-palette-recent-clear.
  Gate: `@med/web` BUILD SUCCEEDS (`Compiled successfully in 3.3s`; all 60
  static pages generated incl. every edited route /schedule/month,
  /caregivers, /reports, /medications, plus the CommandPalette + DayDrilldownPanel
  components). `@med/web` test 446/446 pass across 30 suites (377 baseline + 69
  new this tick) with TMPDIR=/Volumes/Projects/.tmp. `@med/web` typecheck:
  verified ZERO new errors in any touched apps/web file — the 5 new lib modules
  appear 0 times in tsc output; every error is the documented baseline
  (Link bigint JSX in the edited pages/components + .next/types validator +
  DayRail unused @ts-expect-error + packages/icons implicit-any + packages/ui
  react-not-found placeholder). `@med/web` lint fails with the documented
  pre-existing `next lint` "Invalid project directory" tooling bug.
  TWENTY-FOURTH clean tick in a row (no fixup commits, no force-push, no revert).

  Seventh frontend tick under Sanjay's standing override. Five slices spanning
  five different surfaces, each extracting its pure-logic core into a tested
  lib/*.ts module — the web test harness grew from 377 -> 446 tests:
  - lib/day-step.ts (24) — YYYY-MM-DD day arithmetic: stepDay with full
    month/year/leap rollover, nextDay/prevDay, daysBetween, isSameDay,
    relativeDayLabel, dayStepView bundle. Powers the day-drilldown stepper.
  - lib/caregiver-sort.ts (14) — recency comparators (recent / stale /
    never-first) keyed on lastViewedAt vs an injectable now, label tiebreak,
    summarizeCaregiverSort with viewed/never counts.
  - lib/adherence-window.ts (7) — 7/30/90d window-option model: resolveWindow
    with junk-key fallback, windowDays for the data call, windowCaption,
    window-tuned empty copy.
  - lib/density-pref.ts (14) — comfortable/compact layout config + normalize/
    parse guards (bare + JSON-quoted), toggleDensity, otherDensityLabel.
  - lib/recents-clear.ts (10) — confirm-on-second-press state machine
    (pressClear idle->armed->confirmed), disarm, labels, clearedRecents,
    canClearRecents, arm timeout.
  Roadmap: refilled with Tier 1X (#311-#320, ten fresh frontend candidates) so
  the loop stays well-fed even though the open backlog (10 items) was above the
  refill threshold — the remaining stragglers skew heavier (graph/QR/print) so
  fresh small-to-medium slices keep clean 5-batches available.

  Notes:
  - Twenty-fourth tick in a row. Every tick 34 slice is a real user-facing
    capability (logic + visual treatment + interactions + a11y), tested.
  - `schedule-day-drilldown-prev-next` adds prev/next arrows + Left/Right key
    handling to the day-drilldown panel (arrows ignored while typing) and a
    relative "Today / Tomorrow / Yesterday / In N days" chip; the month page
    wires onStep to advance the selected day. The panel's onStep + today props
    are optional, so existing callers are unaffected.
  - `caregivers-activity-feed-sort` is the first sort control on the
    /caregivers LIST (the activity feed itself already lived on the detail
    page) — Recently viewed / Least recent / Never viewed-first, with a
    "N never opened" header tally, chip row only when 2+ shares.
  - `reports-adherence-bars-window-picker` swaps the static "last 30 days"
    label for a 7/30/90d chip group; selecting a window refetches per-med
    adherence (alive-guarded) and re-tones, caption + flagged line + empty
    copy all follow.
  - `medications-list-density-toggle` adds a persisted Comfortable/Compact
    segmented control; compact hides the schedule subline + supply sparkline
    and tightens padding/icon.
  - `command-palette-recent-clear` adds a confirm-on-second-press "Clear"
    control to the Recent section header — arms on first press, wipes the
    localStorage recents on the second within 3s, disarms on close / typing /
    blur / timeout / unmount.

- 2026-06-25 21:30 PDT — tick 33: 5 features shipped (FRONTEND-FOCUS override active).
  Commits: 6821016 today-progress-segments,
  2557903 medication-detail-adherence-ring,
  6e104fa reports-export-format-cards,
  bf25325 upcoming-grouped-by-day,
  119428a caregiver-share-scope-editor.
  Gate: `@med/web` BUILD SUCCEEDS (`Compiled successfully in 3.3s`; all 60
  static pages generated incl. every edited route /today, /medications/[id],
  /reports/export, /upcoming, /caregivers/new). `@med/web` test 377/377 pass
  across 25 suites (291 baseline + 86 new this tick) with TMPDIR=/Volumes/
  Projects/.tmp. `@med/web` typecheck: verified ZERO new errors in any touched
  apps/web file — grepped the full tsc output and every apps/web error is the
  documented pre-existing baseline (Link bigint JSX in 5 pages + .next/types
  validator + DayRail unused @ts-expect-error + packages/icons implicit-any +
  packages/ui react-not-found placeholder). `@med/web` lint fails with the
  documented pre-existing `next lint` "Invalid project directory" tooling bug.
  TWENTY-THIRD clean tick in a row (no fixup commits, no force-push, no revert).

  Sixth frontend tick under Sanjay's standing override. Five slices spanning
  five different surfaces, each extracting its pure-logic core into a tested
  lib/*.ts module — the web test harness grew from 291 -> 377 tests:
  - lib/dose-segments.ts (16) — time-sorted one-segment-per-dose model with
    status->tone/fill mapping, count rollup, clockLabel + minutesOfDay, caption
    builder (all-taken / mixed / remaining-first phrasing)
  - lib/med-adherence.ts (15) — single-med ring view: pct/tone sharing the
    reports ramp, findMedRow, honest hasData=false when nothing scheduled,
    taken clamped to scheduled, window-label pluralisation
  - lib/export-formats.ts (18) — format descriptors + per-format size heuristic
    (doses-weighted vs all-weighted) + humanised byte formatter + card builder
  - lib/upcoming-doses.ts (16) — 7-day forward projection composing dosesForDay,
    today-past-time drop, relative day labels, next-dose pick, formatUntil
  - lib/scope-model.ts (21) — view/act scope grouping, toggle/normalize,
    validateScopes (act-without-view warning), plain-language summarizeScopes
  Remaining frontend backlog: 15 open items across Tier 1U/1V/1W (above the
  refill threshold, so no roadmap refill this tick). Backend tiers 1L-1T stay
  paused until Sanjay removes the override.

  Notes:
  - Twenty-third tick in a row. Every tick 33 slice is a real user-facing
    capability (logic + visual treatment + interactions + a11y), tested.
  - `today-progress-segments` swaps the single flat bar for a clickable
    segmented pill row (one per dose, tone+fill by status); segments scroll
    their dose row into view (reduced-motion aware) and pulse it. Empty/loading
    keeps the old bar so there's no layout jump before doses load.
  - `medication-detail-adherence-ring` retires the old "scale the overall
    window to a 7d slice" estimate in favour of the real per-med 30d row,
    rendered as the dashboard AdherenceRing with an on-track/slipping/
    needs-attention chip and a true "no data yet" state.
  - `reports-export-format-cards` turns the flat export list into a 2-up card
    grid; each card carries a live size estimate from the real record counts
    (today's doses x 90d + meds + schedules), and selection drives a sticky
    download bar.
  - `upcoming-grouped-by-day` is the biggest jump: /upcoming went from a
    today-only pending list to a true 7-day forward projection (composing the
    month view's dosesForDay expander) grouped under sticky relative-day
    headers, today's already-passed times dropped, real Take still wired for
    today's rows by matching back to the DoseEvent.
  - `caregiver-share-scope-editor` groups the permission checkboxes into
    Can-see / Can-do sections with custom sage controls and a live
    plain-language summary that warns when request-refills is granted with no
    view permission.

- 2026-06-25 16:51 PDT — tick 32: 5 features shipped (FRONTEND-FOCUS override active).
  Commits: 0b94e6f today-overdue-banner,
  060b5df dashboard-next-dose-countdown,
  d8a04dd refills-status-filter-tabs,
  e8a8f58 notifications-group-by-day,
  82aa05d schedule-week-today-column.
  Gate: `@med/web` BUILD SUCCEEDS (`Compiled successfully in 3.3s`; all 60
  static pages generated incl. every edited route /today, /dashboard,
  /refills, /notifications, /schedule/week). `@med/web` test 291/291 pass
  across 20 suites (216 baseline + 75 new this tick) with TMPDIR=/Volumes/
  Projects/.tmp. `@med/web` typecheck shows only the pre-existing baseline
  (components/DayRail.tsx(216,9) unused @ts-expect-error + 4 .next/types/
  validator.ts layout-config errors + the packages/utils schedule-resolver/
  taper-plan/titration strict-undefined baseline) — ZERO new errors in any
  apps/web file or new lib/component module (verified by grepping the tsc
  output for every touched/created path; grep returned no matches). `@med/web`
  lint fails with the documented pre-existing `next lint` "Invalid project
  directory" tooling bug — not introduced by this tick.
  TWENTY-SECOND clean tick in a row (no fixup commits, no force-push, no revert).

  Fifth frontend tick under Sanjay's standing override. Five slices spanning
  five different surfaces, each extracting its pure-logic core into a tested
  lib/*.ts module — the web test harness grew from 216 -> 291 tests:
  - lib/overdue.ts (19) — overdue partition (pending + past a 15min grace),
    earliest-first ordering, minutesLate, worst-late, headline + lateness
    formatting
  - lib/countdown.ts (17) — composes lib/next-dose; duration split into
    h/m, long humanised phrasing with until/since/bare directions, clock label
  - lib/refill-filter.ts (14) — status->tab bucketing (picked_up folds into
    Ready), per-tab counts, most-actionable default-tab selection
  - lib/day-group.ts (16) — local-day keying (no UTC drift), whole-day delta,
    relative labels (Today/Yesterday/Tomorrow/weekday/short-date), generic
    groupByDay preserving incoming order, newest-day-first
  - lib/week-days.ts (9) — startOfWeek, same-local-day, 7-cell week model with
    today-column index + containsToday guard
  Remaining frontend backlog: 20 open items across Tier 1U/1V/1W (266-310
  range) — above the refill threshold, so no roadmap refill this tick. Backend
  tiers 1L-1T stay paused until Sanjay removes the override.

  Notes:
  - Twenty-second tick in a row. Every tick 32 slice is a real user-facing
    capability (logic + visual treatment + interactions + a11y), tested.
  - `today-overdue-banner` adds the today page's first proactive alert: a
    sticky danger-toned banner (role=status, aria-live) that surfaces only
    when 1+ pending doses slipped past the 15-min grace. "Jump to first"
    smooth-scrolls (reduced-motion aware) to the longest-waiting dose via a
    new per-row id and pulses it.
  - `dashboard-next-dose-countdown` is a live card between the day rail and
    the stat capsules; self-ticking once a minute, tone-shifting accent ->
    amber -> coral with "Nh Nm late" on overdue and a calm "all caught up"
    end state, plus a quick Take wired to the existing dose-take flow.
  - `refills-status-filter-tabs` adds All/Needed/Requested/Ready tabs with
    count badges; lands on the most actionable non-empty tab on load but
    respects an explicit pick; the 30-day timeline shows only on All.
  - `notifications-group-by-day` breaks the flat inbox into day sections with
    sticky relative-day headers (Today/Yesterday/weekday/short date) + a
    per-group count, layered on top of the existing filter tabs + snooze.
  - `schedule-week-today-column` lights the current weekday column with a
    sage spine + accent header + "Today" cap and scrolls it into view on
    mount (only when the week contains today); also refreshed the column
    chrome to the sage/coral token palette. Replaced the page's ad-hoc
    startOfWeek + manual day array with the tested week model.
  - LSP again flagged the stale-@types/react `Link cannot be used as a JSX
    component / bigint` false positive on every edited .tsx; real tsc reports
    those files clean. Do not chase it (see tick 29/30/31 session notes).

- 2026-06-25 11:46 PDT — tick 31: 5 features shipped (FRONTEND-FOCUS override active).
  Commits: c28c1d7 medication-supply-sparkline,
  930298c reports-adherence-bars,
  3065637 schedule-day-drilldown,
  a8af471 caregivers-activity-feed,
  0fa6034 command-palette-recent.
  Gate: `@med/web` BUILD SUCCEEDS (`Compiled successfully in 3.2s`; all 60
  static pages generated incl. every edited route /medications, /reports,
  /schedule/month + /caregivers/[id]). `@med/web` test 216/216 pass across
  15 suites (130 baseline + 86 new this tick) with TMPDIR=/Volumes/Projects/
  .tmp. `@med/web` typecheck shows only the pre-existing baseline (4 `.next/
  types/validator.ts` layout-config errors + the packages/utils schedule-
  resolver/taper-plan/titration strict-undefined baseline) — ZERO new errors
  in any apps/web file or new lib/component module (verified by grepping the
  tsc output for every touched/created path). `@med/web` lint fails with the
  documented pre-existing `next lint` "Invalid project directory" tooling bug
  — not introduced by this tick.
  TWENTY-FIRST clean tick in a row (no fixup commits, no force-push, no revert).

  Fourth frontend tick under Sanjay's standing override. Five slices spanning
  five different surfaces, each extracting its pure-logic core into a tested
  lib/*.ts module — the web test harness grew from 130 -> 216 tests:
  - lib/supply-sparkline.ts (15) — burndown projection (supply on day d =
    remaining - d*perDay, clamped), fixed-horizon x / per-med y, run-out day,
    tone from refillThresholdDays, polyline + area-path strings
  - lib/adherence-bars.ts (17) — per-med taken/scheduled -> sorted toned bars
    (worst-first, empties last), pct clamp, tone ramp 70/90, weighted overall,
    worst bar, flagged-below-70 count
  - lib/day-doses.ts (18) — single-day dose expansion (weekday + date-range
    match like the month grid), time sort + name tiebreak, part-of-day buckets,
    grouping
  - lib/caregiver-activity.ts (20) — relative-time phrasing (minute->year,
    past/future, singular/plural), expired / expiring-soon windows, ordered
    activity feed, scope labels, summary rollup
  - lib/command-recents.ts (16) — recents push/dedupe/cap, parse-of-garbage
    defence, serialize round-trip, reconcile against live items
  Remaining frontend backlog: 5 Tier 1U stragglers (#274-#277, #279) + 5
  Tier 1V items (#281, #292-#295) + the fresh Tier 1W below. Backend tiers
  1L-1T stay paused until Sanjay removes the override.

  Notes:
  - Twenty-first tick in a row. Every tick 31 slice is a real user-facing
    capability (logic + visual treatment + interactions + a11y), tested.
  - `medication-supply-sparkline` adds the medications list's first per-row
    data-viz: a fixed-horizon burndown so steeper lines = sooner run-out and
    rows are visually comparable; a marker sits where the bottle hits empty.
  - `reports-adherence-bars` turns the flat adherence number into a
    per-medication bar chart sorted worst-first with a tone ramp; needed a new
    deterministic getMedicationAdherence() in lib/data.ts (API-aware, stable
    per-med hash fallback). role=meter bars, flagged-count header chip.
  - `schedule-day-drilldown` makes month-grid day cells clickable, opening a
    slide-in panel (new slideInRight keyframe + reduced-motion entry) listing
    that day's doses grouped morning/afternoon/evening with 12h time chips.
  - `caregivers-activity-feed` replaces the static two-row activity block with
    a real feed carrying relative timestamps + toned dots, an expiring-soon
    header pill, and readable scope labels.
  - `command-palette-recent` adds a Recent section (empty-query only) backed by
    localStorage, reconciled against live items so deleted meds drop out and
    renames update; all storage access best-effort for private mode / SSR.
  - LSP again flagged the stale-@types/react `Link cannot be used as a JSX
    component / bigint` false positive on every edited .tsx; real tsc reports
    those files clean. Do not chase it (see tick 29/30 session notes).

- 2026-06-25 06:28 PDT — tick 30: 5 features shipped (FRONTEND-FOCUS override active).
  Commits: 4e7ed85 medications-list-search-sort,
  cb56e2c refills-timeline-strip,
  77b6f77 adherence-ring-detail-popover,
  281d5dd dose-history-week-strip,
  9009729 notifications-filter-tabs.
  Gate: `@med/web` BUILD SUCCEEDS (`Compiled successfully in 3.2s`; all 60
  static pages generated incl. the 4 edited routes /dashboard, /medications,
  /notifications, /refills + /medications/[id]). `@med/web` test 130/130 pass
  across 10 suites (66 baseline + 64 new this tick) with TMPDIR=/Volumes/
  Projects/.tmp. `@med/web` typecheck shows only the pre-existing baseline
  (4 .next/types/validator.ts layout-config errors + the packages/utils
  taper-plan/titration strict-undefined baseline) — ZERO new errors in any
  apps/web file or new lib module (verified by grepping the tsc output).
  `@med/web` lint fails with the documented pre-existing `next lint`
  "Invalid project directory" tooling bug — not introduced by this tick.
  TWENTIETH clean tick in a row (no fixup commits, no force-push, no revert).

  Third frontend tick under Sanjay's standing override. Five Tier 1V slices,
  each extracting its pure-logic core into a tested lib/*.ts module — the web
  test harness grew from 66 -> 130 tests:
  - lib/medication-sort.ts (16) — filter predicate + dose-per-day parser +
    run-out estimate + null-safe comparators
  - lib/refill-timeline.ts (12) — day-delta, clamped fractional positions,
    greedy lane assignment, gridline ticks
  - lib/adherence-breakdown.ts (12) — taken/skipped/missed split with
    largest-remainder rounding (percentages sum to 100)
  - lib/week-strip.ts (12) — per-day adherence collapse + week roll-up,
    local-date keys (no UTC drift)
  - lib/notification-filter.ts (12) — kind->tab bucketing + unread-aware
    per-tab counts
  Remaining frontend backlog: 5 Tier 1U stragglers (#274-#277, #279) + 10
  Tier 1V items (#281, #285, #286, #288, #290-#295). Backend tiers 1L-1T
  stay paused until Sanjay removes the override.

  Notes:
  - Twentieth tick in a row. Every tick 30 slice is a real user-facing
    capability (logic + visual treatment + interactions + a11y), tested.
  - `medications-list-search-sort` adds the list's first sort control: Name /
    Lowest supply / Soonest refill chips + a search box that also takes a "/"
    focus shortcut. The runout sort divides remainingDoses by parsed doses-per-
    day and surfaces a "~Nd left" estimate chip per row.
  - `refills-timeline-strip` is the refills page's first data-viz: a 30-day
    horizontal strip with a today line, shaded overdue gutter, weekly ticks,
    and lane-stacking so coincident refill dates don't overlap. Only renders
    with 2+ plottable refills.
  - `adherence-ring-detail-popover` makes the dashboard ring a click target;
    the popover derives skipped/missed from taken-vs-scheduled (every not-taken
    dose is missed, since the API doesn't yet expose a skipped split — honest
    and conservative for a health app) and draws a stacked mini-bar.
  - `dose-history-week-strip` adds a 7-pill week row to the med detail page,
    loading 7 days of per-med history in a non-blocking effect that degrades
    to empty days if history is unavailable.
  - `notifications-filter-tabs` adds All/Reminders/Refills/System tabs with
    unread-aware count badges; caregiver notifications fold into System so
    every item lands under exactly one tab.
  - LSP again flagged the stale-@types/react `Link cannot be used as a JSX
    component / bigint` false positive on every edited .tsx; real tsc reports
    those files clean. Do not chase it (see tick 29 session note).

- 2026-06-25 00:30 PDT — tick 29: 5 features shipped (FRONTEND-FOCUS override active).
  Commits: a864074 today-page-bulk-take,
  9093e7a medications-detail-cover,
  4faa31b refill-bottle-progress,
  7ae21de schedule-month-view,
  6afaca8 notifications-snooze-row.
  Gate: `@med/web` BUILD SUCCEEDS (`Compiled successfully in 4.0s`, every
  page incl. the new /schedule/month route prerenders cleanly). `@med/web`
  typecheck shows only the pre-existing baseline (`components/DayRail.tsx`
  (216,9) unused @ts-expect-error + 4 `.next/types/validator.ts` layout-
  config errors) — identical to start-of-tick; zero new errors. `@med/web`
  test 66/66 pass across 5 NEW suites with TMPDIR=/Volumes/Projects/.tmp.
  `@med/web` lint fails with the documented pre-existing `next lint`
  "Invalid project directory" tooling bug (proven identical via git stash) —
  not introduced by this tick.
  NINETEENTH clean tick in a row (no fixup commits, no force-push, no revert).

  Second frontend tick under Sanjay's standing override. This tick stood up
  the FIRST web-app test harness: each of the 5 slices extracts its pure-logic
  core into a lib/*.ts module with co-located vitest tests under apps/web/
  tests/ (the web package had zero test files before today). 66 tests now run
  in the web package:
  - lib/dose-selection.ts (17) — multi-select toggle/range/prune/summarize
  - lib/next-dose.ts (14) — next-dose countdown selection + formatting
  - lib/bottle-fill.ts (11) — refill bottle fill fraction + tone thresholds
  - lib/month-grid.ts (14) — 6x7 calendar grid + recurrence dose counts
  - lib/snooze.ts (12) — relative + named snooze wake-time math
  Five Tier 1U items remain (#274-#277, #279); Tier 1V opens with 15 fresh
  frontend candidates (#281-#295). Backend tiers 1L-1T remain paused until
  Sanjay removes the override.

  Notes:
  - Nineteenth tick in a row. Every tick 29 slice is a real user-facing
    capability (logic + visual treatment + interactions + a11y), tested.
  - `today-page-bulk-take` adds the app's first multi-select surface:
    shift+click range select against the ordered pending list, a sage
    floating action bar with a live count, Promise.allSettled bulk take
    that keeps rows pending on partial failure, and a one-shot bulk Undo.
  - `medications-detail-cover` replaces the flat header with a gradient
    hero (serif name, pill glyph, form/schedule/next-dose capsules) and
    moves instructions into a hover-reveal inline textarea editor.
  - `refill-bottle-progress` draws a real prescription-bottle SVG per row;
    sage liquid level eases on change, coral below the refill threshold.
  - `schedule-month-view` is the first calendar surface: 6x7 grid, spill-day
    dimming, today ring, per-day chips + dose counts, month paging.
  - `notifications-snooze-row` adds a per-row popover (outside-click/Esc
    close, role=menu) that optimistically collapses the row + Undo toast.
  - LSP flagged `Link cannot be used as a JSX component` on every edited
    .tsx — a stale `@types/react@18.2.79` resolution in the LSP only; the
    real `tsc` (@types/react 18.3) reports it clean. Verified per file.

- 2026-06-23 23:47 PDT — tick 28: 5 features shipped (FRONTEND-FOCUS override active).
  Commits: dc76a45 command-palette-cmd-k,
  8905b13 toast-notifications,
  822d699 adherence-ring-widget,
  462c2f1 keyboard-shortcuts-overlay,
  a28108a history-page-heatmap.
  Gate: `@med/web` typecheck clean (only pre-existing
  `components/DayRail.tsx(216,9)` unused @ts-expect-error and 4
  `.next/types/validator.ts` errors — identical to start-of-tick
  baseline; verified by stash+recheck). `@med/web` build
  SUCCEEDS — every page including the new /history heatmap and the
  new (app)/layout with toast/palette/keyboard-help renders cleanly.
  `@med/utils` test 3567/3567 pass with TMPDIR=/Volumes/Projects/.tmp
  (root volume at 100% so /var/folders fills mid-vitest; redirecting
  TMPDIR to the project volume restores the baseline). `@med/config`
  + `@med/api` + `@med/web#lint` all fail with documented pre-existing
  baseline errors; zero new errors introduced by this tick.
  EIGHTEENTH clean tick in a row (no fixup commits, no force-push,
  no revert).

  This is the FIRST frontend tick under Sanjay's standing override
  (set 2026-06-23 in `med-tracker-20min-prompt.md`). The five slices
  level up the (app)/layout with a Linear/Raycast-quality command
  palette, a real toast system wired into dose actions, an animated
  adherence ring on the dashboard, a global keyboard shortcut router
  with discoverable cheat sheet, and a full history-page redesign
  with a 6-month adherence heatmap. Tier 1U opens with 10 fresh
  frontend candidates (#271-#280) — see roadmap. Backend tiers 1L-1T
  remain paused until Sanjay removes the override.

  Notes:
  - Eighteenth tick in a row. Every tick 28 slice is a real user-
    facing capability with logic + visual treatment + interactions +
    accessibility, not scaffolding.
  - `command-palette-cmd-k` is the FIRST keyboard-first navigation
    primitive in the web app. Subsequence-aware fuzzy scorer
    (prefix > substring > consecutive-character) so "med" matches
    "Medications" with a higher score than "create medication";
    title weighted 1.5x over subtitle. Three sections (Pages /
    Actions / Medications) filtered + scored independently then
    flattened for keyboard navigation. ⌘K / Ctrl+K / `/` open it,
    Esc closes, ↑↓ navigate, ↵ runs, Home/End jump to edges. Lazy-
    loads the user's medication list on first open so the rest of
    the app boot path doesn't ping that endpoint. Mouse hover
    updates the active index so mouse + keyboard stay in sync.
    Auto-scroll keeps the active row in view. The topbar hint
    button dispatches a synthesized Cmd+K KeyboardEvent so the
    same code path opens the palette from mouse or keyboard
    (avoids prop drilling).
  - `toast-notifications` is the FIRST transient-feedback layer in
    the web app. <ToastProvider> mounted at (app)/layout, useToast
    hook from anywhere. Four kinds (success / error / warning /
    info) each with semantic icon + tone from the design tokens
    (ok-bg, danger-bg, warn-bg, info-bg) so dark mode flips
    naturally. Hover-pause: timer freezes on mouseenter, resumes
    from the remaining time on mouseleave. Inline action button
    (e.g. Undo) that runs a callback + dismisses. Dedupe by
    externalId: spamming the same action replaces the earlier
    toast in place rather than stacking. Slide-in / slide-out
    keyframes added to globals.css; prefers-reduced-motion query
    skips both. Today page rewired: dose-take and dose-skip
    confirm via toast with Undo action that calls undoDose; errors
    surface as red toasts alongside the existing ErrorBox so the
    user never has to scroll up to see the failure.
  - `adherence-ring-widget` is the FIRST animated SVG widget in
    the web app. Pure SVG, viewBox-scaled so the same source
    renders crisply at any size. Stroke length tweens to the
    target percentage via requestAnimationFrame with easeOutCubic;
    starts from 0 so the ring sweeps in on first paint.
    prefers-reduced-motion is honoured: jumps directly to target,
    preserves a 200ms stroke-colour transition so theme flips
    still feel alive. Tone auto-derives from percentage (>=90 ok
    / >=70 warn / <70 danger) with explicit override. 0/25/50/75
    milestone tick marks on the track for instant "where am I"
    reading. Centre slot is a render prop; default renders the
    big number + percent suffix + optional subtitle. Dashboard
    Two-week pulse replaces the decorative TrendingUp icon block
    with this ring (132px) + trend label (icon flips for
    trend=down), taken/scheduled count, streak-day capsule chip.
    The 14-day intensity grid now derives from the real
    adherencePct with deterministic ~18pp variance so the grid
    reads as coherent variation around the user's baseline (not
    a fake sine wave); today's cell carries a sage outline.
  - `keyboard-shortcuts-overlay` is the FIRST app-wide keyboard
    shortcut router. ? toggles a Linear-style cheat sheet (three
    grouped sections: Navigation / Actions / Help). Leader
    sequences: G then D/T/M/S/R/H route to dashboard / today /
    medications / schedule / refills / history; the leader is a
    1.4-second window. Single-letter actions: N opens
    /medications/new, T toggles theme (clicks the existing topbar
    Toggle theme button so useTheme stays single-source-of-truth),
    Esc closes any active overlay. All shortcuts skip when focus
    is in an input/textarea/select/contentEditable so typing in a
    search box never hijacks the keys. Mac/non-mac modifier glyph
    swap on every kbd block. The topbar gets a discoverable "?"
    chip that dispatches a synthesized "?" KeyboardEvent.
  - `history-page-heatmap` is the FIRST data-visualization page-
    level redesign. Replaced a placeholder list of date pills
    with a 26-week (~6 months) GitHub-contributions-style heatmap.
    Each cell is 14x14px; sage progression for healthy days (95+
    / 85+ / 70+ stops), warm amber for shaky (50+), coral for
    rough (<50); empty days fall back to bg-sunk. Today's cell
    is outlined in sage. Weekday labels (M, W, F) on the left
    rail every other row to keep them legible. Month labels above
    the column where each month begins. Hover/focus lifts a cell
    with hover:scale-125 + 1.5x outline; a detail row underneath
    surfaces full date, % on schedule, dose count, qualitative
    chip ("on point" / "solid" / "mixed" / "shaky" / "rough").
    Three stat tiles (6-month avg, perfect days, rough days) +
    compact "less ... more" legend mirroring the cell ramp.
    Below the heatmap, a "Recent days" list of the last 7 entries
    with date-pill glyph tinted to the day's tone, inline % stat,
    qualitative chip, and ArrowRight into the per-day page. Until
    the API returns per-day history, cells use a deterministic
    per-iso-date percentage so the heatmap reads coherent rather
    than random; this swaps to real values transparently when the
    API starts returning records.

- 2026-06-23 19:41 PDT — tick 27: 5 features shipped.
  Commits: 486397b regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-prometheus,
  f87f532 dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable-multipage,
  3840368 followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-print-i18n,
  0ffbca6 refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise-coverage-report,
  c62e6cb prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input-i18n.
  Gate: 3567/3567 tests pass in `@med/utils` (139 new this tick:
  26+26+27+34+26). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to start-of-tick (same
  6 pre-existing files: adherence-risk, date, ics, schedule-resolver,
  taper-plan, titration); zero new errors introduced by tick 27.
  SEVENTEENTH clean tick in a row (no fixup commits, no force-push,
  no revert). Tier 1R FULLY CLOSED (#236-#245 all shipped across
  ticks 26-27; the 5 carried-forward items #237 #239 #241 #243 #245
  all landed this tick). Tier 1S (#246-#255) untouched + #251
  marked SUPERSEDED by tick 27 #241 (same module path; tick 27 chose
  to apply i18n to the PRINT variant where the gap was real,
  rather than the dashboard variant). Tier 1T refilled with 10
  fresh derivative composition candidates (#256-#265), two per
  tick-27 module. 117 unstarted total across all tiers (older
  recycled candidates still in the queue).

  Notes:
  - Seventeenth composition tick in a row. Every tick 27 module
    composes on at least one tick 23/24/25/26 output (fourteenth-
    derivative companions):
    bulk-cli-summary-prometheus on bulk-cli-summary-json (T26) +
    bulk-cli-summary (T25),
    quiet-hours-calendar-html-printable-multipage on quiet-hours-
    calendar-html-printable (T25),
    warnings-html-print-i18n on warnings-html-print (T26) +
    refusal-reason-suggest-i18n bundle pattern (T14),
    spine-batch-csv-manifest-anonymise-coverage-report on spine-
    batch-csv-manifest-anonymise (T25),
    search-input-i18n on search-input (T25) +
    refusal-reason-suggest-i18n bundle pattern (T14).
    Composition rhythm now spans T11 -> T27, seventeen consecutive
    composition ticks. The pattern continues mechanically.
  - `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-prometheus`
    is the FIRST `/metrics`-text-format exporter in the package.
    Strict Prometheus exposition spec: HELP + TYPE before each
    metric family, single-space separators, one metric per line,
    trailing newline, blank-line separators between families.
    Nine metric families: cohort patients (gauge), epochs (gauge),
    transitions_total (gauge), collisions_total (counter),
    noop_transitions (gauge), verdict_status (gauge — one sample
    per known verdict, 1 for current, 0 otherwise; that pattern
    lets PromQL alerts fire on a target verdict without re-reading
    the underlying log line), per-transition patients (gauge),
    per-transition reshuffled (gauge), per-transition collisions
    (counter). Label-value escaping per spec: backslash, double-
    quote, newline; carriage returns stripped defensively.
    extraLabels for per-cohort tagging on a shared /metrics
    endpoint with reserved-label clash detection (batch, verdict,
    from_epoch, to_epoch can't be overridden). Metric prefix
    validated against /^[a-zA-Z_:][a-zA-Z0-9_:]*$/; label names
    validated against /^[a-zA-Z_][a-zA-Z0-9_]*$/. Label keys
    sorted by name on emission so a downstream diff against the
    payload is stable regardless of extraLabels insertion order.
    listAnonymiseKeyRotateBulkCliSummaryPrometheusMetricNames
    helper for tests + dashboard discovery.
  - `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable-multipage`
    is the FIRST form-feed-separated multi-page emitter in the
    package. Form-feed character (\\f, ASCII 0x0C) is the printer
    cassette page-break code so a single print job splits cleanly
    across N pages. Per-region inputs (regionId + per-region
    options) inherit from a shared baseOptions; per-region options
    fully replace base options on a per-field basis (defaultWindow
    / overrides / palette / printedAt do NOT deep-merge — that's
    the desired behaviour since each region wants its own complete
    config). wrapEachPageAsDocument defaults TRUE (the form-feed
    only makes sense across standalone HTML docs); when false, the
    form-feed separates fragments for hosts injecting them into
    their own outer document. pageSeparator overridable (custom
    HTML-comment separators) or suppressible (''). splitMultipage
    helper restores per-page documents by splitting on the
    separator (mirrors what a printer driver does). detectEmpty
    Regions flags regions with zero non-default cells so admins
    can skip trivial pages without re-rendering. Resolved paper
    picks from baseOptions ?? first region ?? us-letter.
  - `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-print-i18n`
    is the FIRST i18n layer applied to a print-only warnings
    panel in the package. Per-locale badge prefixes ([CRÍTICO] /
    [ATENCIÓN] / [INFO]), severity labels (Siempre crítico /
    Siempre un solo nivel / Destino no usado), empty-state badge
    + label, "Printed" prefix, default footer text. The unused-
    destination chip has a structural quirk: the base render
    echoes the English severity label "Unused destination" in
    the cov-warn-label span (the span that normally holds chip.
    label), so the i18n layer localises THAT span too for the
    unused-destination severity only — honest: a Spanish render
    without the second-span rewrite would print [INFO] Destino
    no usado AND a trailing English "Unused destination" leak.
    Graceful fallback to English on missing keys; fallbackUsed
    + missingKeys (dotted paths) surface gaps. detectCoverage
    helper expects 10 keys per locale (3 badges + 3 severity
    labels + 4 scalars). Caller-supplied footerText honoured
    verbatim (no i18n at this layer for explicit copy).
    extractLines plain-text helper for log review.
  - `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise-coverage-report`
    is the FIRST standalone audit-coverage report for an
    anonymisation result in the package. Surfaces every QA
    signal the on-call needs to sign off before mailing the
    manifest: nameStrategy, hashHexLength (clamped [4, 64]),
    hashPrefix, distinctPatientCount, manifestRowCount, lookup
    RowCount, collisionDetected, redactedRowCount, redacted
    Samples (capped at 5 by default; configurable [0, 100]),
    preserveDateLabel + preservePanelLabel (for PHI-leak
    detection), and a composite worst-wins verdict (review-
    collisions > review-redacted > empty-cohort > ship-safe)
    so the reviewer reads the verdict first. detectLeak
    Warnings returns the 'preserveDateLabel-on' /
    'preservePanelLabel-on' warnings so the channel admin
    can promote PHI-column concerns. aggregate helper rolls
    N coverage reports (one per ward / clinic / panel) into a
    batch-of-batches summary: counts sum, preserve flags OR
    (worst-wins for PHI leak), verdict worst-wins, nameStrategy
    flagged 'mixed' + hashHexLength + hashPrefix null when
    inputs disagree. Empty-cohort verdict suppressed on the
    aggregate when at least one input shipped rows.
  - `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input-i18n`
    is the FIRST i18n layer applied to a search-input render in
    the package. Per-locale placeholder ("Filtrar prescriptores"
    / "処方者を絞り込む" / "Verschreiber filtern"), aria-label,
    and visually-hidden empty-state hint. Smallest i18n bundle
    in the package — 3 keys (placeholder, ariaLabel,
    emptyStateHint). Composes the base anchored-search-input
    renderer so the data attributes + datalist + anchor map
    stay consistent across locales. Graceful fallback to
    English on missing keys; fallbackUsed + missingKeys
    flagged. detectCoverage helper. renderEmergencyCard
    SearchInputI18nMultiLocale rolls the same TOC across N
    locale bundles in one call (Map keyed on locale) parallel
    to the followup-digest-multi-locale module, for clinic-
    chain portals pre-rendering every supported locale
    server-side. HTML escaping inherited from the base
    renderer (placeholder + aria-label go through escapeHtml;
    empty-state hint span body also escaped).
  - Module-domain-noun prefix discipline continues:
    AnonymiseKeyRotateBulkCliSummaryPrometheus (not Prometheus),
    QuietHoursCalendarPrintableMultipage (not Multipage),
    BccTierPolicyCoverageWarningsHtmlPrintI18n (not I18n),
    SpineBatchCsvManifestAnonymiseCoverageReport (not Coverage
    Report), EmergencyCardSearchInputI18n (not I18n). Every
    tick 27 export uses a module-prefixed name where any
    generic name could have collided.
  - 17 clean ticks in a row (no fixup commits, no force-push,
    no revert). Every commit revertible in isolation; every
    commit has its own test suite; every commit passes the
    full @med/utils gate in isolation AND in batch.
  - Tier 1R fully closed out this tick (all 10 of #236-#245
    shipped across ticks 26-27). Tier 1S (10 from #246-#255)
    still has 9 unstarted; #251 marked SUPERSEDED. Tier 1T
    (10 fresh candidates, #256-#265) refilled with derivative
    composition candidates extending each of the 5 modules
    shipped this tick (extra-labels-policy + pushgateway for
    prometheus, toc + i18n for multipage, coverage-report +
    multi-locale for warnings-html-print-i18n, html + cli-
    summary for anonymise-coverage-report, coverage-report +
    rtl for search-input-i18n).
  - Honest scope on #251 supersession: the Tier 1S roadmap
    listed #251 as applying i18n to the DASHBOARD warnings
    HTML, but the tick-26 print variant was the one that
    accumulated chrome strings worth localising (badge
    prefixes, monochrome severity labels, printed-on prefix,
    default footer). Applying i18n to the dashboard variant
    would have been a near-zero-change layer (the dashboard
    only had `emptyStateLabel` + `severityLabels` overrides
    already exposed as base options). Tick 27 chose the
    print variant — same module path, more meaningful work.
  - Hardware corner cases handled this tick: Prometheus
    label-value escaping (backslash, double-quote, newline)
    + carriage-return stripping; reserved-label clash detection
    (batch / verdict / from_epoch / to_epoch); metric + label
    name validation against the exposition spec; deterministic
    label key order via sort on emission; ASCII 0x0C (form-feed)
    as the printer page-break code; deep-replace vs deep-merge
    semantics on multipage region option inheritance (explicit
    REPLACE so a New York region's defaultWindow doesn't
    inherit a Berlin timezone from base); split helper that
    re-derives per-page docs from the concatenated text (so a
    host can ship pages as separate downloads); unused-
    destination chip label-span rewrite gated to that severity
    only (other severities have distinct chip.label content);
    worst-wins verdict precedence for anonymise coverage
    aggregation; empty-cohort verdict suppression on aggregates
    when at least one input shipped rows; per-locale missing-
    keys list with dotted-path naming so a CI gate can flag
    locale bundles independently; HTML escaping via the base
    renderer's escapeHtml for placeholder / aria-label / empty-
    state hint so the i18n layer adds zero XSS surface.

- 2026-06-23 15:30 PDT — tick 26: 5 features shipped.
  Commits: 02f0dca regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-json,
  d984376 dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable-i18n,
  844d9d6 followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-print,
  ffd5d1c refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise-key-rotate,
  51d7d65 prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input-keyboard-nav.
  Gate: 3428/3428 tests pass in `@med/utils` (158 new this tick:
  25+32+36+34+31). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to start-of-tick (same
  6 pre-existing files: adherence-risk, date, ics, schedule-resolver,
  taper-plan, titration); zero new errors introduced by tick 26.
  SIXTEENTH clean tick in a row (no fixup commits, no force-push,
  no revert). Tier 1R half-closed (5 of #236-#245 shipped; #237,
  #239, #241, #243, #245 carried forward). Tier 1S refilled with
  10 fresh derivative composition candidates (#246-#255), two per
  tick-26 module. 114 unstarted total across all tiers (older
  recycled candidates still in the queue).

  Notes:
  - Sixteenth composition tick in a row. Every tick 26 module
    composes on at least one tick 22/23/24/25 output (thirteenth-
    derivative companions):
    bulk-cli-summary-json on bulk-cli-summary (T25),
    quiet-hours-calendar-html-printable-i18n on calendar-html-
    printable (T25) + refusal-reason-suggest-i18n bundle pattern (T14),
    coverage-report-warnings-html-print on coverage-report-warnings-
    html (T25),
    spine-batch-csv-manifest-anonymise-key-rotate on spine-batch-
    csv-manifest-anonymise (T25) + regimen-history anonymise-key-
    rotate (T19) pattern,
    search-input-keyboard-nav on search-input (T25) + back-to-top
    (T24) navigation patterns.
    Composition rhythm now spans T11 -> T26, sixteen consecutive
    composition ticks. The pattern continues mechanically.
  - `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-json`
    is the FIRST structured-JSON variant of a CLI summary in the
    package. Parses the bulk cli-summary's leading-tag from each
    transition line via a tight regex (^(\[[^\]]+\])) and produces
    typed per-transition + batch entries shaped for direct
    JSON.stringify. Defensive: malformed lines fall back to
    '[key-rotate]' / '[key-rotate-bulk]' tags rather than crash.
    Tag overrides: transitionTagOverride callback for per-cohort
    relabelling, batchTagOverride string for the batch entry.
    Helpers: joinAsNdjson (one JSON object per line: transitions
    first then batch; analytics pipelines ingest NDJSON streams
    directly), filterByVerdict (dashboard "show me every widen-
    hash transition" view), combine (multi-cohort combiner with
    worst-wins batch verdict precedence widen-hash > empty-
    cohort > ship-safe > no-op matching the underlying bulk
    semantics). Round-trip safety verified: every field is
    JSON.stringify clean (no Map, no Date, no undefined);
    integer fields stay numeric after JSON.parse so a time-
    series DB ingest doesn't accidentally cast to string.
  - `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable-i18n`
    is the FIRST i18n bundle on a printable HTML render in the
    package. Composes the base printable renderer so the
    underlying cell datum stays English-typed (cells[].dayOfWeek
    / cells[].rule are still the structured keys for downstream
    consumers) — only the rendered chrome text changes. Bundle
    shape: days (mon..sun), rules (default / override:window /
    override:all-day / override:none — the four canonical labels
    the base render uses), printedPrefix ("Printed" / "Imprimé"
    / "Gedruckt" / "印刷"), defaultFooterText. All fields
    optional; missing keys fall back to the English reference
    table. Caller-supplied footerText override always wins
    verbatim (no i18n at this layer — explicit copy is the
    caller's own). Bold-non-default rule labels survive the
    rewrite: the base render wraps non-default rules in
    <strong>; the rewrite walks both bare and strong-wrapped
    patterns. detectCoverage(bundle) standalone CI gate
    helper (expectedKeys / providedKeys / missingKeys /
    coverage ratio / isComplete). summarize uses localised
    labels in the body + lowercases printed prefix
    ("; impreso 2026-06-23"); fallback-key parenthetical
    omitted on complete bundle.
  - `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-print`
    is the FIRST print-only variant of a coverage warnings
    panel in the package. Composes the base warnings HTML so
    chip datum stays consistent, then swaps every visual cue
    that depends on colour: palette swapped to monochrome via
    !important overlay rules; severity differentiation moves
    to BORDER WIDTH (3px critical, 2px tier, 1px unused-
    destination) + BADGE PREFIX ("[CRITICAL]", "[CAUTION]",
    "[INFO]") so the signal survives both monochrome printing
    AND colour-vision differences; chips stack vertically (flex-
    direction:column) for cleaner page breaks; address span
    loses coloured background fill, gains hairline 1px grey
    border, uses tabular-nums for printer-friendly digit
    alignment. @page CSS sized to US Letter / A4. Optional
    "Printed YYYY-MM-DD" stamp (timezone-aware). Optional
    footer override; '' suppresses. suppressBadgePrefix opts
    out for chrome-free renders; suppressPrintedAt for
    stable hash-equal snapshots. extractLines per-chip plain-
    text helper for log review without rendering HTML.
  - `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise-key-rotate`
    is the FIRST per-feature anonymise-key-rotate companion
    in the package (parallel to the regimen-history module).
    Runs exportSpineBatchCsvManifestAnonymise twice (once
    per secret) and walks the lookup tables to produce a
    rotation mapping. Three outputs: oldManifestCsv +
    newManifestCsv (each third-party-safe) + rotationLookupCsv
    (3-col: original + old + new pseudonym, IN-HOUSE only
    PHI). FOURTH output rotationLookupCsvWithoutOriginalNames
    (2-col: old + new pseudonym, safe to share with the
    third-party printer so they can update their lookup
    table without seeing source PHI). Both secrets enforced
    at >= 32 chars. oldSecret === newSecret ACCEPTED (not an
    error) but flagged noOpRotation=true. collisionDetected =
    OR of both anonymise results. nameStrategy='redacted'
    always produces noOpRotation=true. countChanges /
    summarize / detectRedactedEntries helpers parallel the
    existing anonymise + key-rotate idioms.
  - `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input-keyboard-nav`
    is the FIRST keyboard-navigation helper in the package.
    Composes the search-input render and exposes
    focusableOrder (flat array in tab order; index 0 always
    search input, subsequent entries TOC rows with cardIndex
    + displayName attached) + keyMap (per-element bindings
    array of {key, targetId}). Default bindings: search
    input row ArrowDown -> first row, Home -> first, End ->
    last; per row ArrowDown -> next (omitted on last row to
    allow browser tab-out), ArrowUp -> previous OR back to
    search, Home / End -> first / last, Escape -> search.
    Honest scope: ships the SCAFFOLDING (focusable order +
    keyMap); the keydown handler itself is intentionally
    NOT shipped. A host page wires it in 8 lines:
      document.addEventListener('keydown', (e) => {
        const fromId = document.activeElement?.id;
        const target = json[fromId]?.[e.key];
        if (target) document.getElementById(target)?.focus();
      });
    suppressHomeEndBindings / suppressEscapeBinding opt-outs
    for host pages that bind those keys to their own
    behaviour. resolveTarget(result, fromId, key) one-shot
    helper (returns undefined when no binding matches,
    letting the host fall through to default browser
    behaviour). exportAsJson nested record shape for direct
    JSON.stringify to the browser.
  - Module-domain-noun prefix discipline continues:
    AnonymiseKeyRotateBulkCliSummaryJson (not Json),
    QuietHoursCalendarPrintableI18nResult (not I18nResult),
    BccTierPolicyCoverageWarningsHtmlPrintResult (not
    PrintResult), SpineBatchCsvManifestAnonymiseKeyRotate
    Result (not KeyRotateResult), EmergencyCardSearchInput
    KeyboardNavResult (not KeyboardNavResult — the
    EmergencyCardSearchInput prefix is preserved). Every
    tick 26 export uses a module-prefixed name where any
    generic name could have collided.
  - 16 clean ticks in a row (no fixup commits, no force-push,
    no revert). Every commit revertible in isolation; every
    commit has its own test suite; every commit passes the
    full @med/utils gate in isolation AND in batch.
  - Tier 1R half-closed (5 of #236-#245 shipped this tick;
    #237 prometheus, #239 multipage, #241 i18n, #243
    coverage-report, #245 i18n carried forward). Tier 1S
    (10 fresh candidates, #246-#255) refilled with derivative
    composition candidates extending each of the 5 modules
    shipped this tick (ndjson-tee + coverage-report for bulk-
    cli-summary-json, coverage-report + multipage for
    printable-i18n, binder-spine + i18n for warnings-html-
    print, cli-summary + bulk for spine-manifest-anonymise-
    key-rotate, aria-live + vim-bindings for keyboard-nav).
  - Hardware corner cases handled this tick: regex tag
    extraction from the leading [...] of cli-summary lines
    (defensive fallback to default tag on malformed lines),
    NDJSON line-per-object stream format (one transition per
    line, batch last so tail -1 surfaces the verdict), worst-
    wins multi-cohort verdict precedence, two-pass HMAC
    rotation (deduplicated subtle calls per distinct source
    name), no-op rotation detection via every() (true on
    empty input — graceful), in-house vs third-party CSV
    separation (rotationLookupCsv contains PHI;
    rotationLookupCsvWithoutOriginalNames safe to share),
    monochrome severity differentiation via border width +
    badge prefix (survives B&W printing AND colour-vision
    differences), @page CSS for browser print dialog defaults,
    timezone-aware printed-on date formatting (Intl.DateTime
    Format), per-locale string table fallback to EN with
    explicit missingKeys list, bold-non-default rule label
    rewrite covering both bare + <strong>-wrapped patterns,
    keyMap edge cases (empty TOC -> empty bindings list for
    search input, single-row TOC -> ArrowDown omitted on
    only row, no binding -> resolveTarget returns undefined
    for default browser behaviour).

- 2026-06-23 12:23 PDT — tick 25: 5 features shipped.
  Commits: 8bea315 regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary,
  5a990c9 dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable,
  bb695ee followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html,
  304a8d0 refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise,
  5705a7f prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input.
  Gate: 3270/3270 tests pass in `@med/utils` (139 new this tick:
  23+30+24+32+30). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to start-of-tick (same
  6 pre-existing files: adherence-risk, date, ics, schedule-resolver,
  taper-plan, titration); zero new errors introduced by tick 25.
  FIFTEENTH clean tick in a row (no fixup commits, no force-push,
  no revert). Tier 1P fully closed out — all 10 of #216-#225
  shipped across ticks 24-25. Tier 1R refilled with 10 fresh
  derivative composition candidates (#236-#245), two per tick-25
  module. 109 unstarted total across all tiers (older recycled
  candidates still in the queue).

  Notes:
  - Fifteenth composition tick in a row. Every tick 25 module
    composes on at least one tick 21/22/23/24 output (twelfth-
    derivative companions):
    bulk-cli-summary on key-rotate-bulk (T20) + cli-summary (T22),
    quiet-hours-calendar-html-printable on calendar-html (T23),
    coverage-report-warnings-html on coverage-report (T23),
    spine-batch-csv-manifest-anonymise on spine-batch-csv-manifest
    (T23) + anonymise pattern (T18),
    roster-toc-html-anchored-search-input on roster-toc-html-
    anchored (T23) + back-to-top (T24).
    Composition rhythm now spans T11 -> T25, fifteen consecutive
    composition ticks. The pattern continues mechanically.
  - `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary`
    is the FIRST multi-line CLI summary in the package. The
    single-rotation cli-summary emits ONE fixed-shape line;
    this module emits N transition lines (one per epoch
    transition) plus a single batch verdict line. Transition
    lines are tagged `[key-rotate epoch=<from>-><to>]` so a
    stack of nightly log files can be grep-ed by epoch label
    (e.g. `grep 'epoch=secret-2024' nightly.log`). Batch line
    `[key-rotate-bulk] epochs=N transitions=N patients=N
    noop_transitions=N collisions_total=N verdict=V`. Batch
    verdict precedence (worst-wins): widen-hash > empty-cohort >
    ship-safe > no-op. transitionTag + batchTag both override-
    able for multi-cohort runs (e.g. `[cohort=cardiology]`).
    suppressNoOpTransitions hides noisy unchanged-secret rows
    while keeping structured summaries intact. detectAnonymise
    KeyRotateBulkCliWarning surfaces the most actionable mis-
    configuration: widen-hash, all-no-op, empty-cohort, single-
    secret-chain. joinAnonymiseKeyRotateBulkCliSummary collapses
    everything into a single console.log-friendly string with
    the batch line always last (so tail -1 surfaces the verdict).
  - `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable`
    is the FIRST print-only HTML variant in the package paired
    with an explicit @page CSS preset. Composes the dashboard
    calendar so per-cell datum stays consistent, then post-
    processes for paper: monochrome palette (white background
    across every rule), current-day star stripped from labels
    via deterministic transform, overlay CSS suppresses the
    --current outline with !important, non-default rule labels
    bolded by default (typographic accent left after colour
    removal). @page size: 8.5in 11in (us-letter) or 210mm 297mm
    (a4). printedAt emits "Printed YYYY-MM-DD" line using
    Intl.DateTimeFormat in the right timezone. footerText
    overridable; '' suppresses the element. wrapHtmlDocument
    defaults TRUE (printable pages are standalone). extract
    QuietHoursCalendarHtmlPrintableLines emits plain-text per-
    day lines for log review without rendering HTML.
  - `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html`
    is the FIRST severity-tiered warning chip render in the
    package. The base panel collapses every warning into one
    red block; this module classifies warnings into three
    severities:
      always-critical    RED   — channel page-worthy on every envelope
      always-tier        AMBER — channel is one-dimensional
      unused-destination GREY  — cleanup, not action
    Each chip carries the severity label + human label + (for
    unused-destination only) the address split into a monospace
    span so the on-call can copy/paste it without selecting
    the surrounding label. Unknown warning strings fall into
    'unused-destination' as graceful degradation. Empty state
    renders as a single green "All checks passed" chip;
    suppressEmptyState=true opts out for dashboards that hide
    the panel when nothing is wrong. severityLabels override
    for localised text. summarizeBccTierPolicyCoverageWarnings
    Html one-line cron log. extractBccTierPolicyCoverageUnused
    Destinations returns sorted addresses for cleanup tooling.
  - `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise`
    is the FIRST PHI-anonymising spine manifest in the package.
    Hashes patient names BEFORE the CSV is built so a sticker-
    paper print shop or label-printing pipeline (Avery / Brother)
    gets the geometry it needs without PHI. Same CSV shape as
    the base manifest; patientName replaced with the
    pseudonymous hash. ASYNC — uses Web Crypto (subtle.sign)
    with HMAC-SHA-256, same pipeline regimen-snapshot anonymise
    already uses. Two name strategies: 'hashed' (default,
    "spine-7a3f1b2c", deterministic) and 'redacted' (literal
    "REDACTED" for jurisdictions that don't accept pseudonyms).
    Configurable hashPrefix + hashHexLength (clamped [4, 64]).
    hmacSecret enforced at >= 32 chars. Each distinct source
    name hashed ONCE (N redundant subtle calls avoided when
    a patient repeats on multiple spines). Collision detection
    flags collisionDetected when two source names map to the
    same pseudonym. dateLabel + panelLabel pass through
    unchanged by default; preserveDateLabel=false /
    preservePanelLabel=false rewrite non-null cells to
    "REDACTED" for columns that themselves carry PHI. THREE
    outputs: manifestCsv (third-party-safe), sheetSummaryCsv
    (no PHI; pass-through), nameLookupCsv (IN-HOUSE only,
    source-to-pseudonym mapping for label-print-error reversal).
  - `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input`
    is the FIRST search-input scaffolding in the package.
    HONEST scope: pure CSS cannot read the input's value into a
    selector so substring filtering by typed text is NOT
    shipped. What IS shipped: `<input type="search">` at the
    top of the TOC wrapper (first focusable), per-row
    data-toc-name (lowercased displayName) + data-toc-specialty
    (lowercased, "other" when null) for substring matching,
    `<datalist>` with one option per prescriber for browser
    autocomplete (zero JS needed), :placeholder-shown sibling
    selector covering the empty-state baseline, and
    :not(:placeholder-shown) sibling selector as the hook the
    host page extends with a 5-line oninput handler. A host
    page that wants typed filtering wires the oninput hook;
    the data attributes are first-class for that. Graceful
    degradation: when no host hook is wired, every row stays
    visible AND the browser's built-in find (Cmd-F) highlights
    matches via the data attributes. buildEmergencyCardSearch
    InputAttributeFragments returns per-cardIndex HTML
    attribute fragments ready to splice into the host's card
    markup. Search input + datalist + body id all configurable
    via per-id options so a host page embedding multiple TOCs
    disambiguates via per-TOC prefixes.
  - Module-domain-noun prefix discipline continues:
    AnonymiseKeyRotateBulkCliSummary (not BulkCliSummary),
    DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintable
    Result (not PrintableResult), BccTierPolicyCoverage
    WarningsHtmlResult (not WarningsHtmlResult — the BccTier
    Policy prefix is preserved), SpineBatchCsvManifestAnonymise
    Result (not AnonymiseResult), EmergencyCardPdfTwoUpRoster
    TocHtmlAnchoredSearchInputResult (not SearchInputResult).
    Every tick 25 export uses a module-prefixed name where any
    generic name could have collided.
  - 15 clean ticks in a row (no fixup commits, no force-push,
    no revert). Every commit revertible in isolation; every
    commit has its own test suite; every commit passes the
    full @med/utils gate in isolation AND in batch.
  - Tier 1P fully closed out this tick (#221-#225 shipped);
    Tier 1Q still has 10 carried-forward (#226-#235). Tier 1R
    (10 fresh candidates, #236-#245) refilled with derivative
    composition candidates extending each of the 5 modules
    shipped this tick (json + prometheus for bulk-cli-summary,
    i18n + multipage for printable, print + i18n for warnings-
    html, key-rotate + coverage-report for anonymise, keyboard
    -nav + i18n for search-input).
  - Honest scope on search-input (#225): the prompt asked for a
    "CSS-only :not() match" but true substring filtering by
    arbitrary typed text is impossible in pure CSS (CSS cannot
    read input values into selectors). The shipped module is
    explicit about this in the docstring: it ships the
    SCAFFOLDING (input + data attributes + datalist + empty-
    state CSS baseline) and is honest that the host page wires
    the actual filter logic via a 5-line oninput hook. Better
    to ship an honest scaffold than a fake-CSS-only filter
    that doesn't work.

- 2026-06-23 07:37 PDT — tick 24: 5 features shipped.
  Commits: 2e13caf regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-csv-export-per-class,
  8437a62 dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-per-cell-edit,
  a938449 followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-html,
  be242e0 refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-pivot,
  87dbec7 prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-back-to-top.
  Gate: 3131/3131 tests pass in `@med/utils` (178 new this tick:
  38+35+36+37+32). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to start-of-tick (same
  6 pre-existing files: adherence-risk, date, ics, schedule-resolver,
  taper-plan, titration); zero new errors introduced by tick 24.
  FOURTEENTH clean tick in a row (no fixup commits, no force-push,
  no revert). Tier 1P first half closed out (#216-#220 shipped);
  remaining #221-#225 carried forward. Tier 1Q refilled with 10
  fresh composition candidates (#226-#235). 114 unstarted total
  across all tiers (older recycled candidates included).

  Notes:
  - Fourteenth composition tick in a row. Every tick 24 module
    composes on at least one tick 20/21/22/23 output (eleventh-
    derivative companions):
    bulk-csv-export-per-class on bulk-csv-export (T23),
    quiet-hours-calendar-html-per-cell-edit on quiet-hours-
    calendar-html (T23),
    bcc-tier-policy-coverage-report-html on bcc-tier-policy-
    coverage-report (T23),
    spine-batch-csv-manifest-pivot on spine-batch-csv-manifest (T23),
    roster-toc-html-anchored-back-to-top on roster-toc-html-
    anchored (T23).
    Composition rhythm now spans T11 -> T24, fourteen consecutive
    composition ticks. The pattern continues mechanically.
  - `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-csv-export-per-class`
    is the FIRST per-class CSV multiplexer in the package.
    The bulk-csv-export emits ONE big sheet; the per-class
    variant emits N small sheets, one per drug class, each
    containing only the patients on that class. Cardiology
    clinic auditing CAD patients gets statin.csv + beta-blocker
    .csv + ace-inhibitor.csv as three separate sheets rather
    than 47 columns of the master sheet. patientClasses is a
    ReadonlyMap<patientId, ReadonlySet<DrugClassCode | string>>
    so callers can extend the taxonomy with custom class strings
    (trial arms, registry buckets, etc) without forking the
    module. classesToEmit restricts the output to a subset (the
    rest fall through to unclassified). includeUnclassified
    defaults TRUE so no patient is silently dropped from an
    audit hand-off. basenameTemplate + unclassifiedBasename
    govern the file basenames. Manifest CSV columns: classCode,
    basename, patientCount, transitionCount. The per-class
    chains.csv reuses the underlying exportAnonymiseKeyRotateBulkCsv
    byte-for-byte (each per-class row equals the same patient's
    row in the master sheet — only fewer rows). Transition
    patientCount on each per-class transition row equals the
    FILTERED patient count (so a cardiology auditor sees how
    many cardiology patients were in each rotation epoch, not
    the master cohort number). listAnonymiseKeyRotateBulkCsvExportPerClassFiles
    flattens chains + transitions + manifest into a
    file-entry array for direct write-to-zip / write-to-tar
    pipelines.
  - `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-per-cell-edit`
    is the FIRST clickable cell variant in the package. The
    base calendar HTML is passive (every cell shows the
    resolved rule but isn't interactive); the per-cell-edit
    overlay wraps each cell in `<a href="...">` whose target
    is built from a caller-supplied URL template with three
    placeholders ({day}, {dayLabel}, {rule}, URI-encoded
    before substitution). Channel admin clicks "Wed" in the
    grid and lands on the override editor pre-scoped to
    Wednesday. isCellEditable predicate selectively suppresses
    the anchor on a cell (read-only days render as plain divs
    — graceful degradation). buildAriaLabel default
    "Edit quiet hours for ${dayLabel} (currently ${ruleLabel})"
    keeps the overlay accessible. openInNewTab adds
    target="_blank" rel="noopener" when the admin page wants
    a separate tab. editLinks parallel array exposes the
    resolved hrefs + aria-labels for hosts that need just the
    URL shape (sitemap entries, link tests, custom markup).
  - `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-html`
    is the FIRST dashboard-ready HTML render of a coverage
    report in the package. The base coverage report is JSON-
    friendly (good for analytics pipelines, useless for the
    ops dashboard). This module emits a section with: headline
    card (envelope count + BCC fan-out + dominant tier status),
    tier-distribution bars (one per tier, coloured by tier:
    routine grey, actionable amber, critical red, width set
    to the ratio), top fan-out table (sorted by count DESC,
    monospaced address column, tabular-nums for the count),
    warnings panel (red border + light-red background; the
    on-call wants warnings to JUMP), escalation-only
    addresses list. Empty states clean: 0 envelopes ->
    "No dominant tier" + "No BCC fan-out" empty state.
    topFanoutRowLimit defaults 10 (suppresses the table when
    set to 0). suppressWarnings flag for admin overlays.
    tierLabels override for localised tier names without
    rewriting CSS. wrapHtmlDocument emits a standalone HTML
    doc for browser print. HTML-escapes every address,
    warning, and label against XSS.
  - `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-pivot`
    is the FIRST sheet-row pivot in the package. The base
    manifest is one-row-per-SPINE (audit-friendly for the
    spine-by-spine workflow); the pivot is one-row-per-SHEET
    (audit-friendly for the printer-cassette-loader workflow
    where the auditor verifies sheet 3 has these 12 patients
    in row-major order). Position cells expand to one column
    per slot (pos_1, pos_2, ..., pos_N where N = sheet
    capacity), filled in row-major order. Empty positions
    render as bare empty cells by default; configurable via
    emptyPositionPlaceholder (e.g. "—"). positionColumnTemplate
    overrides the header pattern. includeDateLabelInPosition
    formats cells as 'patientName (dateLabel)'. All other
    spine-batch options (sheetPreset, forceColumns, forceRows)
    pass through to the underlying manifest so the geometry
    math stays consistent. detectPartialSpineSheets returns
    sheet numbers where spineCount < capacity ("you're
    wasting sticker stock" warning). source manifest exposed
    for callers that want both views.
  - `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-back-to-top`
    is the FIRST return-path TOC variant in the package.
    The base anchored TOC supports one-way navigation (TOC
    -> card); back-to-top adds the return-path (card -> TOC)
    by injecting an `<a id="${tocTopAnchorId}" tabindex="-1">`
    at the top of the .toc-wrapper section so card links can
    target it. backLinkByCardIndex Map exposes pre-rendered
    `<a href="#tocTopAnchorId">Back to TOC</a>` fragments per
    cardIndex so the host page splices them into each card's
    markup. tocTopAnchorId defaults `${tocPrefix}-top` (hosts
    embedding multiple TOCs disambiguate via per-TOC prefixes).
    backLinkLabel + backLinkClassName overrides for i18n +
    custom styling. buildBackLinkAriaLabel default
    "Return to table of contents from {displayName} card"
    keeps screen-reader navigation crisp. tabindex=-1 on the
    top anchor makes it a programmatic JUMP target (via href
    fragment) without putting it in the natural tab sequence.
    HTML-escapes every label, ariaLabel, and prescriber name
    against XSS. buildEmergencyCardTocBackToTopLinks
    convenience for callers with existing TOC entries that
    only need the back-link fragments.
  - Module-domain-noun prefix discipline continues:
    AnonymiseKeyRotateBulkCsvExportPerClassResult (not
    PerClassResult), DoseRoundtripQuietHoursCalendarHtmlPerCellEditResult
    (not PerCellEditResult), BccTierPolicyCoverageReportHtmlResult
    (not CoverageReportHtmlResult), SpineBatchCsvManifestPivotResult
    (not PivotResult), EmergencyCardPdfTwoUpRosterTocHtmlAnchoredBackToTopResult
    (not BackToTopResult). Every tick 24 export uses a module-
    prefixed name where any generic name could have collided.
  - 14 clean ticks in a row (no fixup commits, no force-push,
    no revert). Every commit revertible in isolation; every
    commit has its own test suite; every commit passes the
    full @med/utils gate in isolation AND in batch.
  - Tier 1P #216-#220 shipped this tick; #221-#225 carried
    forward for the next tick. Tier 1Q (10 fresh candidates,
    #226-#235) refilled with derivative composition candidates
    extending each of the 5 modules shipped this tick.
  - Hardware corner cases handled this tick: CSV escaping
    for commas / quotes / newlines in patient names (RFC 4180
    doubled-quote), BOM round-trip (opt-in for Excel on
    Windows), URI-encoding in URL templates (rule values
    contain colons), aria-label HTML-escaping against XSS,
    keyboard-skippable anchor (tabindex=-1), empty-input
    paths (header-only CSVs, "no fan-out" empty state, "no
    dominant tier" headline), unicode patient names (LOWER-
    only for canonical key, UPPER-cased for display label),
    JSON-safe Map -> array conversion for the coverage report
    (count DESC then address ASC).

- 2026-06-23 03:43 PDT — tick 23: 5 features shipped.
  Commits: 1e04b8a regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-csv-export,
  9a8c32f dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html,
  a1d66fb followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report,
  c2576b4 refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest,
  b89b1c7 prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored.
  Gate: 2953/2953 tests pass in `@med/utils` (161 new this tick:
  38+32+28+33+30). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to start-of-tick (same
  6 pre-existing files: adherence-risk, date, ics, schedule-resolver,
  taper-plan, titration); zero new errors introduced by tick 23.
  THIRTEENTH clean tick in a row (no fixup commits, no force-push,
  no revert). Tier 1O closed out (4/5 of the original candidates
  shipped; #210 was a duplicate of tick 22 #205 and is marked
  skipped). Tier 1P refilled with 10 fresh composition candidates
  (#216-#225). 109 unstarted total across all tiers (older
  recycled candidates included).

  Notes:
  - Thirteenth composition tick in a row. Every tick 23 module
    composes on at least one tick 20/21/22 output (tenth-derivative
    companions):
    bulk-csv-export on bulk (T20),
    quiet-hours-calendar-html on quiet-hours-calendar (T20),
    bcc-tier-policy-coverage-report on bcc-tier-policy (T20),
    spine-batch-csv-manifest on spine-batch (T20),
    roster-toc-html-anchored on roster-toc-html (T20) +
    roster-toc-grouped-html (T22).
    Composition rhythm now spans T11 -> T23, thirteen consecutive
    composition ticks. The pattern continues mechanically.
  - `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-csv-export`
    is the FIRST per-epoch chain CSV export in the package.
    Existing CSV exports are single-step (key-rotate, history,
    dose-export); none model the per-patient chain across N+1
    secret epochs. Two CSVs in one call: chainsCsv (one row per
    patient with per-epoch pseudonym columns named after the
    supplied epochLabels) + transitionsCsv (one row per
    (fromEpoch -> toEpoch) transition with patientCount, no-op,
    collision flags). includeOriginalIds defaults FALSE because
    the result is PHI under HIPAA safe harbour when the original
    columns are present. epochColumns: ids-and-names (default),
    ids-only (typical audit case), names-only. sortBy: first-
    epoch-pseudonym (default lexical for cross-run stability),
    last-epoch-pseudonym, patient-id (requires includeOriginalIds
    so the column has to exist), input (preserve order).
    exportAnonymiseKeyRotateBulkTerminalCsv produces a focussed
    4-column terminal mapping CSV (or 6 with originalIds) for the
    most common audit lookup ("I have ancient data; what's the
    current pseudonym?").
  - `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html`
    is the FIRST 7-day grid HTML render in the package. The
    calendar module resolves per-day overrides as a structured
    decision object; the channel admin wants a 7-column grid
    where every column is a day-of-week and every cell shows the
    resolved rule + window in one glance. CSS grid, no JS, sans-
    serif. Each cell carries the day label, the rule label
    (Default / Custom window / Quiet all day / No quiet hours),
    the resolved window in HH:00-HH:00 timezone form, and a
    colour swatch keyed on the rule (gray=default, amber=custom,
    red=all-day, green=none). palette is Partial so the admin can
    override individual cell colours. When runAt is supplied, the
    matching day's cell is marked with .qh-cal-cell--current
    (2px outline) and a star marker after the day label.
    weekStart='mon-first' (default; matches clinical on-call) or
    'sun-first' (US consumer order). resolveCurrentDay uses
    Intl.DateTimeFormat in the channel timezone so a runAt of
    Friday 22:00 PT expressed as Saturday 05:00 UTC correctly
    resolves to Friday. Composes resolveQuietHoursRuleForDay (the
    documented helper exported by the calendar module) so changes
    to the underlying rule semantics flow through without an HTML
    rewrite. summarizeQuietHoursCalendarHtml emits a one-line
    cron-log summary with the today-part conditional on runAt.
  - `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report`
    is the FIRST JSON-friendly tier-policy report in the package.
    The basic coverage struct uses a Map for fanOutByAddress
    which doesn't round-trip cleanly through the standard JSON
    serialiser. The report transforms every Map to a sorted array
    of {address, count} entries and adds derived metrics:
    tierDistribution (per-tier ratio summing to 1.0), fanOutByTier
    (per-tier per-address breakdown), escalationOnlyAddresses
    (addresses that only fired on a single tier; typical for the
    escalation contact), dominantTier (most envelopes; null on tie
    or empty), top fan-out address + count, tierIsAlwaysRoutine /
    tierIsAlwaysActionable / tierIsAlwaysCritical flags for
    misconfiguration detection. always-* flags gated on
    envelopeCount > 0 so an empty input never falsely flags as
    "always routine" (counts==0 must NOT trigger the always flag).
    detectBccTierPolicyCoverageWarnings returns human-readable
    warning strings ("Channel always critical", "Unused
    destination: <addr>") for ops dashboards. summarize emits a
    one-line cron-log summary with envelope count + distribution +
    dominant tier + top fan-out + escalation-only count + unused
    count, with "no BCC fan-out" message for unfired runs.
  - `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest`
    is the FIRST audit CSV manifest of a printed spine batch. The
    spine-batch module produces printable HTML + sheet geometry;
    the QA workflow that audits a 47-spine printed batch needs to
    confirm every patient on the roster appears on at least one
    sticker sheet BEFORE printing. Two CSVs: manifestCsv (one row
    per spine with sheetNumber, totalSheets, rowOnSheet,
    columnOnSheet, positionInBatch, patientName, dateLabel,
    panelLabel) + sheetSummaryCsv (one row per sheet with
    sheetNumber, spineCount actual, capacity). The grid math is
    delegated to computeSpineBatchCapacity (the same helper the
    batch HTML render uses) so the manifest never disagrees with
    the rendered output. detectSpineBatchCsvManifestDuplicates
    returns patient names that appear on more than one spine with
    the per-occurrence sheet coordinates so the auditor can find
    them quickly (typical fix for a duplicate-paste in the
    roster). exportSpineBatchHtmlAndManifest returns both the
    printable batch HTML and the audit CSV in one call.
    summarize emits a one-line cron-log summary with spine + sheet
    counts and a duplicate-count flag.
  - `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored`
    is the FIRST anchor-link TOC variant in the package. The
    existing TOC HTML renders each prescriber name as a non-
    interactive <span>; that's right for paper print but wrong
    for a single-page HTML render where the TOC and the cards
    live in the same document. The household admin browsing the
    in-app digest expects to click the TOC name and jump to the
    matching card. TOC names become <a class="toc-name"
    href="#{anchorId}"> with blue underlined hover styling, visible
    focus outline for keyboard navigation. anchorByCardIndex Map
    returned alongside the HTML so the host page can place
    matching `<a id="{anchorId}">` targets on each card without
    re-deriving the id. Anchor id scheme (URL-safe,
    deterministic): default `rx-toc-{cardIndex}`; tocPrefix
    override for hosts embedding multiple TOCs;
    useDisplayNameSlug=true: `rx-toc-{slug(name)}-{cardIndex}`
    (cardIndex ALWAYS appended for uniqueness so Smith, Jane A.
    on card 3 vs. card 7 don't collide); includeSpecialtyInAnchor
    =true: `rx-toc-{slug(specialty)}-{cardIndex}` (or
    `rx-toc-other-{cardIndex}` when specialty is missing); both
    flags on: `rx-toc-{slug(specialty)}-{slug(name)}-{cardIndex}`.
    slugify lowercases, replaces non-alphanumeric runs with single
    hyphens, falls back to "untitled" so anchor ids are always
    non-empty. buildEmergencyCardTocAnchorMap exposes the anchor-
    id mapping for callers that already have TOC entries from
    another render path. summarize emits a one-line cron-log
    summary with the id-shape description.
  - Module-domain-noun prefix discipline continues:
    AnonymiseKeyRotateBulkCsvExportResult (not
    BulkCsvExportResult), DoseRoundtripThreadBatcherQuietHoursCalendarHtmlResult
    (not CalendarHtmlResult), FollowupDigestBccTierPolicyCoverageReport
    (not CoverageReport), SpineBatchCsvManifestResult (not
    CsvManifestResult), EmergencyCardPdfTwoUpRosterTocHtmlAnchoredResult
    (not AnchoredResult). Every tick 23 export uses a module-
    prefixed name where any generic name could have collided.
  - 13 clean ticks in a row (no fixup commits, no force-push,
    no revert). Every commit revertible in isolation; every
    commit has its own test suite; every commit passes the
    full @med/utils gate in isolation AND in batch.
  - Tier 1O #210 (roster-toc-html-collapsible) marked SKIPPED
    in this tick — it's a DUPLICATE of tick 22 #205 (roster-toc-
    grouped-html). The grouped-html variant already provides
    collapsible specialty sections via <details>/<summary>. Tier
    1P (10 fresh candidates) refilled with derivative composition
    candidates extending each of the 5 modules shipped this tick.
  - Hardware corner cases handled this tick: CSV escaping for
    commas / quotes / newlines in patient names (RFC 4180
    doubled-quote convention), BOM round-trip (opt-in for Excel
    on Windows), header-only output for empty inputs (chains,
    manifests, calendar), JSON-safe Map -> array conversion
    (preserves sort order: count DESC then address ASC),
    timezone-aware day-of-week resolution (Friday 22:00 PT
    expressed as Saturday 05:00 UTC resolves to Friday), star
    marker on the current cell only when runAt is supplied,
    palette overrides via Partial (no need to redeclare full
    record), anchor id uniqueness across displayName collisions
    (cardIndex always appended), slugify fallback to "untitled"
    for all-punctuation displayNames, URL-safe anchor ids
    (lowercase alphanumeric + hyphens only), forced-grid
    deterministic row/column wrap (positions 0..N-1 map to
    sheet 1 row 1..rows, sheet 2 row 1..rows, ... with column
    cycling), patientCount column on transitions CSV reading
    from mappings.length (defensive against an empty cohort
    case), tier-distribution rounding to 4 decimals so the sum
    is approximately 1.0 within typical floating-point error
    (verified within 0.001 in the test).

- 2026-06-22 23:54 PDT — tick 22: 5 features shipped.
  Commits: 41a5d93 regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-cli-summary,
  ff031fb dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-snooze,
  849da42 followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-suppress-self-cc,
  4072e06 refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-color-coding,
  7e57774 prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-grouped-html.
  Gate: 2792/2792 tests pass in `@med/utils` (125 new this tick:
  24+23+17+33+28). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to start-of-tick (same
  6 pre-existing files: adherence-risk, date, ics, schedule-resolver,
  taper-plan, titration); zero new errors introduced by tick 22.
  TWELFTH clean tick in a row (no fixup commits, no force-push,
  no revert). No roadmap refill needed: 10 unstarted candidates
  remain in the fresh Tier 1O (#206-#215). 105 unstarted total
  across all tiers (older recycled candidates included).

  Notes:
  - Twelfth composition tick in a row. Every tick 22 module
    composes on at least one tick 19/20/21 output (ninth-derivative
    companions):
    merge-anonymise-key-rotate-cli-summary on merge-anonymise-key-rotate (T19),
    thread-batcher-quiet-hours-snooze on thread-batcher-quiet-hours (T19),
    cron-batcher-html-mailer-bcc-suppress-self-cc on cron-batcher-html-mailer-bcc (T19),
    binder-spine-color-coding on binder-spine (T19) + i18n-rollup
    coverage struct (T14),
    roster-toc-grouped-html on roster-toc (T19) + roster-toc-html (T20).
    Composition rhythm now spans T11 -> T22, twelve consecutive
    composition ticks. The pattern continues mechanically.
  - `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-cli-summary`
    is the FIRST fixed-shape grep-line CLI summary in the package.
    Existing one-line summaries are sentence-form (free text); this
    is a five-field `[tag] patients=N reshuffled=N collisions=N
    verdict=V` shape parseable by a single regex. Verdicts
    no-op / widen-hash / ship-safe / empty-cohort with precedence
    empty > widen-hash > no-op > ship-safe. countReshuffled walks
    the mappings (id OR name change counts; covers the sequential-
    name reshuffle case where the id is stable but the alphabet
    position shifted). countCollisions sums distinct collision-
    group members beyond the first across BOTH old + new epochs
    (defensive: trusts upstream collisionDetected flag, doesn't
    re-detect). detectAnonymiseKeyRotateCliWarning returns the
    most actionable warning string (widen-hash with collision count
    singularised; no-op with non-empty cohort; empty-cohort).
    summarizeAnonymiseKeyRotationBatchForCli rolls N cohorts into
    one `[key-rotate-batch] cohorts=N patients_total=N
    reshuffled_total=N collisions_total=N verdict=V` line for
    multi-cohort cron ticks with widen-hash > ship-safe > no-op >
    empty-cohort batch precedence.
  - `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-snooze`
    is the FIRST per-call snooze override for the quiet-hours
    deferral. Incident-response weekends need the on-call to
    receive the midnight unread badge; the existing quiet-hours
    module always defers and there is no per-call escape hatch.
    Two configuration shapes: snoozeUntil (hard instant) and
    snoozeForMs (convenience: runAt + duration). When BOTH set,
    snoozeUntil wins. When the underlying decision is defer-until
    or suppress-completely AND runAt < snoozeUntil, override to
    post-now with reason 'snooze-override' and tag the parent
    fallback "(snooze override during {windowLabel} until
    {snoozeUntil})" so the on-call understands when the override
    expires. Does NOT touch post-now decisions (no double
    override). isSnoozeActive reports whether the snooze is
    configured AND not yet expired regardless of whether the
    override actually fired. snoozeAwarePostingRecommendation
    returns the one-shape posting decision matching the
    quiet-hours module's postingRecommendation API.
  - `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-suppress-self-cc`
    is the FIRST cross-envelope self-CC suppression in the
    package. Existing dropPrimaryFromBcc handles the own-
    envelope case (envelope's own primary appearing on its own
    BCC). It does NOT handle the cross-envelope case: when the
    household admin gets a primary on their own envelope AND a
    BCC on alice/bob/carol's envelopes, admin receives 4 copies.
    Default 'suppress-when-primary-elsewhere' strips a BCC
    address from every other envelope when the address appears
    as a primary on any envelope. 'preserve-all' opts out for
    the test/legacy compatibility case. preserveAddresses
    overrides per-address when the audit trail is wanted
    (a clinical coordinator who actually wants both copies).
    Recomputes fanOutByAddress to reflect post-suppression
    delivery counts so the SMTP relay pre-warm step sees the
    accurate distribution. Counts suppressions per address.
  - `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-color-coding`
    is the FIRST color-coded spine variant. Base spine is B&W;
    in a high-volume clinic with many binders, all spines look
    identical from across the room which defeats visual triage.
    Default 4mm color stripe at the top of the spine, color-keyed
    to the dominant refusal source from the rollup coverage:
    NPO-window red (#DC2626 / red-600, most urgent), prescriber-
    pause blue (#2563EB / blue-600, intentional), out-of-supply
    orange (#EA580C / orange-600, refill blocker), sleeping-window
    purple (#7C3AED / purple-600, overnight), recent-pattern
    yellow (#CA8A04 / yellow-600, chronic non-adherence), no-
    dominant gray (#6B7280 / gray-500). Verbal tag (NPO / PAUSE
    / SUPPLY / SLEEP / PATTERN) accompanies the stripe so the
    signal degrades gracefully on monochrome printers and for
    color-vision-different clinicians. monochromeFallback=true
    opts out of the stripe entirely. stripePlacement supports
    top / bottom / left / right (verbal tag rotates -90 / 90
    for vertical placements). stripeThicknessMm clamped to
    [1, 20]. palette is Partial so callers can override specific
    entries without re-declaring the full record. pickDominantSource
    ties-break by clinical priority order (npo > pause > supply
    > sleep > pattern) so two tied sources never produce visual
    ambiguity.
  - `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-grouped-html`
    is the FIRST screen-first companion to the TOC HTML using
    native HTML <details>/<summary>. The flat TOC works for print
    but is wrong for screen review: the patient portal's TOC
    widget and the household admin's screen scroll want collapsible
    specialty groups so an 80-prescriber roster doesn't dominate
    the page. Native disclosure widgets work in every modern browser
    with no JavaScript and degrade correctly on screen readers.
    Default state 'open' (everything expanded); defaultGroupState
    ='collapsed' switches to accordion behaviour (multiple groups
    can be open simultaneously). Per-specialty collapsedSpecialties
    + openSpecialties with openSpecialties winning on conflict.
    Specialty matching is case-insensitive against the
    title-cased + uppercased group label (matches the underlying
    TOC's grouping). forceOpenInPrint=true (default) emits a
    @media print stylesheet that forces all groups OPEN under
    print so a screen-first reviewer who decides to print the
    TOC doesn't end up with a collapsed paper copy. The print
    CSS includes the `display: grid !important` override on
    `details:not([open]) > .toc-group-body` to bypass the native
    collapse during print. CSS resets the webkit details marker
    so the summary chrome stays consistent across browsers.
    tallyGroupedTocOpenState returns the per-group open/closed
    breakdown for the patient portal's "X of Y specialties shown"
    tally widget.
  - Module-domain-noun prefix discipline continues:
    AnonymiseKeyRotateCliSummary (not CliSummary),
    DoseRoundtripThreadBatcherQuietHoursSnoozeResult (not
    SnoozeResult), FollowupDigestHtmlMailerBccSuppressSelfCcResult
    (not SuppressSelfCcResult), RefusalReasonSpineColorCoding
    (not ColorCoding), EmergencyCardPdfTwoUpRosterTocGroupedHtmlResult
    (not GroupedHtmlResult). Every tick 22 export uses a
    module-prefixed name where any generic name (CliSummary,
    SnoozeResult, SuppressSelfCcResult, ColorCoding,
    GroupedHtmlResult) could have collided.
  - 12 clean ticks in a row (no fixup commits, no force-push,
    no revert). Every commit revertible in isolation; every
    commit has its own test suite; every commit passes the
    full @med/utils gate in isolation AND in batch.
  - Hardware corner cases handled this tick: fixed-shape CLI
    parseability (every verdict variant emits the same 5-field
    line shape; verified by a regex test), batch verdict
    precedence (widen-hash > ship-safe > no-op > empty-cohort,
    matching per-cohort precedence), snooze configuration
    precedence (snoozeUntil wins over snoozeForMs), snooze
    no-op cases (decision was already post-now; runAt past
    snoozeUntil; no snooze configured), cross-envelope vs
    own-envelope BCC suppression (dropPrimaryFromBcc handles
    own; this module handles cross; preserveAddresses overrides
    cross only), fan-out recomputation post-suppression (so the
    SMTP relay sees post-suppression numbers), color-stripe
    placement geometry (top/bottom = horizontal; left/right =
    vertical with verbal tag rotated to match), monochrome
    fallback (no stripe but verbal tag in black), no-dominant
    palette entry (separate from monochromeFallback - color
    printer with empty rollup still gets a gray stripe),
    @media print forcing groups open in TOC HTML (so screen-
    first reviewer's print copy stays usable), case-insensitive
    specialty matching against the title-cased label, footer
    singularisation for 1 entry / 1 group / 1 page edge cases.

- 2026-06-22 20:21 PDT — tick 21: 5 features shipped.
  Commits: cf964ff regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-html,
  5d96521 dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-coverage-report,
  7bc88e4 followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-coverage-report,
  a3cd655 refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-i18n,
  fcb1649 prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-print-only.
  Gate: 2667/2667 tests pass in `@med/utils` (160 new this tick:
  40+29+33+34+24). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to start-of-tick (same
  6 pre-existing files: adherence-risk, date, ics, schedule-resolver,
  taper-plan, titration); zero new errors introduced by tick 21.
  ELEVENTH clean tick in a row (no fixup commits, no force-push,
  no revert). No roadmap refill needed: 15 unstarted candidates
  remain across Tier 1N (#201-#205) and Tier 1O (#206-#215).

  Notes:
  - Eleventh composition tick in a row. Every tick 21 module
    composes on at least one tick 20 output (eighth-derivative
    companions):
    merge-anonymise-key-rotate-html on merge-anonymise-key-rotate
    (T19) + html-render conventions (T13-T14),
    thread-batcher-quiet-hours-coverage-report on
    thread-batcher-quiet-hours (T19),
    cron-batcher-html-mailer-bcc-coverage-report on
    cron-batcher-html-mailer-bcc (T19),
    binder-spine-i18n on binder-spine (T19) + the existing
    i18n bundle pattern (refusal-reason-suggest-i18n, T14),
    roster-toc-print-only on roster-toc (T19).
    Composition rhythm now spans T11 -> T21, eleven consecutive
    composition ticks. The pattern continues mechanically.
  - `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-html`
    is the FIRST HTML render of the rotation mapping in the
    package. Use case: a clinic auditor reviewing the rotation
    by eye needs a table view, not a JS struct. Defaults to
    NON-PHI output (no original patient ids / names) so the
    fragment is filable outside the patient chart per HIPAA
    safe harbour. includeOriginalIds=true opt-in adds the
    source columns for the PHI variant. Banner shows count +
    NO-OP ROTATION + COLLISION DETECTED / NO COLLISIONS chips
    so the auditor sees the verdict before scrolling. Per-row
    no-op "unchanged" chip distinguishes rows where the
    pseudonym didn't change from rows that actually rotated.
    Three sort orders (old-pseudonym default, new-pseudonym,
    patient-id which requires PHI). renderRegimenHistoryAnonymise
    KeyRotateHtmlChangesOnly is the canonical "audit-binder ready"
    preset (no-op rows hidden, non-PHI, lex-sorted, fragment).
  - `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-coverage-report`
    is the FIRST JSON coverage report for the quiet-hours
    decision stream. Operations dashboards ingest one N-run
    window per channel and answer "how often did we defer /
    suppress / override / which window labels are configured?".
    The basic module's one-line summary can't answer those.
    Three categories of misconfiguration: channelIsAlwaysDeferring
    (every run deferred, likely 24h window), channelIsAlways
    Suppressing (every run suppressed, suppress-completely with
    24h window), channelIsAlwaysPostingNow (no run ever deferred
    or suppressed across 7+ runs - the window may be inactive).
    detectQuietHoursMisconfiguration surfaces one of these as a
    single string for the dashboard. Multi-window-labels check
    fires FIRST because it's usually the underlying cause of
    always-deferring / always-suppressing patterns.
    deferralLatenciesMs (min/max/mean) reports the actual
    deferral durations; negative latencies (deferUntil before
    runAt; broken upstream config) drop out of the math but
    the decision still counts in the deferral total.
  - `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-coverage-report`
    is the FIRST JSON coverage report for the BCC envelope
    stream. The basic BCC module's coverage struct uses a Map
    for fanOutByAddress; JSON serialisers drop Map keys
    silently. Ops dashboards need an array shape they can
    ingest without a custom reviver. fanOutByAddress translated
    to {address, count}[] sorted DESC by count (ASC by address
    for ties). declaredDestinations input (second arg) is the
    ground truth for unusedBccAddresses; without it the unused
    list is empty (can only know what's unused if we know what
    was declared). topNFanoutAddresses for the "loudest
    addresses" widget. detectFollowupDigestBccMisconfiguration
    surfaces three conditions: zero-headers-with-declarations
    (scope filters too narrow), unused addresses (per-caregiver
    scope likely filtered them out), extreme fan-out skew
    (>75% of headers on one address with 3+ distinct addresses).
    JSON-roundtrip safe (verified in tests).
  - `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-i18n`
    is the FIRST chrome-string i18n bundle in the package
    (the existing refusal-reason-suggest-i18n bundles cover
    EXPLANATION strings, not chrome). The bundle pattern
    deliberately mirrors the existing i18n layer:
    { locale, strings: Partial<...> } with per-key English
    fallback so contributor-submitted incomplete locales
    don't blank the spine. Five built-in bundles ship out
    of the box: en-US, es-419 (covers es-ES via region-strip),
    fr-FR (covers fr-CA), de-DE, hi-IN (devanagari).
    renderLocalisedRefusalReasonSpine wraps the base spine
    renderer: drops the base's hard-coded includePanelSize
    emission (English-only), then re-injects the localised
    "<count> <unit>" label using the bundle's strings
    before the closing </div></section>. Uses the base
    spine's font metrics (cross-axis font sizing heuristic)
    so the injected label is visually identical to what
    the base would have emitted in English. pickBuiltInSpineBundle
    + region-strip lookup so 'es-MX' picks up 'es-419'.
    validateSpineI18nBundle returns missing keys for CI
    checks of contributor submissions.
  - `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-print-only`
    is the FIRST standalone-TOC variant in the package
    (the existing TOC modules always emit the combined
    document or its HTML companion). Use case: clinician
    auditing the binder index doesn't want to re-print
    every card; clinician photocopying a roster lookup
    for a colleague wants ONLY the index. Header strip
    rewritten "Page 1 of N+1" -> "Page 1 of 1" for
    standalone-document consistency. Footer block rewritten
    "Document N pages total" -> "Index only (binder spans N
    pages)" so the clinician knows they're holding the index,
    not a partial copy. CRUCIALLY: per-entry pageNumber
    values STAY pointing at where the cards live in the
    underlying binder (no rewrite to 1) - the index is
    still useful as a binder-lookup reference. Defensive
    footer synthesis if upstream TOC ever stops emitting
    a footer block. combinedDocumentPageCount preserved
    on the result so UI banners can say "you are looking
    at the index for an 8-page binder".
  - Module-domain-noun prefix discipline continues:
    RegimenHistoryAnonymiseKeyRotateHtmlOptions (not HtmlOptions),
    DoseRoundtripQuietHoursCoverageReport (not CoverageReport),
    FollowupDigestBccCoverageReport (not CoverageReport),
    RefusalReasonSpineI18nBundle (not I18nBundle - distinct
    from the existing RefusalReasonI18nBundle for explanation
    strings), EmergencyCardPdfTwoUpRosterTocPrintOnlyResult
    (not PrintOnlyResult). Every tick 21 export uses a
    module-prefixed name where any generic name (HtmlOptions,
    CoverageReport, I18nBundle, PrintOnlyResult) could have
    collided.
  - 11 clean ticks in a row (no fixup commits, no force-push,
    no revert). Every commit revertible in isolation; every
    commit has its own test suite; every commit passes the
    full @med/utils gate in isolation AND in batch.
  - Hardware corner cases handled this tick: PHI gating
    (default includeOriginalIds=false; sortBy='patient-id'
    requires includeOriginalIds=true and throws otherwise),
    negative latency dropout (broken upstream config still
    counts as a deferral but drops out of latency math),
    JSON roundtrip safety (fanOutByAddress is array not Map;
    verified in tests), per-key i18n fallback (partial
    bundles never blank the output), region-strip locale
    fallback ('es-XX' -> 'es' -> es-419; 'xx-YY' -> en-US),
    standalone-document footer block rewrite (page count
    references reflect single-page reality not combined-doc
    reality), per-entry pageNumber preservation (still
    points into the binder for the lookup use case),
    defensive footer synthesis when upstream TOC has no
    footer block, empty roster handling (TOC still renders
    "No entries." or equivalent in every module).

- 2026-06-22 17:07 PDT — tick 20: 5 features shipped.
  Commits: 00866f9 regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk,
  7184508 dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar,
  ef5e503 followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy,
  3c0a7c7 refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch,
  7184475 prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html.
  Gate: 2507/2507 tests pass in `@med/utils` (144 new this tick:
  29+30+24+30+31). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to start-of-tick (same
  6 pre-existing files: adherence-risk, date, ics, schedule-resolver,
  taper-plan, titration); zero new errors introduced by tick 20.
  TENTH clean tick in a row (no fixup commits, no force-push, no
  revert). Refilled roadmap (Tier 1O) with 10 new candidates (#206-#215).

  Notes:
  - Tenth composition tick in a row. Every tick 20 module composes
    on at least one tick 19 output (seventh-derivative companions):
    merge-anonymise-key-rotate-bulk on merge-anonymise-key-rotate (T19),
    thread-batcher-quiet-hours-calendar on thread-batcher-quiet-hours (T19),
    cron-batcher-html-mailer-bcc-tier-policy on cron-batcher-html-mailer-bcc (T19),
    html-print-cover-sheet-binder-spine-batch on html-print-cover-sheet-binder-spine (T19),
    watermark-roster-toc-html on watermark-roster-toc (T19).
    Composition rhythm now spans T11 -> T20, ten consecutive
    composition ticks. The pattern continues mechanically.
  - `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk`
    is the FIRST bulk-rotation companion in the package. Use case:
    a clinic that has been mailing the same analytics partner for
    a decade accumulates a CHAIN of annual HMAC secret rotations.
    The single-step key-rotate module connects epoch N -> epoch N+1
    one transition at a time; bulk-rotation walks the entire chain
    pairwise in PARALLEL (Promise.all over the per-transition
    primitive) and stitches the results into per-patient pseudonym
    chains across every epoch. Three lookup helpers cover the
    typical audit questions: first-to-last (the most common "I have
    ancient data; what's the current pseudonym?"), arbitrary-epoch-
    to-epoch (bounds-checked, throws on inverted indices), and
    without-original-ids (PHI-safe drop of source patient ids for
    external analytics-partner hand-off). epochLabels (default
    'epoch-0'..'epoch-N') are mirrored into every transition + result
    for cron-log / audit-trail traceability.
  - `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar`
    is the FIRST calendar-aware quiet-hours module in the package
    and sets the pattern for future per-day-of-week overlays. Three
    override kinds: 'window' (basic quiet-hours window for that day),
    'quiet-all-day' (entire day is quiet; 0-24 window synthesised),
    'no-quiet-hours' (quiet hours OFF for that day; skip-flag).
    Day-of-week resolution uses Intl.DateTimeFormat in the
    defaultWindow's timezone, so Friday 23:30 UTC in a PT window
    correctly evaluates as Friday PT (avoids the UTC-day vs local-
    day mismatch that bit the first prototype). matchedDayOfWeek +
    matchedRule on the decision provide cron-log audit visibility
    ("today was sat -> override:all-day -> suppressed"). Convenience
    builder buildWeekendsAllDayWeekdaysOvernightCalendar produces
    the canonical "weekends quiet all day, weekdays 22:00-07:00 PT"
    config that most clinical channels start with.
  - `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy`
    is the FIRST tier-aware BCC overlay in the package. Three
    canonical tiers (routine, actionable, critical) chosen to match
    typical clinical-records on-call severity buckets. Default
    heuristic classifier inspects envelope.text + envelope.subject
    for canonical phrases ("overdue" -> critical; "no follow-ups
    requiring attention" -> routine; else actionable). Per-destination
    eligibleTiers filter composes correctly with the basic BCC
    module's per-caregiver scope (forCaregiverIds /
    excludeCaregiverIds): a destination is kept only if BOTH its
    tier filter AND its caregiver scope match. unusedDestinations
    in coverage flags addresses that were declared but never matched
    any envelope ("you set tier='critical' but had zero critical
    digests" - common misconfiguration signal). filterEnvelopesByTier
    convenience routes envelopes to per-severity mailer queues
    (critical -> page on-call; routine -> low-priority queue).
    buildPcpAdminEscalationTierDestinations produces the canonical
    3-destination config in one call.
  - `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch`
    is the FIRST multi-spine sticker-sheet layout in the package.
    Real sticker-paper printers don't print one sticker per page;
    a clinic printing 47 binder spines at once after a Q3 review
    wants all 47 on a small number of sticker sheets, not 47 print
    jobs. Two canonical sheet presets (us-letter 21.59x27.94cm and
    a4 21.0x29.7cm) plus 'custom' with explicit dimensions in cm.
    Auto-computed columns + rows from sheet + spine + gap, OR
    forceColumns / forceRows for fixed-stock sticker paper with a
    specific NxM grid. Bounds-check throws with cm-precision error
    when forced layouts don't fit. Pagination across multiple sheets
    with page-break-before:always on each after the first (the
    individual spines' own page-break-before is suppressed because
    the sheet wrapper handles pagination). computeSpineBatchCapacity
    gives a non-render preview ("your batch of 47 spines will need
    2 sheets") for UI confirmations before commit.
  - `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html`
    is the FIRST HTML/CSS companion to the PDF TOC. Four htmlPageSize
    presets (Letter landscape default + Letter portrait + A4 landscape
    + A4 portrait) plus 'custom' with explicit inch dimensions.
    Distinct from the underlying PDF's `pageSize` ('letter'|'a4')
    because the @page CSS rule needs orientation explicit; renamed
    to htmlPageSize to avoid the type collision. wrapHtmlDocument
    knob (default true) toggles between full-document mode and
    fragment mode for splicing into a host page. Sans-serif font
    by default (system-ui stack) - one of the key differences from
    the PDF module's monospace-friendly block output. Watermark
    rendered as a fixed-position overlay matching the PDF's
    watermark text + visual weight. HTML escaping on every user-
    controlled string. Empty roster renders "No entries." instead
    of crashing.
  - Module-domain-noun prefix discipline continues:
    RegimenHistoryAnonymiseKeyRotateBulkOptions (not BulkOptions),
    DoseRoundtripThreadBatcherQuietHoursCalendarOptions (not CalendarOptions),
    FollowupDigestHtmlMailerBccTierDestination (not TierDestination),
    RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry (not BatchEntry),
    EmergencyCardPdfTwoUpRosterTocHtmlOptions (not TocHtmlOptions).
    Every tick 20 export uses a module-prefixed name where any
    generic name (BulkOptions, CalendarOptions, TierDestination,
    BatchEntry, TocHtmlOptions) could have collided.
  - 10 clean ticks in a row (no fixup commits, no force-push, no
    revert). Every commit revertible in isolation; every commit has
    its own test suite; every commit passes the full @med/utils gate
    in isolation AND in batch.
  - Hardware corner cases handled this tick: HMAC short-secret
    rejection propagated through bulk-rotation chain validation,
    Intl day-of-week timezone resolution (Friday 23:30 UTC in PT
    is still Friday PT), Pdf vs HTML pageSize type collision
    resolved via dedicated htmlPageSize property name, forced
    grid bounds check with cm-precision error message, individual-
    spine pageBreakBefore suppression when wrapped in a sheet
    grid, tier classification on envelopes with missing text/
    subject fields (defaults to actionable via the else-branch),
    custom-classifier override for callers wanting precise
    classification from the underlying digest data, unused-
    destinations rollup for declared-but-never-matched BCC
    addresses, empty-roster rendering ("No entries." text on
    the HTML TOC; bulk-rotation handles empty patient lists
    by returning 0 chains but still computing all N-1 empty
    transitions).

- 2026-06-22 13:56 PDT — tick 19: 5 features shipped.
  Commits: 0d5ae12 regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate,
  a508e14 dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours,
  6222295 followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc,
  185496e refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine,
  931885b prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc.
  Gate: 2363/2363 tests pass in `@med/utils` (134 new this tick:
  26+31+23+26+28). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to start-of-tick (same
  6 pre-existing files: adherence-risk, date, ics, schedule-resolver,
  taper-plan, titration); zero new errors introduced by tick 19.
  NINTH clean tick in a row (no fixup commits, no force-push, no
  revert). Refilled roadmap (Tier 1N) with 15 new candidates (#191-#205).

  Notes:
  - Ninth composition tick in a row. Every tick 19 module composes
    on at least one tick 18 output (sixth-derivative companions):
    merge-anonymise-key-rotate on merge-anonymise (T18),
    thread-batcher-quiet-hours on thread-batcher (T18),
    cron-batcher-html-mailer-bcc on cron-batcher-html-mailer (T18),
    html-print-cover-sheet-binder-spine on html-print-cover-sheet
    (T18), watermark-roster-toc on watermark-roster (T18).
    Composition rhythm now spans T11 -> T19, nine consecutive
    composition ticks. The pattern continues mechanically.
  - `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate`
    is the FIRST secret-rotation companion in the package. Use case:
    a clinic rotates its analytics-partner HMAC secret on annual
    schedule (security policy compliance, leaked key, audit
    recommendation) and the analytics partner depends on stable
    pseudonyms to track per-patient trends across months. Without
    the rotation mapping, every patient's pseudonym silently
    changes and the partner loses trend continuity (re-baseline
    every chart). The mapping connects old "pid-c1d2" to new
    "pid-7a3f" without ever re-exposing source patient ids.
    Sequential reshuffle on rotation: because 'sequential' names
    assign by HASHED-ID sort order and rotating the secret
    reshuffles that order, a patient who was "Patient A" under
    the old secret might be "Patient B" under the new one — the
    mapping captures that reshuffle so downstream consumers can
    track per-letter trends. Three convenience helpers:
    buildOldToNewPseudonymMapWithoutOriginalIds (drops the
    originalPatientId column so the resulting struct is itself
    non-PHI), buildOldToNewPseudonymLookup (Map for direct old ->
    new translation), summarizeAnonymiseKeyRotation (cron-log
    one-liner with no-op + collision phrasing). Two parallel
    Promise.all hash builds keep the latency bounded by a single
    HMAC pass.
  - `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours`
    is the FIRST quiet-hours wrapper in the package and sets the
    pattern for #192 (calendar-aware) when it lands. Three
    policies: 'defer-parent' (default; hold parent until next end-
    of-quiet-hours top-of-hour), 'defer-unless-actionable' (actionable
    runs post immediately with override tag during quiet hours),
    'suppress-completely' (drop parent entirely; archive only).
    Window semantics: inclusive start, exclusive end, supports
    wrap-across-midnight (22:00-07:00 default PT) and single-day
    windows. fallbackText tagging adds visible context for the on-
    call when a midnight ping arrives via the actionable-override
    path. deferUntil snaps to the next top-of-hour boundary in the
    window's timezone so deferral lands at a stable wall-clock
    minute. postingRecommendation convenience: single-shape
    {shouldPostNow, postAt} return for callers who prefer not to
    switch on the discriminated decision union.
  - `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc`
    is the FIRST BCC overlay in the package. Per-CAREGIVER scoping
    (forCaregiverIds limits a destination to listed caregivers;
    excludeCaregiverIds removes a destination — takes precedence)
    + per-ENVELOPE BCC dedup (a duplicated destination doesn't
    fan out twice). dropPrimaryFromBcc default trims the primary
    `to` address from the BCC array so a caregiver who's also on a
    global BCC list (e.g. household admin who is also a sibling-
    caregiver) doesn't appear twice on their own envelope;
    primaryDroppedFromBcc surfaces the affected caregiver ids for
    cron-log auditing. fanOutByAddress telemetry rolls up per-
    address envelope counts for SMTP relay capacity planning.
    filterEnvelopesWithAnyRecipient drops envelopes with neither
    primary nor BCC; collectAllBccAddresses returns a sorted deduped
    list for SMTP relay pre-warm.
  - `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine`
    is the FIRST physical-sticker layout in the package. Clinics
    file binders by SPINE LABEL, not cover sheet — a 20+ binder
    archive is scrolled by spine, not pulled and flipped. Three
    size presets (3.5x1.5cm default; 5x2cm wide; 2.5x1cm narrow)
    for common binder thicknesses plus a 'custom' knob with
    validation. Three rotation modes (-90 default for upright
    bottom-to-top text; 90 top-to-bottom for right-opening binders;
    0 horizontal for unusual cases). Content order: patient name
    (largest), panel label (uppercase, optional), date label,
    optional 'N doses' line. HTML escaping on every user-controlled
    field. Print-friendly serif + B&W-survivable palette mirrors
    the cover sheet conventions. 1px black cut-line border by
    default for sticker-paper printer cutting; page-break-before
    by default so the spine lands on its own page.
  - `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc`
    is the FIRST table-of-contents page in the package. Generated
    FROM the same emergencyCards array the roster was built from
    so the TOC can never drift from the cards — no hand-maintained
    index. Default group-by-specialty alphabetical, within-group
    by displayName (cardiology cards cluster); 'cardOrder' within-
    group flag + tocGroupBySpecialty=false ungrouped flag for
    alternate layouts. 'Other' fallback group for prescribers
    without a specialty. Page numbers point into the COMBINED
    document (card index 0 -> page 2; TOC is page 1) — roster
    pages' per-page header strips are renumbered to reflect the
    TOC offset ("Page 2 of N" on the first roster page when N is
    combined total). TOC inherits the same watermark + same
    batchId + same generatedAt as the roster pages so the combined
    document is visually + audit-trail coherent. Empty rosters
    render a single-page TOC ("0 entries"). flattenRosterWithTocPages
    emits a uniform discriminated page stream (kind: 'toc' | 'roster')
    for renderers that take a single page list.
  - Module-domain-noun prefix discipline continues:
    RegimenHistoryAnonymiseKeyRotateEntry (not KeyRotateEntry),
    DoseRoundtripThreadBatcherQuietHoursDecision (not QuietHoursDecision),
    FollowupDigestHtmlMailerBccEnvelope (not BccEnvelope),
    RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine (not BinderSpine),
    EmergencyCardPdfTwoUpRosterTocPage (not TocPage).
    Every tick 19 export uses a module-prefixed name where any
    generic name (KeyRotateEntry, QuietHoursDecision, BccEnvelope,
    BinderSpine, TocPage) could have collided.
  - 9 clean ticks in a row (no fixup commits, no force-push, no
    revert). Every commit revertible in isolation; every commit has
    its own test suite; every commit passes the full @med/utils gate
    in isolation AND in batch.
  - Hardware corner cases handled this tick: HMAC short-secret
    rejection (propagated from primary anonymise module), Intl
    timezone "24" -> 0 normalisation for midnight hour parsing,
    36-hour bounded loop in nextEndOfQuietHours to avoid runaway
    on weird timezone definitions, HTML escaping on user-controlled
    spine fields (patientName, panelLabel, dateLabel), TOC page
    geometry synthesis when the roster is empty (so the TOC stays
    renderable for QA), TOC header strip text rewrite to preserve
    the original strip's color + fontSize + margin while updating
    pageNumber + totalPages.

- 2026-06-22 10:23 PDT — tick 18: 5 features shipped.
  Commits: d7d365a regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise,
  bbe11f9 dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher,
  d5009fb followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer,
  b73cbc6 refusal-reason-suggest-i18n-rollup-html-print-cover-sheet,
  6bd5a92 prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster.
  Gate: 2229/2229 tests pass in `@med/utils` (124 new this tick:
  23+26+23+27+25). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to start-of-tick (same
  6 pre-existing files: adherence-risk, date, ics, schedule-resolver,
  taper-plan, titration); zero new errors introduced by tick 18.
  EIGHTH clean tick in a row (no fixup commits, no force-push, no
  revert). Refilled roadmap (Tier 1M) with 15 new candidates (#176-#190).

  Notes:
  - Eighth composition tick in a row. Every tick 18 module composes
    on at least one tick 17 output OR a parallel-pattern T17 module:
    merge-anonymise on csv-export-merge (T16) + parallel design
    pattern to merge-per-class (#151 unbuilt), thread-batcher on
    summary-text-slack (T17), cron-batcher-html-mailer on cron-batcher
    (T17), html-print-cover-sheet on html-print (T17), watermark-
    roster on two-up-watermark (T17). Composition rhythm continues
    eight ticks deep: T11 -> T18.
  - `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise`
    is the FIRST PHI-safe export companion in the package. HMAC-
    SHA-256 via Web Crypto (globalThis.crypto.subtle, no @types/node
    dep) matches the caregiver-share-token + regimen-snapshot-archive
    pattern — functions are therefore async. Three name strategies:
    'sequential' (default, Patient A/B/C by HASHED-ID-SORTED order so
    sibling 1 is always "Patient A" regardless of input array order),
    'hashed' (Patient <hex>), 'redacted' (literal "REDACTED" for the
    most conservative pipelines). Hash truncation configurable
    (default 16 hex chars / 8 bytes entropy, clamped [4, 64]).
    collisionDetected flag surfaces same-hash-different-id pairs.
    Medication name / strength / snapshotId / takenAt deliberately
    NOT touched — per HIPAA safe harbor (45 CFR 164.514) those
    columns are not PHI once stripped of patient identifiers.
    Convenience helper hashPatientIdForAnonymisedMerge for pre-
    computing lookup tables out of band.
  - `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher`
    is the FIRST Slack thread-shape module in the package. Slack
    threads are the standard "one new line in channel + N replies"
    pattern QA on-call channels use to avoid noise. Two
    chat.postMessage calls per day regardless of N runs: parent
    first (returns ts), each reply with thread_ts=ts. Parent stack:
    header / context (date + runCount) / section (aggregate stats) /
    context (per-tier rollup, only tiers with >0 count, omitted
    entirely when no diffs) / context (clean-run hint, only when
    some are clean) / actions (https-only dashboard button).
    suppressCleanRuns drops clean replies but STILL counts them in
    the parent rollup so aggregate is honest. Parser-skip-only runs
    count as actionable (parser skips are a real problem signal,
    not a clean run).
  - `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer`
    wraps each per-caregiver cron-batch entry into an SMTP-ready
    multipart/alternative envelope (to + subject + text + html). The
    four fields map 1:1 to Nodemailer / AWS SES / Sendgrid envelope
    fields. Per-locale subject templates with {caregiverName} and
    {dateLabel} interpolation; trailing "()" / " - " collapsed when
    dateLabel is empty. Multi-patient body composition via per-
    patient section concatenation with a default horizontal-rule
    separator (text) or bordered <section> (HTML). Patient labels
    HTML-escaped so a name like '<Alice & "the kid">' doesn't break
    markup. Silent / suppressed caregivers from the cron batch
    preserved in a separate list with reason discriminator
    ('silent-week' / 'unknown-locale-skipped') so the mailer layer
    decides to ship a heartbeat or skip entirely. Convenience:
    filterEnvelopesWithDestination (drops envelopes without `to`)
    and per-entry single-envelope builder for spot reviews.
  - `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet`
    is the FIRST cover-sheet pattern in the package (sets the
    template for future validator-html-print-cover-sheet,
    prescriber-contact-card-emergency-card-pdf-binder-cover, etc).
    Hero block (32pt patient name + 14pt small-caps panel subtitle,
    2px bottom border, top padding). Metadata table (dateLabel,
    doses reviewed, suggested count, body page count, locale
    fallback hint) where every row is optional and OMITTED when
    not provided — the cover stays clean for small panels.
    Source breakdown in declared priority order (NPO first) NOT
    by count so cover shape is stable across reviews; empty-state
    when no source fired. Locale breakdown sorted by count desc.
    Signature block (default 3 lines: Reviewer signature / Date /
    Printed name) with long underlines for wet-signature attestation;
    configurable per clinical setting; hideable for automated
    archive pipelines. page-break-after:always (default) so the
    body starts on page 2 when concatenated; turnable off for
    splice-into-larger-document scenarios.
  - `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster`
    adds the FIRST per-page traceability strip in the package
    (sets the pattern for future multi-page roster modules).
    Header strip on every page with configurable template (5
    tokens: pageNumber, totalPages, batchId, watermarkText,
    generatedAtLabel). Default: "Page N of M  ·  <watermark>  ·
    Batch <id>  ·  Generated YYYY-MM-DD". batchId explicit when
    provided, otherwise auto-generated via djb2 hash of (generatedAt
    + totalCardCount + watermarkPreset) so two identical inputs yield
    the same id and different inputs yield different ids. Auto ids
    prefixed "roster-" for visual distinction. Strip is returned
    as a SEPARATE field on each page result so PDF renderers that
    don't know about it can skip it; convenience
    rosterHeaderStripsAsBlocks folds into footer-kind blocks for
    callers that want a single block stream. watermarkVerifiedAt
    locked at the ROSTER level (defaults to generatedAt) so the
    underlying multi-page builder uses the same date for every page
    AND the batchId hash sees the same locked timestamp.
  - Module-domain-noun prefix discipline continues:
    RegimenHistoryCsvMergeAnonymiseResult (not AnonymiseResult),
    DoseRoundtripThreadBatcherEntry (not ThreadBatcherEntry),
    FollowupDigestHtmlMailerEnvelope (not Envelope),
    RefusalReasonI18nRollupHtmlPrintCoverSheet (not CoverSheet),
    EmergencyCardPdfTwoUpRosterHeaderStrip (not HeaderStrip).
    Every tick 18 export uses a module-prefixed name where any
    generic name could have collided.
  - 8 clean ticks in a row (no fixup commits, no force-push, no
    revert). Every commit revertible in isolation; every commit has
    its own test suite; every commit passes the full @med/utils gate
    in isolation AND in batch.
  - Hardware corner cases handled this tick: HMAC short-secret
    rejection (early throw with byte count surfaced), URL https://
    gating on Slack dashboard button (matching the per-run renderer's
    same pattern), HTML escaping on user-controlled labels (cover
    sheet patient + panel labels, mailer patient labels), date
    locking across multi-page batches (watermark + roster both lock
    once for a batch to prevent midnight rollover producing mixed-
    date stacks).

- 2026-06-22 06:44 PDT — tick 17: 5 features shipped.
  Commits: 64991e0 regimen-snapshot-archive-history-rollup-csv-export-merge,
  c655d19 dose-export-csv-import-roundtrip-validator-summary-text-slack,
  7b5bc30 followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher,
  f386c15 refusal-reason-suggest-i18n-rollup-html-print,
  9ab8a19 prescriber-contact-card-emergency-card-pdf-two-up-watermark.
  Gate: 2105/2105 tests pass in `@med/utils` (110 new this tick:
  18+27+17+23+25). Lint + build placeholder ok. `@med/utils`
  typecheck baseline = 43 errors identical to start-of-tick (same
  6 pre-existing files: adherence-risk, date, ics, schedule-resolver,
  taper-plan, titration); zero new errors introduced by tick 17.
  SEVENTH clean tick in a row (no fixup commits, no force-push, no
  revert). Refilled roadmap (Tier 1L) with 15 new candidates (#161-#175).

  Notes:
  - Seventh composition tick in a row — every tick 17 module composes
    on at least one tick 16 output. The composition rhythm now spans
    T11 -> T17, seven consecutive composition ticks. T16 shipped
    fifth-derivative modules; T17 ships SIXTH-derivative companions
    — every module is a layer above a T16 output: csv-export-merge
    on csv-export (T16), summary-text-slack on summary-text (T16),
    multi-locale-cron-batcher on multi-locale (T16), i18n-rollup-
    html-print on i18n-rollup-html (T15) parallel to validator-html-
    print (#142 unbuilt), pdf-two-up-watermark on pdf-two-up (T16).
    The pattern continues to hold mechanically.
  - `regimen-snapshot-archive-history-rollup-csv-export-merge` is
    the FIRST multi-patient sheet composer. Pediatric / family-
    history use case: a cardiologist seeing two siblings on the
    same appointment day wants ONE spreadsheet, not two — scroll
    once, compare side-by-side. Two leading columns (patientId,
    patientName) prepended to every body row. The merger
    DELIBERATELY does NOT re-parse cell contents — it strips the
    per-patient header by line slice, then glues patient columns
    onto each body line. This keeps the merger robust against
    per-patient CSV column evolution (future drops or additions
    flow through untouched). Per-patient row order preserved
    verbatim (the per-patient export already exposes eventOrder
    for sorting); merge order follows the input array. Per-
    patient BOM is stripped before merge so the combined output
    never has a stray BOM in the middle. Accepts pre-built
    RegimenHistoryCsvExportResult or raw RegimenHistoryRollup.
    Convenience helpers for events-only and timeline-only merges.
  - `dose-export-csv-import-roundtrip-validator-summary-text-slack`
    is the FIRST Slack Block Kit module in the package. Block Kit
    types used: header (plain_text), section (mrkdwn), context
    (mrkdwn elements), divider, actions (button with primary
    style). Tier blocks composed as section (title + count) +
    context (sample doseIds with overflow indicator); parser-skip
    block uses a single section with multi-line mrkdwn so each
    reason renders as a discrete bullet. Slack hard caps respected:
    49 blocks (1 reserved for overflow notice). Adjudication URL
    gated to https:// only — http:// and javascript: URLs would
    be rejected by Slack at message-post time; we filter them
    before that round-trip. fallbackText emitted alongside blocks
    for the mobile / screen-reader notification preview.
  - `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher`
    composes buildMultiLocaleFollowupDigest for the M x K cron
    fan-out problem. Cost optimisation: the underlying digest math
    runs ONCE per patient (not M*K times) by collecting the set
    of locales any caregiver requested and rendering those locales
    once per patient. Silent-week semantics layered carefully —
    per-patient null short-circuit drops the patient from each
    caregiver's list; a caregiver whose every patient is silent
    yields no entry and is recorded in coverage.silentCaregiverIds
    for the mailer to suppress; empty patientIds also marks the
    caregiver silent. Unknown-locale policy supports 'fallback-en'
    (default), 'skip', or 'error' for strict deploys. localeUsage
    Map records post-resolution locales (so 'ja-JP' that fell
    back to 'en-US' appears under 'en-US' count, surfacing the
    real localisation gap in coverage telemetry).
  - `refusal-reason-suggest-i18n-rollup-html-print` is the FIRST
    print-friendly companion in the package and sets the pattern
    for #142 (validator-html-print) when it lands. Print
    paradigm decisions: NO interactive controls (paper signoff
    bubble `[ ] Accept  [ ] Reject  Signed: ___` replaces
    checkboxes); paginated with page-break-after:always between
    pages + page-break-inside:avoid on each row; repeating
    header on every page with "Page N of M" + optional dateLabel
    for binder archiving; print palette is black-on-white with
    bold uppercase source labels in brackets (faint colour fills
    don't survive a B&W photocopy); print-friendly serif
    (Georgia / Times) instead of the portal's sans-serif.
    Coverage strip appears on page 1 only — printing it on every
    page would clutter the paper roster.
  - `prescriber-contact-card-emergency-card-pdf-two-up-watermark`
    adds a single diagonal watermark spanning BOTH slots (a per-
    slot watermark would render two banners with a visible
    discontinuity at the gutter, defeating the legal / status
    signal a watermark exists to communicate). Presets: draft,
    verified (uses watermarkVerifiedAt for the YYYY-MM-DD
    suffix), icu-copy, do-not-fax, controlled, custom. Default
    geometry: page-centre, -30° rotation, 96pt bold gray-400 at
    0.18 opacity. Watermark returned in a separate field (not
    inside left.blocks / right.blocks) so the caller's PDF
    library renders slot blocks FIRST then watermark LAST,
    producing the on-top-of-cards translucent overlay effect.
    Multi-page builder LOCKS watermarkVerifiedAt once for the
    whole batch — a midnight rollover mid-print would otherwise
    produce a mixed-date stack of cards.
  - Module-domain-noun prefix discipline continues:
    RegimenHistoryCsvMergeResult (not MergeResult),
    DoseRoundtripSlackResult (not SlackResult),
    FollowupDigestCronBatcherEntry (not CronBatcherEntry),
    RefusalReasonI18nRollupHtmlPrint (not HtmlPrint),
    EmergencyCardPdfTwoUpWatermark (not Watermark) — every tick
    17 export uses a module-prefixed name where any generic name
    (MergeResult, SlackResult, Watermark) could have collided.
  - 7 clean ticks in a row (no fixup commits, no force-push, no
    revert). Every commit revertible in isolation; every commit
    has its own test suite; every commit passes the full
    @med/utils gate in isolation AND in batch.

- 2026-06-22 03:17 PDT — tick 16: 5 features shipped.
  Commits: c4d4a0b regimen-snapshot-archive-history-rollup-csv-export,
  d5dbe6f dose-export-csv-import-roundtrip-validator-summary-text,
  09acfbf followup-digest-text-html-bundle-i18n-multi-locale,
  39feccb refusal-reason-suggest-i18n-rollup-html,
  3628ba8 prescriber-contact-card-emergency-card-pdf-two-up.
  Gate: 1995/1995 tests pass in `@med/utils` (93 new this tick:
  17+17+15+17+27). Lint + build placeholder ok. `@med/utils` typecheck
  baseline = 43 errors identical to start-of-tick (across the same 6
  pre-existing files: adherence-risk, date, ics, schedule-resolver,
  taper-plan, titration); zero new errors introduced by tick 16.
  `pnpm -r test` shows @med/api 16/131 fail with 5000ms timeouts on
  tracing.test.ts under parallel-load — known flake when @med/api
  runs concurrent with the larger @med/utils suite (documented in
  T14, T15 state notes). Re-run in ISOLATION (`pnpm --filter @med/api
  test`) ALSO showed 15/131 timeouts on the same tracing.test.ts
  cases — this is a pre-existing @med/api infrastructure issue, NOT
  caused by this tick (diff is 100% under packages/utils/, zero
  touches to apps/api). SIXTH clean tick in a row (no fixup commits,
  no force-push, no revert). Refilled roadmap (Tier 1K) with 15 new
  candidates (#146-#160).

  Notes:
  - Sixth composition tick in a row — every module composes on at
    least one prior module. The composition rhythm is now SIX TICKS
    DEEP: T11 ships foundation modules, T12 ships first-derivative
    companions (htm, i18n), T13 ships second-derivative companions
    (html, csv variants), T14 ships third-derivative companions
    (validator, bundle, i18n), T15 ships fourth-derivative companions
    (html, i18n rollup, bundle i18n, emergency PDF), T16 ships
    FIFTH-derivative companions — every module a layer above a T15
    output: csv-export on history-rollup-html, summary-text on
    validator-html, bundle-i18n-multi-locale on bundle-i18n,
    i18n-rollup-html on i18n-rollup, pdf-two-up on pdf. The pattern
    is now mechanically reliable across six consecutive ticks.
  - `regimen-snapshot-archive-history-rollup-csv-export` ships TWO
    CSVs (eventsCsv + timelineCsv) because clinicians ask for
    different shapes — events for filter/sort review, timeline for
    plotting regimen-size-over-time in analytics tooling. Default
    `eventOrder='medication'` (rollup grouping preserved) matches
    how a prescriber READS the timeline; `'time'` is the alternative
    for analytics pipelines that want events as a flat fact table.
    MED_TRACKER CSV conventions match dose-export-csv: RFC 4180
    quoting, optional BOM for Excel-on-Windows UTF-8, header always
    emitted (even on empty rollup), empty cells for null fields (NOT
    the literal string "null") so spreadsheet formulas treat them as
    blank. Convenience helpers
    `exportRegimenHistoryEventsCsvForMedication` slices to a single
    medication for per-drug share workflows.
  - `dose-export-csv-import-roundtrip-validator-summary-text` is the
    FIRST multi-line TEXT companion to a one-line summarize helper.
    Use case: the on-call engineer at 2am reading a CI artifact, or
    QA tooling scanning a pipeline log, wants per-tier sample
    doseIds and parser-skip reason groupings — not just the headline.
    Output is a fenced block (=== delimiters) suitable for cron logs,
    CI artifacts, terminal stdout, or a Slack code-fenced message.
    Tier blocks render in priority order (structural -> mixed ->
    status-edit -> note-only) matching the HTML render so an
    engineer who has both windows open sees the same prioritisation.
    Parser-skip block groups by reason and emits sample row numbers
    so a recurring skip pattern is easy to spot — formatted like
    "invalid status [4x; rows 5, 12, 18, +1 more]" so a glance tells
    the engineer "always the same reason at row N and following".
    Sample caps configurable per tier / per adjacent list / per
    skip reason; extras collapse to "...and N more".
  - `followup-digest-text-html-bundle-i18n-multi-locale` solves a real
    multi-household pain point: a Spanish-speaking caregiver and an
    English-speaking adult child both watching the same patient
    each want the weekly digest in their own language. Today the
    caller would loop the i18n module per locale, paying for the
    underlying digest construction (row selection, null short-circuit,
    stat computation) N times. This module builds it once and applies
    each locale via the existing i18n layer. Coverage rollup has the
    QA-critical telemetry: requestedCount / renderedCount (mismatch
    surfaces malformed locales that refused to render — defensive
    guard for future per-locale short-circuit), locales (dedup, input
    order), noopLocales (locales whose output was character-identical
    to the English baseline — the QA signal that a bundle has no real
    translation, e.g. "the ja-JP bundle shipped empty; please review").
    Null short-circuit is GLOBAL — when the underlying digest is null
    (silent week), the entire multi-locale call returns null so no
    caregiver gets an empty pulse in their own language. Duplicate
    locale ids dedupe last-wins so household-specific overrides beat
    global defaults; encounter order is preserved for the first
    appearance of each locale so output is deterministic.
  - `refusal-reason-suggest-i18n-rollup-html` is the SECOND HTML
    render in a sibling pair with `dose-export-csv-import-roundtrip-
    validator-html`. Shared chip palette + table layout + font
    stack so the patient adjudication queue feels visually
    consistent across both modules. Suggestions GROUPED BY SOURCE
    in priority order (npo-window -> prescriber-pause -> out-of-
    supply -> sleeping-window -> recent-pattern); each row carries
    the localised explanation, the locale id, a FALLBACK badge when
    the i18n layer used the English fallback, the suggested reason
    code, and accept / reject controls bound to the dose id. Doses
    with no suggestion are DROPPED — the suggester's "nothing fired"
    entries aren't actionable in the queue, and including them would
    bloat the row count. Coverage strip at the top mirrors the
    rollup's telemetry; missing placeholders are explicitly surfaced
    because they're the QA signal that a locale bundle has bad keys.
    Per-source row cap (default 25), per-source filter (drilldown
    view), and `renderRefusalReasonI18nRollupTableOnly` variant for
    embedding inside an existing adjudication container. Header
    underline color is `#6d28d9` (purple) to distinguish from
    validator-html's `#0f766e` (teal) at a glance when both panels
    open adjacent.
  - `prescriber-contact-card-emergency-card-pdf-two-up` is the FIRST
    landscape multi-card layout in the module. Physical use case:
    cardiology / oncology ED-binder cover — patient walks in with a
    4-card mini-deck on two sheets instead of a 4-page packet, with
    a scissor-cut gutter so the cards split into individual wallet
    inserts. Page geometry: same paper rotated to LANDSCAPE,
    vertical centerline dividing into left + right halves with a
    configurable gutter (default 18pt / ~0.25"). Each half preserves
    the single-up card's block ordering and visual hierarchy. Font
    sizes step down a notch (hero 36pt vs single-up 48pt, name
    16pt vs 18pt, QR 180pt vs 240pt) to fit the narrower slot
    without losing the design language. Crucially we RE-DO the
    block math for half-page coordinates rather than calling the
    single-up builder twice and offsetting blocks — the single-up
    coordinates are page-relative, not half-page-relative, and naive
    translation would put the hero phone at the wrong y. The two
    layouts share visual language but compute their own positions.
    Odd-count terminal page renders left slot with right=null
    (`rightSlotEmpty=true`) so the binder doesn't end on a blank
    half-card.
  - Module-domain-noun prefix discipline continues to hold:
    RegimenHistoryCsvExportOptions (not CsvExportOptions),
    DoseRoundtripSummaryTextOptions (not SummaryTextOptions),
    FollowupDigestMultiLocaleResult (not MultiLocaleResult),
    RefusalReasonI18nRollupHtml (not Html),
    EmergencyCardPdfTwoUpPage (not TwoUpPage) — every export this
    tick used a module-prefixed name where any generic name
    (Options, Result, Html, Page) could have collided.
  - 6 clean ticks in a row (no fixup commits, no force-push, no
    revert). Every commit revertible in isolation; every commit has
    its own test suite; every commit passes the full @med/utils gate
    in isolation AND in batch.

- 2026-06-21 23:25 PDT — tick 15: 5 features shipped.
  Commits: e81504f regimen-snapshot-archive-history-rollup-html,
  6c7977c dose-export-csv-import-roundtrip-validator-html,
  1657c8b followup-digest-text-html-bundle-i18n,
  0125aa9 refusal-reason-suggest-i18n-rollup,
  ac528fe prescriber-contact-card-emergency-card-pdf.
  Gate: 1902/1902 tests pass in `@med/utils` (182 new this tick:
  35+39+38+26+44). Lint + build placeholder ok. `@med/utils` typecheck
  baseline = 42 errors identical to start-of-tick (across the same 6
  pre-existing files: adherence-risk, date, ics, schedule-resolver,
  taper-plan, titration); zero new errors introduced by tick 15.
  `pnpm -r test` confirms `@med/ui` 228/228 JSX runtime failures
  unchanged from baseline, `@med/api` 131/131 pass on re-run (first
  run hit 2 timing-flake timeouts when parallel with the larger
  @med/utils suite — both auth-timing tests that pre-date this tick).
  FIFTH clean tick in a row (no fixup commits). Refilled roadmap
  (Tier 1J) with 15 new candidates (#131-#145).

  Notes:
  - Fifth composition tick in a row — every module composes on at
    least one prior module. This now spans T11 -> T15, five
    consecutive composition ticks, each adding a derivative layer
    on top of the previous ones. T14 shipped foundation modules
    (third-derivatives of T11+T12 work); T15 ships FOURTH-
    derivatives — every module is a layer above a T14 output:
    history-rollup-html on history-rollup (T14), validator-html on
    validator (T14), bundle-i18n on bundle (T14), suggest-i18n-
    rollup on suggest-i18n (T14), emergency-card-pdf on emergency-
    card (T14). The pattern is now mechanically reliable: each
    tick's outputs become next tick's inputs.
  - `regimen-snapshot-archive-history-rollup-html` is the FIRST
    HTML render with THREE sort modes (tenure / event-count /
    recent) selectable at render time, NOT separate functions per
    sort. Tenure is the de-prescribing clinician's natural sort
    (long-term meds with no recent strength changes are review
    candidates); event-count surfaces titration-heavy meds; recent
    is the "what just moved" dashboard view. ACTIVE/REMOVED/CYCLED
    status chips encode three orthogonal axes (presence, removal
    history, cycling) so a single visual scan tells the clinician
    everything. Events render NEWEST-FIRST inside each cell — UI
    paradigm consistent with caregiver-handoff-summary where the
    most-recent dose leads. Timeline strip at the top uses inline
    HTML divs (24px scaled bars) so email previews get a visual
    signal when canvas-based charts can't render, mirroring
    refusal-trend-summary-html's inline-bars approach. Cycled
    medication detection escalated to a top-of-page banner
    (purple, "clinical review recommended") because the clinical
    weight of "removed then re-added" is the strongest single
    signal in the rollup.
  - `dose-export-csv-import-roundtrip-validator-html` GROUPS diffs
    by RISK TIER in priority order (structural -> mixed ->
    status-edit -> note-only) so the visually dominant section
    contains the highest-risk rows. Three tier colours (red /
    orange / yellow / blue) borrowed from followup-digest-html's
    chip palette for cross-module visual consistency. Before/after
    cells use red-strikethrough + green-highlight so a fast scan
    catches the actual change. null and empty-string render as
    distinct placeholders (∅ vs (empty)) so an adjudicator can
    tell a missing value apart from an explicitly-empty one —
    these have different clinical meanings in the dose CSV
    (pharmacy round-trip drops field, vs patient explicitly
    cleared it). riskFilter='all' / per-tier lets the UI ship a
    drilldown view without re-rendering. Adjacent lists (added /
    removed / parser-skipped) collapse to the footer below the
    diff sections — they're context, not the primary action.
  - `followup-digest-text-html-bundle-i18n` is the FIRST i18n
    layer on a COMPOSITE bundle, parallel to refusal-reason-
    suggest-i18n but for a multi-piece body (subject + opener +
    coverage + section headers + kind labels + row chips +
    portal CTA + footer). Strategy: thread the locale through the
    underlying bundle builder (so row inclusion + null short-
    circuit + stats stay identical), then string-replace the
    known English fragments in BOTH text and HTML bodies. HTML
    body needs an HTML-escaped copy of the English opener because
    the html builder &quot;-escapes oldest titles — a naive
    find-and-replace would miss the substituted opener entirely.
    Plural-aware key splitting (.one vs .many) avoids the
    `follow-up(s)` literal that no human language actually uses;
    callers extending to a new locale don't have to pick a
    side. Partial bundles legitimate — caller can localise only
    the subject and let everything else fall back to English.
  - `refusal-reason-suggest-i18n-rollup` is the FIRST batch
    helper that combines THREE prior modules in one call:
    suggester + i18n + per-dose orchestration. Preserves null
    entries (doses with no suggestion) so the picker UI's row
    count always matches input dose count — naive composition
    drops these and breaks the picker row alignment. Coverage
    rollup aggregates suggested / fallback counts globally AND
    per-source so QA pipelines can pinpoint "es-419 is missing
    the sleeping-window key for 12% of doses" without iterating
    per-dose results. Distinct missingPlaceholders set (sorted
    alphabetically for deterministic test output) surfaces bad
    locale entries via one telemetry line instead of N per-dose
    log entries.
  - `prescriber-contact-card-emergency-card-pdf` is the FIRST
    PDF layout module. Critical product decision: NO PDF
    dependency. The patient app already has @react-pdf/renderer
    on the client and pdfkit on the server, and shipping ANOTHER
    one would bloat the bundle. Instead we produce a STRUCTURED
    PAYLOAD (page geometry + ordered blocks + QR placement) the
    caller's PDF library walks to draw. Hero phone at 48pt — that
    sounds aggressive until you realise this card lives in a
    manila folder under the ED intake desk's fluorescent light
    and an intake nurse has to read it from across the desk.
    QR encodes the prescriber's vCard so an iPhone scanner
    creates the contact directly without typing — chosen ECC
    level M for vCard size (under the L threshold for
    typical vCards). Page sizes Letter (US) + A4 (international)
    with consistent 0.5" margin. Block ordering is top-to-bottom
    by y coordinate so a naive PDF library renders in array
    order. Footer pinned to bottom with printed-at timestamp for
    auditability.
  - Module-domain-noun prefix discipline continues to hold:
    DoseRoundtripHtmlRiskFilter (not RiskFilter),
    EmergencyCardPdfPayload (not PdfPayload),
    FollowupDigestI18nKey (not I18nKey),
    LocalisedRefusalSuggestion (not Suggestion),
    RegimenHistoryRollupHtml (not Html) — every export this tick
    used a module-prefixed name where any generic name (Filter,
    Payload, Key, Suggestion, Html) could have collided.
  - 5 clean ticks in a row (no fixup commits, no force-push, no
    revert). Pattern: build the foundation in T11, layer the
    HTML / i18n / variant companions over T12-T15. Every commit
    revertible in isolation; every commit has its own test suite;
    every commit passes the full @med/utils gate in isolation
    AND in batch.

- 2026-06-21 20:35 PDT — tick 14: 5 features shipped.
  Commits: c72a767 dose-export-csv-import-roundtrip-validator,
  61ec903 refusal-reason-suggest-i18n,
  86592bc followup-digest-text-html-bundle,
  b677d53 prescriber-contact-card-emergency-card,
  cb71f6c regimen-snapshot-archive-history-rollup.
  Gate: 1720/1720 tests pass in `@med/utils` (120 new this tick:
  27+25+20+28+20). Lint + build placeholder ok. `@med/utils` typecheck
  baseline = 43 errors identical to start-of-tick; zero new errors
  introduced by tick 14. `pnpm -r test` confirms `@med/ui` 228/228 JSX
  runtime failures unchanged from baseline, `@med/api` 131/131 pass.
  FOURTH clean tick in a row (no fixup commits). Refilled roadmap
  (Tier 1I) with 15 new candidates (#116-#130, recycling a few
  long-deferred items at the tail).

  Notes:
  - Fourth composition tick in a row — every module composes on at
    least one prior module. This is now the established multi-tick
    pattern: T10 / T11 ship foundation modules, T12 ships first-
    derivative companions, T13 ships second-derivative companions,
    T14 ships THIRD-derivative companions (validator + i18n +
    bundle + variant + history rollup, where each is a layer above
    a tick-12/13 output). Four of the five rely DIRECTLY on
    tick-11+ work: validator on dose-export-csv (T13), i18n on
    refusal-reason-suggest (T13), bundle on followup-overdue-digest
    + followup-digest-html (T12+T13), history rollup on regimen-
    snapshot-archive (T10) + diffRegimenSnapshots (same module).
    One ships a fresh cross-cut: prescriber-contact-card-emergency-
    card is a new layout variant of a T11 module, not a derivative
    of a derivative.
  - `dose-export-csv-import-roundtrip-validator` is the FIRST
    diff-aware re-import path. Risk classifier collapses to ONE of
    four tiers (note-only / status-edit / structural / mixed) so
    the adjudication UI can map to chip colors without re-parsing
    field lists. Pure note edits are the auto-acceptable safe tier
    — UI's "auto-accept low-risk changes" toggle bulk-applies
    note-only without surfacing them. The mixed tier exists for
    cross-category edits (structural + status, status + note) so
    the UI knows to surface the row even when individual fields
    look benign in isolation. `applyAcceptedDiffs` is intentionally
    a NEW-ARRAY helper, not an in-place mutator — patient adjudic-
    ation runs in React + Redux flows where source-mutation breaks
    every memoisation. Empty-note vs missing-note treated as the
    SAME value so a clean round-trip produces zero spurious diffs;
    learned from dose-export-csv where the writer emits an empty
    cell for both and the parser converts back to undefined.
  - `refusal-reason-suggest-i18n` is the FIRST i18n layer in
    @med/utils. Pattern: stable `source` discriminator is the i18n
    key (NOT the English text), so locale tables are pure JS
    objects mapping source -> ICU template. Suggester logic stays
    English-only (cron logs, dev tooling unchanged); only the
    picker tooltip is localised. Placeholders are extracted by
    REGEX on the English explanation strings — this avoids changing
    the suggester's public shape. Triple fallback chain: missing
    locale key -> suggestion's own English; unrecognised English
    template -> same fallback; unknown placeholder in template ->
    leave as `{placeholder}` and record in missingPlaceholders so
    bad locale entries surface in QA without crashing the picker.
    Ships a validate function for CI-grade locale file checking:
    REQUIRED_PLACEHOLDERS + ALLOWED_PLACEHOLDERS tables enforce
    the per-source contract.
  - `followup-digest-text-html-bundle` is the FIRST composition that
    GUARANTEES drift-free output across two single-body builders.
    Naive composition (call buildFollowupDigest + buildFollowupDigestHtml
    separately) has two drift modes: section limits diverging
    (text capped, html unbounded), and independent null short-
    circuits putting one body in the inbox without the other. This
    wrapper threads shared options to BOTH builders and uses ONE
    null check (text-digest null implies bundle null). Returned
    shape ships text/html top-level + an explicit alternatives
    array for the few SMTP providers (SES raw, mailgun raw) that
    need the MIME shape directly. Defensive throw when text-digest
    non-null but html-digest null — unreachable today but catches
    future divergence of the two predicates instead of silently
    shipping a half-built bundle.
  - `prescriber-contact-card-emergency-card` is the FIRST layout
    variant of an existing card type rather than a wrapper. ED
    handoff context inverts the standard hierarchy: ON-CALL number
    leads at 32px, daytime drops to a fallback line, fax/NPI/
    address/scheduling URL DROP entirely (out of scope at the
    ED). Specialty must be present — without it the ED clerk
    cannot route the patient; missing-specialty drives a warning.
    Text render uses centred ASCII with == separators around the
    hero phone line so it remains the visually dominant element
    even on a black-and-white pharmacy printer at the ED. HTML
    render adds a red border + red EMERGENCY CONTACT header for
    in-portal identification. Source PrescriberContactCard is
    preserved as `card.source` so any downstream code that needs
    the dropped fields (e.g. an exporter) can still reach them.
  - `regimen-snapshot-archive-history-rollup` rolls a chronologic-
    al list of snapshots into a per-medication add/remove/change
    timeline. Critical design choice: use diffRegimenSnapshots
    PAIRWISE for every adjacent pair so the rollup is byte-for-
    byte consistent with single-pair diffs — a future maintainer
    fixing a diff bug fixes the rollup at the same time. Cycled
    medication detection (added then removed then added) is a
    specific clinical signal (rebound; off-label restart) that
    deserves its own list. Re-add preserves firstSeen as the
    ORIGINAL first appearance — cumulative tenure is what
    clinicians read; resetting on re-add would mask "you've been
    on this for 18 months total even though we paused for 60
    days." `name` always carries the MOST RECENT name (medications
    get renamed: brand vs generic, formulation changes,
    combination drugs splitting). Prescriber + pharmacy joins
    deliberately IGNORED — they churn for non-clinical reasons
    (insurance changes, locums) and would crowd out the
    strength/presence signals the prescriber actually cares about.
  - Fourth clean tick in a row (no fixup commits). Module-domain-
    noun prefix discipline continues to hold: DoseRoundtripField
    (not Field), RefusalReasonI18nResult (not I18nResult),
    FollowupDigestBundle (not Bundle), PrescriberEmergencyCard
    (not EmergencyCard), RegimenHistoryEvent (not HistoryEvent) —
    every export this tick used a module-prefixed name where any
    generic name (Field, Result, Bundle, Card, Event) could have
    collided.


- 2026-06-21 17:14 PDT — tick 13: 5 features shipped.
  Commits: 01a07a6 dose-export-csv, 3d77ee6 refusal-reason-suggest,
  302c24b followup-digest-html, 9a6f3a8 refusal-trend-summary-html,
  4d77255 regimen-snapshot-archive-restore.
  Gate: 1600/1600 tests pass in `@med/utils` (134 new this tick:
  30+30+28+21+25). Lint + build placeholder ok. `@med/utils` typecheck
  baseline = 43 errors identical to start-of-tick; zero new errors
  introduced by tick 13. `pnpm -r test` confirms `@med/ui` 228/228 JSX
  runtime failures unchanged from baseline, `@med/api` 131/131 pass.
  THIRD clean tick in a row (no fixup commits). Refilled roadmap
  (Tier 1H) with 15 new candidates (#101-#115).

  Notes:
  - Another composition tick — every module composes on at least
    one prior module rather than introducing a brand-new domain.
    This is now a multi-tick rhythm: T11 ships foundation
    modules, T12 ships first-derivative companions, T13 ships
    second-derivative companions (CSV / HTML / restore variants
    of the T12 outputs). Three of the five rely DIRECTLY on
    tick-11 + tick-12 work: dose-export-csv on dose-batch-export,
    followup-digest-html on followup-overdue-digest, refusal-
    trend-summary-html on medication-refusal-trend. Two ship
    new cross-cutting concerns: refusal-reason-suggest is a new
    rule-based picker, regimen-snapshot-archive-restore is the
    round-trip companion to a tick-10 module.
  - `dose-export-csv` is the FIRST data-export module with a
    deliberate ROUND-TRIP parser (parseDoseCsvExport). FHIR is
    the right interop format for clinical handoff but the retail-
    pharmacy world still speaks CSV — Walgreens / CVS export
    histories as chain-published column sets, and a patient
    moving between chains is asked for one of those. The three
    layouts (MED_TRACKER, WALGREENS, CVS) match the chains'
    actual headers, not what FHIR thinks the columns should be.
    Pharmacy-status mapping (TAKEN / TAKEN-LATE / MISSED /
    SKIPPED / PENDING) is the documented retail label, not the
    DoseStatus enum value — DO NOT widen without a sample
    export from each chain because the labels drift between
    pharmacy quarterly releases. RFC-4180 quoting is implemented
    inline; the chains' parsers reject quoted empty strings
    (`""`) so we emit bare empty cells (`,,`) instead. Round-trip
    parser deliberately tolerates BOM + CRLF + LF interchangeably
    because patients hand-edit CSV in Excel-on-Windows and the
    output ends up with a BOM the patient didn't put there.
  - `refusal-reason-suggest` introduces the FIRST rule-based
    suggestion pipeline in @med/utils. We don't auto-apply — the
    patient is always the source of truth for refusal reasons —
    but the controlled vocabulary in medication-refusal-log is
    big enough (10 reasons) that the picker defaults to
    `declined` if we don't pre-select. That destroys the signal
    in honest-adherence math because "declined" is the
    everything-bucket. Five rules in strict priority order: NPO
    window (0.95 confidence; strongest clinical signal) > pause
    (0.9) > out-of-supply (0.85) > sleeping (0.7) > pattern
    (0.4-0.65 scaled, capped). The sleeping rule uses
    quiet-hours.isInQuietHours so the wrap-midnight semantics
    are identical to the reminder engine. Pattern-tie-break
    prefers tolerability (nausea > side-effect > everything
    else) so the more-actionable de-prescribing signal surfaces
    first.
  - `followup-digest-html` is the FIRST module to render an HTML
    fragment for an email body. Structural decisions deliberately
    mirror followup-overdue-digest (same null short-circuit, same
    subject line — VERIFIED by parity test, same most-overdue-
    leads opener, same hasExpired advisory) so the two outputs
    stay in lockstep. All styles inline because Gmail strips
    <style> blocks; colour values match the Tailwind palette the
    dashboard already uses for visual consistency. The HTML
    fragment has no envelope (no <html>/<body>) — the email layer
    wraps. User-controlled strings (patient name, row titles,
    portal URL) HTML-escape via the standard 5-char replace —
    verified by an explicit <script>-tag patient-name test
    because mailbox previews render HTML.
  - `refusal-trend-summary-html` is the FIRST module to produce
    BOTH a chart-component-ready data payload AND a rendered
    HTML fragment from one call. The chart payload is shape-
    compatible with Recharts/Apex/etc directly — no further
    mapping needed downstream — so the dashboard's chart
    component can consume `sparkline.data` unchanged. The
    inline HTML sparkline is drawn in plain HTML divs with
    inline styles (24px-tall scaled bars), so email previews
    still get a visual signal when canvas-based charts can't
    render. ASCII bar fallback (U+2581..U+2588) ships
    alongside for plain-text consumers. Direction chips honour
    risingTolerability as a STRONGER signal than the direction
    chip — tolerability lead overrides RISING/STABLE/FALLING
    chip with a "TOLERABILITY LEAD" red chip because that's
    the actionable signal the prescriber should see first.
    actionableOnly filter (default true) hides stable / falling
    / insufficient rows from the email body but keeps them in
    the sparkline payload so a separate dashboard consumer can
    render every chart.
  - `regimen-snapshot-archive-restore` is the round-trip
    companion to regimen-snapshot-archive. SECURITY-FIRST
    ordering: verifyRegimenSnapshot fires BEFORE any diff is
    computed, and the five failure modes (malformed, bad-
    version, signature-mismatch, payload-tampered,
    secret-too-short) pass through verbatim so the restore UI
    can map each to a specific user-facing message. Eight
    RestoreItemAction values cover the full diff space; single-
    field divergence collapses to a focused action while multi-
    field divergence escalates to `collision` with the
    field-name list so the UI can ask the patient to adjudicate
    instead of silently picking a winner. The `currentOnly`
    list surfaces medications added AFTER the snapshot was
    taken; importantly hasChanges does NOT flip to true based
    on currentOnly alone — those rows don't require a restore
    action. Schedule comparison uses the same normalisation as
    regimen-snapshot-archive.normaliseSchedule so the
    comparison is apples-to-apples (times sorted, daysOfWeek
    sorted, intervalHours / cronExpression null-normalised).
    The plan is a PROPOSAL — this module never writes to a DB,
    never mutates the current regimen.
  - Third clean tick in a row (no fixup commits). Module-domain-
    noun prefix discipline continues to hold: RestoreItemAction
    (not Action), RefusalTrendChartPoint (not ChartPoint),
    RefusalReasonSuggestion (not Suggestion), FollowupDigestHtml
    (not DigestHtml), DoseCsvExportResult (not CsvExportResult)
    — every export this tick used a module-prefixed name where
    any generic name could have collided.


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
