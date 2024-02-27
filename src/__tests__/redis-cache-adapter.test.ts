import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { CacheAdapter, RedisCacheAdapter } from '..';

describe('RedisCacheAdapter', () => {
  jest.setTimeout(60000);

  let redisContainer: StartedRedisContainer;
  let redis: Redis;
  let adapter: CacheAdapter;

  beforeAll(async () => {
    redisContainer = await new RedisContainer().start();

    redis = new Redis(redisContainer.getConnectionUrl());
  });

  afterAll(async () => {
    await redis.quit();
    await redisContainer.stop();
  });

  beforeEach(() => {
    adapter = new RedisCacheAdapter(redis);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await redis.flushall();
  });

  describe('get', () => {
    it('returns the value for the given key', async () => {
      await redis.set('foo', 'bar');

      const value = await adapter.get('foo');

      expect(value).toBe('bar');
    });

    it('returns undefined if the key does not exist', async () => {
      const value = await adapter.get('foo');

      expect(value).toBeUndefined();
    });
  });

  describe('mget', () => {
    it('returns the values for the given keys', async () => {
      await redis.mset('foo', 'bar', 'baz', 'qux');

      const value = await adapter.mget(['foo', 'baz']);

      expect(value).toEqual(['bar', 'qux']);
    });

    it('returns undefined for keys that do not exist', async () => {
      await redis.set('foo', 'bar');

      const value = await adapter.mget(['foo', 'baz']);

      expect(value).toEqual(['bar', undefined]);
    });
  });

  describe('set', () => {
    it('sets the value for the given key', async () => {
      await adapter.set('foo', 'bar', 1000);

      const value = await redis.get('foo');

      expect(value).toBe('bar');
    });

    it('sets the value with an expiration', async () => {
      await adapter.set('foo', 'bar', 1000);

      const value = await redis.get('foo');

      expect(value).toBe('bar');
      expect(await redis.pttl('foo')).toBeLessThanOrEqual(1000);
    });
  });

  describe('mset', () => {
    it('sets the values for the given keys', async () => {
      await adapter.mset(['foo', 'bar'], ['baz', 'qux'], 1000);

      const value = await redis.mget('foo', 'bar');

      expect(value).toEqual(['baz', 'qux']);
    });

    it('sets the values with an expiration', async () => {
      await adapter.mset(['foo', 'bar'], ['baz', 'qux'], 1000);

      expect(await redis.pttl('foo')).toBeLessThanOrEqual(1000);
      expect(await redis.pttl('bar')).toBeLessThanOrEqual(1000);
    });
  });

  describe('del', () => {
    it('deletes the value for the given key', async () => {
      await redis.set('foo', 'bar');

      await adapter.del('foo');

      const exists = await redis.exists('foo');

      expect(exists).toBe(0);
    });
  });

  describe('mdel', () => {
    it('deletes the values for the given keys', async () => {
      await redis.mset('foo', 'bar', 'baz', 'qux');

      await adapter.mdel(['foo', 'baz']);

      const exists = await redis.exists('foo', 'baz');

      expect(exists).toBe(0);
    });
  });

  describe('pdel', () => {
    it('deletes the values for the given pattern', async () => {
      await redis.mset(
        'foo-1',
        'bar',
        'foo-2',
        'baz',
        'qux-1',
        'quux',
        'qux-2',
        'corge',
      );

      await adapter.pdel('foo-*');

      const keys = await redis.keys('*');

      expect(keys).toEqual(expect.arrayContaining(['qux-1', 'qux-2']));
    });
  });

  describe('has', () => {
    it('returns true if the key exists', async () => {
      await redis.set('foo', 'bar');

      const exists = await adapter.has('foo');

      expect(exists).toBe(true);
    });

    it('returns false if the key does not exist', async () => {
      const exists = await adapter.has('foo');

      expect(exists).toBe(false);
    });
  });

  describe('mhas', () => {
    it('returns true if all keys exist', async () => {
      await redis.mset('foo', 'bar', 'baz', 'qux');

      const exists = await adapter.mhas(['foo', 'baz']);

      expect(exists).toBe(true);
    });

    it('returns false if any key does not exist', async () => {
      await redis.set('foo', 'bar');

      const exists = await adapter.mhas(['foo', 'baz']);

      expect(exists).toBe(false);
    });
  });
});
