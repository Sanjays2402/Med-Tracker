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

## Roadmap

Status legend: `[ ]` todo, `[x]` shipped (tick / SHA), `[~]` in progress, `[!]` skipped/blocked.

### Tier 1 — pure utilities (packages/utils)

1. [ ] `renewal-window` — Insurance renewal eligibility (days-supply, % consumed, earliest-fill).
2. [ ] `missed-dose-replan` — Re-plan next safe dose after a miss (min-interval, max-daily safe windows).
3. [ ] `dose-rounding` — Round computed doses to dispensable strengths (tablet halves, syringe steps).
4. [ ] `streak-rescue` — Detect at-risk streaks; expose grace/makeup options before they break.
5. [ ] `pharmacy-hours` — Pharmacy hours resolver: isOpenAt / nextOpen / nextClose with holiday overrides.
6. [ ] `notification-batcher` — Coalesce multiple due reminders inside a small window into one notification.
7. [ ] `dose-history-aggregator` — Group dose history into day/week/month buckets with status counts.
8. [ ] `bp-log` — Blood-pressure paired-reading log with hypertension classification.
9. [ ] `weight-trend` — Rolling 7d/30d weight trend with EMA + outlier rejection.
10. [ ] `glucose-log` — Pre/post-prandial glucose log with in-range %, hypo/hyper flags.
11. [ ] `prn-budget` — As-needed (PRN) usage budget tracker (e.g. max 4 doses / 24h).
12. [ ] `regimen-summary` — Plain-language regimen summary: counts, timing buckets, top hubs.
13. [ ] `dose-streak-by-med` — Per-medication streak (not just overall) with longest-streak history.
14. [ ] `pill-burden` — Daily pill burden (count + total mg / mL) for de-prescribing review.
15. [ ] `pharmacy-distance-pick` — Pick closest open pharmacy given lat/lng + hours + carries-drug list.
16. [ ] `interaction-pair-search` — Fast lookup of pair severity across full drug list (memoised classifier).
17. [ ] `dose-adherence-trend` — Linear-fit adherence trend (slope, intercept, projected 30d %).
18. [ ] `reminder-snooze-policy` — Snooze policy: max snoozes, escalation, auto-skip after N misses.
19. [ ] `vacation-overrides` — Per-day schedule overrides for vacations / travel days.
20. [ ] `medication-history-import` — Import external history (CSV) into normalized doses with dedup.

### Tier 2 — UI / app slices (web + ui pkg)

(Pulled forward only after Tier 1 momentum is established and after careful
study of existing `apps/web` and `packages/ui` patterns.)

## Tick log

(Each tick appends one line: timestamp / features-shipped / sha-list.)
