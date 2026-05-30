import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Auth plugin.
 *
 * Adds two reusable preHandlers to the Fastify instance:
 *
 *   app.authenticate        Verifies the bearer JWT (via @fastify/jwt) and
 *                           populates req.user with { sub, role, email }.
 *                           In non-production environments a x-user-id
 *                           header is accepted as a developer convenience
 *                           and assigned the 'user' role. In production
 *                           only a valid JWT is accepted.
 *
 *   app.requireRole(role)   Returns a preHandler that runs authenticate
 *                           and then asserts the resolved role matches.
 *                           Used to gate /admin/* routes to operators.
 *
 * Role resolution priority for JWT claims:
 *   1. payload.role
 *   2. payload.roles[0]      (first role from an array claim)
 *   3. 'user'                (default for any authenticated subject)
 *
 * The plugin deliberately does not auto-apply to every route. Routes opt
 * in explicitly so unauthenticated endpoints (/livez, /readyz, /metrics,
 * /auth/login, /auth/signup) keep working without ceremony.
 */

export type AuthRole = 'user' | 'admin' | string;

export interface AuthUser {
  sub: string;
  role: AuthRole;
  email?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (role: AuthRole) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

function unauthorized(reply: FastifyReply, message: string) {
  return reply.status(401).send({ error: { code: 'unauthorized', message } });
}

function forbidden(reply: FastifyReply, message: string) {
  return reply.status(403).send({ error: { code: 'forbidden', message } });
}

const plugin: FastifyPluginAsync = async (app) => {
  const isProd = process.env.NODE_ENV === 'production';

  app.decorate('authenticate', async function authenticate(req: FastifyRequest, reply: FastifyReply) {
    // 1. Try JWT bearer.
    const authHeader = req.headers.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      try {
        await (req as unknown as { jwtVerify: () => Promise<void> }).jwtVerify();
        const payload = (req as unknown as { user?: Record<string, unknown> }).user ?? {};
        const sub = (payload.sub as string | undefined) ?? (payload.id as string | undefined);
        if (!sub) return unauthorized(reply, 'token missing subject');
        const rolesClaim = payload.roles;
        const role: string =
          (payload.role as string | undefined) ??
          (Array.isArray(rolesClaim) && typeof rolesClaim[0] === 'string' ? (rolesClaim[0] as string) : undefined) ??
          'user';
        req.authUser = { sub, role, email: payload.email as string | undefined };
        return;
      } catch {
        return unauthorized(reply, 'invalid or expired token');
      }
    }

    // 2. Dev-only fallback header. Refused in production.
    if (!isProd) {
      const hdr = req.headers['x-user-id'];
      const sub = Array.isArray(hdr) ? hdr[0] : hdr;
      if (typeof sub === 'string' && sub.length > 0) {
        const roleHdr = req.headers['x-user-role'];
        const role = (Array.isArray(roleHdr) ? roleHdr[0] : roleHdr) as string | undefined;
        req.authUser = { sub, role: role && role.length > 0 ? role : 'user' };
        return;
      }
    }

    return unauthorized(reply, 'authentication required');
  });

  app.decorate('requireRole', function requireRole(role: AuthRole) {
    return async function requireRoleHandler(req: FastifyRequest, reply: FastifyReply) {
      await app.authenticate(req, reply);
      if (reply.sent) return;
      const actual = req.authUser?.role;
      if (actual !== role) {
        req.log.warn(
          { required: role, actual, sub: req.authUser?.sub },
          'rbac_denied',
        );
        return forbidden(reply, `role '${role}' required`);
      }
    };
  });

  app.log.info('auth plugin registered (JWT bearer + RBAC)');
};

export default fp(plugin, { name: 'auth', dependencies: [] });
