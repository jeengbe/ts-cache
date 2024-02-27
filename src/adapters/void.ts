import type { CacheAdapter } from '.';

export class VoidCacheAdapter implements CacheAdapter {
  async get(): Promise<string | undefined> {
    return undefined;
  }

  async mget(keys: readonly string[]): Promise<(string | undefined)[]> {
    return new Array<undefined>(keys.length).fill(undefined);
  }

  async set(): Promise<void> {
    // No-op
  }

  async mset(): Promise<void> {
    // No-op
  }

  async del(): Promise<void> {
    // No-op
  }

  async mdel(): Promise<void> {
    // No-op
  }

  async has(): Promise<boolean> {
    return false;
  }

  async mhas(): Promise<boolean> {
    return false;
  }
}
