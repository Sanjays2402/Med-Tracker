import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { AuditService, type AuditActor } from '../services/AuditService';

/**
 * Audit plugin.
 *
 * Decorates the app with a real AuditService that writes append only JSONL.
 * Also installs an onResponse hook that records every mutating HTTP request
 * (POST, PUT, PATCH, DELETE) and every auth route, so authentication events
 * are captured regardless of HTTP verb.
 *
 * Read routes are intentionally not audited to keep the log focused on state
 * changes and security events. Health, metrics, and the audit query endpoint
 * itself are excluded to avoid recursion and dashboard noise.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SKIP_ROUTES = new Set(['/health', '/livez', '/readyz', '/ready', '/metrics', '/admin/audit']);

function actorFrom(req: FastifyRequest): AuditActor {
  // Fastify JWT decorates req.user when a token is verified. We treat any
  // bearer principal as the actor; if absent the entry is recorded as
  // anonymous (null actor) so abuse from unauthenticated traffic is still
  // visible in the trail.
  const u = (req as unknown as { user?: { sub?: string; id?: string; role?: string } }).user;
  if (!u) return null;
  const id = u.sub ?? u.id;
  if (!id) return null;
  return { id, role: u.role };
}

function actionFor(method: string, route: string): string {
  if (route.startsWith('/auth/')) return `auth.${route.slice('/auth/'.length).replace(/\//g, '.')}`;
  const base = route.replace(/^\//, '').replace(/\/:[^/]+/g, '').replace(/\//g, '.') || 'root';
  const verb =
    method === 'POST' ? 'create' :
    method === 'PUT' ? 'replace' :
    method === 'PATCH' ? 'update' :
    method === 'DELETE' ? 'delete' :
    'read';
  return `${base}.${verb}`;
}

const plugin: FastifyPluginAsync = async (app) => {
  const { env } = await import('../env');
  const audit = new AuditService(env.AUDIT_LOG_PATH);
  app.decorate('audit', audit);

  app.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
    const route = req.routeOptions?.url ?? req.url.split('?')[0] ?? 'unknown';
    if (SKIP_ROUTES.has(route)) return;
    const isAuth = route.startsWith('/auth/');
    if (!isAuth && !MUTATING_METHODS.has(req.method)) return;
    try {
      await audit.record({
        actor: actorFrom(req),
        action: actionFor(req.method, route),
        method: req.method,
        route,
        status: reply.statusCode,
        reqId: req.id,
        ip: req.ip,
      });
    } catch (err) {
      req.log.warn({ err }, 'audit_write_failed');
    }
  });

  app.addHook('onClose', async () => {
    await audit.close();
  });
};

declare module 'fastify' {
  interface FastifyInstance {
    audit: AuditService;
  }
}

export default fp(plugin, { name: 'audit' });
