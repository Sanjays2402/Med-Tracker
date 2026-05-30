import fp from 'fastify-plugin';
import client from 'prom-client';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Tenant context plugin.
 *
 * Resolves the tenant identifier for an authenticated request and exposes
 * helpers used by downstream routes and services to scope reads and writes
 * to a single tenant. This is the foundation for multi tenant isolation:
 * every persistence call that returns or mutates user owned data should
 * filter on req.tenantId rather than trusting client supplied identifiers.
 *
 * Resolution order (first match wins):
 *   1. JWT claim `tid`
 *   2. JWT claim `tenant`
 *   3. JWT claim `org`
 *   4. JWT claim `tenant_id`
 *   5. `req.authUser.sub`  fallback for single user tenancy. Every user is
 *      their own tenant unless an explicit tenant claim is present, so the
 *      isolation model degrades safely instead of leaking across users.
 *
 * The plugin deliberately does NOT block requests by itself. Use
 * `app.requireTenant()` as a preHandler on routes that must have a tenant,
 * and `app.assertTenantOwns(req, ownerId)` inside handlers when comparing
 * a row's tenantId against the caller. Both increment a Prometheus counter
 * on denial so cross tenant access attempts are observable in dashboards
 * without scraping logs.
 *
 * Header `x-tenant-id` is consulted only in non production environments
 * and only when no JWT tenant claim is present. It is never trusted to
 * override an authenticated claim.
 */

export type TenantId = string;

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * preHandler that runs app.authenticate, then asserts req.tenantId is
     * resolved. Returns 401 if unauthenticated, 403 if the principal has
     * no tenant context. Use on every route that reads or writes tenant
     * scoped data.
     */
    requireTenant: () => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /**
     * Compares a row's tenant against the caller's tenant. Returns true
     * when access is allowed. When the caller does not own the row this
     * helper records the denial in Prometheus and returns false; the
     * caller is responsible for sending the 404 or 403 response. Hiding
     * existence with 404 is recommended for resources the user should
     * not be able to enumerate.
     */
    assertTenantOwns: (req: FastifyRequest, ownerTenantId: TenantId | null | undefined) => boolean;
  }
  interface FastifyRequest {
    /** Resolved tenant for this request, if any. */
    tenantId?: TenantId;
  }
}

function getTenantDeniedCounter(registry: client.Registry): client.Counter<'route' | 'reason'> {
  const name = 'http_tenant_access_denied_total';
  const existing = registry.getSingleMetric(name) as
    | client.Counter<'route' | 'reason'>
    | undefined;
  if (existing) return existing;
  return new client.Counter({
    name,
    help: 'Total number of tenant scoped requests denied due to missing or mismatched tenant',
    labelNames: ['route', 'reason'] as const,
    registers: [registry],
  });
}

function resolveTenant(payload: Record<string, unknown> | undefined, sub: string | undefined): TenantId | undefined {
  if (payload) {
    for (const key of ['tid', 'tenant', 'org', 'tenant_id'] as const) {
      const v = payload[key];
      if (typeof v === 'string' && v.length > 0) return v;
    }
  }
  if (typeof sub === 'string' && sub.length > 0) return sub;
  return undefined;
}

const plugin: FastifyPluginAsync = async (app) => {
  const isProd = process.env.NODE_ENV === 'production';
  // Register the denial counter on the dedicated metrics registry created
  // by plugins/metrics.ts so it is exposed at /metrics alongside the rest
  // of the HTTP counters. Falls back to the default registry when the
  // metrics plugin is not present (e.g. isolated unit tests).
  const registry = (app as unknown as { metricsRegistry?: client.Registry }).metricsRegistry ?? client.register;
  const tenantDenied = getTenantDeniedCounter(registry);

  // Always try to populate req.tenantId after a successful authenticate.
  // We do this with a preHandler decorator rather than a global hook so
  // that unauthenticated routes (/livez, /metrics, /auth/login) are not
  // forced through tenant resolution.
  app.addHook('preHandler', async (req: FastifyRequest) => {
    if (req.tenantId) return;
    const payload = (req as unknown as { user?: Record<string, unknown> }).user;
    const sub = req.authUser?.sub ?? (payload?.sub as string | undefined);
    const resolved = resolveTenant(payload, sub);
    if (resolved) {
      req.tenantId = resolved;
      return;
    }
    if (!isProd) {
      const hdr = req.headers['x-tenant-id'];
      const v = Array.isArray(hdr) ? hdr[0] : hdr;
      if (typeof v === 'string' && v.length > 0) {
        req.tenantId = v;
      }
    }
  });

  app.decorate('requireTenant', function requireTenant() {
    return async function requireTenantHandler(req: FastifyRequest, reply: FastifyReply) {
      await app.authenticate(req, reply);
      if (reply.sent) return;
      // authenticate populates req.authUser; the preHandler above runs
      // before route handlers but after this preHandler chain entry, so
      // resolve inline as well to cover the immediate post-auth case.
      if (!req.tenantId) {
        const payload = (req as unknown as { user?: Record<string, unknown> }).user;
        req.tenantId = resolveTenant(payload, req.authUser?.sub);
      }
      if (!req.tenantId) {
        const route = req.routeOptions?.url ?? req.url.split('?')[0] ?? 'unknown';
        tenantDenied.inc({ route, reason: 'missing' });
        req.log.warn({ sub: req.authUser?.sub, route }, 'tenant_missing');
        return reply.status(403).send({
          error: { code: 'tenant_required', message: 'tenant context required' },
        });
      }
    };
  });

  app.decorate('assertTenantOwns', function assertTenantOwns(req: FastifyRequest, ownerTenantId: TenantId | null | undefined) {
    if (!req.tenantId) {
      const route = req.routeOptions?.url ?? req.url.split('?')[0] ?? 'unknown';
      tenantDenied.inc({ route, reason: 'missing' });
      return false;
    }
    if (!ownerTenantId || ownerTenantId !== req.tenantId) {
      const route = req.routeOptions?.url ?? req.url.split('?')[0] ?? 'unknown';
      tenantDenied.inc({ route, reason: 'mismatch' });
      req.log.warn(
        { sub: req.authUser?.sub, caller: req.tenantId, owner: ownerTenantId ?? null, route },
        'tenant_mismatch',
      );
      return false;
    }
    return true;
  });

  app.log.info('tenant plugin registered (JWT claim + safe fallback)');
};

export default fp(plugin, { name: 'tenant', dependencies: ['auth', 'metrics'] });
