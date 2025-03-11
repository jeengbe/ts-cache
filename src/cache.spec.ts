import { MemoryCacheAdapter, TtlCacheEngine } from '@/adapters';
import { Cache, CacheOperation, CacheOptions } from './cache';

class MockTtlCacheEngine implements TtlCacheEngine<string, string> {
  private readonly values = new Map<string, [value: string, ttl: number]>();

  get(key: string): string | undefined {
    return this.values.get(key)?.[0];
  }

  set(key: string, value: string, options: { ttl: number }): this {
    this.values.set(key, [value, options.ttl]);
    return this;
  }

  delete(key: string): boolean {
    return this.values.delete(key);
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  entries(): IterableIterator<[string, string]> {
    const { values } = this;

    return (function* () {
      for (const [key, [value]] of values) {
        yield [key, value];
      }
    })();
  }

  keys(): IterableIterator<string> {
    return this.values.keys();
  }

  clear(): void {
    this.values.clear();
  }

  getRemainingTTL(key: string): number | undefined {
    return this.values.get(key)?.[1];
  }
}

describe('Cache', () => {
  let adapter: MemoryCacheAdapter;
  let mockOptions: jest.Mocked<CacheOptions<Record<string, string>>>;
  let cache: Cache<Record<string, string>>;

  beforeEach(() => {
    adapter = new MemoryCacheAdapter(new MockTtlCacheEngine());
    mockOptions = {
      serialize: jest.fn((val) => JSON.stringify(val)),
      deserialize: jest.fn((val) => JSON.parse(val)),
    };

    cache = new Cache<Record<string, string>>(adapter, 'cache', mockOptions);
  });

  describe('get', () => {
    it('returns undefined if there is nothing cached', async () => {
      const value = await cache.get('foo');

      expect(value).toBeUndefined();
    });

    it('emits a miss if there is nothing cached', async () => {
      const onRead = jest.fn();
      cache.on('read', onRead);

      await cache.get('foo');

      expect(onRead).toHaveBeenCalledWith('foo', false, CacheOperation.Get);
    });

    it('returns cached value', async () => {
      await cache.set('foo', 'bar', 0);

      const value = await cache.get('foo');

      expect(value).toBe('bar');
    });

    it('records a hit if there is something cached', async () => {
      const onRead = jest.fn();
      cache.on('read', onRead);

      await cache.set('foo', 'bar', 0);

      await cache.get('foo');

      expect(onRead).toHaveBeenCalledWith('foo', true, CacheOperation.Get);
    });

    it("deserializes the value if it's cached", async () => {
      await cache.set('foo', 'bar', 0);

      await cache.get('foo');

      expect(mockOptions.deserialize).toHaveBeenCalledWith('"bar"', 'foo');
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(adapter, 'cache-a');
      const cacheB = new Cache(adapter, 'cache-b');
      const cacheC = new Cache(adapter);

      await cacheA.set('foo', 'bar', 0);
      await cacheB.set('foo', 'baz', 0);
      await cacheC.set('foo', 'qux', 0);

      const valueA = await cacheA.get('foo');
      const valueB = await cacheB.get('foo');
      const valueC = await cacheC.get('foo');

      expect(valueA).toBe('bar');
      expect(valueB).toBe('baz');
      expect(valueC).toBe('qux');
    });
  });

  describe('mget', () => {
    it('returns mixed cached value / undefined', async () => {
      await cache.set('b', 'bar', 0);
      await cache.set('d', 'baz', 0);

      const values = await cache.mget(['a', 'b', 'c', 'd']);

      expect(values).toEqual([undefined, 'bar', undefined, 'baz']);
    });

    it('records a miss if there is nothing cached', async () => {
      const onRead = jest.fn();
      cache.on('read', onRead);

      await cache.set('b', 'bar', 0);
      await cache.set('d', 'baz', 0);

      await cache.mget(['a', 'b', 'c', 'd']);

      expect(onRead).toHaveBeenCalledWith('a', false, CacheOperation.Mget);
      expect(onRead).toHaveBeenCalledWith('c', false, CacheOperation.Mget);
    });

    it('records a hit if there is something cached', async () => {
      const onRead = jest.fn();
      cache.on('read', onRead);

      await cache.set('b', 'bar', 0);
      await cache.set('d', 'baz', 0);

      await cache.mget(['a', 'b', 'c', 'd']);

      expect(onRead).toHaveBeenCalledWith('b', true, CacheOperation.Mget);
      expect(onRead).toHaveBeenCalledWith('d', true, CacheOperation.Mget);
    });

    it("deserializes the value if it's cached", async () => {
      await cache.set('b', 'bar', 0);
      await cache.set('d', 'baz', 0);

      await cache.mget(['a', 'b', 'c', 'd']);

      expect(mockOptions.deserialize).toHaveBeenCalledWith('"bar"', 'b');
      expect(mockOptions.deserialize).toHaveBeenCalledWith('"baz"', 'd');
    });

    it('does nothing if nothing requested', async () => {
      const onRead = jest.fn();
      cache.on('read', onRead);

      const values = await cache.mget([]);

      expect(values).toEqual([]);
      expect(onRead).not.toHaveBeenCalled();
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(adapter, 'cache-a');
      const cacheB = new Cache(adapter, 'cache-b');
      const cacheC = new Cache(adapter);

      await cacheA.set('foo', 'bar', 0);
      await cacheB.set('foo', 'baz', 0);
      await cacheC.set('foo', 'qux', 0);

      const valuesA = await cacheA.mget(['foo', 'bar']);
      const valuesB = await cacheB.mget(['foo', 'bar']);
      const valuesC = await cacheC.mget(['foo', 'bar']);

      expect(valuesA).toEqual(['bar', undefined]);
      expect(valuesB).toEqual(['baz', undefined]);
      expect(valuesC).toEqual(['qux', undefined]);
    });
  });

  describe('set', () => {
    it('sets value', async () => {
      await cache.set('foo', 'bar', 0);

      const value = await cache.get('foo');

      expect(value).toBe('bar');
    });

    it('sets ttl', async () => {
      await cache.set('foo', 'bar', 1000);

      const ttl = await cache.getRemainingTtl('foo');

      expect(ttl).toBe(1000);
    });

    it('converts string ttl to ms', async () => {
      await cache.set('foo', 'bar', '1s');

      const ttl = await cache.getRemainingTtl('foo');

      expect(ttl).toBe(1000);
    });

    it("calls the ttl producer if it's a function", async () => {
      const producer = jest.fn().mockReturnValue(1000);

      await cache.set('foo', 'bar', producer);

      expect(producer).toHaveBeenCalledWith('bar');

      const ttl = await cache.getRemainingTtl('foo');

      expect(ttl).toBe(1000);
    });

    it("converts ttl producer's string ttl to ms", async () => {
      await cache.set('foo', 'bar', () => '1s' as const);

      const ttl = await cache.getRemainingTtl('foo');

      expect(ttl).toBe(1000);
    });

    it('serializes the value before storing it', async () => {
      await cache.set('foo', 'bar', 0);

      expect(mockOptions.serialize).toHaveBeenCalledWith('bar', 'foo');
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(adapter, 'cache-a');
      const cacheB = new Cache(adapter, 'cache-b');
      const cacheC = new Cache(adapter);

      await cacheA.set('foo', 'bar', 0);
      await cacheB.set('foo', 'baz', 0);
      await cacheC.set('foo', 'qux', 0);

      const valueA = await cacheA.get('foo');
      const valueB = await cacheB.get('foo');
      const valueC = await cacheC.get('foo');

      expect(valueA).toBe('bar');
      expect(valueB).toBe('baz');
      expect(valueC).toBe('qux');
    });
  });

  describe('mset', () => {
    it('sets all values', async () => {
      await cache.mset(['bar', 'baz'], (d) => `foo-${d}`, 0);

      const valueA = await cache.get('foo-bar');
      const valueB = await cache.get('foo-baz');

      expect(valueA).toBe('bar');
      expect(valueB).toBe('baz');
    });

    it('calls makeKey with value and index', async () => {
      const makeKey = jest.fn().mockReturnValue('foo');

      await cache.mset(['foo', 'bar', 'baz', 'qux'], makeKey, 0);

      expect(makeKey).toHaveBeenCalledWith('foo', 0);
      expect(makeKey).toHaveBeenCalledWith('bar', 1);
      expect(makeKey).toHaveBeenCalledWith('baz', 2);
      expect(makeKey).toHaveBeenCalledWith('qux', 3);
    });

    it('sets ttl', async () => {
      await cache.mset(['bar', 'baz'], (d) => `foo-${d}`, 1000);

      const ttlA = await cache.getRemainingTtl('foo-bar');
      const ttlB = await cache.getRemainingTtl('foo-baz');

      expect(ttlA).toBe(1000);
      expect(ttlB).toBe(1000);
    });

    it('converts string ttl to ms', async () => {
      await cache.mset(['bar', 'baz'], (d) => `foo-${d}`, '1s');

      const ttlA = await cache.getRemainingTtl('foo-bar');
      const ttlB = await cache.getRemainingTtl('foo-baz');

      expect(ttlA).toBe(1000);
      expect(ttlB).toBe(1000);
    });

    it('calls the ttl producer with the value and index', async () => {
      const producer = jest.fn().mockReturnValue(1000);

      await cache.mset(['bar', 'baz'], (d) => `foo-${d}`, producer);

      expect(producer).toHaveBeenCalledWith('bar', 0);
      expect(producer).toHaveBeenCalledWith('baz', 1);

      const ttlA = await cache.getRemainingTtl('foo-bar');
      const ttlB = await cache.getRemainingTtl('foo-baz');

      expect(ttlA).toBe(1000);
      expect(ttlB).toBe(1000);
    });

    it("converts ttl producer's string ttl to ms", async () => {
      await cache.mset(
        ['bar', 'baz'],
        (d) => `foo-${d}`,
        () => '1s' as const,
      );

      const ttlA = await cache.getRemainingTtl('foo-bar');
      const ttlB = await cache.getRemainingTtl('foo-baz');

      expect(ttlA).toBe(1000);
      expect(ttlB).toBe(1000);
    });

    it('supports individual ttl values', async () => {
      await cache.mset(
        ['bar', 'baz'],
        (d) => `foo-${d}`,
        (_, i) => (i + 1) * 1000,
      );

      const ttlA = await cache.getRemainingTtl('foo-bar');
      const ttlB = await cache.getRemainingTtl('foo-baz');

      expect(ttlA).toBe(1000);
      expect(ttlB).toBe(2000);
    });

    it('serializes the values before storing them', async () => {
      await cache.mset(['bar', 'baz'], (d) => `foo-${d}`, 0);

      expect(mockOptions.serialize).toHaveBeenCalledWith('bar', 'foo-bar');
      expect(mockOptions.serialize).toHaveBeenCalledWith('baz', 'foo-baz');
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(adapter, 'cache-a');
      const cacheB = new Cache(adapter, 'cache-b');
      const cacheC = new Cache(adapter);

      await cacheA.mset(['bar'], () => `foo`, 0);
      await cacheB.mset(['baz'], () => `foo`, 0);
      await cacheC.mset(['qux'], () => `foo`, 0);

      const valueA = await cacheA.get('foo');
      const valueB = await cacheB.get('foo');
      const valueC = await cacheC.get('foo');

      expect(valueA).toBe('bar');
      expect(valueB).toBe('baz');
      expect(valueC).toBe('qux');
    });
  });

  describe('del', () => {
    it('drops value', async () => {
      await cache.set('foo', 'bar', 0);

      await cache.del('foo');

      const value = await cache.get('foo');

      expect(value).toBeUndefined();
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(adapter, 'cache-a');
      const cacheB = new Cache(adapter, 'cache-b');
      const cacheC = new Cache(adapter);

      await cacheA.set('foo', 'bar', 0);
      await cacheB.set('foo', 'baz', 0);
      await cacheC.set('foo', 'qux', 0);

      await cacheA.del('foo');
      await cacheB.del('foo');
      await cacheC.del('foo');

      const valueA = await cacheA.get('foo');
      const valueB = await cacheB.get('foo');
      const valueC = await cacheC.get('foo');

      expect(valueA).toBeUndefined();
      expect(valueB).toBeUndefined();
      expect(valueC).toBeUndefined();
    });
  });

  describe('mdel', () => {
    it('drops values', async () => {
      await cache.set('foo', 'bar', 0);
      await cache.set('bar', 'baz', 0);

      await cache.mdel(['foo', 'bar']);

      const valueA = await cache.get('foo');
      const valueB = await cache.get('bar');

      expect(valueA).toBeUndefined();
      expect(valueB).toBeUndefined();
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(adapter, 'cache-a');
      const cacheB = new Cache(adapter, 'cache-b');
      const cacheC = new Cache(adapter);

      await cacheA.set('foo', 'bar', 0);
      await cacheB.set('foo', 'baz', 0);
      await cacheC.set('foo', 'qux', 0);

      await cacheA.mdel(['foo']);
      await cacheB.mdel(['foo']);
      await cacheC.mdel(['foo']);

      const valueA = await cacheA.get('foo');
      const valueB = await cacheB.get('foo');
      const valueC = await cacheC.get('foo');

      expect(valueA).toBeUndefined();
      expect(valueB).toBeUndefined();
      expect(valueC).toBeUndefined();
    });
  });

  describe('pdel', () => {
    it('drops values', async () => {
      await cache.set('foo-a', 'bar', 0);
      await cache.set('foo-b', 'baz', 0);

      await cache.pdel('foo-*');

      const valueA = await cache.get('foo-a');
      const valueB = await cache.get('foo-b');

      expect(valueA).toBeUndefined();
      expect(valueB).toBeUndefined();
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(adapter, 'cache-a');
      const cacheB = new Cache(adapter, 'cache-b');
      const cacheC = new Cache(adapter);

      await cacheA.set('foo-a', 'bar', 0);
      await cacheB.set('foo-a', 'baz', 0);
      await cacheC.set('foo-a', 'qux', 0);

      await cacheA.pdel('foo-*');
      await cacheB.pdel('foo-*');
      await cacheC.pdel('foo-*');

      const valueA = await cacheA.get('foo-a');
      const valueB = await cacheB.get('foo-a');
      const valueC = await cacheC.get('foo-a');

      expect(valueA).toBeUndefined();
      expect(valueB).toBeUndefined();
      expect(valueC).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('drops all values', async () => {
      await cache.set('foo', 'bar', 0);
      await cache.set('bar', 'baz', 0);

      await cache.clear();

      const valueA = await cache.get('foo');
      const valueB = await cache.get('bar');

      expect(valueA).toBeUndefined();
      expect(valueB).toBeUndefined();
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(adapter, 'cache-a');
      const cacheB = new Cache(adapter, 'cache-b');
      const cacheC = new Cache(adapter);

      await cacheA.set('foo', 'bar', 0);
      await cacheB.set('foo', 'baz', 0);
      await cacheC.set('foo', 'qux', 0);

      await cacheA.clear();

      {
        const valueA = await cacheA.get('foo');
        const valueB = await cacheB.get('foo');
        const valueC = await cacheC.get('foo');

        expect(valueA).toBeUndefined();
        expect(valueB).toBe('baz');
        expect(valueC).toBe('qux');
      }

      // Since C has no prefix, it also includes 'cache-b*'
      await cacheC.clear();

      {
        const valueA = await cacheA.get('foo');
        const valueB = await cacheB.get('foo');
        const valueC = await cacheC.get('foo');

        expect(valueA).toBeUndefined();
        expect(valueB).toBeUndefined();
        expect(valueC).toBeUndefined();
      }
    });
  });

  describe('has', () => {
    it('returns true if the value exists', async () => {
      await cache.set('foo', 'bar', 0);

      const value = await cache.has('foo');

      expect(value).toBe(true);
    });

    it('returns false if the value does not exist', async () => {
      const value = await cache.has('foo');

      expect(value).toBe(false);
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(adapter, 'cache-a');
      const cacheB = new Cache(adapter, 'cache-b');
      const cacheC = new Cache(adapter);

      await cacheA.set('foo', 'bar', 0);

      {
        const valueA = await cacheA.has('foo');
        const valueB = await cacheB.has('foo');
        const valueC = await cacheC.has('foo');

        expect(valueA).toBe(true);
        expect(valueB).toBe(false);
        expect(valueC).toBe(false);
      }

      await cacheB.set('foo', 'baz', 0);

      {
        const valueA = await cacheA.has('foo');
        const valueB = await cacheB.has('foo');
        const valueC = await cacheC.has('foo');

        expect(valueA).toBe(true);
        expect(valueB).toBe(true);
        expect(valueC).toBe(false);
      }

      await cacheC.set('foo', 'qux', 0);

      {
        const valueA = await cacheA.has('foo');
        const valueB = await cacheB.has('foo');
        const valueC = await cacheC.has('foo');

        expect(valueA).toBe(true);
        expect(valueB).toBe(true);
        expect(valueC).toBe(true);
      }
    });
  });

  describe('mhas', () => {
    it('returns true if all values exist', async () => {
      await cache.set('foo', 'bar', 0);
      await cache.set('bar', 'baz', 0);

      const value = await cache.mhas(['foo', 'bar']);

      expect(value).toBe(true);
    });

    it('returns false if any value does not exist', async () => {
      await cache.set('foo', 'bar', 0);

      const value = await cache.mhas(['foo', 'bar']);

      expect(value).toBe(false);
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(adapter, 'cache-a');
      const cacheB = new Cache(adapter, 'cache-b');
      const cacheC = new Cache(adapter);

      await cacheA.set('foo', 'bar', 0);

      {
        const valueA = await cacheA.mhas(['foo']);
        const valueB = await cacheB.mhas(['foo']);
        const valueC = await cacheC.mhas(['foo']);

        expect(valueA).toBe(true);
        expect(valueB).toBe(false);
        expect(valueC).toBe(false);
      }

      await cacheB.set('foo', 'baz', 0);

      {
        const valueA = await cacheA.mhas(['foo']);
        const valueB = await cacheB.mhas(['foo']);
        const valueC = await cacheC.mhas(['foo']);

        expect(valueA).toBe(true);
        expect(valueB).toBe(true);
        expect(valueC).toBe(false);
      }

      await cacheC.set('foo', 'qux', 0);

      {
        const valueA = await cacheA.mhas(['foo']);
        const valueB = await cacheB.mhas(['foo']);
        const valueC = await cacheC.mhas(['foo']);

        expect(valueA).toBe(true);
        expect(valueB).toBe(true);
        expect(valueC).toBe(true);
      }
    });
  });

  describe('cached', () => {
    it("doesn't run the producer if the value is cached", async () => {
      await cache.set('foo', 'bar', 0);
      const producer = jest.fn().mockResolvedValue('baz');

      const value = await cache.cached('foo', producer, 0);

      expect(value).toBe('bar');
      expect(producer).toHaveBeenCalledTimes(0);
    });

    it('records a hit if there is something cached', async () => {
      const onRead = jest.fn();
      cache.on('read', onRead);

      await cache.set('foo', 'bar', 0);

      await cache.cached('foo', async () => 'baz', 0);

      expect(onRead).toHaveBeenCalledWith('foo', true, CacheOperation.Cached);
    });

    it("deserializes the value if it's cached", async () => {
      await cache.set('foo', 'bar', 0);

      await cache.cached('foo', async () => 'baz', 0);

      expect(mockOptions.deserialize).toHaveBeenCalledWith('"bar"', 'foo');
    });

    it('runs the producer if nothing cached', async () => {
      const producer = jest.fn().mockResolvedValue('bar');

      const value = await cache.cached('foo', producer, 0);

      expect(value).toBe('bar');
      expect(producer).toHaveBeenCalledTimes(1);
    });

    it("saves the producer's result", async () => {
      await cache.cached('foo', async () => 'bar', 0);

      const value = await cache.get('foo');

      expect(value).toBe('bar');
    });

    it('sets ttl', async () => {
      await cache.cached('foo', async () => 'bar', 1000);

      const ttl = await cache.getRemainingTtl('foo');

      expect(ttl).toBe(1000);
    });

    it('converts string ttl to ms', async () => {
      await cache.cached('foo', async () => 'bar', '1s');

      const ttl = await cache.getRemainingTtl('foo');

      expect(ttl).toBe(1000);
    });

    it("calls the ttl producer if it's a function", async () => {
      const producer = jest.fn().mockReturnValue(1000);

      await cache.cached('foo', async () => 'bar', producer);

      expect(producer).toHaveBeenCalledWith('bar');

      const ttl = await cache.getRemainingTtl('foo');

      expect(ttl).toBe(1000);
    });

    it("converts ttl producer's string ttl to ms", async () => {
      await cache.cached(
        'foo',
        async () => 'bar',
        () => '1s' as const,
      );

      const ttl = await cache.getRemainingTtl('foo');

      expect(ttl).toBe(1000);
    });

    it('records a miss if there is nothing cached', async () => {
      const onRead = jest.fn();
      cache.on('read', onRead);

      await cache.cached('foo', async () => 'bar', 0);

      expect(onRead).toHaveBeenCalledWith('foo', false, CacheOperation.Cached);
    });

    it('serializes the value before storing it', async () => {
      await cache.cached('foo', async () => 'bar', 0);

      expect(mockOptions.serialize).toHaveBeenCalledWith('bar', 'foo');
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(adapter, 'cache-a');
      const cacheB = new Cache(adapter, 'cache-b');
      const cacheC = new Cache(adapter);

      await cacheA.cached('foo', async () => 'bar', 0);
      await cacheB.cached('foo', async () => 'baz', 0);
      await cacheC.cached('foo', async () => 'qux', 0);

      const valueA = await cacheA.get('foo');
      const valueB = await cacheB.get('foo');
      const valueC = await cacheC.get('foo');

      expect(valueA).toBe('bar');
      expect(valueB).toBe('baz');
      expect(valueC).toBe('qux');
    });
  });

  describe('mcached', () => {
    it('runs the producer for those items that are not cached', async () => {
      await cache.set('foo-b', 'bar', 0);
      await cache.set('foo-d', 'qux', 0);
      const producer = jest.fn().mockResolvedValue(['foo', 'baz']);

      const value = await cache.mcached(
        ['a', 'b', 'c', 'd'],
        (d) => `foo-${d}`,
        producer,
        0,
      );

      expect(producer).toHaveBeenCalledWith(['a', 'c']);
      expect(value).toEqual(['foo', 'bar', 'baz', 'qux']);
    });

    it('records a miss for those items that are not cached', async () => {
      const onRead = jest.fn();
      cache.on('read', onRead);

      await cache.set('foo-b', 'bar', 0);
      await cache.set('foo-d', 'baz', 0);

      await cache.mcached(
        ['a', 'b', 'c', 'd'],
        (d) => `foo-${d}`,
        async () => ['foo', 'baz'],
        0,
      );

      expect(onRead).toHaveBeenCalledWith(
        'foo-a',
        false,
        CacheOperation.Mcached,
      );
      expect(onRead).toHaveBeenCalledWith(
        'foo-c',
        false,
        CacheOperation.Mcached,
      );
    });

    it('records a hit for those items that are cached', async () => {
      const onRead = jest.fn();
      cache.on('read', onRead);

      await cache.set('foo-b', 'bar', 0);
      await cache.set('foo-d', 'baz', 0);

      await cache.mcached(
        ['a', 'b', 'c', 'd'],
        (d) => `foo-${d}`,
        async () => ['foo', 'baz'],
        0,
      );

      expect(onRead).toHaveBeenCalledWith(
        'foo-b',
        true,
        CacheOperation.Mcached,
      );
      expect(onRead).toHaveBeenCalledWith(
        'foo-d',
        true,
        CacheOperation.Mcached,
      );
    });

    it('deserializes those values that are cached', async () => {
      await cache.set('foo-b', 'bar', 0);
      await cache.set('foo-d', 'baz', 0);

      await cache.mcached(
        ['a', 'b', 'c', 'd'],
        (d) => `foo-${d}`,
        async () => ['foo', 'baz'],
        0,
      );

      expect(mockOptions.deserialize).toHaveBeenCalledWith('"bar"', 'foo-b');
      expect(mockOptions.deserialize).toHaveBeenCalledWith('"baz"', 'foo-d');
    });

    it('serializes the values before storing them', async () => {
      await cache.set('foo-b', 'bar', 0);
      await cache.set('foo-d', 'baz', 0);

      await cache.mcached(
        ['a', 'b', 'c', 'd'],
        (d) => `foo-${d}`,
        async () => ['foo', 'baz'],
        0,
      );

      expect(mockOptions.serialize).toHaveBeenCalledWith('foo', 'foo-a');
      expect(mockOptions.serialize).toHaveBeenCalledWith('baz', 'foo-c');
    });

    it("doesn't run the producer if all items are cached", async () => {
      await cache.set('foo-a', 'bar', 0);
      await cache.set('foo-b', 'baz', 0);
      await cache.set('foo-c', 'qux', 0);
      const producer = jest.fn();

      await cache.mcached(['a', 'b', 'c'], (d) => `foo-${d}`, producer, 0);

      expect(producer).not.toHaveBeenCalled();
    });

    it('records a hit if all items are cached', async () => {
      const onRead = jest.fn();
      cache.on('read', onRead);

      await cache.set('foo-a', 'bar', 0);
      await cache.set('foo-b', 'baz', 0);
      await cache.set('foo-c', 'qux', 0);

      await cache.mcached(
        ['a', 'b', 'c'],
        (d) => `foo-${d}`,
        async () => [],
        0,
      );

      expect(onRead).toHaveBeenCalledWith(
        'foo-a',
        true,
        CacheOperation.Mcached,
      );
      expect(onRead).toHaveBeenCalledWith(
        'foo-b',
        true,
        CacheOperation.Mcached,
      );
      expect(onRead).toHaveBeenCalledWith(
        'foo-c',
        true,
        CacheOperation.Mcached,
      );
    });

    it('records a miss if no items are cached', async () => {
      const onRead = jest.fn();
      cache.on('read', onRead);

      await cache.mcached(
        ['a', 'b', 'c', 'd'],
        (d) => `foo-${d}`,
        async () => ['foo', 'bar', 'baz', 'qux'],
        0,
      );

      expect(onRead).toHaveBeenCalledWith(
        'foo-a',
        false,
        CacheOperation.Mcached,
      );
      expect(onRead).toHaveBeenCalledWith(
        'foo-b',
        false,
        CacheOperation.Mcached,
      );
      expect(onRead).toHaveBeenCalledWith(
        'foo-c',
        false,
        CacheOperation.Mcached,
      );
      expect(onRead).toHaveBeenCalledWith(
        'foo-d',
        false,
        CacheOperation.Mcached,
      );
    });

    it("stores the producer's result", async () => {
      await cache.mcached(
        ['a', 'b', 'c'],
        (d) => `foo-${d}`,
        async () => ['foo', 'bar', 'baz'],
        0,
      );

      const valueA = await cache.get('foo-a');
      const valueB = await cache.get('foo-b');
      const valueC = await cache.get('foo-c');

      expect(valueA).toBe('foo');
      expect(valueB).toBe('bar');
      expect(valueC).toBe('baz');
    });

    it('sets ttl', async () => {
      await cache.mcached(
        ['a', 'b', 'c'],
        (d) => `foo-${d}`,
        async () => ['foo', 'bar', 'baz'],
        1000,
      );

      const ttlA = await cache.getRemainingTtl('foo-a');
      const ttlB = await cache.getRemainingTtl('foo-b');
      const ttlC = await cache.getRemainingTtl('foo-c');

      expect(ttlA).toBe(1000);
      expect(ttlB).toBe(1000);
      expect(ttlC).toBe(1000);
    });

    it('converts string ttl to ms', async () => {
      await cache.mcached(
        ['a', 'b', 'c'],
        (d) => `foo-${d}`,
        async () => ['foo', 'bar', 'baz'],
        '1s',
      );

      const ttlA = await cache.getRemainingTtl('foo-a');
      const ttlB = await cache.getRemainingTtl('foo-b');
      const ttlC = await cache.getRemainingTtl('foo-c');

      expect(ttlA).toBe(1000);
      expect(ttlB).toBe(1000);
      expect(ttlC).toBe(1000);
    });

    it("calls the ttl producer if it's a function", async () => {
      const producer = jest.fn().mockReturnValue(1000);

      await cache.mcached(
        ['a', 'b', 'c'],
        (d) => `foo-${d}`,
        async () => ['foo', 'bar', 'baz'],
        producer,
      );

      expect(producer).toHaveBeenCalledWith('foo', 0);
      expect(producer).toHaveBeenCalledWith('bar', 1);
      expect(producer).toHaveBeenCalledWith('baz', 2);

      const ttlA = await cache.getRemainingTtl('foo-a');
      const ttlB = await cache.getRemainingTtl('foo-b');
      const ttlC = await cache.getRemainingTtl('foo-c');

      expect(ttlA).toBe(1000);
      expect(ttlB).toBe(1000);
      expect(ttlC).toBe(1000);
    });

    it("converts ttl producer's string ttl to ms", async () => {
      await cache.mcached(
        ['a', 'b', 'c'],
        (d) => `foo-${d}`,
        async () => ['foo', 'bar', 'baz'],
        () => '1s' as const,
      );

      const ttlA = await cache.getRemainingTtl('foo-a');
      const ttlB = await cache.getRemainingTtl('foo-b');
      const ttlC = await cache.getRemainingTtl('foo-c');

      expect(ttlA).toBe(1000);
      expect(ttlB).toBe(1000);
      expect(ttlC).toBe(1000);
    });

    it('supports individual ttl values', async () => {
      await cache.mcached(
        ['a', 'b', 'c'],
        (d) => `foo-${d}`,
        async () => ['foo', 'bar', 'baz'],
        (_, i) => (i + 1) * 1000,
      );

      const ttlA = await cache.getRemainingTtl('foo-a');
      const ttlB = await cache.getRemainingTtl('foo-b');
      const ttlC = await cache.getRemainingTtl('foo-c');

      expect(ttlA).toBe(1000);
      expect(ttlB).toBe(2000);
      expect(ttlC).toBe(3000);
    });

    it('calls makeKey with value and index', async () => {
      await cache.set('foo-a', 'bar', 0);
      await cache.set('foo-b', 'baz', 0);
      await cache.set('foo-c', 'qux', 0);

      const makeKey = jest.fn((data: string) => `foo-${data}`);

      await cache.mcached(['a', 'b', 'c'], makeKey, async () => [], 0);

      expect(makeKey).toHaveBeenCalledWith('a', 0);
      expect(makeKey).toHaveBeenCalledWith('b', 1);
      expect(makeKey).toHaveBeenCalledWith('c', 2);
    });

    it("throws an error if the producer doesn't return as many values as requested", async () => {
      {
        const producer = jest.fn().mockResolvedValue(['foo', 'baz']);

        const valuePromise = cache.mcached(
          ['a'],
          (d) => `foo-${d}`,
          producer,
          0,
        );

        await expect(valuePromise).rejects.toThrow(
          'The producer did not return exactly as many results as inputs were given.',
        );
        expect(producer).toHaveBeenCalledWith(['a']);

        const val = await cache.get('foo-a');

        expect(val).toBeUndefined();
      }
      {
        const producer = jest.fn().mockResolvedValue([]);

        const valuePromise = cache.mcached(
          ['a'],
          (d) => `foo-${d}`,
          producer,
          0,
        );

        await expect(valuePromise).rejects.toThrow(
          'The producer did not return exactly as many results as inputs were given.',
        );
        expect(producer).toHaveBeenCalledWith(['a']);

        const val = await cache.get('foo-a');

        expect(val).toBeUndefined();
      }
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(adapter, 'cache-a');
      const cacheB = new Cache(adapter, 'cache-b');
      const cacheC = new Cache(adapter);

      await cacheA.mcached(
        ['a'],
        (d) => `foo-${d}`,
        async () => ['bar'],
        0,
      );
      await cacheB.mcached(
        ['a'],
        (d) => `foo-${d}`,
        async () => ['bar'],
        0,
      );
      await cacheC.mcached(
        ['a'],
        (d) => `foo-${d}`,
        async () => ['bar'],
        0,
      );

      const valueA = await cacheA.get('foo-a');
      const valueB = await cacheB.get('foo-a');
      const valueC = await cacheC.get('foo-a');

      expect(valueA).toBe('bar');
      expect(valueB).toBe('bar');
      expect(valueC).toBe('bar');
    });
  });

  describe('getRemainingTtl', () => {
    it('returns the remaining TTL', async () => {
      await cache.set('foo', 'bar', 1000);

      const ttl = await cache.getRemainingTtl('foo');

      expect(ttl).toBe(1000);
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(adapter, 'cache-a');
      const cacheB = new Cache(adapter, 'cache-b');
      const cacheC = new Cache(adapter);

      await cacheA.set('foo', 'bar', 1000);
      await cacheB.set('foo', 'baz', 2000);
      await cacheC.set('foo', 'qux', 3000);

      await cacheA.getRemainingTtl('foo');
      await cacheB.getRemainingTtl('foo');
      await cacheC.getRemainingTtl('foo');

      const ttlA = await cacheA.getRemainingTtl('foo');
      const ttlB = await cacheB.getRemainingTtl('foo');
      const ttlC = await cacheC.getRemainingTtl('foo');

      expect(ttlA).toBe(1000);
      expect(ttlB).toBe(2000);
      expect(ttlC).toBe(3000);
    });
  });
});
