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

  async mhas(keys: readonly string[]): Promise<boolean[]> {
    return new Array<boolean>(keys.length).fill(false);
  }

  async getRemainingTtl(): Promise<number | undefined> {
    return undefined;
  }
}
