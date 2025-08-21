import type { CacheAdapter } from '.';

export class VoidCacheAdapter implements CacheAdapter {
  async mget(keys: readonly string[]): Promise<(string | undefined)[]> {
    return new Array<undefined>(keys.length).fill(undefined);
  }

  async mset(): Promise<void> {
    // No-op
  }

  async mdel(): Promise<void> {
    // No-op
  }

  async pdel(): Promise<void> {
    // No-op
  }

  async mhas(): Promise<boolean> {
    return false;
  }

  async getRemainingTtl(): Promise<number | undefined> {
    return undefined;
  }
}
