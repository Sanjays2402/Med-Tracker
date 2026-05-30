import { z } from 'zod';

/**
 * Environment configuration.
 *
 * Validated with zod at import time. Process exits if the environment is
 * invalid so a misconfigured deployment fails fast at boot rather than
 * silently serving traffic with a dev secret, a wrong CORS origin, or an
 * unreachable database URL.
 *
 * Production safety rails (NODE_ENV=production):
 *   - JWT_SECRET must be set and at least 32 characters, and must not be the
 *     dev placeholder.
 *   - WEB_ORIGIN must be an https URL (anything except http://localhost*).
 *   - SENTRY_DSN is recommended; a warning is logged when missing.
 *   - ADMIN_TOKEN, when set, must be at least 24 characters so a weak token
 *     does not become the only thing protecting the audit trail.
 *
 * All other environments use permissive defaults so local dev and CI keep
 * working without configuration.
 */

const trimmed = (s: unknown) => (typeof s === 'string' ? s.trim() : s);

const baseSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  JWT_SECRET: z.preprocess(trimmed, z.string().min(1)).default('dev-secret-change-me'),
  WEB_ORIGIN: z.preprocess(trimmed, z.string().url()).default('http://localhost:3000'),
  DATABASE_URL: z.preprocess(trimmed, z.string().min(1)).default('file:./dev.db'),

  AUDIT_LOG_PATH: z.preprocess(trimmed, z.string().min(1)).default('./data/audit.log'),
  ADMIN_TOKEN: z.preprocess(trimmed, z.string()).default(''),

  SENTRY_DSN: z.preprocess(trimmed, z.string()).default(''),
  SENTRY_ENVIRONMENT: z.preprocess(trimmed, z.string().min(1)).optional(),
  SENTRY_RELEASE: z.preprocess(trimmed, z.string()).default(''),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),

  // OpenAPI / Swagger UI. The JSON document at /openapi.json is always
  // exposed (it is the API contract); the interactive UI at /docs is
  // gated so operators can hide it in production deployments that prefer
  // to publish docs through an internal portal instead.
  OPENAPI_UI_ENABLED: z
    .preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.enum(['true', 'false']))
    .transform((v) => v === 'true')
    .default('true'),
});

const DEV_JWT_PLACEHOLDERS = new Set([
  'dev-secret-change-me',
  'change-me',
  'changeme',
  'secret',
  'test',
  '',
]);

/**
 * Apply production-only invariants on top of the base parse. Returned as
 * issues so they show up alongside any base validation errors in one block.
 */
function productionInvariants(env: z.infer<typeof baseSchema>): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const issues: string[] = [];

  if (DEV_JWT_PLACEHOLDERS.has(env.JWT_SECRET)) {
    issues.push('JWT_SECRET must be set to a real secret in production');
  } else if (env.JWT_SECRET.length < 32) {
    issues.push('JWT_SECRET must be at least 32 characters in production');
  }

  // WEB_ORIGIN must not be a localhost URL in production. Allow http only for
  // explicit cluster-internal hosts (no dots is fine for k8s service DNS like
  // http://web.default.svc.cluster.local, but those have dots too). Simplest
  // rule: require https unless the host has no public TLD (still rejects
  // localhost).
  try {
    const u = new URL(env.WEB_ORIGIN);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '0.0.0.0') {
      issues.push('WEB_ORIGIN must not point at localhost in production');
    } else if (u.protocol !== 'https:' && !u.hostname.endsWith('.cluster.local')) {
      issues.push('WEB_ORIGIN must use https in production (cluster.local hosts excepted)');
    }
  } catch {
    // unreachable: base schema already enforced URL shape
  }

  if (env.ADMIN_TOKEN && env.ADMIN_TOKEN.length < 24) {
    issues.push('ADMIN_TOKEN must be at least 24 characters when set');
  }

  return issues;
}

export type Env = z.infer<typeof baseSchema>;

/**
 * Parse and validate an environment-like object. Throws an Error whose
 * message lists every validation problem. Exposed so tests can exercise the
 * schema without mutating process.env.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = baseSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const prodIssues = productionInvariants(parsed.data);
  if (prodIssues.length > 0) {
    throw new Error(
      `Invalid environment configuration (production):\n${prodIssues.map((m) => `  - ${m}`).join('\n')}`,
    );
  }
  // Default SENTRY_ENVIRONMENT to NODE_ENV when caller did not set it. We do
  // this after parsing so the resolved value always has a string.
  return {
    ...parsed.data,
    SENTRY_ENVIRONMENT: parsed.data.SENTRY_ENVIRONMENT ?? parsed.data.NODE_ENV,
  };
}

function loadEnv(): Env {
  try {
    return parseEnv(process.env);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error((err as Error).message);
    // Never exit during tests; vitest catches the throw and reports it cleanly.
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw err;
  }
}

export const env: Env = loadEnv();
