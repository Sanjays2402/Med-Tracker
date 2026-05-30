import {
  identifyPill,
  type PillDescriptor,
  type PillMatch,
  type PillMatchOptions,
  type PillQuery,
} from '@med/utils';

/**
 * PillIdentifierService holds a process-local catalog of pill descriptors
 * and answers identification queries against it. The catalog is injected so
 * routes can swap in a static seed list, a database-backed loader, or a
 * test fixture without changing the math.
 */
export class PillIdentifierService {
  private catalog: PillDescriptor[];

  constructor(catalog: PillDescriptor[] = []) {
    this.catalog = catalog.slice();
  }

  size(): number {
    return this.catalog.length;
  }

  setCatalog(next: PillDescriptor[]): void {
    this.catalog = next.slice();
  }

  identify(query: PillQuery, opts: PillMatchOptions = {}): PillMatch[] {
    return identifyPill(query, this.catalog, opts);
  }
}

/**
 * Default seed catalog covering common outpatient tablets. Production
 * deployments are expected to replace this with an authoritative source;
 * the seed is sufficient for development, demos, and tests.
 */
export const DEFAULT_PILL_CATALOG: PillDescriptor[] = [
  { id: 'lisinopril-10', name: 'Lisinopril 10 mg', imprint: 'L 10', shape: 'round', colors: ['pink'], scored: true, sizeMm: 7 },
  { id: 'lisinopril-20', name: 'Lisinopril 20 mg', imprint: 'L 20', shape: 'round', colors: ['yellow'], scored: true, sizeMm: 8 },
  { id: 'metformin-500', name: 'Metformin 500 mg', imprint: '500', shape: 'oval', colors: ['white'], scored: false, sizeMm: 12 },
  { id: 'metformin-1000', name: 'Metformin 1000 mg', imprint: '1000', shape: 'oval', colors: ['white'], scored: true, sizeMm: 18 },
  { id: 'atorvastatin-20', name: 'Atorvastatin 20 mg', imprint: 'A 20', shape: 'oval', colors: ['white'], sizeMm: 11 },
  { id: 'amoxicillin-500', name: 'Amoxicillin 500 mg', imprint: 'AMOX 500', shape: 'capsule', colors: ['red', 'pink'], sizeMm: 19 },
  { id: 'ibuprofen-200', name: 'Ibuprofen 200 mg', imprint: 'IBU 200', shape: 'round', colors: ['brown'], sizeMm: 10 },
  { id: 'acetaminophen-500', name: 'Acetaminophen 500 mg', imprint: 'L484', shape: 'oblong', colors: ['white'], sizeMm: 19 },
  { id: 'sertraline-50', name: 'Sertraline 50 mg', imprint: 'ZLT 50', shape: 'capsule', colors: ['blue', 'white'], sizeMm: 16 },
  { id: 'omeprazole-20', name: 'Omeprazole 20 mg', imprint: 'OME 20', shape: 'capsule', colors: ['purple'], sizeMm: 17 },
  { id: 'amlodipine-5', name: 'Amlodipine 5 mg', imprint: 'AML 5', shape: 'round', colors: ['white'], scored: false, sizeMm: 6 },
  { id: 'levothyroxine-50', name: 'Levothyroxine 50 mcg', imprint: 'LT 50', shape: 'round', colors: ['white'], scored: true, sizeMm: 6 },
];
