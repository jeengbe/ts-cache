/* istanbul ignore file */
export interface CacheAdapter {
  /**
   * Gets the value of a key or undefined if the key does not exist.
   */
  get(key: string): Promise<string | undefined>;

  /**
   * Gets the values of all given keys. If a key does not exist, the corresponding
   * value will be undefined. The index of the value in the result array will match
   * the index of the key in the input array.
   */
  mget(keys: readonly string[]): Promise<(string | undefined)[]>;

  /**
   * Sets the value of a key. If the key already exists, its value will be overwritten.
   */
  set(key: string, value: string, ttlMs: number): Promise<void>;

  /**
   * Sets the values of all given keys. If a key already exists, its value will be overwritten.
   */
  mset(
    keys: readonly string[],
    values: readonly string[],
    ttlMs: number,
  ): Promise<void>;

  /**
   * Deletes the value of a key.
   */
  del(key: string): Promise<void>;

  /**
   * Deletes the values of all given keys.
   */
  mdel(keys: readonly string[]): Promise<void>;

  /**
   * Deletes all keys that match the given pattern.
   */
  pdel(pattern: string): Promise<void>;

  /**
   * Checks if a key exists.
   */
  has(key: string): Promise<boolean>;

  /**
   * Checks if all given keys exist.
   */
  mhas(keys: readonly string[]): Promise<boolean>;
}

export * from './memory';
export * from './redis';
export * from './void';
