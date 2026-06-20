import { describe, it, expect } from 'vitest';
import {
  pickClosestPharmacy,
  haversineDistanceKm,
  type PharmacyCandidate,
} from '../src/pharmacy-distance-pick';

const ALWAYS_OPEN = { always: true };
const NEVER_OPEN = { weekly: {} };
const WEEKDAYS_9_TO_5 = {
  weekly: {
    1: { open: '09:00', close: '17:00' },
    2: { open: '09:00', close: '17:00' },
    3: { open: '09:00', close: '17:00' },
    4: { open: '09:00', close: '17:00' },
    5: { open: '09:00', close: '17:00' },
  },
} as const;

function pharmacy(
  id: string,
  name: string,
  lat: number,
  lng: number,
  extra: Partial<PharmacyCandidate> = {},
): PharmacyCandidate {
  return {
    id,
    name,
    lat,
    lng,
    hours: ALWAYS_OPEN,
    ...extra,
  };
}

describe('haversineDistanceKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistanceKm(37.7749, -122.4194, 37.7749, -122.4194)).toBe(0);
  });

  it('approximates SF -> LA distance to ~559 km', () => {
    // SF (37.7749, -122.4194) -> LA (34.0522, -118.2437)
    const d = haversineDistanceKm(37.7749, -122.4194, 34.0522, -118.2437);
    expect(d).toBeGreaterThan(550);
    expect(d).toBeLessThan(570);
  });

  it('symmetric', () => {
    const a = haversineDistanceKm(40, -74, 51, 0);
    const b = haversineDistanceKm(51, 0, 40, -74);
    expect(a).toBeCloseTo(b, 5);
  });
});

describe('pickClosestPharmacy', () => {
  // User at downtown SF.
  const userLat = 37.7749;
  const userLng = -122.4194;

  it('returns no pick for empty candidates', () => {
    const r = pickClosestPharmacy([], { userLat, userLng });
    expect(r.pick).toBeUndefined();
    expect(r.ranked).toHaveLength(0);
    expect(r.message).toMatch(/No pharmacy/);
  });

  it('picks the closest open pharmacy', () => {
    const c: PharmacyCandidate[] = [
      pharmacy('p1', 'Far CVS', 37.86, -122.27), // ~10+ km
      pharmacy('p2', 'Near Walgreens', 37.78, -122.42), // ~0.6 km
      pharmacy('p3', 'Medium Rite Aid', 37.80, -122.40), // ~2.9 km
    ];
    const r = pickClosestPharmacy(c, { userLat, userLng });
    expect(r.pick?.pharmacy.id).toBe('p2');
    expect(r.alternatives.map((a) => a.pharmacy.id)).toEqual(['p3', 'p1']);
  });

  it('prefers open over closed even when closed is closer', () => {
    const c: PharmacyCandidate[] = [
      pharmacy('closed', 'Closed', 37.7750, -122.4195, { hours: NEVER_OPEN }),
      pharmacy('open', 'Open', 37.78, -122.42),
    ];
    const r = pickClosestPharmacy(c, { userLat, userLng });
    expect(r.pick?.pharmacy.id).toBe('open');
  });

  it('falls back to closest closed when no open in range', () => {
    const c: PharmacyCandidate[] = [
      pharmacy('p1', 'Closed-A', 37.78, -122.42, { hours: NEVER_OPEN }),
      pharmacy('p2', 'Closed-B', 37.80, -122.40, { hours: NEVER_OPEN }),
    ];
    const r = pickClosestPharmacy(c, { userLat, userLng });
    expect(r.pick?.pharmacy.id).toBe('p1');
    expect(r.pick?.isOpen).toBe(false);
    expect(r.message).toMatch(/closed/);
  });

  it('returns no pick when fallback disabled and nothing open', () => {
    const c: PharmacyCandidate[] = [
      pharmacy('p1', 'Closed-A', 37.78, -122.42, { hours: NEVER_OPEN }),
    ];
    const r = pickClosestPharmacy(c, { userLat, userLng, includeClosedFallback: false });
    expect(r.pick).toBeUndefined();
    expect(r.message).toMatch(/none currently open/);
  });

  it('filters by carriesDrugIds', () => {
    const c: PharmacyCandidate[] = [
      pharmacy('p1', 'Near (no drug)', 37.78, -122.42, { carriesDrugIds: ['other'] }),
      pharmacy('p2', 'Far (has drug)', 37.80, -122.40, { carriesDrugIds: ['target'] }),
    ];
    const r = pickClosestPharmacy(c, { userLat, userLng, drugId: 'target' });
    expect(r.pick?.pharmacy.id).toBe('p2');
  });

  it('treats unknown formulary as carries (open list)', () => {
    const c: PharmacyCandidate[] = [
      pharmacy('p1', 'Near', 37.78, -122.42), // no carriesDrugIds
      pharmacy('p2', 'Far', 37.80, -122.40, { carriesDrugIds: [] }), // empty
    ];
    const r = pickClosestPharmacy(c, { userLat, userLng, drugId: 'target' });
    expect(r.pick?.pharmacy.id).toBe('p1');
  });

  it('excludes pharmacies beyond maxDistanceKm', () => {
    const c: PharmacyCandidate[] = [
      pharmacy('near', 'Near', 37.78, -122.42),
      pharmacy('far', 'Far', 34.05, -118.24), // LA, ~560 km
    ];
    const r = pickClosestPharmacy(c, { userLat, userLng, maxDistanceKm: 10 });
    expect(r.ranked).toHaveLength(1);
    expect(r.pick?.pharmacy.id).toBe('near');
  });

  it('alternatives count limited to 2', () => {
    const c: PharmacyCandidate[] = Array.from({ length: 5 }, (_, i) =>
      pharmacy(`p${i}`, `P${i}`, 37.78 + i * 0.001, -122.42 + i * 0.001),
    );
    const r = pickClosestPharmacy(c, { userLat, userLng });
    expect(r.alternatives).toHaveLength(2);
    expect(r.ranked).toHaveLength(5);
  });

  it('rejects invalid user lat/lng', () => {
    expect(() => pickClosestPharmacy([], { userLat: 91, userLng: 0 })).toThrow();
    expect(() => pickClosestPharmacy([], { userLat: 0, userLng: -200 })).toThrow();
  });

  it('rejects invalid pharmacy lat/lng', () => {
    const c: PharmacyCandidate[] = [pharmacy('p1', 'Bad', 95, 0)];
    expect(() => pickClosestPharmacy(c, { userLat, userLng })).toThrow();
  });

  it('uses business-hours pharmacy correctly', () => {
    // Wednesday 2026-06-24 13:00 local -> open per WEEKDAYS_9_TO_5.
    const wedAfternoon = new Date(2026, 5, 24, 13, 0);
    const sunAfternoon = new Date(2026, 5, 21, 13, 0);
    const c: PharmacyCandidate[] = [pharmacy('p1', 'Biz', 37.78, -122.42, { hours: WEEKDAYS_9_TO_5 })];
    const open = pickClosestPharmacy(c, { userLat, userLng, at: wedAfternoon });
    expect(open.pick?.isOpen).toBe(true);
    const closed = pickClosestPharmacy(c, { userLat, userLng, at: sunAfternoon, includeClosedFallback: false });
    expect(closed.pick).toBeUndefined();
  });

  it('message highlights single open option', () => {
    const c: PharmacyCandidate[] = [
      pharmacy('p1', 'Only', 37.78, -122.42),
    ];
    const r = pickClosestPharmacy(c, { userLat, userLng });
    expect(r.message).toMatch(/Only/);
    expect(r.message).toMatch(/open/);
  });

  it('message mentions other open options when present', () => {
    const c: PharmacyCandidate[] = [
      pharmacy('p1', 'A', 37.78, -122.42),
      pharmacy('p2', 'B', 37.785, -122.42),
    ];
    const r = pickClosestPharmacy(c, { userLat, userLng });
    expect(r.message).toMatch(/other open option/);
  });
});
