import type { FastifyInstance } from 'fastify';
import { accessSync, constants as fsConstants, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '../env';

/**
 * Health and lifecycle probes.
 *
 * Two distinct endpoints are exposed so Kubernetes can tell the difference
 * between a process that is alive (do not restart me) and a process that is
 * ready to serve traffic (route requests to me).
 *
 *   GET /livez  liveness. Returns 200 as long as the event loop is running.
 *               Never depends on external systems. A failing liveness probe
 *               means the pod is wedged and should be killed.
 *
 *   GET /readyz readiness. Returns 200 only when the process is willing to
 *               accept new requests. Today that means the audit log
 *               directory is writable and JWT signing is configured. A
 *               failing readiness probe means take this pod out of the
 *               Service rotation but leave it running.
 *
 *   GET /health backward compatible alias for /livez. Kept so existing
 *               dashboards, uptime checks, and the v0 Helm chart continue
 *               to work. New callers should prefer /livez or /readyz.
 *
 * All three endpoints are intentionally unauthenticated, fast, and excluded
 * from the audit log (see plugins/audit.ts SKIP_ROUTES).
 */

type ReadinessCheck = {
  name: string;
  ok: boolean;
  detail?: string;
};

function checkAuditLogWritable(): ReadinessCheck {
  const path = env.AUDIT_LOG_PATH;
  try {
    const dir = dirname(path);
    accessSync(dir, fsConstants.W_OK);
    // If the file already exists, confirm it is a regular file we can append
    // to. If it does not exist yet the directory write check above is enough,
    // the AuditService will create it on first write.
    try {
      const st = statSync(path);
      if (!st.isFile()) {
        return { name: 'audit_log', ok: false, detail: 'not a regular file' };
      }
      accessSync(path, fsConstants.W_OK);
    } catch {
      // File does not exist yet, that's fine.
    }
    return { name: 'audit_log', ok: true };
  } catch (err) {
    return {
      name: 'audit_log',
      ok: false,
      detail: (err as Error).message,
    };
  }
}

function checkJwtConfigured(): ReadinessCheck {
  const secret = env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    return { name: 'jwt_secret', ok: false, detail: 'missing or too short' };
  }
  if (env.NODE_ENV === 'production' && /change.?me|dev.?secret/i.test(secret)) {
    return { name: 'jwt_secret', ok: false, detail: 'placeholder secret in production' };
  }
  return { name: 'jwt_secret', ok: true };
}

export function runReadinessChecks(): { ok: boolean; checks: ReadinessCheck[] } {
  const checks = [checkAuditLogWritable(), checkJwtConfigured()];
  return { ok: checks.every((c) => c.ok), checks };
}

export async function registerHealth(app: FastifyInstance) {
  const livenessPayload = () => ({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    pid: process.pid,
  });

  app.get('/livez', { schema: { tags: ['health'] } }, async (_req, reply) => {
    return reply.send(livenessPayload());
  });

  // Backward compatible alias. Behaves exactly like /livez.
  app.get('/health', { schema: { tags: ['health'] } }, async (_req, reply) => {
    return reply.send({ ok: true, ...livenessPayload() });
  });

  app.get('/readyz', { schema: { tags: ['health'] } }, async (_req, reply) => {
    const result = runReadinessChecks();
    const body = {
      status: result.ok ? 'ready' : 'not_ready',
      checks: result.checks,
    };
    return reply.code(result.ok ? 200 : 503).send(body);
  });
}
