import { mkdirSync, createWriteStream, existsSync, readFileSync, writeFileSync, renameSync, type WriteStream } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Append only audit log.
 *
 * Every entry is one JSON object per line (JSONL) written synchronously to a
 * configurable file path. The format is intentionally append only so it can be
 * shipped to a SIEM or object store without rewrites, and so a compromised
 * process cannot silently mutate historical records.
 *
 * Entry shape:
 *   {
 *     ts: ISO 8601 timestamp,
 *     actor: { id, role } | null,
 *     action: short verb, e.g. "auth.login", "medication.create",
 *     resource: optional resource id or path,
 *     method: HTTP method when sourced from a request,
 *     route: matched fastify route,
 *     status: HTTP status code,
 *     reqId: x-request-id,
 *     ip: client ip,
 *     meta: arbitrary structured detail
 *   }
 */

export type AuditActor = { id: string; role?: string } | null;

export type AuditEntry = {
  ts: string;
  actor: AuditActor;
  action: string;
  resource?: string;
  method?: string;
  route?: string;
  status?: number;
  reqId?: string;
  ip?: string;
  meta?: Record<string, unknown>;
};

export type AuditQuery = {
  actorId?: string;
  action?: string;
  since?: string;
  until?: string;
  limit?: number;
};

export class AuditService {
  private readonly path: string;
  private stream: WriteStream | null = null;

  constructor(filePath: string) {
    this.path = resolve(filePath);
    mkdirSync(dirname(this.path), { recursive: true });
    this.stream = createWriteStream(this.path, { flags: 'a' });
  }

  /** Append a single entry. Resolves once the line is flushed to the OS buffer. */
  async record(entry: Omit<AuditEntry, 'ts'> & { ts?: string }): Promise<void> {
    const line =
      JSON.stringify({
        ts: entry.ts ?? new Date().toISOString(),
        actor: entry.actor ?? null,
        action: entry.action,
        resource: entry.resource,
        method: entry.method,
        route: entry.route,
        status: entry.status,
        reqId: entry.reqId,
        ip: entry.ip,
        meta: entry.meta,
      }) + '\n';
    if (!this.stream) throw new Error('AuditService closed');
    const ok = this.stream.write(line);
    if (!ok) {
      await new Promise<void>((res) => this.stream!.once('drain', () => res()));
    }
  }

  /**
   * Read recent entries matching the query. The log is append only so we read
   * the file once and filter in memory. For deployments past a few hundred
   * megabytes this should be backed by a log aggregator instead.
   */
  query(q: AuditQuery = {}): AuditEntry[] {
    if (!existsSync(this.path)) return [];
    const raw = readFileSync(this.path, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const out: AuditEntry[] = [];
    for (const line of lines) {
      let entry: AuditEntry;
      try {
        entry = JSON.parse(line) as AuditEntry;
      } catch {
        continue;
      }
      if (q.actorId && entry.actor?.id !== q.actorId) continue;
      if (q.action && entry.action !== q.action) continue;
      if (q.since && entry.ts < q.since) continue;
      if (q.until && entry.ts > q.until) continue;
      out.push(entry);
    }
    const limit = q.limit && q.limit > 0 ? Math.min(q.limit, 1000) : 200;
    return out.slice(-limit).reverse();
  }

  filePath(): string {
    return this.path;
  }

  /**
   * Remove every entry whose actor.id matches actorId. The log is rewritten
   * atomically: we drain the in-flight stream, write the surviving lines to
   * a sibling temp file, rename it into place, then reopen the append
   * stream. Returns the number of entries removed so callers can audit the
   * deletion itself.
   *
   * This is the storage primitive behind the GDPR right-to-erasure endpoint
   * (DELETE /me). It is synchronous around the file swap so a concurrent
   * writer cannot append between the read and the rename.
   */
  async purgeActor(actorId: string): Promise<number> {
    if (!actorId) return 0;
    if (!this.stream) throw new Error('AuditService closed');
    // Pause appends by closing the current stream, swap the file, reopen.
    const s = this.stream;
    this.stream = null;
    await new Promise<void>((res) => s.end(() => res()));

    let removed = 0;
    if (existsSync(this.path)) {
      const raw = readFileSync(this.path, 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      const kept: string[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as AuditEntry;
          if (entry.actor?.id === actorId) {
            removed += 1;
            continue;
          }
          kept.push(line);
        } catch {
          // Preserve unparseable lines so we never destroy data we cannot
          // attribute. Operators can inspect them out of band.
          kept.push(line);
        }
      }
      const tmp = this.path + '.purge.tmp';
      writeFileSync(tmp, kept.length ? kept.join('\n') + '\n' : '');
      renameSync(tmp, this.path);
    }
    this.stream = createWriteStream(this.path, { flags: 'a' });
    return removed;
  }

  async close(): Promise<void> {
    if (!this.stream) return;
    const s = this.stream;
    this.stream = null;
    await new Promise<void>((res) => s.end(() => res()));
  }
}
