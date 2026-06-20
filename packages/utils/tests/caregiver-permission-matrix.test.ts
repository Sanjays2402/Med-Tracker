import { describe, it, expect } from 'vitest';
import {
  buildPermissionMatrix,
  canCaregiverDo,
  caregiverCapabilitiesFor,
  medicationsCaregiverCan,
  summarizePermissions,
  type CaregiverPermissionInput,
} from '../src/caregiver-permission-matrix';

function makeInput(overrides: Partial<CaregiverPermissionInput['share']>, now = new Date(2026, 5, 1)): CaregiverPermissionInput {
  return {
    share: {
      id: 'c-1',
      scopes: ['view-meds', 'view-adherence'],
      expiresAt: null,
      ...overrides,
    } as CaregiverPermissionInput['share'],
    now,
  };
}

describe('buildPermissionMatrix', () => {
  it('maps view-meds scope to view-medications capability', () => {
    const m = buildPermissionMatrix(makeInput({ scopes: ['view-meds'] }));
    expect(m.expired).toBe(false);
    expect(m.global.has('view-medications')).toBe(true);
    expect(m.global.has('view-adherence')).toBe(false);
  });

  it('unions all scope-derived capabilities', () => {
    const m = buildPermissionMatrix(
      makeInput({ scopes: ['view-meds', 'view-adherence', 'view-refills'] }),
    );
    expect(m.global.has('view-medications')).toBe(true);
    expect(m.global.has('view-adherence')).toBe(true);
    expect(m.global.has('view-refills')).toBe(true);
  });

  it('marks the matrix expired when expiresAt is past', () => {
    const m = buildPermissionMatrix({
      share: {
        id: 'c-1',
        scopes: ['view-meds'],
        expiresAt: new Date(2026, 0, 1).toISOString(),
      } as CaregiverPermissionInput['share'],
      now: new Date(2026, 5, 1),
    });
    expect(m.expired).toBe(true);
    expect(m.global.size).toBe(0);
  });

  it('does not mark the matrix expired when expiresAt is in the future', () => {
    const m = buildPermissionMatrix({
      share: {
        id: 'c-1',
        scopes: ['view-meds'],
        expiresAt: new Date(2027, 0, 1).toISOString(),
      } as CaregiverPermissionInput['share'],
      now: new Date(2026, 5, 1),
    });
    expect(m.expired).toBe(false);
  });

  it('applies a grant override to a specific medication', () => {
    const m = buildPermissionMatrix({
      ...makeInput({ scopes: ['view-meds'] }),
      overrides: [{ medicationId: 'm-1', grant: ['log-doses'] }],
    });
    expect(canCaregiverDo(m, 'log-doses', 'm-1')).toBe(true);
    expect(canCaregiverDo(m, 'log-doses', 'm-2')).toBe(false);
    expect(canCaregiverDo(m, 'view-medications', 'm-1')).toBe(true);
  });

  it('applies a deny override (deny wins over scope)', () => {
    const m = buildPermissionMatrix({
      ...makeInput({ scopes: ['view-meds', 'view-adherence'] }),
      overrides: [{ medicationId: 'm-1', deny: ['view-adherence'] }],
    });
    expect(canCaregiverDo(m, 'view-adherence', 'm-1')).toBe(false);
    expect(canCaregiverDo(m, 'view-adherence', 'm-2')).toBe(true);
    expect(canCaregiverDo(m, 'view-medications', 'm-1')).toBe(true);
  });

  it('honors deny over grant when both are listed for the same med', () => {
    const m = buildPermissionMatrix({
      ...makeInput({ scopes: ['view-meds'] }),
      overrides: [
        { medicationId: 'm-1', grant: ['log-doses', 'edit-schedule'], deny: ['edit-schedule'] },
      ],
    });
    expect(canCaregiverDo(m, 'log-doses', 'm-1')).toBe(true);
    expect(canCaregiverDo(m, 'edit-schedule', 'm-1')).toBe(false);
  });
});

describe('canCaregiverDo', () => {
  it('returns false for any capability when the matrix is expired', () => {
    const m = buildPermissionMatrix({
      share: {
        id: 'c-1',
        scopes: ['view-meds'],
        expiresAt: new Date(2020, 0, 1).toISOString(),
      } as CaregiverPermissionInput['share'],
      now: new Date(2026, 5, 1),
    });
    expect(canCaregiverDo(m, 'view-medications')).toBe(false);
    expect(canCaregiverDo(m, 'log-doses', 'm-1')).toBe(false);
  });

  it('falls back to global when no per-medication override exists', () => {
    const m = buildPermissionMatrix(makeInput({ scopes: ['view-meds'] }));
    expect(canCaregiverDo(m, 'view-medications', 'm-99')).toBe(true);
    expect(canCaregiverDo(m, 'log-doses', 'm-99')).toBe(false);
  });

  it('returns global when medicationId omitted', () => {
    const m = buildPermissionMatrix(makeInput({ scopes: ['view-meds'] }));
    expect(canCaregiverDo(m, 'view-medications')).toBe(true);
    expect(canCaregiverDo(m, 'log-doses')).toBe(false);
  });
});

describe('medicationsCaregiverCan', () => {
  it('returns every medication when global grants the capability', () => {
    const m = buildPermissionMatrix(makeInput({ scopes: ['view-meds'] }));
    const list = medicationsCaregiverCan(m, 'view-medications', ['m-1', 'm-2', 'm-3']);
    expect(list).toEqual(['m-1', 'm-2', 'm-3']);
  });

  it('excludes medications where the capability is denied', () => {
    const m = buildPermissionMatrix({
      ...makeInput({ scopes: ['view-meds'] }),
      overrides: [{ medicationId: 'm-2', deny: ['view-medications'] }],
    });
    const list = medicationsCaregiverCan(m, 'view-medications', ['m-1', 'm-2', 'm-3']);
    expect(list).toEqual(['m-1', 'm-3']);
  });

  it('includes medications where the capability is specifically granted', () => {
    const m = buildPermissionMatrix({
      ...makeInput({ scopes: [] as CaregiverPermissionInput['share']['scopes'] }),
      overrides: [{ medicationId: 'm-2', grant: ['log-doses'] }],
    });
    const list = medicationsCaregiverCan(m, 'log-doses', ['m-1', 'm-2', 'm-3']);
    expect(list).toEqual(['m-2']);
  });

  it('returns an empty list when the matrix is expired', () => {
    const m = buildPermissionMatrix({
      share: {
        id: 'c-1',
        scopes: ['view-meds'],
        expiresAt: new Date(2020, 0, 1).toISOString(),
      } as CaregiverPermissionInput['share'],
      now: new Date(2026, 5, 1),
    });
    const list = medicationsCaregiverCan(m, 'view-medications', ['m-1', 'm-2']);
    expect(list).toEqual([]);
  });
});

describe('caregiverCapabilitiesFor', () => {
  it('returns the global capabilities sorted when no override exists', () => {
    const m = buildPermissionMatrix(
      makeInput({ scopes: ['view-meds', 'view-adherence'] }),
    );
    const caps = caregiverCapabilitiesFor(m, 'm-99');
    expect(caps).toEqual(['view-adherence', 'view-medications']);
  });

  it('returns the override capabilities sorted when one exists', () => {
    const m = buildPermissionMatrix({
      ...makeInput({ scopes: ['view-meds'] }),
      overrides: [{ medicationId: 'm-1', grant: ['log-doses'] }],
    });
    const caps = caregiverCapabilitiesFor(m, 'm-1');
    expect(caps).toEqual(['log-doses', 'view-medications']);
  });

  it('returns an empty list when expired', () => {
    const m = buildPermissionMatrix({
      share: {
        id: 'c-1',
        scopes: ['view-meds'],
        expiresAt: new Date(2020, 0, 1).toISOString(),
      } as CaregiverPermissionInput['share'],
      now: new Date(2026, 5, 1),
    });
    expect(caregiverCapabilitiesFor(m, 'm-1')).toEqual([]);
  });
});

describe('summarizePermissions', () => {
  it('summarizes a global-only matrix', () => {
    const m = buildPermissionMatrix(makeInput({ scopes: ['view-meds'] }));
    expect(summarizePermissions(m)).toMatch(/Global: view-medications/);
  });

  it('mentions override count when overrides exist', () => {
    const m = buildPermissionMatrix({
      ...makeInput({ scopes: ['view-meds'] }),
      overrides: [
        { medicationId: 'm-1', grant: ['log-doses'] },
        { medicationId: 'm-2', deny: ['view-medications'] },
      ],
    });
    expect(summarizePermissions(m)).toMatch(/overrides: 2/);
  });

  it('says expired when matrix is expired', () => {
    const m = buildPermissionMatrix({
      share: {
        id: 'c-1',
        scopes: ['view-meds'],
        expiresAt: new Date(2020, 0, 1).toISOString(),
      } as CaregiverPermissionInput['share'],
      now: new Date(2026, 5, 1),
    });
    expect(summarizePermissions(m)).toMatch(/expired/);
  });
});
