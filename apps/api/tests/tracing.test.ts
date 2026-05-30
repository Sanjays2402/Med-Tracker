import { describe, it, expect } from 'vitest';
import { build } from '../src/server';
import { parseTraceparent, buildContext } from '../src/plugins/tracing';

describe('W3C trace context propagation', () => {
  describe('parseTraceparent', () => {
    it('accepts a well formed traceparent', () => {
      const tp = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      const parsed = parseTraceparent(tp);
      expect(parsed).not.toBeNull();
      expect(parsed!.version).toBe('00');
      expect(parsed!.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
      expect(parsed!.spanId).toBe('b7ad6b7169203331');
      expect(parsed!.flags).toBe('01');
    });

    it('rejects malformed, wrong length, or all zero ids', () => {
      expect(parseTraceparent('')).toBeNull();
      expect(parseTraceparent(undefined)).toBeNull();
      expect(parseTraceparent('not-a-traceparent')).toBeNull();
      // Too short trace id.
      expect(parseTraceparent('00-1234-b7ad6b7169203331-01')).toBeNull();
      // Reserved version ff is invalid.
      expect(parseTraceparent('ff-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01')).toBeNull();
      // All zero trace id is invalid per spec.
      expect(parseTraceparent('00-00000000000000000000000000000000-b7ad6b7169203331-01')).toBeNull();
      // All zero span id is invalid per spec.
      expect(parseTraceparent('00-0af7651916cd43dd8448eb211c80319c-0000000000000000-01')).toBeNull();
      // Non hex characters.
      expect(parseTraceparent('00-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-b7ad6b7169203331-01')).toBeNull();
    });

    it('normalises uppercase hex to lowercase', () => {
      const tp = '00-0AF7651916CD43DD8448EB211C80319C-B7AD6B7169203331-01';
      const parsed = parseTraceparent(tp);
      expect(parsed!.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
      expect(parsed!.spanId).toBe('b7ad6b7169203331');
    });
  });

  describe('buildContext', () => {
    it('adopts the inbound trace id and treats its span id as parent', () => {
      const ctx = buildContext('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01', undefined);
      expect(ctx.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
      expect(ctx.parentSpanId).toBe('b7ad6b7169203331');
      expect(ctx.spanId).not.toBe('b7ad6b7169203331');
      expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(ctx.sampled).toBe(true);
      expect(ctx.traceparent).toBe(`00-0af7651916cd43dd8448eb211c80319c-${ctx.spanId}-01`);
    });

    it('generates a fresh trace id when no traceparent is supplied', () => {
      const ctx = buildContext(undefined, undefined);
      expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(ctx.parentSpanId).toBeNull();
      expect(ctx.sampled).toBe(false);
      expect(ctx.traceparent).toBe(`00-${ctx.traceId}-${ctx.spanId}-00`);
    });

    it('preserves a safe tracestate and drops a malformed one', () => {
      const ok = buildContext(undefined, 'vendor1=value1,vendor2=value2');
      expect(ok.tracestate).toBe('vendor1=value1,vendor2=value2');
      const bad = buildContext(undefined, 'has\nnewline');
      expect(bad.tracestate).toBeNull();
    });

    it('produces unique span ids across calls with the same parent', () => {
      const tp = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      const a = buildContext(tp, undefined);
      const b = buildContext(tp, undefined);
      expect(a.spanId).not.toBe(b.spanId);
      expect(a.traceId).toBe(b.traceId);
    });
  });

  describe('HTTP propagation', () => {
    it('echoes a fresh traceparent and exposes req.trace when none is inbound', async () => {
      const app = await build();
      try {
        const res = await app.inject({ method: 'GET', url: '/health' });
        expect(res.statusCode).toBe(200);
        const tp = res.headers['traceparent'];
        expect(typeof tp).toBe('string');
        expect(tp as string).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
        // tracestate should not be set when no inbound header.
        expect(res.headers['tracestate']).toBeUndefined();
      } finally {
        await app.close();
      }
    });

    it('adopts an inbound traceparent trace id and changes the span id', async () => {
      const app = await build();
      try {
        const inboundTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
        const inboundSpanId = '00f067aa0ba902b7';
        const res = await app.inject({
          method: 'GET',
          url: '/health',
          headers: {
            traceparent: `00-${inboundTraceId}-${inboundSpanId}-01`,
            tracestate: 'rojo=00f067aa0ba902b7',
          },
        });
        expect(res.statusCode).toBe(200);
        const tp = res.headers['traceparent'] as string;
        const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(tp);
        expect(m).not.toBeNull();
        expect(m![1]).toBe(inboundTraceId);
        expect(m![2]).not.toBe(inboundSpanId);
        expect(m![3]).toBe('01');
        expect(res.headers['tracestate']).toBe('rojo=00f067aa0ba902b7');
      } finally {
        await app.close();
      }
    });

    it('ignores a malformed inbound traceparent and generates a new one', async () => {
      const app = await build();
      try {
        const res = await app.inject({
          method: 'GET',
          url: '/health',
          headers: { traceparent: 'not-a-valid-traceparent' },
        });
        expect(res.statusCode).toBe(200);
        const tp = res.headers['traceparent'] as string;
        expect(tp).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/);
      } finally {
        await app.close();
      }
    });
  });
});
