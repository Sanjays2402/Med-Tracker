import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import client from 'prom-client';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

/**
 * Rate limiting plugin.
 *
 * Wraps @fastify/rate-limit with three layers that match enterprise traffic
 * shapes:
 *
 *   1. Global default limit applied to every route. Acts as a backstop
 *      against unauthenticated scrapers and basic floods.
 *   2. Auth-aware key generator. Authenticated traffic is counted per
 *      JWT subject (req.authUser.sub) so a single misbehaving user cannot
 *      consume the IP budget for an entire NAT or office. Requests with an
 *      x-api-key header are counted per key. Unauthenticated traffic falls
 *      back to the client IP.
 *   3. Per-route tier helper exposed as app.rateLimitTier(tier). Sensitive
 *      routes (login, signup, exports, admin queries, expensive ML
 *      endpoints) opt into a stricter tier on top of the global limit.
 *
 * All tiers participate in a single Prometheus counter, http_rate_limit_
 * exceeded_total{tier,route}, so dashboards and alerts can spot abuse
 * without re-deriving it from request logs.
 *
 * Tiers (max requests per window):
 *   - default: 200 / 1m   global backstop, applied automatically
 *   - auth:     10 / 1m   login, signup, refresh, password reset surfaces
 *   - export:   20 / 1h   GDPR export, report exports, account deletion
 *   - admin:    60 / 1m   /admin/ * read endpoints
 *   - heavy:    30 / 1m   pill identifier, interactions graph, AI scoring
 */

export type RateLimitTier = 'default' | 'auth' | 'export' | 'admin' | 'heavy';

interface TierConfig {
  max: number;
  timeWindow: string;
}

export const RATE_LIMIT_TIERS: Record<RateLimitTier, TierConfig> = {
  default: { max: 200, timeWindow: '1 minute' },
  auth: { max: 10, timeWindow: '1 minute' },
  export: { max: 20, timeWindow: '1 hour' },
  admin: { max: 60, timeWindow: '1 minute' },
  heavy: { max: 30, timeWindow: '1 minute' },
};

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Returns a Fastify route `config` object that opts a route into the
     * named rate limit tier. Compose into a route's config:
     *
     *   app.post('/auth/login', {
     *     config: app.rateLimitTier('auth'),
     *     schema: ...,
     *   }, handler);
     */
    rateLimitTier: (tier: RateLimitTier) => {
      rateLimit: TierConfig & { keyGenerator: (req: FastifyRequest) => string };
      rateLimitTier: RateLimitTier;
    };
  }
}

export function authAwareKey(req: FastifyRequest): string {
  const sub = req.authUser?.sub;
  if (sub && typeof sub === 'string' && sub.length > 0) {
    return `user:${sub}`;
  }
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    return `key:${apiKey.slice(0, 32)}`;
  }
  return `ip:${req.ip}`;
}

const plugin: FastifyPluginAsync = async (app) => {
  // Reuse the metrics plugin's registry when present so the exceeded counter
  // appears in the same /metrics scrape as the rest of the API's metrics.
  // Falls back to the prom-client default registry for unit tests that load
  // this plugin in isolation.
  const appRegistry = (app as unknown as { metricsRegistry?: client.Registry }).metricsRegistry;
  const registers: client.Registry[] = appRegistry ? [appRegistry] : [client.register];

  const counterName = 'http_rate_limit_exceeded_total';
  // Avoid duplicate registration across hot reloads / multiple build()s in
  // the same vitest process.
  const existing = registers[0]!.getSingleMetric(counterName) as
    | client.Counter<string>
    | undefined;
  const breaches =
    existing ??
    new client.Counter({
      name: counterName,
      help: 'Total responses rejected by rate limiting, labelled by tier and route',
      labelNames: ['tier', 'route'],
      registers,
    });

  await app.register(rateLimit, {
    global: true,
    max: RATE_LIMIT_TIERS.default.max,
    timeWindow: RATE_LIMIT_TIERS.default.timeWindow,
    keyGenerator: authAwareKey,
    // Skip metrics and health endpoints so liveness probes and Prometheus
    // scrapes never get throttled.
    allowList: (req) => {
      const url = req.url.split('?')[0] ?? '';
      return url === '/metrics' || url === '/livez' || url === '/readyz' || url === '/health';
    },
    errorResponseBuilder: (req, context) => {
      const routeOpts = (req as unknown as {
        routeOptions?: { url?: string; config?: { rateLimitTier?: RateLimitTier } };
      }).routeOptions;
      const route = routeOpts?.url ?? req.url.split('?')[0] ?? 'unknown';
      const tier: RateLimitTier = routeOpts?.config?.rateLimitTier ?? 'default';
      breaches.inc({ tier, route });
      req.log.warn(
        { tier, route, key: authAwareKey(req), ttl: context.ttl, max: context.max },
        'rate_limit_exceeded',
      );
      // Build a real FastifyError so the upstream error handler (sentry
      // plugin) sees a 429 statusCode and a meaningful code, instead of
      // collapsing the response into an opaque 500.
      const err = new Error(`Too many requests. Retry after ${Math.ceil(context.ttl / 1000)}s.`) as Error & {
        statusCode: number;
        code: string;
        rateLimitTier: RateLimitTier;
        rateLimitRetryAfterMs: number;
      };
      err.statusCode = 429;
      err.code = 'rate_limited';
      err.rateLimitTier = tier;
      err.rateLimitRetryAfterMs = context.ttl;
      return err;
    },
  });

  app.decorate('rateLimitTier', function rateLimitTierFn(tier: RateLimitTier) {
    const cfg = RATE_LIMIT_TIERS[tier];
    return {
      rateLimit: {
        ...cfg,
        keyGenerator: authAwareKey,
      },
      rateLimitTier: tier,
    };
  });

  app.log.info('rate limit plugin registered (auth-aware, per-tier)');
};

export default fp(plugin, { name: 'rateLimit', dependencies: ['auth', 'metrics'] });
