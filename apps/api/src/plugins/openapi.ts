import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from '../env';

/**
 * OpenAPI documentation plugin.
 *
 * Registers @fastify/swagger to build a live OpenAPI 3.0 document from the
 * route schemas the API already declares (every route attaches at minimum a
 * `schema.tags` entry), and serves it through two surfaces:
 *
 *   GET /openapi.json   the raw OpenAPI 3.0 document. Stable contract, safe
 *                       for codegen (openapi-typescript, openapi-generator)
 *                       and external API consumers.
 *
 *   GET /docs           interactive Swagger UI for humans. Useful for QA,
 *                       on-call, and integration partners. The UI is gated
 *                       behind OPENAPI_UI_ENABLED so production deployments
 *                       can hide it while still publishing the JSON
 *                       document to internal portals.
 *
 * The bearer security scheme mirrors the auth plugin (Authorization: Bearer
 * <jwt>) so "Try it out" works without extra wiring.
 *
 * Excluded from /metrics route histograms and from the audit log via the
 * existing SKIP_ROUTES lists; see plugins/metrics.ts and plugins/audit.ts.
 */
const plugin: FastifyPluginAsync = async (app) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Med-Tracker API',
        description:
          'HTTP API for medication adherence, scheduling, caregiver handoff, and reporting. ' +
          'Authentication is JWT bearer. Rate limits are tiered per route group (auth, read, write, export, admin).',
        version: process.env.npm_package_version ?? '0.1.0',
      },
      servers: [
        {
          url: env.NODE_ENV === 'production' ? '/' : `http://localhost:${env.PORT}`,
          description: env.NODE_ENV,
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      tags: [
        { name: 'auth', description: 'Signup, login, refresh, logout' },
        { name: 'me', description: 'Authenticated user profile and data lifecycle (GDPR export/erase)' },
        { name: 'medications', description: 'User medication catalog' },
        { name: 'schedules', description: 'Dose scheduling, conflicts, travel mode' },
        { name: 'doses', description: 'Dose ledger: take, skip, snooze, history' },
        { name: 'streaks', description: 'Adherence streaks and forecasts' },
        { name: 'refills', description: 'Refill tracking and batch operations' },
        { name: 'caregivers', description: 'Caregiver invites, handoff, digest tokens' },
        { name: 'reports', description: 'Adherence reports and CSV/ICS/PDF/JSON exports' },
        { name: 'reminders', description: 'Reminder engine and pending notifications' },
        { name: 'notifications', description: 'Notification ledger' },
        { name: 'interactions', description: 'Drug-drug interaction checks' },
        { name: 'drugs', description: 'Drug catalog lookup' },
        { name: 'admin', description: 'Operator endpoints, gated by ADMIN_TOKEN and role' },
        { name: 'health', description: 'Liveness and readiness probes' },
      ],
    },
  });

  if (env.OPENAPI_UI_ENABLED) {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
      },
      staticCSP: true,
    });
  }

  // Always expose the raw OpenAPI JSON, even when the UI is disabled. This
  // is the contract that codegen and partners consume; turning it off would
  // break downstream builds. It is unauthenticated by design.
  app.get(
    '/openapi.json',
    { schema: { tags: ['health'], hide: true } },
    async (_req, reply) => {
      reply.header('content-type', 'application/json; charset=utf-8');
      return reply.send(app.swagger());
    },
  );
};

export default fp(plugin, { name: 'openapi' });
