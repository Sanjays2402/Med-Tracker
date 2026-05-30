export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  DATABASE_URL: process.env.DATABASE_URL ?? 'file:./dev.db',
  /**
   * Path to the append only audit log (JSONL). Defaults to a process local
   * file under ./data so the dev server does not require any external
   * storage. In production this should point at a path on a durable volume
   * that is shipped to a SIEM or object store.
   */
  AUDIT_LOG_PATH: process.env.AUDIT_LOG_PATH ?? './data/audit.log',
  /**
   * Bearer token required to read the audit trail via /admin/audit. When
   * unset the endpoint is disabled (503) so the trail cannot leak from a
   * misconfigured deployment.
   */
  ADMIN_TOKEN: process.env.ADMIN_TOKEN ?? '',
  /**
   * Sentry DSN. When unset Sentry initialisation is skipped and errors are
   * only logged. Set this in staging and production to ship server side
   * errors to Sentry with request id, route, method, and user context.
   */
  SENTRY_DSN: process.env.SENTRY_DSN ?? '',
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  SENTRY_RELEASE: process.env.SENTRY_RELEASE ?? '',
};
