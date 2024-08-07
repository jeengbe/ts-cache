import micromatch from 'micromatch';
import type { CacheAdapter } from '.';

export interface NoTtlCacheEngine<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): this;
  delete(key: K): boolean;
  has(key: K): boolean;
  entries(): IterableIterator<[K, V]>;
  keys(): IterableIterator<K>;
  clear(): void;
}

/**
 * Stores data in a map without respecting TTL.
 *
 * Note: Returns `Infinity` for `getRemainingTtl` if the key exists.
 */
export class NoTtlMemoryCacheAdapter implements CacheAdapter {
  constructor(
    private readonly cache: NoTtlCacheEngine<string, string> = new Map(),
  ) {}

  async get(key: string): Promise<string | undefined> {
    return this.cache.get(key);
  }

  async mget(keys: readonly string[]): Promise<(string | undefined)[]> {
    return keys.map((k) => this.cache.get(k));
  }

  async set(key: string, value: string): Promise<void> {
    this.cache.set(key, value);
  }

  async mset(
    keys: readonly string[],
    values: readonly string[],
  ): Promise<void> {
    keys.forEach((key, index) => this.cache.set(key, values[index]));
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async mdel(keys: readonly string[]): Promise<void> {
    keys.forEach((key) => this.cache.delete(key));
  }

  async pdel(pattern: string): Promise<void> {
    if (pattern === '*') {
      this.cache.clear();
      return;
    }

    const keys = Array.from(this.cache.keys());

    const keysToDelete = micromatch(keys, pattern);

    keysToDelete.forEach((key) => this.cache.delete(key));
  }

  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  async mhas(keys: readonly string[]): Promise<boolean> {
    return keys.every((k) => this.cache.has(k));
  }

  async getRemainingTtl(key: string): Promise<number | undefined> {
    return this.cache.has(key) ? Infinity : undefined;
  }
}
