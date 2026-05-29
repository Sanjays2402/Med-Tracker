# Contributing to Med-Tracker

Thanks for taking the time to contribute. This project follows a few simple rules.

## Development setup

1. Install Node 20 and pnpm 9.
2. Run `pnpm install` from the repo root.
3. Run `pnpm db:migrate && pnpm db:seed`.
4. Run `pnpm dev` to start every app at once.

## Branching

Work on a feature branch named `feat/short-description` or `fix/short-description`. Open a pull request against `main` when the change is ready.

## Commits

We use Conventional Commits. Examples:

```
feat(api): add refill reminder endpoint
fix(web): correct streak math for daylight savings
docs: clarify caregiver share token rotation
```

Commitlint runs in CI and blocks anything that does not match.

## Tests

Run `pnpm test` before opening a pull request. Add tests for new behaviour. Playwright lives in `tests/e2e` and runs against a built copy of the web app.

## Code style

ESLint and Prettier handle formatting. Husky runs lint-staged on commit. Do not bypass the hook.

## Reporting bugs

Open an issue with reproduction steps, expected behaviour, and actual behaviour. A failing test case is the fastest path to a fix.
