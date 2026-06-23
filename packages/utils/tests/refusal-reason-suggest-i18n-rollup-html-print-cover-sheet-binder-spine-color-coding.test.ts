import { describe, it, expect } from 'vitest';
import {
  renderRefusalReasonSpineWithColorCoding,
  pickDominantSource,
  summarizeSpineColorCoding,
} from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-color-coding';
import type {
  RefusalReasonI18nRollupCoverage,
  RefusalReasonI18nRollupResult,
} from '../src/refusal-reason-suggest-i18n-rollup';
import type { RefusalReasonI18nKey } from '../src/refusal-reason-suggest-i18n';

function rollupWithSources(
  counts: Partial<Record<RefusalReasonI18nKey, number>>,
): RefusalReasonI18nRollupResult {
  const bySource = new Map<
    RefusalReasonI18nKey,
    { suggested: number; fallback: number }
  >();
  let doseCount = 0;
  let suggestedCount = 0;
  for (const [k, n] of Object.entries(counts)) {
    if (!n) continue;
    bySource.set(k as RefusalReasonI18nKey, { suggested: n, fallback: 0 });
    doseCount += n;
    suggestedCount += n;
  }
  const coverage: RefusalReasonI18nRollupCoverage = {
    doseCount,
    suggestedCount,
    fallbackCount: 0,
    bySource,
    missingPlaceholders: [],
  };
  return {
    suggestions: [],
    byDoseId: new Map(),
    coverage,
  };
}

const EMPTY_ROLLUP: RefusalReasonI18nRollupResult = {
  suggestions: [],
  byDoseId: new Map(),
  coverage: {
    doseCount: 0,
    suggestedCount: 0,
    fallbackCount: 0,
    bySource: new Map(),
    missingPlaceholders: [],
  },
};

describe('pickDominantSource', () => {
  it('returns the source with the highest count', () => {
    const r = rollupWithSources({
      'npo-window': 5,
      'prescriber-pause': 2,
      'recent-pattern': 1,
    });
    expect(pickDominantSource(r.coverage)).toBe('npo-window');
  });

  it('breaks ties by priority order (npo > pause > supply > sleep > pattern)', () => {
    const r = rollupWithSources({
      'recent-pattern': 5,
      'npo-window': 5,
    });
    expect(pickDominantSource(r.coverage)).toBe('npo-window');
  });

  it('returns null when bySource is empty', () => {
    expect(pickDominantSource(EMPTY_ROLLUP.coverage)).toBeNull();
  });

  it('picks the only present source when there is one', () => {
    const r = rollupWithSources({ 'sleeping-window': 3 });
    expect(pickDominantSource(r.coverage)).toBe('sleeping-window');
  });

  it('ignores zero-count sources', () => {
    const r = rollupWithSources({
      'npo-window': 0,
      'prescriber-pause': 3,
    });
    expect(pickDominantSource(r.coverage)).toBe('prescriber-pause');
  });
});

describe('renderRefusalReasonSpineWithColorCoding — default color stripe', () => {
  it('renders an NPO-window stripe in red by default', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'Alice',
    });
    expect(out.dominantSource).toBe('npo-window');
    expect(out.stripeColor).toBe('#DC2626');
    expect(out.html).toContain('background:#DC2626');
    expect(out.html).toContain('NPO');
  });

  it('renders a prescriber-pause stripe in blue', () => {
    const r = rollupWithSources({ 'prescriber-pause': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'Bob',
    });
    expect(out.dominantSource).toBe('prescriber-pause');
    expect(out.stripeColor).toBe('#2563EB');
    expect(out.html).toContain('PAUSE');
  });

  it('renders an out-of-supply stripe in orange', () => {
    const r = rollupWithSources({ 'out-of-supply': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'Carol',
    });
    expect(out.stripeColor).toBe('#EA580C');
    expect(out.html).toContain('SUPPLY');
  });

  it('renders a sleeping-window stripe in purple', () => {
    const r = rollupWithSources({ 'sleeping-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'Dan',
    });
    expect(out.stripeColor).toBe('#7C3AED');
    expect(out.html).toContain('SLEEP');
  });

  it('renders a recent-pattern stripe in yellow', () => {
    const r = rollupWithSources({ 'recent-pattern': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'Erin',
    });
    expect(out.stripeColor).toBe('#CA8A04');
    expect(out.html).toContain('PATTERN');
  });

  it('uses the no-dominant gray when no sources are present', () => {
    const out = renderRefusalReasonSpineWithColorCoding(EMPTY_ROLLUP, {
      patientName: 'Empty',
    });
    expect(out.dominantSource).toBeNull();
    expect(out.stripeColor).toBe('#6B7280');
    expect(out.sourceTag).toBeNull();
  });
});

describe('renderRefusalReasonSpineWithColorCoding — placement', () => {
  it('emits a horizontal top stripe by default', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
    });
    expect(out.html).toContain('top:0');
    expect(out.html).toContain('left:0');
    expect(out.html).toContain('right:0');
    expect(out.html).toContain('height:4mm');
  });

  it('emits a bottom stripe when placement=bottom', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
      stripePlacement: 'bottom',
    });
    expect(out.html).toContain('bottom:0');
    expect(out.html).toContain('height:4mm');
  });

  it('emits a vertical left stripe when placement=left', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
      stripePlacement: 'left',
    });
    expect(out.html).toContain('left:0');
    expect(out.html).toContain('width:4mm');
  });

  it('emits a vertical right stripe when placement=right', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
      stripePlacement: 'right',
    });
    expect(out.html).toContain('right:0');
    expect(out.html).toContain('width:4mm');
  });

  it('respects a custom stripe thickness', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
      stripeThicknessMm: 8,
    });
    expect(out.html).toContain('height:8mm');
  });

  it('clamps thickness to [1, 20]', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const tooSmall = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
      stripeThicknessMm: 0.1,
    });
    expect(tooSmall.html).toContain('height:1mm');
    const tooLarge = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
      stripeThicknessMm: 100,
    });
    expect(tooLarge.html).toContain('height:20mm');
  });
});

describe('renderRefusalReasonSpineWithColorCoding — verbal tag', () => {
  it('emits the verbal tag by default for a known source', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
    });
    expect(out.sourceTag).toBe('NPO');
    expect(out.html).toContain('NPO');
  });

  it('omits the verbal tag when includeSourceTag=false', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
      includeSourceTag: false,
    });
    expect(out.sourceTag).toBeNull();
    expect(out.html).not.toContain('class="spine-color-tag"');
  });

  it('emits no tag when no dominant source exists, regardless of includeSourceTag', () => {
    const out = renderRefusalReasonSpineWithColorCoding(EMPTY_ROLLUP, {
      patientName: 'X',
      includeSourceTag: true,
    });
    expect(out.sourceTag).toBeNull();
  });
});

describe('renderRefusalReasonSpineWithColorCoding — monochrome fallback', () => {
  it('skips the color stripe but keeps the verbal tag', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
      monochromeFallback: true,
    });
    expect(out.stripeColor).toBeNull();
    expect(out.html).not.toContain('background:#DC2626');
    expect(out.sourceTag).toBe('NPO');
    expect(out.html).toContain('NPO');
    expect(out.monochromeFallbackApplied).toBe(true);
  });

  it('emits black tag text under monochrome fallback', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
      monochromeFallback: true,
    });
    expect(out.html).toContain('color:#000');
    expect(out.html).not.toContain('text-shadow:0 0 1pt');
  });

  it('emits no stripe AND no tag for empty rollup under monochrome', () => {
    const out = renderRefusalReasonSpineWithColorCoding(EMPTY_ROLLUP, {
      patientName: 'X',
      monochromeFallback: true,
    });
    expect(out.stripeColor).toBeNull();
    expect(out.sourceTag).toBeNull();
    expect(out.html).not.toContain('class="spine-color-stripe"');
    expect(out.html).not.toContain('class="spine-color-tag"');
  });
});

describe('renderRefusalReasonSpineWithColorCoding — custom palette', () => {
  it('overrides specific palette entries while preserving defaults', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
      palette: { 'npo-window': '#FF00FF' },
    });
    expect(out.stripeColor).toBe('#FF00FF');
    expect(out.html).toContain('background:#FF00FF');
  });

  it('overrides the no-dominant gray when no source is present', () => {
    const out = renderRefusalReasonSpineWithColorCoding(EMPTY_ROLLUP, {
      patientName: 'X',
      palette: { 'no-dominant': '#00FF00' },
    });
    expect(out.stripeColor).toBe('#00FF00');
  });
});

describe('renderRefusalReasonSpineWithColorCoding — base spine composition', () => {
  it('preserves the underlying spine HTML structure (patient name, border)', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'Alice',
    });
    expect(out.html).toContain('Alice');
    expect(out.html).toContain('<section');
    expect(out.widthCm).toBe(3.5);
    expect(out.heightCm).toBe(1.5);
  });

  it('preserves the rotation from the base spine', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
      rotationDegrees: 90,
    });
    expect(out.rotationDegrees).toBe(90);
    expect(out.html).toContain('rotate(90deg)');
  });

  it('splices the color stripe INSIDE the <section> wrapper', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
    });
    // Stripe element appears AFTER the section opening tag.
    const sectionOpenIdx = out.html.indexOf('<section');
    const sectionCloseIdx = out.html.indexOf('</section>');
    const stripeIdx = out.html.indexOf('class="spine-color-stripe"');
    expect(stripeIdx).toBeGreaterThan(sectionOpenIdx);
    expect(stripeIdx).toBeLessThan(sectionCloseIdx);
  });
});

describe('summarizeSpineColorCoding', () => {
  it('reports the source + stripe color for a normal stripe', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
    });
    const s = summarizeSpineColorCoding(out);
    expect(s).toContain('npo-window');
    expect(s).toContain('#DC2626');
    expect(s).toContain('tag=NPO');
  });

  it('reports no-dominant fallback', () => {
    const out = renderRefusalReasonSpineWithColorCoding(EMPTY_ROLLUP, {
      patientName: 'X',
    });
    const s = summarizeSpineColorCoding(out);
    expect(s).toContain('no-dominant');
    expect(s).toContain('#6B7280');
  });

  it('reports monochrome fallback distinctly', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const out = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
      monochromeFallback: true,
    });
    const s = summarizeSpineColorCoding(out);
    expect(s).toContain('monochrome fallback');
    expect(s).toContain('tag=NPO');
    expect(s).toContain('no stripe');
  });

  it('reports monochrome fallback on empty rollup distinctly', () => {
    const out = renderRefusalReasonSpineWithColorCoding(EMPTY_ROLLUP, {
      patientName: 'X',
      monochromeFallback: true,
    });
    const s = summarizeSpineColorCoding(out);
    expect(s).toContain('monochrome fallback');
    expect(s).toContain('no dominant source');
  });
});

describe('renderRefusalReasonSpineWithColorCoding — determinism', () => {
  it('is byte-identical for identical inputs', () => {
    const r = rollupWithSources({ 'npo-window': 5 });
    const a = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
    });
    const b = renderRefusalReasonSpineWithColorCoding(r, {
      patientName: 'X',
    });
    expect(a.html).toBe(b.html);
    expect(a.stripeColor).toBe(b.stripeColor);
  });
});
