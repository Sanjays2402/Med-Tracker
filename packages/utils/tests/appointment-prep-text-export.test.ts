import { describe, it, expect } from 'vitest';
import {
  buildAppointmentPrepTextExport,
  buildAppointmentPrepTextExportNoBorder,
} from '../src/appointment-prep-text-export';
import { buildAppointmentPrepChecklist } from '../src/appointment-prep-checklist';
import type { Medication } from '@med/types';
import type { AdverseEventRecord } from '../src/adverse-event-log';
import type { LabWindow } from '../src/lab-window-tracker';

function med(o: Partial<Medication> & { id: string; name: string }): Medication {
  return {
    id: o.id,
    userId: '00000000-0000-0000-0000-000000000001',
    drugId: o.drugId ?? 'd-1',
    name: o.name,
    strength: o.strength ?? '10 mg',
    form: o.form ?? 'tablet',
    startDate: o.startDate ?? '2026-01-01',
    endDate: o.endDate ?? null,
    active: o.active ?? true,
    supplyRemaining: o.supplyRemaining ?? 30,
    dosesPerRefill: o.dosesPerRefill ?? 30,
    ...(o.instructions !== undefined ? { instructions: o.instructions } : {}),
  } as Medication;
}

function adverse(o: Partial<AdverseEventRecord> & { description: string; onsetAt: string }): AdverseEventRecord {
  return {
    id: o.id ?? 'ev-' + o.onsetAt,
    description: o.description,
    tags: o.tags ?? ['rash'],
    onsetAt: o.onsetAt,
    reportedAt: o.reportedAt ?? o.onsetAt,
    severity: o.severity ?? 'minor',
    severityRationale: o.severityRationale ?? 'tag-default',
    proximities: o.proximities ?? [],
    suspectMedications: o.suspectMedications ?? [],
    escalate: o.escalate ?? false,
    summary: o.summary ?? '',
  };
}

function lab(o: Partial<LabWindow> & { medicationName: string; labCode: string; status: LabWindow['status'] }): LabWindow {
  return {
    medicationId: o.medicationId ?? 'm-x',
    medicationName: o.medicationName,
    labCode: o.labCode,
    labName: o.labName ?? o.labCode,
    status: o.status,
    daysUntilDue: o.daysUntilDue ?? 0,
    lastDrawnAt: o.lastDrawnAt ?? null,
    nextDueAt: o.nextDueAt ?? null,
    message: o.message ?? `${o.status} ${o.labCode}`,
  };
}

function checklist(over: Partial<Parameters<typeof buildAppointmentPrepChecklist>[0]> = {}) {
  return buildAppointmentPrepChecklist({
    patientName: 'Jane Doe',
    visit: { dateIso: '2026-06-25', clinician: 'Dr. Smith' },
    medications: [med({ id: 'm1', name: 'Lisinopril' }), med({ id: 'm2', name: 'Metformin' })],
    ...over,
  });
}

describe('buildAppointmentPrepTextExport — basic shape', () => {
  it('produces a bordered card with default width 40', () => {
    const c = checklist();
    const out = buildAppointmentPrepTextExport(c);
    const lines = out.text.split('\n');
    expect(out.width).toBe(40);
    for (const line of lines) {
      expect(line.length).toBe(40);
    }
    expect(lines[0]?.startsWith('+')).toBe(true);
    expect(lines[lines.length - 1]?.startsWith('+')).toBe(true);
  });

  it('first content line contains the centered patient name', () => {
    const c = checklist();
    const out = buildAppointmentPrepTextExport(c);
    const lines = out.text.split('\n');
    expect(lines[1]).toContain('Jane Doe');
    const inner = lines[1]!.slice(1, -1);
    const leftPad = inner.length - inner.trimStart().length;
    const rightPad = inner.length - inner.trimEnd().length;
    expect(Math.abs(leftPad - rightPad)).toBeLessThanOrEqual(1);
  });

  it('renders visit date + clinician on the second content line', () => {
    const c = checklist();
    const out = buildAppointmentPrepTextExport(c);
    expect(out.text).toContain('2026-06-25');
    expect(out.text).toContain('Dr. Smith');
  });

  it('includes counts row with med/adv/labs/refills counts', () => {
    const c = checklist();
    const out = buildAppointmentPrepTextExport(c);
    expect(out.text).toContain('Meds 2');
    expect(out.text).toContain('Adv 0');
    expect(out.text).toContain('Labs 0');
    expect(out.text).toContain('Rfl 0');
  });

  it('omits border when border=false', () => {
    const c = checklist();
    const out = buildAppointmentPrepTextExport(c, { border: false });
    const lines = out.text.split('\n');
    expect(lines[0]?.startsWith('+')).toBe(false);
    expect(lines[0]).toContain('Jane Doe');
  });
});

describe('buildAppointmentPrepTextExport — urgent items', () => {
  it('surfaces the worst lab as an OVERDUE/DUE SOON line', () => {
    const labs = [
      lab({ medicationName: 'Warfarin', labCode: 'INR', status: 'overdue', daysUntilDue: -5 }),
    ];
    const c = checklist({ labs });
    const out = buildAppointmentPrepTextExport(c);
    expect(out.text).toContain('LAB OVERDUE');
    expect(out.text).toContain('INR');
  });

  it('surfaces only the WORST lab (overdue beats due-soon)', () => {
    const labs = [
      lab({ medicationName: 'Warfarin', labCode: 'INR', status: 'overdue', daysUntilDue: -5 }),
      lab({ medicationName: 'Atorvastatin', labCode: 'LFT', status: 'due-soon', daysUntilDue: 3 }),
    ];
    const c = checklist({ labs });
    const out = buildAppointmentPrepTextExport(c);
    expect(out.text).toContain('INR');
    expect(out.text).toContain('Labs 2');
  });

  it('renders only urgent refills (default <= 3 days of supply)', () => {
    const refills = [
      { medicationId: 'm1', medicationName: 'Lisinopril', daysOfSupplyLeft: 2 },
      { medicationId: 'm2', medicationName: 'Metformin', daysOfSupplyLeft: 14 },
    ];
    const c = checklist({ refillsNeeded: refills });
    const out = buildAppointmentPrepTextExport(c);
    expect(out.text).toContain('RFL 2d');
    expect(out.text).toContain('Lisinopril');
    expect(out.text).not.toContain('14d');
  });

  it('shows OUT when daysOfSupplyLeft <= 0', () => {
    const refills = [
      { medicationId: 'm1', medicationName: 'Lisinopril', daysOfSupplyLeft: 0 },
    ];
    const c = checklist({ refillsNeeded: refills });
    const out = buildAppointmentPrepTextExport(c);
    expect(out.text).toContain('RFL OUT');
    expect(out.text).not.toContain('-1d');
  });

  it('surfaces top adverse event only when severity >= major', () => {
    const ae = [
      adverse({ description: 'Severe rash', onsetAt: '2026-06-20T08:00:00Z', severity: 'major' }),
    ];
    const c = checklist({ adverseEvents: ae });
    const out = buildAppointmentPrepTextExport(c);
    expect(out.text).toContain('AE MAJ');
    expect(out.text).toContain('Severe rash');
  });

  it('does NOT surface minor/moderate adverse events', () => {
    const ae = [adverse({ description: 'Mild headache', onsetAt: '2026-06-20T08:00:00Z', severity: 'minor' })];
    const c = checklist({ adverseEvents: ae });
    const out = buildAppointmentPrepTextExport(c);
    expect(out.text).not.toContain('AE');
    expect(out.text).not.toContain('headache');
  });

  it('respects custom urgentItemLimit', () => {
    const refills = [
      { medicationId: 'm1', medicationName: 'Med1', daysOfSupplyLeft: 0 },
      { medicationId: 'm2', medicationName: 'Med2', daysOfSupplyLeft: 1 },
      { medicationId: 'm3', medicationName: 'Med3', daysOfSupplyLeft: 2 },
      { medicationId: 'm4', medicationName: 'Med4', daysOfSupplyLeft: 3 },
    ];
    const c = checklist({ refillsNeeded: refills });
    const out = buildAppointmentPrepTextExport(c, { urgentItemLimit: 2, maxLines: 20 });
    expect(out.text).toContain('Med1');
    expect(out.text).toContain('Med2');
    expect(out.text).not.toContain('Med3');
  });

  it('respects custom urgentRefillDaysOfSupply', () => {
    const refills = [
      { medicationId: 'm1', medicationName: 'Med1', daysOfSupplyLeft: 6 },
      { medicationId: 'm2', medicationName: 'Med2', daysOfSupplyLeft: 8 },
    ];
    const c = checklist({ refillsNeeded: refills });
    const out = buildAppointmentPrepTextExport(c, { urgentRefillDaysOfSupply: 7 });
    expect(out.text).toContain('Med1');
    expect(out.text).not.toContain('Med2');
  });
});

describe('buildAppointmentPrepTextExport — truncation', () => {
  it('truncates long names with an ellipsis', () => {
    const c = checklist({ patientName: 'A'.repeat(100) });
    const out = buildAppointmentPrepTextExport(c);
    expect(out.text).toContain('\u2026');
  });

  it('drops footer first, then urgent rows when over maxLines', () => {
    const refills = Array.from({ length: 10 }, (_, i) => ({
      medicationId: `m${i}`,
      medicationName: `Med${i}`,
      daysOfSupplyLeft: 0,
    }));
    const c = checklist({ refillsNeeded: refills, lastVisitIso: '2026-05-01' });
    const out = buildAppointmentPrepTextExport(c, { maxLines: 8, urgentItemLimit: 10 });
    expect(out.truncated).toBe(true);
    expect(out.droppedItems).toBeGreaterThan(0);
    expect(out.text).not.toContain('Since visit');
  });

  it('NEVER drops the counts row', () => {
    const refills = Array.from({ length: 20 }, (_, i) => ({
      medicationId: `m${i}`,
      medicationName: `Med${i}`,
      daysOfSupplyLeft: 0,
    }));
    const c = checklist({ refillsNeeded: refills });
    const out = buildAppointmentPrepTextExport(c, { maxLines: 8, urgentItemLimit: 20 });
    expect(out.text).toContain('Meds 2');
  });

  it('respects maxLines exactly (incl. border when border=true)', () => {
    const c = checklist();
    const out = buildAppointmentPrepTextExport(c, { maxLines: 6 });
    expect(out.lineCount).toBeLessThanOrEqual(6);
  });

  it('respects maxLines when border=false', () => {
    const c = checklist();
    const out = buildAppointmentPrepTextExport(c, { maxLines: 4, border: false });
    expect(out.lineCount).toBeLessThanOrEqual(4);
  });
});

describe('buildAppointmentPrepTextExport — width', () => {
  it('respects custom width', () => {
    const c = checklist();
    const out = buildAppointmentPrepTextExport(c, { width: 32 });
    expect(out.width).toBe(32);
    for (const line of out.text.split('\n')) {
      expect(line.length).toBe(32);
    }
  });

  it('clamps width to a minimum of 20', () => {
    const c = checklist();
    const out = buildAppointmentPrepTextExport(c, { width: 10 });
    expect(out.width).toBe(20);
  });
});

describe('buildAppointmentPrepTextExport — footer', () => {
  it('includes "Since visit" footer when lastVisitIso provided and room exists', () => {
    const c = checklist({ lastVisitIso: '2026-05-01' });
    const out = buildAppointmentPrepTextExport(c);
    expect(out.text).toContain('Since visit 2026-05-01');
  });

  it('omits "Since visit" when lastVisitIso not provided', () => {
    const c = checklist();
    const out = buildAppointmentPrepTextExport(c);
    expect(out.text).not.toContain('Since visit');
  });
});

describe('buildAppointmentPrepTextExport — reason line', () => {
  it('includes Re: line when reasonForVisit provided', () => {
    const c = checklist({
      visit: { dateIso: '2026-06-25', clinician: 'Dr. Smith', reasonForVisit: 'BP follow-up' },
    });
    const out = buildAppointmentPrepTextExport(c, { maxLines: 12 });
    expect(out.text).toContain('Re: BP follow-up');
  });

  it('truncates long reason text', () => {
    const c = checklist({
      visit: {
        dateIso: '2026-06-25',
        reasonForVisit: 'a very long reason that should be truncated when it exceeds the card width',
      },
    });
    const out = buildAppointmentPrepTextExport(c, { width: 32, maxLines: 12 });
    expect(out.text).toContain('\u2026');
  });
});

describe('buildAppointmentPrepTextExportNoBorder', () => {
  it('returns same content with border off', () => {
    const c = checklist();
    const out = buildAppointmentPrepTextExportNoBorder(c);
    const lines = out.text.split('\n');
    expect(lines[0]?.startsWith('+')).toBe(false);
    expect(out.text).toContain('Jane Doe');
  });
});

describe('end-to-end realistic checklist', () => {
  it('produces a wallet card with all the canonical front-desk signals', () => {
    const meds = [
      med({ id: 'warfarin', name: 'Warfarin' }),
      med({ id: 'lisinopril', name: 'Lisinopril' }),
      med({ id: 'atorvastatin', name: 'Atorvastatin' }),
    ];
    const ae = [
      adverse({
        description: 'Major bruising',
        onsetAt: '2026-06-20T08:00:00Z',
        severity: 'major',
        suspectMedications: ['Warfarin'],
      }),
    ];
    const labs = [
      lab({ medicationName: 'Warfarin', labCode: 'INR', status: 'overdue', daysUntilDue: -8 }),
    ];
    const refills = [
      { medicationId: 'lisinopril', medicationName: 'Lisinopril', daysOfSupplyLeft: 0 },
    ];
    const c = buildAppointmentPrepChecklist({
      patientName: 'Mary Smith',
      visit: { dateIso: '2026-06-25', clinician: 'Dr. Smith', reasonForVisit: 'INR follow-up' },
      lastVisitIso: '2026-05-01',
      medications: meds,
      adverseEvents: ae,
      labs,
      refillsNeeded: refills,
    });
    const out = buildAppointmentPrepTextExport(c);
    expect(out.text).toContain('Mary Smith');
    expect(out.text).toContain('LAB OVERDUE');
    expect(out.text).toContain('AE MAJ');
    expect(out.text).toContain('RFL OUT');
    expect(out.lineCount).toBeLessThanOrEqual(10);
  });
});
