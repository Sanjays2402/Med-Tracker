import fp from 'fastify-plugin';
import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import * as Sentry from '@sentry/node';

/**
 * W3C Trace Context propagation plugin.
 *
 * Implements the W3C Trace Context spec (https://www.w3.org/TR/trace-context/)
 * at the HTTP edge so the API participates in distributed traces emitted by
 * upstream proxies, browsers, and downstream microservices without pulling in
 * the full OpenTelemetry SDK.
 *
 * For every request:
 *   1. Parse an inbound `traceparent` header. When valid we adopt its
 *      `trace_id` and treat its `span_id` as the parent span; otherwise we
 *      generate a fresh 16 byte trace id.
 *   2. Always generate a fresh 8 byte `span_id` for this server span so two
 *      hops never share the same span id.
 *   3. Bind `traceId`, `spanId`, and (when present) `parentSpanId` to the
 *      per request pino child logger so every log line for the request can
 *      be joined against a trace backend.
 *   4. Echo the resulting `traceparent` and pass through `tracestate`
 *      unchanged on the response, so downstream collectors can stitch the
 *      trace together.
 *   5. Tag the Sentry scope with `trace_id` and `span_id` when Sentry is
 *      configured, so an exception in Sentry links back to the same trace
 *      visible in Tempo, Jaeger, Honeycomb, or any other W3C aware backend.
 *
 * The plugin deliberately does not emit spans itself. Real OTLP export is
 * left to an OpenTelemetry SDK or a sidecar; the value of this plugin is
 * propagation, which is the part you cannot retrofit after the fact without
 * losing trace continuity for in flight requests.
 */

// version-traceId-spanId-flags, lowercase hex, no extension fields supported.
const TRACEPARENT_RE = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ALL_ZERO_TRACE = '00000000000000000000000000000000';
const ALL_ZERO_SPAN = '0000000000000000';
// tracestate: list of up to 32 comma separated key=value entries. We validate
// at a coarse level (printable ASCII, no CR/LF) and pass it through opaquely.
const TRACESTATE_SAFE = /^[\x20-\x7E]{1,512}$/;

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  sampled: boolean;
  traceparent: string;
  tracestate: string | null;
}

function hex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

/** Parse a W3C traceparent header. Returns null when invalid. */
export function parseTraceparent(value: string | undefined | null): {
  version: string;
  traceId: string;
  spanId: string;
  flags: string;
} | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  const m = TRACEPARENT_RE.exec(trimmed);
  if (!m) return null;
  const [, version, traceId, spanId, flags] = m;
  // Version ff is reserved for future use and must be rejected per spec.
  if (version === 'ff') return null;
  if (traceId === ALL_ZERO_TRACE) return null;
  if (spanId === ALL_ZERO_SPAN) return null;
  return { version, traceId, spanId, flags };
}

/** Build a context, adopting an inbound traceparent when valid. */
export function buildContext(traceparentHeader: string | undefined, tracestateHeader: string | undefined): TraceContext {
  const parsed = parseTraceparent(traceparentHeader);
  const traceId = parsed?.traceId ?? hex(16);
  const parentSpanId = parsed?.spanId ?? null;
  const spanId = hex(8);
  // Preserve inbound sample decision when present, otherwise default to
  // unsampled. Operators that want head sampling on the edge should set the
  // flag at the load balancer.
  const flags = parsed?.flags ?? '00';
  const sampled = (parseInt(flags, 16) & 0x01) === 0x01;
  const traceparent = `00-${traceId}-${spanId}-${flags}`;
  const ts = typeof tracestateHeader === 'string' ? tracestateHeader.trim() : '';
  const tracestate = ts && TRACESTATE_SAFE.test(ts) ? ts : null;
  return { traceId, spanId, parentSpanId, sampled, traceparent, tracestate };
}

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    const tp = req.headers['traceparent'];
    const ts = req.headers['tracestate'];
    const tpVal = Array.isArray(tp) ? tp[0] : tp;
    const tsVal = Array.isArray(ts) ? ts[0] : ts;
    const ctx = buildContext(tpVal, tsVal);

    (req as unknown as { trace: TraceContext }).trace = ctx;

    // Enrich the per request logger. requestId plugin has already created a
    // child with reqId, so this child includes both for easy correlation.
    req.log = req.log.child({
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      ...(ctx.parentSpanId ? { parentSpanId: ctx.parentSpanId } : {}),
    });

    // Echo on the response so downstream callers see our span id as their
    // parent and can stitch the trace forward.
    reply.header('traceparent', ctx.traceparent);
    if (ctx.tracestate) reply.header('tracestate', ctx.tracestate);

    // Tag Sentry scope so captureException links back to the same trace.
    // getCurrentScope is a no op when Sentry is not initialised, so this is
    // safe to call unconditionally.
    const scope = Sentry.getCurrentScope();
    scope.setTag('trace_id', ctx.traceId);
    scope.setTag('span_id', ctx.spanId);
    if (ctx.parentSpanId) scope.setTag('parent_span_id', ctx.parentSpanId);
  });
};

declare module 'fastify' {
  interface FastifyRequest {
    trace?: TraceContext;
  }
}

export default fp(plugin, { name: 'tracing', dependencies: ['requestId'] });
