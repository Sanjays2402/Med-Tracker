/** pharmacy and external webhook handling */
export class WebhookService {
  // Inject the prisma client (or a stub during tests).
  constructor(private readonly prisma: any) {}

  async health(): Promise<{ ok: boolean; service: string }> {
    return { ok: true, service: 'WebhookService' };
  }
}
