/* istanbul ignore file */
export interface CacheAdapter {
  get(key: string): Promise<string | undefined>;
  mget(keys: readonly string[]): Promise<(string | undefined)[]>;

  set(key: string, value: string, ttlMs: number): Promise<void>;
  mset(
    keys: readonly string[],
    values: readonly string[],
    ttlMs: number,
  ): Promise<void>;

  del(key: string): Promise<void>;
  mdel(keys: readonly string[]): Promise<void>;
  pdel(pattern: string): Promise<void>;

  has(key: string): Promise<boolean>;
  mhas(keys: readonly string[]): Promise<boolean>;
}

export * from './memory';
export * from './redis';
export * from './void';
