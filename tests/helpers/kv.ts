// In-memory KV store compatible with the `KV` interface of src/core/save.ts (localStorage subset).
import type { KV } from '../../src/core/save.ts';

export class MemoryKV implements KV {
  readonly data = new Map<string, string>();
  reads = 0;
  writes = 0;
  /** When set, the corresponding operation throws (simulates quota errors / blocked storage). */
  failGet = false;
  failSet = false;
  failRemove = false;

  getItem(k: string): string | null {
    this.reads++;
    if (this.failGet) throw new Error('getItem blocked');
    return this.data.has(k) ? this.data.get(k)! : null;
  }

  setItem(k: string, v: string): void {
    if (this.failSet) throw new Error('QuotaExceededError');
    this.writes++;
    this.data.set(k, String(v));
  }

  removeItem(k: string): void {
    if (this.failRemove) throw new Error('removeItem blocked');
    this.data.delete(k);
  }
}
