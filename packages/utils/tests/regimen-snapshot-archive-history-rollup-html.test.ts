import { describe, it, expect } from 'vitest';
import {
  renderRegimenHistoryRollupHtml,
  renderRegimenHistoryRollupTableOnly,
} from '../src/regimen-snapshot-archive-history-rollup-html';
import {
  rollupRegimenHistory,
} from '../src/regimen-snapshot-archive-history-rollup';
import {
  buildRegimenSnapshot,
  type RegimenSnapshotInputItem,
  type SignedRegimenSnapshot,
} from '../src/regimen-snapshot-archive';
import type { Medication, Schedule } from '@med/types';

const SECRET = 'a-very-long-test-secret-that-meets-min-bytes-please';

function med(
  overrides: Partial<Medication> & { id: string; name: string; strength?: string },
): Medication {
  return {
    id: overrides.id,
    userId: '00000000-0000-0000-0000-000000000001',
    drugId: overrides.drugId ?? 'd-1',
    name: overrides.name,
    strength: overrides.strength ?? '5 mg',
    form: overrides.form ?? 'tablet',
    startDate: overrides.startDate ?? '2026-01-01',
    endDate: overrides.endDate ?? null,
    active: overrides.active ?? true,
    supplyRemaining: overrides.supplyRemaining ?? 30,
    dosesPerRefill: overrides.dosesPerRefill ?? 30,
  } as Medication;
}

function sched(id: string, medicationId: string): Schedule {
  return {
    id,
    medicationId,
    kind: 'daily',
    times: ['08:00'],
    daysOfWeek: [],
    startsAt: '2026-01-01T08:00:00.000Z',
    endsAt: null,
    enabled: true,
  } as Schedule;
}

function items(specs: { id: string; name: string; strength?: string }[]): RegimenSnapshotInputItem[] {
  return specs.map((s) => ({
    medication: med(s),
    schedules: [sched(`s-${s.id}`, s.id)],
  }));
}

async function makeSnap(
  snapshotId: string,
  takenAt: string,
  specs: { id: string; name: string; strength?: string }[],
): Promise<SignedRegimenSnapshot> {
  return buildRegimenSnapshot({
    snapshotId,
    patientId: '22222222-2222-2222-2222-222222222222',
    patientName: 'Test Patient',
    items: items(specs),
    secret: SECRET,
    takenAt: new Date(takenAt),
  });
}

describe('renderRegimenHistoryRollupHtml — basic shape', () => {
  it('renders header, timeline, table for a typical rollup', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '5 mg' },
      { id: 'm-metf', name: 'Metformin', strength: '500 mg' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '10 mg' },
      { id: 'm-metf', name: 'Metformin', strength: '500 mg' },
      { id: 'm-atorv', name: 'Atorvastatin', strength: '20 mg' },
    ]);
    const s3 = await makeSnap('s3', '2026-07-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '20 mg' },
      { id: 'm-atorv', name: 'Atorvastatin', strength: '20 mg' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload, s3.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup, { patientName: 'Jane Doe' });
    expect(out.html).toContain('Jane Doe — regimen history');
    expect(out.html).toContain('Amlodipine');
    expect(out.html).toContain('Metformin');
    expect(out.html).toContain('Atorvastatin');
    expect(out.html).toContain('Regimen size over time');
    expect(out.medicationOrder.length).toBe(3);
  });

  it('renders generic title when patientName missing', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).toContain('Regimen history');
    expect(out.html).not.toContain(' — regimen history');
  });

  it('renders snapshot count and event count in subtitle', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
      { id: 'm-metf', name: 'Metformin' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '10 mg' },
      { id: 'm-atorv', name: 'Atorvastatin' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).toContain('2 snapshots');
    expect(out.html).toContain('3 medications');
  });

  it('renders empty-state message for an empty rollup', () => {
    const rollup = rollupRegimenHistory([]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).toContain('No medications in this rollup.');
    expect(out.medicationOrder).toEqual([]);
    expect(out.medicationOverflow).toBe(0);
  });

  it('renders singular forms for count=1', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).toContain('1 snapshot ');
    expect(out.html).toContain('1 medication ');
    expect(out.html).toContain('1 event');
  });
});

describe('renderRegimenHistoryRollupHtml — event chips', () => {
  it('renders ADDED chip in green for additions', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
      { id: 'm-metf', name: 'Metformin' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).toContain('ADDED');
    expect(out.html).toContain('#dcfce7');
  });

  it('renders REMOVED chip in red for removals', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
      { id: 'm-metf', name: 'Metformin' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).toContain('REMOVED');
    expect(out.html).toContain('#fee2e2');
  });

  it('renders CHANGE chip in yellow for strength changes', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '5 mg' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '10 mg' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).toContain('CHANGE');
    expect(out.html).toContain('#fef3c7');
    expect(out.html).toContain('5 mg → 10 mg');
  });

  it('shows ACTIVE chip for present meds and REMOVED chip for absent', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
      { id: 'm-metf', name: 'Metformin' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    // Amlodipine still active in last snap; Metformin removed
    expect(out.html).toMatch(/Amlodipine.*ACTIVE/);
    expect(out.html).toMatch(/Metformin.*REMOVED/);
  });

  it('shows CYCLED chip for medications removed then re-added', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
      { id: 'm-metf', name: 'Metformin' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const s3 = await makeSnap('s3', '2026-07-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
      { id: 'm-metf', name: 'Metformin' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload, s3.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).toContain('CYCLED');
    expect(out.html).toContain('clinical review recommended');
  });

  it('omits CYCLED banner when no medications cycled', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
      { id: 'm-metf', name: 'Metformin' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).not.toContain('CYCLED');
    expect(out.html).not.toContain('clinical review recommended');
  });
});

describe('renderRegimenHistoryRollupHtml — sort modes', () => {
  async function rollupWithFour() {
    // amlo: Jan -> Jul (longest tenure, several events)
    // metf: Jan -> Apr then removed (medium tenure)
    // atorv: Apr -> Jul (shorter tenure)
    // warf: Jul only (newest)
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '5 mg' },
      { id: 'm-metf', name: 'Metformin' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '10 mg' },
      { id: 'm-atorv', name: 'Atorvastatin' },
    ]);
    const s3 = await makeSnap('s3', '2026-07-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '20 mg' },
      { id: 'm-atorv', name: 'Atorvastatin' },
      { id: 'm-warf', name: 'Warfarin' },
    ]);
    return rollupRegimenHistory([s1.payload, s2.payload, s3.payload]);
  }

  it('default tenure sort puts longest-tenure first', async () => {
    const out = renderRegimenHistoryRollupHtml(await rollupWithFour());
    expect(out.medicationOrder[0]).toBe('m-amlo');
  });

  it('event-count sort puts most-events first', async () => {
    const out = renderRegimenHistoryRollupHtml(await rollupWithFour(), {
      sort: 'event-count',
    });
    expect(out.medicationOrder[0]).toBe('m-amlo');
  });

  it('recent sort puts most-recently-changed first', async () => {
    const out = renderRegimenHistoryRollupHtml(await rollupWithFour(), {
      sort: 'recent',
    });
    // Three meds share a 2026-07-01 most-recent event (amlo, atorv, warf).
    // Tie-break is alphabetical by name (Amlodipine, Atorvastatin, Warfarin).
    // Metformin (removed 2026-04) is the oldest most-recent event, so it
    // comes last.
    expect(out.medicationOrder[0]).toBe('m-amlo');
    expect(out.medicationOrder.indexOf('m-metf')).toBe(3);
  });

  it('sort label appears in subtitle', async () => {
    const out = renderRegimenHistoryRollupHtml(await rollupWithFour(), {
      sort: 'event-count',
    });
    expect(out.html).toContain('sort: event-count');
  });
});

describe('renderRegimenHistoryRollupHtml — medication limit', () => {
  it('caps medications and shows overflow row', async () => {
    const specs = Array.from({ length: 12 }, (_, i) => ({
      id: `m-${i.toString().padStart(2, '0')}`,
      name: `Med${String.fromCharCode(65 + i)}`,
    }));
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', specs);
    const rollup = rollupRegimenHistory([s1.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup, { medicationLimit: 5 });
    expect(out.medicationOrder.length).toBe(5);
    expect(out.medicationOverflow).toBe(7);
    expect(out.html).toContain('…and 7 more medications not shown');
  });

  it('singular overflow message for 1 hidden', async () => {
    const specs = Array.from({ length: 6 }, (_, i) => ({
      id: `m-${i.toString().padStart(2, '0')}`,
      name: `Med${i.toString().padStart(2, '0')}`,
    }));
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', specs);
    const rollup = rollupRegimenHistory([s1.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup, { medicationLimit: 5 });
    expect(out.html).toContain('…and 1 more medication not shown');
  });

  it('default medicationLimit is 50', async () => {
    const specs = Array.from({ length: 50 }, (_, i) => ({
      id: `m-${i.toString().padStart(2, '0')}`,
      name: `Med${i.toString().padStart(2, '0')}`,
    }));
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', specs);
    const rollup = rollupRegimenHistory([s1.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.medicationOrder.length).toBe(50);
    expect(out.medicationOverflow).toBe(0);
  });
});

describe('renderRegimenHistoryRollupHtml — events per medication limit', () => {
  it('caps events per medication and shows earlier-overflow note', async () => {
    const snaps: SignedRegimenSnapshot[] = [];
    for (let i = 0; i < 10; i++) {
      snaps.push(
        await makeSnap(
          `s${i + 1}`,
          `2026-0${i + 1}-01T00:00:00.000Z`.replace(/-0(\d\d)/, (_, n) => `-${parseInt(n).toString().padStart(2, '0')}`),
          [{ id: 'm-amlo', name: 'Amlodipine', strength: `${i + 1} mg` }],
        ),
      );
    }
    const rollup = rollupRegimenHistory(snaps.map((s) => s.payload));
    const out = renderRegimenHistoryRollupHtml(rollup, { eventsPerMedicationLimit: 3 });
    expect(out.html).toContain('…and');
    expect(out.html).toContain('earlier');
  });

  it('does not show overflow when events fit', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '5 mg' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '10 mg' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup, { eventsPerMedicationLimit: 8 });
    expect(out.html).not.toContain('earlier');
  });
});

describe('renderRegimenHistoryRollupHtml — timeline strip', () => {
  it('renders timeline by default', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
      { id: 'm-metf', name: 'Metformin' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
      { id: 'm-metf', name: 'Metformin' },
      { id: 'm-atorv', name: 'Atorvastatin' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).toContain('Regimen size over time');
  });

  it('omits timeline when includeTimeline=false', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
      { id: 'm-metf', name: 'Metformin' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup, { includeTimeline: false });
    expect(out.html).not.toContain('Regimen size over time');
  });

  it('shows +N for positive deltas and -N for negative', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
      { id: 'm-metf', name: 'Metformin' },
    ]);
    const s3 = await makeSnap('s3', '2026-07-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload, s3.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).toContain('+1');
    expect(out.html).toContain('-1');
  });

  it('shows ±0 for unchanged sizes (strength changes only)', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '5 mg' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '10 mg' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).toContain('±0');
  });

  it('omits timeline rows entirely when timeline is empty', () => {
    const rollup = rollupRegimenHistory([]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).not.toContain('Regimen size over time');
  });
});

describe('renderRegimenHistoryRollupHtml — HTML escaping', () => {
  it('escapes medication name with HTML special chars', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-x', name: '<script>alert("x")</script>' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).not.toContain('<script>alert');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('&quot;');
  });

  it('escapes patient name with HTML special chars', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup, {
      patientName: "O'Brien & Co. <test>",
    });
    expect(out.html).not.toContain('<test>');
    expect(out.html).toContain('&lt;test&gt;');
    expect(out.html).toContain('&amp;');
    expect(out.html).toContain('&#39;');
  });

  it('escapes strength values with special chars', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-x', name: 'Med', strength: '<5mg>' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-x', name: 'Med', strength: '<10mg>' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).toContain('&lt;5mg&gt; → &lt;10mg&gt;');
  });
});

describe('renderRegimenHistoryRollupHtml — brand colour', () => {
  it('uses default brand color (#0f766e)', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    expect(out.html).toContain('#0f766e');
  });

  it('respects custom brandColor', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup, { brandColor: '#ff0000' });
    expect(out.html).toContain('#ff0000');
  });

  it('omits brand accent when brandColor=null', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup, {
      brandColor: null,
      includeTimeline: false,
    });
    // Header accent ribbon dropped — no border-bottom for the title
    expect(out.html).not.toMatch(/border-bottom:3px solid #0f766e/);
  });

  it('respects custom fontFamily', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup, { fontFamily: 'Comic Sans' });
    expect(out.html).toContain('Comic Sans');
  });
});

describe('renderRegimenHistoryRollupTableOnly', () => {
  it('omits timeline strip', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
      { id: 'm-metf', name: 'Metformin' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload]);
    const out = renderRegimenHistoryRollupTableOnly(rollup);
    expect(out.html).not.toContain('Regimen size over time');
  });

  it('still includes header and table', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload]);
    const out = renderRegimenHistoryRollupTableOnly(rollup, { patientName: 'Jane' });
    expect(out.html).toContain('Jane — regimen history');
    expect(out.html).toContain('Amlodipine');
  });
});

describe('renderRegimenHistoryRollupHtml — events ordering', () => {
  it('events display newest-first inside each cell', async () => {
    const s1 = await makeSnap('s1', '2026-01-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '5 mg' },
    ]);
    const s2 = await makeSnap('s2', '2026-04-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '10 mg' },
    ]);
    const s3 = await makeSnap('s3', '2026-07-01T00:00:00.000Z', [
      { id: 'm-amlo', name: 'Amlodipine', strength: '20 mg' },
    ]);
    const rollup = rollupRegimenHistory([s1.payload, s2.payload, s3.payload]);
    const out = renderRegimenHistoryRollupHtml(rollup);
    const idx20 = out.html.indexOf('10 mg → 20 mg');
    const idx10 = out.html.indexOf('5 mg → 10 mg');
    expect(idx20).toBeGreaterThan(-1);
    expect(idx10).toBeGreaterThan(-1);
    expect(idx20).toBeLessThan(idx10);
  });
});
