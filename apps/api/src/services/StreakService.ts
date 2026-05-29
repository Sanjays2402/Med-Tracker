/** compute and cache streaks */
export class StreakService {
  // Inject the prisma client (or a stub during tests).
  constructor(private readonly prisma: any) {}

  async health(): Promise<{ ok: boolean; service: string }> {
    return { ok: true, service: 'StreakService' };
  }
}
