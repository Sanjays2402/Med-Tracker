import { findInteractions } from '@med/utils';
import type { Drug } from '@med/types';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Loads drug entries from the seeded `content/drugs/` directory. */
export class DrugCatalog {
  private cache: Map<string, Drug> = new Map();
  constructor(private readonly dir: string) {}

  load(): void {
    if (this.cache.size) return;
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      const d = JSON.parse(readFileSync(join(this.dir, f), 'utf8')) as Drug;
      this.cache.set(d.id, d);
    }
  }

  get(id: string): Drug | undefined {
    this.load();
    return this.cache.get(id);
  }

  byIds(ids: string[]): Drug[] {
    this.load();
    return ids.map((id) => this.cache.get(id)).filter((d): d is Drug => Boolean(d));
  }

  search(query: string, limit = 25): Drug[] {
    this.load();
    const q = query.toLowerCase();
    const out: Drug[] = [];
    for (const d of this.cache.values()) {
      if (
        d.generic.toLowerCase().includes(q) ||
        d.brand.toLowerCase().includes(q) ||
        d.class.toLowerCase().includes(q)
      ) {
        out.push(d);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  checkInteractions(ids: string[]) {
    return findInteractions(this.byIds(ids));
  }
}
