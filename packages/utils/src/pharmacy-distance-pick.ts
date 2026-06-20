/**
 * Pharmacy distance pick: closest open pharmacy that carries a given drug.
 *
 * The refill UX wants to answer "where can I get this drug right now?"
 * with a single tap. That needs three filters combined:
 *
 *   1. The pharmacy carries the drug (formulary check; we use a simple
 *      `carriesDrugIds` list since we don't model inventory).
 *   2. The pharmacy is OPEN at the requested instant (resolvePharmacyOpen
 *      from pharmacy-hours.ts).
 *   3. The pharmacy is reachable in a reasonable distance (Haversine on
 *      lat/lng; we don't model real road distance — the caller can
 *      multiply by a road factor if needed).
 *
 * `pickClosestPharmacy` ranks candidates by (open-first, distance asc)
 * and returns the top match plus the next two alternatives so the UI
 * can show fallback options when the top pick is on the other side of
 * town. The full ranked list is also available.
 *
 * Pure / deterministic. Distance in km. Caller supplies lat/lng in
 * decimal degrees.
 */

import { resolvePharmacyOpen, type PharmacyHours } from './pharmacy-hours';

export interface PharmacyCandidate {
  id: string;
  name: string;
  lat: number;
  lng: number;
  hours: PharmacyHours;
  /** Drug IDs the pharmacy stocks. Empty = unknown / "anything". */
  carriesDrugIds?: string[];
  /** Optional address blob for display. */
  address?: string;
}

export interface PickOptions {
  /** User's location. */
  userLat: number;
  userLng: number;
  /** When to evaluate "open". Default new Date(). */
  at?: Date;
  /** Drug to filter on. Omit to skip the formulary filter. */
  drugId?: string;
  /** Maximum distance in km. Default 50 km. */
  maxDistanceKm?: number;
  /**
   * When true and no open pharmacy is found within the max distance,
   * fall back to the closest CLOSED pharmacy that carries the drug
   * (with the next-open time surfaced). Default true.
   */
  includeClosedFallback?: boolean;
}

export interface RankedPharmacy {
  pharmacy: PharmacyCandidate;
  distanceKm: number;
  isOpen: boolean;
  /** Reason string from resolvePharmacyOpen for UI tooltip. */
  reason: string;
  /** ISO of next open boundary; only present when isOpen is false. */
  nextOpen?: string;
  /** ISO of next close boundary; only present when isOpen is true. */
  nextClose?: string;
}

export interface PickResult {
  /** Best match (open + carries + closest). Undefined if no candidate qualifies. */
  pick?: RankedPharmacy;
  /** Up to two next-best alternatives after the pick. */
  alternatives: RankedPharmacy[];
  /** All candidates considered (including filtered-out ones), ranked. */
  ranked: RankedPharmacy[];
  /** Plain-text explanation suitable for UI. */
  message: string;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance between two lat/lng points in kilometers.
 * Pure math, no allocations beyond locals.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function validateLatLng(lat: number, lng: number, label: string): void {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error(`${label} latitude out of range: ${lat}`);
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error(`${label} longitude out of range: ${lng}`);
  }
}

export function pickClosestPharmacy(
  candidates: PharmacyCandidate[],
  options: PickOptions,
): PickResult {
  validateLatLng(options.userLat, options.userLng, 'user');
  const at = options.at ?? new Date();
  const maxDistance = options.maxDistanceKm ?? 50;
  const includeClosedFallback = options.includeClosedFallback ?? true;

  const ranked: RankedPharmacy[] = candidates
    .map((p) => {
      validateLatLng(p.lat, p.lng, `pharmacy ${p.id}`);
      const distanceKm = haversineDistanceKm(
        options.userLat,
        options.userLng,
        p.lat,
        p.lng,
      );
      const open = resolvePharmacyOpen({ hours: p.hours, at });
      const entry: RankedPharmacy = {
        pharmacy: p,
        distanceKm: round2(distanceKm),
        isOpen: open.isOpen,
        reason: open.reason,
      };
      if (open.nextOpen) entry.nextOpen = open.nextOpen;
      if (open.nextClose) entry.nextClose = open.nextClose;
      return entry;
    })
    .filter((entry) => entry.distanceKm <= maxDistance)
    .filter((entry) => {
      if (!options.drugId) return true;
      const list = entry.pharmacy.carriesDrugIds;
      // If formulary is unknown (undefined or empty list), treat as carries.
      if (!list || list.length === 0) return true;
      return list.includes(options.drugId);
    });

  // Stable ranking: open first, then distance asc, then name asc for ties.
  ranked.sort((a, b) => {
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    return a.pharmacy.name.localeCompare(b.pharmacy.name);
  });

  const openOnly = ranked.filter((p) => p.isOpen);
  let pick: RankedPharmacy | undefined = openOnly[0];
  if (!pick && includeClosedFallback) pick = ranked[0];

  const alternatives = pick
    ? ranked.filter((p) => p.pharmacy.id !== pick!.pharmacy.id).slice(0, 2)
    : [];

  const message = buildMessage(pick, openOnly.length, ranked.length, options);

  const result: PickResult = {
    alternatives,
    ranked,
    message,
  };
  if (pick) result.pick = pick;
  return result;
}

function buildMessage(
  pick: RankedPharmacy | undefined,
  openCount: number,
  totalCount: number,
  options: PickOptions,
): string {
  if (!pick) {
    if (totalCount === 0) {
      const drugBit = options.drugId ? ` that carries ${options.drugId}` : '';
      return `No pharmacy within ${options.maxDistanceKm ?? 50} km${drugBit}.`;
    }
    return `${totalCount} pharmacy in range but none currently open.`;
  }
  if (pick.isOpen) {
    return `${pick.pharmacy.name} is ${pick.distanceKm} km away and open${openCount > 1 ? ` (${openCount - 1} other open option${openCount - 1 === 1 ? '' : 's'} nearby)` : ''}.`;
  }
  return `${pick.pharmacy.name} is the closest (${pick.distanceKm} km) but currently closed${pick.nextOpen ? `; next open ${pick.nextOpen}` : ''}.`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
