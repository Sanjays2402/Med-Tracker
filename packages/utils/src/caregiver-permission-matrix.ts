/**
 * Caregiver permission matrix.
 *
 * `CaregiverShare` carries a flat list of `scopes` like `view-meds`,
 * `view-adherence`, `view-refills`. That's enough to gate the
 * dashboard but not enough for finer-grained UX:
 *
 *   - a parent caregiver should be able to LOG doses for an elderly
 *     parent on a specific medication while only being able to VIEW
 *     others (e.g. a sensitive psychiatric med),
 *   - an adult child should see the refill timeline but not be able
 *     to edit the schedule,
 *   - a paid aide gets view + log on every med but cannot add new
 *     medications.
 *
 * This module turns the scope list plus an optional per-medication
 * override list into a `PermissionMatrix`: a fast lookup that
 * answers "can caregiver X perform action Y on medication Z?".
 *
 * Scopes map to capabilities deterministically. Per-medication
 * overrides can ADD or DROP capabilities for a specific drug. Drop
 * is honoured first (deny-wins) so a "private" medication remains
 * private even if a broader scope would have granted it.
 *
 * Pure / deterministic. Designed for the API authorization layer and
 * the UI hide/show logic to share the same source of truth.
 */

import type { CaregiverShare } from '@med/types';

export type CaregiverScope = NonNullable<CaregiverShare['scopes']>[number];

export type Capability =
  | 'view-medications'
  | 'view-adherence'
  | 'view-refills'
  | 'log-doses'
  | 'edit-schedule'
  | 'add-medication'
  | 'remove-medication';

export interface PermissionOverride {
  /** Specific medication this override applies to. */
  medicationId: string;
  /** Capabilities to grant in addition to scope-derived defaults. */
  grant?: Capability[];
  /** Capabilities to revoke; deny-wins over both scope and grant. */
  deny?: Capability[];
}

export interface CaregiverPermissionInput {
  share: Pick<CaregiverShare, 'id' | 'scopes' | 'expiresAt'>;
  overrides?: PermissionOverride[];
  /** Reference clock for expiry checks. Default new Date(). */
  now?: Date;
}

export interface PermissionMatrix {
  caregiverId: string;
  /** Capabilities granted at the regimen level (no medication-specific filter). */
  global: Set<Capability>;
  /** Map medicationId -> capabilities (global + grants - denies). */
  perMedication: Map<string, Set<Capability>>;
  /** True when the share's expiresAt is past `now`. All `can*` return false. */
  expired: boolean;
}

const DEFAULT_SCOPE_MAP: Record<CaregiverScope, Capability[]> = {
  'view-meds': ['view-medications'],
  'view-adherence': ['view-adherence'],
  'view-refills': ['view-refills'],
};

function unionAll(sets: Iterable<Capability[]>): Set<Capability> {
  const out = new Set<Capability>();
  for (const arr of sets) for (const c of arr) out.add(c);
  return out;
}

/**
 * Build a matrix from a share + overrides.
 *
 * Expired shares return a matrix with `expired=true`, an empty global
 * capability set, and an empty per-medication map. `canCaregiver*`
 * short-circuit to false on expired matrices.
 */
export function buildPermissionMatrix(input: CaregiverPermissionInput): PermissionMatrix {
  const now = input.now ?? new Date();
  const expiresAt = input.share.expiresAt;
  const expired =
    typeof expiresAt === 'string'
      ? new Date(expiresAt).getTime() <= now.getTime()
      : false;

  if (expired) {
    return {
      caregiverId: input.share.id,
      global: new Set(),
      perMedication: new Map(),
      expired: true,
    };
  }

  const scopeCaps = unionAll(
    (input.share.scopes ?? []).map((s) => DEFAULT_SCOPE_MAP[s] ?? []),
  );
  const overrides = input.overrides ?? [];

  // Build the per-medication map: start with the global caps then
  // apply per-med grants and denies. Deny wins.
  const perMedication = new Map<string, Set<Capability>>();
  for (const o of overrides) {
    const base = new Set<Capability>(scopeCaps);
    for (const g of o.grant ?? []) base.add(g);
    for (const d of o.deny ?? []) base.delete(d);
    perMedication.set(o.medicationId, base);
  }

  return {
    caregiverId: input.share.id,
    global: scopeCaps,
    perMedication,
    expired: false,
  };
}

/**
 * Check whether a caregiver can perform `capability` on `medicationId`.
 *
 * If a per-medication entry exists, it is consulted; deny-wins.
 * Otherwise the regimen-level global set applies.
 */
export function canCaregiverDo(
  matrix: PermissionMatrix,
  capability: Capability,
  medicationId?: string,
): boolean {
  if (matrix.expired) return false;
  if (medicationId !== undefined) {
    const specific = matrix.perMedication.get(medicationId);
    if (specific) return specific.has(capability);
  }
  return matrix.global.has(capability);
}

/**
 * Convenience: enumerate the medications the caregiver can act on for
 * a given capability across a list of known medication ids. Excludes
 * any medication whose override denies the capability.
 */
export function medicationsCaregiverCan(
  matrix: PermissionMatrix,
  capability: Capability,
  knownMedicationIds: string[],
): string[] {
  if (matrix.expired) return [];
  const out: string[] = [];
  for (const id of knownMedicationIds) {
    const specific = matrix.perMedication.get(id);
    if (specific) {
      if (specific.has(capability)) out.push(id);
      continue;
    }
    if (matrix.global.has(capability)) out.push(id);
  }
  return out;
}

/**
 * Convenience: list every capability the caregiver has on a specific
 * medication, accounting for overrides and global scopes.
 */
export function caregiverCapabilitiesFor(
  matrix: PermissionMatrix,
  medicationId: string,
): Capability[] {
  if (matrix.expired) return [];
  const specific = matrix.perMedication.get(medicationId);
  if (specific) return [...specific].sort();
  return [...matrix.global].sort();
}

/**
 * Compose a human-readable summary of the matrix, intended for the
 * caregiver settings UI ("Mom can: view meds + adherence; can log
 * Lisinopril and Metformin only.").
 */
export function summarizePermissions(matrix: PermissionMatrix): string {
  if (matrix.expired) return 'Caregiver share is expired.';
  const globalList = [...matrix.global].sort().join(', ') || '(no capabilities)';
  const overrideCount = matrix.perMedication.size;
  if (overrideCount === 0) return `Global: ${globalList}.`;
  return `Global: ${globalList}. Per-medication overrides: ${overrideCount}.`;
}
