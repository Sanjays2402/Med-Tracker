import { CaregiverService } from './CaregiverService';
import { env } from '../env';

let instance: CaregiverService | null = null;

/**
 * Process-wide CaregiverService. The in-memory share store survives across
 * requests within a single API process which is enough for the current
 * non-Prisma wiring; once persistence lands the service will swap to a
 * DB-backed store without changing the route signatures.
 */
export function caregiverService(): CaregiverService {
  if (!instance) instance = new CaregiverService(env.JWT_SECRET || 'dev-secret-please-change-me');
  return instance;
}
