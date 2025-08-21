import EventEmitter from 'events';
import { type CacheAdapter } from './adapters';
import { TtlExpression, ttlToMs } from './ttl';

export interface CacheOptions<
  Entries extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * A function to serialize the values before storing them in the cache.
   */
  serialize?: Serialize<Entries>;

  /**
   * A function to deserialize the values after reading them from the cache.
   */
  deserialize?: Deserialize<Entries>;
}

type Serialize<Entries extends Record<string, unknown>> = (
  this: void,
  val: Entries[keyof Entries & string],
  key: keyof Entries & string,
) => string;

type Deserialize<Entries extends Record<string, unknown>> = (
  this: void,
  val: string,
  key: keyof Entries & string,
) => Entries[keyof Entries & string];

export interface CacheEvents<Entries extends Record<string, unknown>> {
  /**
   * Fired after every cache read operation. For mget and mcached operations, the event is fired once for each key.
   *
   * @param key The requested key.
   * @param hit Whether the key was found in the cache.
   * @param operation The operation that was performed.
   */
  read: [key: keyof Entries, hit: boolean, operation: CacheOperation];
}

export enum CacheOperation {
  Get,
  Mget,
  Cached,
  Mcached,
}

/**
 * Context for all documentation comments:
 *
 * ```ts
 * type Result = { id: string; calculated: number };
 *
 * declare const resultCache: Cache<{
 *   [K in `expensive-${string}`]: Result;
 * }>;
 * ```
 */
export class Cache<
  Entries extends Record<string, unknown> = Record<string, unknown>,
> extends EventEmitter<CacheEvents<Entries>> {
  private readonly serialize: Serialize<Entries>;
  private readonly deserialize: Deserialize<Entries>;

  constructor(
    private readonly cacheAdapter: CacheAdapter,
    private readonly prefix?: string,
    options: CacheOptions<Entries> = {},
  ) {
    super();

    ({
      serialize: this.serialize = defaultSerialize,
      deserialize: this
        .deserialize = defaultDeserialize as Deserialize<Entries>,
    } = options);
  }

  /**
   * Gets the cached value for a given key.
   *
   * Use {@link Cache.cached} if you want to read a value from cache and only calculate it if it's not set.
   *
   * @returns the cached value or `undefined` if the key is not in the cache.
   *
   * @example
   *
   * ```ts
   * declare const id: string;
   *
   * const result = await resultCache.get(
   *   //  ^? Result | undefined
   *   `expensive-${id}`,
   * );
   * ```
   */
  async get<K extends keyof Entries & string>(
    key: K,
  ): Promise<Entries[K] | undefined> {
    const cacheKey = this.getCacheKey(key);

    const res = await this.cacheAdapter.get(cacheKey);

    if (res === undefined) {
      this.emit('read', key, false, CacheOperation.Get);
      return undefined;
    }

    this.emit('read', key, true, CacheOperation.Get);
    return this.deserialize(res, key) as Entries[K];
  }

  /**
   * Gets the cached values for a given list of keys.
   *
   * @returns an array with the cached values. Each entry holds either the cached value of the key at that position or `undefined` if the key was not found in the cache.
   *
   * @example
   *
   * ```ts
   * declare const ids: string[];
   *
   * const results = await resultCache.mget(
   *   //  ^? (Result | undefined)[]
   *   ids.map(id => `expensive-${id}` as const),
   * );
   * ```
   */
  async mget<const K extends readonly (keyof Entries & string)[]>(
    keys: K,
  ): Promise<{
    -readonly [I in keyof K]: Entries[K[I]] | undefined;
  }> {
    if (keys.length === 0) {
      return [] as {
        -readonly [I in keyof K]: Entries[K[I]] | undefined;
      };
    }

    const cacheKeys = keys.map((key) => this.getCacheKey(key));

    const res = await this.cacheAdapter.mget(cacheKeys);

    return res.map((r, i) => {
      if (r === undefined) {
        this.emit('read', keys[i], false, CacheOperation.Mget);
        return undefined;
      }

      this.emit('read', keys[i], true, CacheOperation.Mget);
      return this.deserialize(r, keys[i]);
    }) as {
      -readonly [I in keyof K]: Entries[K[I]] | undefined;
    };
  }

  /**
   * Saves the value for a given cache key to the cache.
   *
   * Use {@link Cache.cached} if you want to read a value from cache and only calculate+store it if it's not set.
   *
   * @param ttl For how long to keep the value in milliseconds or a duration string.
   */
  async set<K extends keyof Entries & string>(
    key: K,
    value: Entries[K],
    ttl: TtlExpression<[value: Entries[K]]>,
  ): Promise<void> {
    const cacheKey = this.getCacheKey(key);
    const ttlMs = ttlToMs(ttl, [value]);

    await this.cacheAdapter.set(cacheKey, this.serialize(value, key), ttlMs);
  }

  /**
   * Saves many values to the cache. Takes a list of values and a function to calculate the cache keys from those.
   *
   * Use {@link Cache.mcached} if you want to read many values from the cache and only compute values+save them for those not in the cache.
   *
   * @param ttl For how long to keep the values in milliseconds or a duration string.
   *
   * @example
   *
   * ```ts
   * declare const items: readonly Result[];
   *
   * await resultCache.mset(
   *   items,
   *   (item) => `expensive-${item.id}`,
   *   '1d',
   * );
   * ```
   */
  async mset<I extends readonly Entries[keyof Entries & string][]>(
    items: I,
    makeKey: (
      this: void,
      item: I[number],
      index: number,
    ) => keyof Entries & string,
    ttl: TtlExpression<[value: I[number], index: number]>,
  ): Promise<void> {
    await this.cacheAdapter.mset(
      items.map((item, i) => {
        const key = makeKey(item, i);

        return [
          this.getCacheKey(key),
          this.serialize(item, makeKey(item, i)),
          ttlToMs(ttl, [item, i]),
        ];
      }),
    );
  }

  /**
   * Deletes the value for the given key from the cache.
   *
   * @example
   *
   * ```ts
   * declare const deleteId: string;
   *
   * await resultCache.del(`expensive-${deleteId}`);
   * ```
   */
  async del(key: keyof Entries & string): Promise<void> {
    const cacheKey = this.getCacheKey(key);

    await this.cacheAdapter.del(cacheKey);
  }

  /**
   * Deletes the values for the given list of keys from the cache.
   *
   * @example
   *
   * ```ts
   * declare const deleteIds: string[];
   *
   * await resultCache.del(
   *   deleteIds.map(id => `expensive-${id}` as const)
   * );
   * ```
   */
  async mdel(keys: readonly (keyof Entries & string)[]): Promise<void> {
    const cacheKeys = keys.map((k) => this.getCacheKey(k));

    await this.cacheAdapter.mdel(cacheKeys);
  }

  /**
   * Deletes all values from the cache whose keys match the given glob-style pattern.
   *
   * Please note that the pattern is not fully typed and can be any string.
   *
   * @param pattern A glob-style pattern to match the keys against.
   *
   * @example
   *
   * ```ts
   * await resultCache.pdel('expensive-*');
   * ```
   */
  async pdel(pattern: string): Promise<void> {
    const cacheKey = this.getCacheKey(pattern);

    await this.cacheAdapter.pdel(cacheKey);
  }

  /**
   * Clears the entire cache.
   *
   * @example
   *
   * ```ts
   * await resultCache.clear();
   * ```
   */
  async clear(): Promise<void> {
    await this.pdel('*');
  }

  /**
   * Checks whether there is a value for the given key in the cache.
   *
   * @example
   *
   * ```ts
   * declare const id: string;
   *
   * const isCached = await resultCache.has(
   *   `expensive-${id}`,
   * );
   * ```
   */
  async has(key: keyof Entries & string): Promise<boolean> {
    const cacheKey = this.getCacheKey(key);

    return await this.cacheAdapter.has(cacheKey);
  }

  /**
   * Checks whether there is a value cached for all of the given keys.
   *
   * @returns `true` if all keys have a value cached, `false` if at least one key has no value in the cache.
   *
   * @example
   *
   * ```ts
   * declare const ids: string;
   *
   * const allCached = await resultCache.has(
   *   ids.map(id => `expensive-${id}` as const),
   * );
   * ```
   */
  async mhas(keys: readonly (keyof Entries & string)[]): Promise<boolean> {
    const cacheKeys = keys.map((k) => this.getCacheKey(k));

    return await this.cacheAdapter.mhas(cacheKeys);
  }

  /**
   * Wraps a function call in a cache and only executes it if the
   * value is not in the cache.
   *
   * @param ttl For how long to keep the value in milliseconds or a duration string.
   *
   * @example
   *
   * ```ts
   * declare function expensiveFunction(id: string): Promise<Result>;
   * declare const id: string;
   *
   * const result = await resultCache.cached(
   *   //  ^? Result
   *   `expensive-${id}`,
   *   () => expensiveFunction(id),
   *   '1d',
   * );
   * ```
   */
  async cached<K extends keyof Entries & string>(
    key: K,
    producer: (this: void) => Promise<Entries[K]>,
    ttl: TtlExpression<[value: Entries[K]]>,
  ): Promise<Entries[K]> {
    const cacheKey = this.getCacheKey(key);

    const res = await this.cacheAdapter.get(cacheKey);

    if (res === undefined) {
      this.emit('read', key, false, CacheOperation.Cached);
      const value = await producer();
      const ttlMs = ttlToMs(ttl, [value]);

      await this.cacheAdapter.set(cacheKey, this.serialize(value, key), ttlMs);

      return value;
    }

    this.emit('read', key, true, CacheOperation.Cached);
    return this.deserialize(res, key) as Entries[K];
  }

  /**
   * Wraps a batch function call in a cache and only executes for those values that are not cached.
   * If all requested keys are cached, the producer is not executed.
   *
   * @param producer Takes an array of input items that are not cached and returns an array of results. The output array must have
   * the same length as the input, and items are mapped by their array indices.
   *
   * @param ttl For how long to keep the values in milliseconds or a duration string.
   *
   * @example
   *
   * ```ts
   * declare function expensiveBatchFunction(
   *   ids: readonly string[],
   * ): Promise<Result[]>;
   * declare const ids: string[];
   *
   * const results = await resultCache.mcached(
   *   //  ^? Result[]
   *   ids,
   *   (id) => `expensive-${id}`,
   *   (m) => expensiveBatchFunction(m),
   *   '1d',
   * );
   * ```
   */
  async mcached<D, const K extends keyof Entries & string>(
    data: readonly D[],
    makeKey: (this: void, data: D, index: number) => K,
    producer: (this: void, data: readonly D[]) => Promise<Entries[K][]>,
    ttl: TtlExpression<[value: Entries[K], index: number]>,
  ): Promise<Entries[K][]> {
    const keys = data.map((d, i) => makeKey(d, i));
    const cacheKeys = keys.map((k) => this.getCacheKey(k));

    const cachedResults = await this.cacheAdapter.mget(cacheKeys);
    const toReturn = new Array<Entries[K]>(data.length);
    const missingIndices: number[] = [];

    cachedResults.forEach((result, i) => {
      if (result === undefined) {
        this.emit('read', keys[i], false, CacheOperation.Mcached);
        missingIndices.push(i);
      } else {
        this.emit('read', keys[i], true, CacheOperation.Mcached);
        toReturn[i] = this.deserialize(result, keys[i]) as Entries[K];
      }
    });

    if (!missingIndices.length) return toReturn;

    const missingData = missingIndices.map((index) => data[index]);
    const producedValues = await producer(missingData);

    if (producedValues.length !== missingData.length) {
      throw new Error(
        'The producer did not return exactly as many results as inputs were given.',
        {
          cause: {
            missingData,
            producedValues,
          },
        },
      );
    }

    const toStore = new Array<[string, string, number]>(producedValues.length);

    producedValues.forEach((value, index) => {
      const returnIndex = missingIndices[index];

      toReturn[returnIndex] = value;
      toStore[index] = [
        cacheKeys[returnIndex],
        this.serialize(value, keys[returnIndex]),
        ttlToMs(ttl, [value, index]),
      ];
    });

    await this.cacheAdapter.mset(toStore);

    return toReturn;
  }

  /**
   * Gets the remaining time to live of a key in milliseconds or `undefined` if the key does not exist or has expired.
   *
   * May return `Infinity` if the key exists but has no TTL set.
   */
  async getRemainingTtl(
    key: keyof Entries & string,
  ): Promise<number | undefined> {
    const cacheKey = this.getCacheKey(key);

    return await this.cacheAdapter.getRemainingTtl(cacheKey);
  }

  /**
   * Computes the cache key for a given key.
   *
   * The "key" is the user's input, and "cache key" is what is actually used to store the value.
   */
  private getCacheKey(key: string): string {
    if (!this.prefix) return key;

    return `${this.prefix}:${key}`;
  }
}

function defaultSerialize(value: unknown): string {
  return JSON.stringify(value);
}

function defaultDeserialize(value: string): unknown {
  return JSON.parse(value);
}
