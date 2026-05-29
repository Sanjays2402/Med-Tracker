# Security Policy

## Supported versions

The `main` branch and the most recent tagged release receive security updates.

## Reporting a vulnerability

Please email security@med-tracker.dev with a clear description, reproduction steps, and the impact you observed. We aim to acknowledge within 72 hours and to release a patch within 30 days for high severity issues.

Do not open public GitHub issues for security problems. If you are unsure whether something qualifies, send it privately and we will help triage.

## Handling personal health information

Med-Tracker may store medication schedules and adherence history. Treat this data as protected health information. Never paste real patient data into bug reports or test fixtures. The `content/` and `tests/` directories contain only synthetic records.
