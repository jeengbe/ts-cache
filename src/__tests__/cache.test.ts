import { Cache, CacheMode } from '..';
import type { CacheAdapter } from '../adapters';

const mockCacheAdapter: jest.Mocked<CacheAdapter> = {
  set: jest.fn(),
  mset: jest.fn(),
  get: jest.fn(),
  mget: jest.fn(),
  del: jest.fn(),
  mdel: jest.fn(),
  pdel: jest.fn(),
  has: jest.fn(),
  mhas: jest.fn(),
};

const mockMetrics = {
  onMiss: jest.fn(),
  onHit: jest.fn(),
};

const serialize = JSON.stringify;
const cache = new Cache(mockCacheAdapter, 'cache', mockMetrics);

beforeEach(() => {
  jest.resetAllMocks();
});

describe('Cache', () => {
  describe('get', () => {
    it('returns undefined if there is nothing cached', async () => {
      mockCacheAdapter.get.mockResolvedValue(undefined);

      const value = await cache.get('foo');

      expect(value).toBeUndefined();
    });

    it('records a miss if there is nothing cached', async () => {
      mockCacheAdapter.get.mockResolvedValue(undefined);

      await cache.get('foo');

      expect(mockMetrics.onMiss).toHaveBeenCalledWith('foo', CacheMode.Get);
    });

    it('returns cached value', async () => {
      mockCacheAdapter.get.mockResolvedValue(serialize('bar'));

      const value = await cache.get('foo');

      expect(value).toBe('bar');
    });

    it('records a hit if there is something cached', async () => {
      mockCacheAdapter.get.mockResolvedValue(serialize('bar'));

      await cache.get('foo');

      expect(mockMetrics.onHit).toHaveBeenCalledWith('foo', CacheMode.Get);
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(mockCacheAdapter, 'cache-a');
      const cacheB = new Cache(mockCacheAdapter, 'cache-b');
      const cacheC = new Cache(mockCacheAdapter);

      await cacheA.get('foo');
      await cacheB.get('foo');
      await cacheC.get('foo');

      expect(mockCacheAdapter.get).toHaveBeenCalledWith('cache-a:foo');
      expect(mockCacheAdapter.get).toHaveBeenCalledWith('cache-b:foo');
      expect(mockCacheAdapter.get).toHaveBeenCalledWith('foo');
    });
  });

  describe('mget', () => {
    it('returns mixed cached value / undefined', async () => {
      mockCacheAdapter.mget.mockResolvedValue([
        undefined,
        serialize('bar'),
        undefined,
        serialize('baz'),
      ]);

      const values = await cache.mget(['a', 'b', 'c', 'd']);

      expect(values).toEqual([undefined, 'bar', undefined, 'baz']);
    });

    it('records a miss if there is nothing cached', async () => {
      mockCacheAdapter.mget.mockResolvedValue([
        undefined,
        serialize('bar'),
        undefined,
        serialize('baz'),
      ]);

      await cache.mget(['a', 'b', 'c', 'd']);

      expect(mockMetrics.onMiss).toHaveBeenCalledWith('a', CacheMode.Mget);
      expect(mockMetrics.onMiss).toHaveBeenCalledWith('c', CacheMode.Mget);
    });

    it('records a hit if there is something cached', async () => {
      mockCacheAdapter.mget.mockResolvedValue([
        undefined,
        serialize('bar'),
        undefined,
        serialize('baz'),
      ]);

      await cache.mget(['a', 'b', 'c', 'd']);

      expect(mockMetrics.onHit).toHaveBeenCalledWith('b', CacheMode.Mget);
      expect(mockMetrics.onHit).toHaveBeenCalledWith('d', CacheMode.Mget);
    });

    it('does nothing if nothing requested', async () => {
      const values = await cache.mget([]);

      expect(values).toEqual([]);
      expect(mockCacheAdapter.mget).not.toHaveBeenCalled();
      expect(mockCacheAdapter.mset).not.toHaveBeenCalled();
      expect(mockMetrics.onMiss).not.toHaveBeenCalled();
      expect(mockMetrics.onHit).not.toHaveBeenCalled();
    });

    it('uses prefix', async () => {
      mockCacheAdapter.mget.mockResolvedValue([]);

      const cacheA = new Cache(mockCacheAdapter, 'cache-a');
      const cacheB = new Cache(mockCacheAdapter, 'cache-b');
      const cacheC = new Cache(mockCacheAdapter);

      await cacheA.mget(['foo', 'bar']);
      await cacheB.mget(['foo', 'bar']);
      await cacheC.mget(['foo', 'bar']);

      expect(mockCacheAdapter.mget).toHaveBeenCalledWith([
        'cache-a:foo',
        'cache-a:bar',
      ]);
      expect(mockCacheAdapter.mget).toHaveBeenCalledWith([
        'cache-b:foo',
        'cache-b:bar',
      ]);
      expect(mockCacheAdapter.mget).toHaveBeenCalledWith(['foo', 'bar']);
    });
  });

  describe('set', () => {
    it('sets value', async () => {
      await cache.set('foo', 'bar', 0);

      expect(mockCacheAdapter.set).toHaveBeenCalledWith(
        'cache:foo',
        serialize('bar'),
        0,
      );
    });

    it('sets ttl', async () => {
      await cache.set('foo', 'bar', 1000);

      expect(mockCacheAdapter.set).toHaveBeenCalledWith(
        'cache:foo',
        serialize('bar'),
        1000,
      );
    });

    it('converts string ttl to ms', async () => {
      await cache.set('foo', 'bar', '1s');

      expect(mockCacheAdapter.set).toHaveBeenCalledWith(
        'cache:foo',
        serialize('bar'),
        1000,
      );
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(mockCacheAdapter, 'cache-a');
      const cacheB = new Cache(mockCacheAdapter, 'cache-b');
      const cacheC = new Cache(mockCacheAdapter);

      await cacheA.set('foo', 'bar', 0);
      await cacheB.set('foo', 'baz', 0);
      await cacheC.set('foo', 'qux', 0);

      expect(mockCacheAdapter.set).toHaveBeenCalledWith(
        'cache-a:foo',
        serialize('bar'),
        0,
      );
      expect(mockCacheAdapter.set).toHaveBeenCalledWith(
        'cache-b:foo',
        serialize('baz'),
        0,
      );
      expect(mockCacheAdapter.set).toHaveBeenCalledWith(
        'foo',
        serialize('qux'),
        0,
      );
    });
  });

  describe('mset', () => {
    it('sets all values', async () => {
      await cache.mset(['bar', 'baz'], (d) => `foo-${d}`, 0);

      expect(mockCacheAdapter.mset).toHaveBeenCalledWith(
        ['cache:foo-bar', 'cache:foo-baz'],
        [serialize('bar'), serialize('baz')],
        0,
      );
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
      await cache.mset(['bar'], (d) => `foo-${d}`, 1000);

      expect(mockCacheAdapter.mset).toHaveBeenCalledWith(
        ['cache:foo-bar'],
        [serialize('bar')],
        1000,
      );
    });

    it('converts string ttl to ms', async () => {
      await cache.mset(['bar'], (d) => `foo-${d}`, '1s');

      expect(mockCacheAdapter.mset).toHaveBeenCalledWith(
        ['cache:foo-bar'],
        [serialize('bar')],
        1000,
      );
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(mockCacheAdapter, 'cache-a');
      const cacheB = new Cache(mockCacheAdapter, 'cache-b');
      const cacheC = new Cache(mockCacheAdapter);

      await cacheA.mset(['bar'], (d) => `foo-${d}`, 0);
      await cacheB.mset(['baz'], (d) => `foo-${d}`, 0);
      await cacheC.mset(['qux'], (d) => `foo-${d}`, 0);

      expect(mockCacheAdapter.mset).toHaveBeenCalledWith(
        ['cache-a:foo-bar'],
        [serialize('bar')],
        0,
      );
      expect(mockCacheAdapter.mset).toHaveBeenCalledWith(
        ['cache-b:foo-baz'],
        [serialize('baz')],
        0,
      );
      expect(mockCacheAdapter.mset).toHaveBeenCalledWith(
        ['foo-qux'],
        [serialize('qux')],
        0,
      );
    });
  });

  describe('del', () => {
    it('drops value', async () => {
      await cache.del('foo');

      expect(mockCacheAdapter.del).toHaveBeenCalledWith('cache:foo');
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(mockCacheAdapter, 'cache-a');
      const cacheB = new Cache(mockCacheAdapter, 'cache-b');
      const cacheC = new Cache(mockCacheAdapter);

      await cacheA.del('foo');
      await cacheB.del('foo');
      await cacheC.del('foo');

      expect(mockCacheAdapter.del).toHaveBeenCalledWith('cache-a:foo');
      expect(mockCacheAdapter.del).toHaveBeenCalledWith('cache-b:foo');
      expect(mockCacheAdapter.del).toHaveBeenCalledWith('foo');
    });
  });

  describe('mdel', () => {
    it('drops values', async () => {
      await cache.mdel(['foo', 'bar']);

      expect(mockCacheAdapter.mdel).toHaveBeenCalledWith([
        'cache:foo',
        'cache:bar',
      ]);
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(mockCacheAdapter, 'cache-a');
      const cacheB = new Cache(mockCacheAdapter, 'cache-b');
      const cacheC = new Cache(mockCacheAdapter);

      await cacheA.mdel(['foo']);
      await cacheB.mdel(['foo']);
      await cacheC.mdel(['foo']);

      expect(mockCacheAdapter.mdel).toHaveBeenCalledWith(['cache-a:foo']);
      expect(mockCacheAdapter.mdel).toHaveBeenCalledWith(['cache-b:foo']);
      expect(mockCacheAdapter.mdel).toHaveBeenCalledWith(['foo']);
    });
  });

  describe('pdel', () => {
    it('drops values', async () => {
      await cache.pdel('foo-*');

      expect(mockCacheAdapter.pdel).toHaveBeenCalledWith('cache:foo-*');
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(mockCacheAdapter, 'cache-a');
      const cacheB = new Cache(mockCacheAdapter, 'cache-b');
      const cacheC = new Cache(mockCacheAdapter);

      await cacheA.pdel('foo-*');
      await cacheB.pdel('foo-*');
      await cacheC.pdel('foo-*');

      expect(mockCacheAdapter.pdel).toHaveBeenCalledWith('cache-a:foo-*');
      expect(mockCacheAdapter.pdel).toHaveBeenCalledWith('cache-b:foo-*');
      expect(mockCacheAdapter.pdel).toHaveBeenCalledWith('foo-*');
    });
  });

  describe('has', () => {
    it('returns what the adapter returns', async () => {
      mockCacheAdapter.has.mockResolvedValue(false);

      const value = await cache.has('foo');

      expect(value).toBe(false);
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(mockCacheAdapter, 'cache-a');
      const cacheB = new Cache(mockCacheAdapter, 'cache-b');
      const cacheC = new Cache(mockCacheAdapter);

      await cacheA.has('foo');
      await cacheB.has('foo');
      await cacheC.has('foo');

      expect(mockCacheAdapter.has).toHaveBeenCalledWith('cache-a:foo');
      expect(mockCacheAdapter.has).toHaveBeenCalledWith('cache-b:foo');
      expect(mockCacheAdapter.has).toHaveBeenCalledWith('foo');
    });
  });

  describe('mhas', () => {
    it('returns what the adapter returns', async () => {
      mockCacheAdapter.mhas.mockResolvedValue(false);

      const value = await cache.mhas(['foo', 'bar']);

      expect(value).toBe(false);
      expect(mockCacheAdapter.mhas).toHaveBeenCalledWith([
        'cache:foo',
        'cache:bar',
      ]);
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(mockCacheAdapter, 'cache-a');
      const cacheB = new Cache(mockCacheAdapter, 'cache-b');
      const cacheC = new Cache(mockCacheAdapter);

      await cacheA.mhas(['foo']);
      await cacheB.mhas(['foo']);
      await cacheC.mhas(['foo']);

      expect(mockCacheAdapter.mhas).toHaveBeenCalledWith(['cache-a:foo']);
      expect(mockCacheAdapter.mhas).toHaveBeenCalledWith(['cache-b:foo']);
      expect(mockCacheAdapter.mhas).toHaveBeenCalledWith(['foo']);
    });
  });

  describe('cached', () => {
    it('runs the producer if nothing cached', async () => {
      mockCacheAdapter.get.mockResolvedValue(undefined);
      const producer = jest.fn().mockResolvedValue('bar');

      const value = await cache.cached('foo', producer, 0);

      expect(mockCacheAdapter.set).toHaveBeenCalledWith(
        'cache:foo',
        serialize('bar'),
        0,
      );
      expect(value).toBe('bar');
      expect(producer).toHaveBeenCalledTimes(1);
    });

    it('records a miss if there is nothing cached', async () => {
      mockCacheAdapter.get.mockResolvedValue(undefined);
      const producer = jest.fn().mockResolvedValue('bar');

      await cache.cached('foo', producer, 0);

      expect(mockMetrics.onMiss).toHaveBeenCalledWith('foo', CacheMode.Cached);
    });

    it("doesn't run the producer if the value is cached", async () => {
      mockCacheAdapter.get.mockResolvedValue(serialize('bar'));
      const producer = jest.fn().mockResolvedValue('baz');

      const value = await cache.cached('foo', producer, 0);

      expect(mockCacheAdapter.set).not.toHaveBeenCalled();
      expect(value).toBe('bar');
      expect(producer).toHaveBeenCalledTimes(0);
    });

    it('records a hit if there is something cached', async () => {
      mockCacheAdapter.get.mockResolvedValue(serialize('bar'));
      const producer = jest.fn().mockResolvedValue('baz');

      await cache.cached('foo', producer, 0);

      expect(mockMetrics.onHit).toHaveBeenCalledWith('foo', CacheMode.Cached);
    });

    it('uses prefix', async () => {
      const cacheA = new Cache(mockCacheAdapter, 'cache-a');
      const cacheB = new Cache(mockCacheAdapter, 'cache-b');
      const cacheC = new Cache(mockCacheAdapter);

      const producer = jest.fn().mockResolvedValue('bar');

      await cacheA.cached('foo', producer, 0);
      await cacheB.cached('foo', producer, 0);
      await cacheC.cached('foo', producer, 0);

      expect(producer).toHaveBeenCalledTimes(3);
      expect(mockCacheAdapter.set).toHaveBeenCalledWith(
        'cache-a:foo',
        serialize('bar'),
        0,
      );
      expect(mockCacheAdapter.set).toHaveBeenCalledWith(
        'cache-b:foo',
        serialize('bar'),
        0,
      );
      expect(mockCacheAdapter.set).toHaveBeenCalledWith(
        'foo',
        serialize('bar'),
        0,
      );
    });
  });

  describe('mcached', () => {
    it('runs the producer for those items that are not cached', async () => {
      mockCacheAdapter.mget.mockResolvedValue([
        undefined,
        serialize('bar'),
        undefined,
        serialize('qux'),
      ]);
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
      mockCacheAdapter.mget.mockResolvedValue([
        undefined,
        serialize('bar'),
        undefined,
        serialize('qux'),
      ]);
      const producer = jest.fn().mockResolvedValue(['foo', 'baz']);

      await cache.mcached(['a', 'b', 'c', 'd'], (d) => `foo-${d}`, producer, 0);

      expect(mockMetrics.onMiss).toHaveBeenCalledWith(
        'foo-a',
        CacheMode.Mcached,
      );
      expect(mockMetrics.onMiss).toHaveBeenCalledWith(
        'foo-c',
        CacheMode.Mcached,
      );
    });

    it('records a hit for those items that are cached', async () => {
      mockCacheAdapter.mget.mockResolvedValue([
        undefined,
        serialize('bar'),
        undefined,
        serialize('qux'),
      ]);
      const producer = jest.fn().mockResolvedValue(['foo', 'baz']);

      await cache.mcached(['a', 'b', 'c', 'd'], (d) => `foo-${d}`, producer, 0);

      expect(mockMetrics.onHit).toHaveBeenCalledWith(
        'foo-b',
        CacheMode.Mcached,
      );
      expect(mockMetrics.onHit).toHaveBeenCalledWith(
        'foo-d',
        CacheMode.Mcached,
      );
    });

    it("doesn't run the producer if all items are cached", async () => {
      mockCacheAdapter.mget.mockResolvedValue([
        serialize('foo'),
        serialize('bar'),
        serialize('baz'),
        serialize('qux'),
      ]);
      const producer = jest.fn();

      await cache.mcached(['a', 'b', 'c', 'd'], (d) => `foo-${d}`, producer, 0);

      expect(producer).not.toHaveBeenCalled();
    });

    it('records a hit if all items are cached', async () => {
      mockCacheAdapter.mget.mockResolvedValue([
        serialize('foo'),
        serialize('bar'),
        serialize('baz'),
        serialize('qux'),
      ]);
      const producer = jest.fn();

      await cache.mcached(['a', 'b', 'c', 'd'], (d) => `foo-${d}`, producer, 0);

      expect(mockMetrics.onHit).toHaveBeenCalledWith(
        'foo-a',
        CacheMode.Mcached,
      );
      expect(mockMetrics.onHit).toHaveBeenCalledWith(
        'foo-b',
        CacheMode.Mcached,
      );
      expect(mockMetrics.onHit).toHaveBeenCalledWith(
        'foo-c',
        CacheMode.Mcached,
      );
      expect(mockMetrics.onHit).toHaveBeenCalledWith(
        'foo-d',
        CacheMode.Mcached,
      );
    });

    it('records a miss if no items are cached', async () => {
      mockCacheAdapter.mget.mockResolvedValue([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
      const producer = jest
        .fn()
        .mockResolvedValue(['foo', 'bar', 'baz', 'qux']);

      await cache.mcached(['a', 'b', 'c', 'd'], (d) => `foo-${d}`, producer, 0);

      expect(mockMetrics.onMiss).toHaveBeenCalledWith(
        'foo-a',
        CacheMode.Mcached,
      );
      expect(mockMetrics.onMiss).toHaveBeenCalledWith(
        'foo-b',
        CacheMode.Mcached,
      );
      expect(mockMetrics.onMiss).toHaveBeenCalledWith(
        'foo-c',
        CacheMode.Mcached,
      );
      expect(mockMetrics.onMiss).toHaveBeenCalledWith(
        'foo-d',
        CacheMode.Mcached,
      );
    });

    it('calls makeKey with value and index', async () => {
      mockCacheAdapter.mget.mockResolvedValue([
        serialize('foo'),
        serialize('bar'),
        serialize('baz'),
        serialize('qux'),
      ]);

      const makeKey = jest.fn().mockReturnValue('foo');

      await cache.mcached(['a', 'b', 'c', 'd'], makeKey, async () => [], 0);

      expect(makeKey).toHaveBeenCalledWith('a', 0);
      expect(makeKey).toHaveBeenCalledWith('b', 1);
      expect(makeKey).toHaveBeenCalledWith('c', 2);
      expect(makeKey).toHaveBeenCalledWith('d', 3);
    });

    it("throws an error if the producer doesn't return as many values as requested", async () => {
      {
        mockCacheAdapter.mget.mockResolvedValue([undefined]);
        const producer = jest.fn().mockResolvedValue(['foo', 'baz']);

        const valuePromise = cache.mcached(
          ['a'],
          (d) => `foo-${d}`,
          producer,
          0,
        );

        await expect(valuePromise).rejects.toThrow();
        expect(producer).toHaveBeenCalledWith(['a']);
        expect(mockCacheAdapter.mset).not.toHaveBeenCalled();
      }
      {
        mockCacheAdapter.mget.mockResolvedValue([undefined]);
        const producer = jest.fn().mockResolvedValue([]);

        const valuePromise = cache.mcached(
          ['a'],
          (d) => `foo-${d}`,
          producer,
          0,
        );

        await expect(valuePromise).rejects.toThrow();
        expect(producer).toHaveBeenCalledWith(['a']);
        expect(mockCacheAdapter.mset).not.toHaveBeenCalled();
      }
    });

    it('uses prefix', async () => {
      mockCacheAdapter.mget.mockResolvedValue([undefined]);
      const cacheA = new Cache(mockCacheAdapter, 'cache-a');
      const cacheB = new Cache(mockCacheAdapter, 'cache-b');
      const cacheC = new Cache(mockCacheAdapter);

      const producer = jest.fn().mockResolvedValue(['bar']);

      await cacheA.mcached(['a'], (d) => `foo-${d}`, producer, 0);
      await cacheB.mcached(['a'], (d) => `foo-${d}`, producer, 0);
      await cacheC.mcached(['a'], (d) => `foo-${d}`, producer, 0);

      expect(producer).toHaveBeenCalledTimes(3);
      expect(mockCacheAdapter.mget).toHaveBeenCalledWith(['cache-a:foo-a']);
      expect(mockCacheAdapter.mget).toHaveBeenCalledWith(['cache-b:foo-a']);
      expect(mockCacheAdapter.mget).toHaveBeenCalledWith(['foo-a']);
      expect(mockCacheAdapter.mset).toHaveBeenCalledWith(
        ['cache-a:foo-a'],
        [serialize('bar')],
        0,
      );
      expect(mockCacheAdapter.mset).toHaveBeenCalledWith(
        ['cache-b:foo-a'],
        [serialize('bar')],
        0,
      );
      expect(mockCacheAdapter.mset).toHaveBeenCalledWith(
        ['foo-a'],
        [serialize('bar')],
        0,
      );
    });
  });
});
