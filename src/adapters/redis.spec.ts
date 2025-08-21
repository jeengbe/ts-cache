import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import assert from 'assert';
import { Redis, ScanStream } from 'ioredis';
import { CacheAdapter } from './interface';
import { RedisCacheAdapter } from './redis';

class MockScanStream extends ScanStream {
  constructor(private readonly batches: readonly (readonly string[])[]) {
    super({
      objectMode: true,
      command: 'SCAN',
      redis: {} as Redis,
    });
  }

  _read(): void {
    this.batches.forEach((batch) => {
      this.push(batch);
    });

    this.push(null);
  }
}

class MockErrorScanStream extends ScanStream {
  constructor(private readonly error?: Error) {
    super({
      objectMode: true,
      command: 'SCAN',
      redis: {} as Redis,
    });
  }

  _read() {
    this.emit('error', this.error);
  }
}

describe('RedisCacheAdapter', () => {
  jest.setTimeout(60000);

  let redisContainer: StartedRedisContainer;
  let redis: Redis;
  let adapter: CacheAdapter;

  beforeAll(async () => {
    redisContainer = await new RedisContainer('redis:8.2').start();

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
    jest.resetAllMocks();
    jest.restoreAllMocks();
    await redis.flushall();
  });

  describe('mget', () => {
    it('handles getting no values', async () => {
      const values = await adapter.mget([]);

      expect(values).toEqual([]);
    });

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

    describe('wraps Redis errors', () => {
      it('throws an error', async () => {
        jest.spyOn(redis, 'mget').mockRejectedValue(new Error());

        await expect(adapter.mget(['foo', 'baz'])).rejects.toThrow(
          'Failed to get keys from Redis.',
        );
      });

      it('includes the original error', async () => {
        const error = new Error();
        jest.spyOn(redis, 'mget').mockRejectedValue(error);

        try {
          await adapter.mget(['foo', 'baz']);
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          assert(err instanceof Error);

          expect(err.cause).toBe(error);
        }
      });
    });
  });

  describe('mset', () => {
    it('handles setting no values', async () => {
      await adapter.mset([]);
    });

    it('sets the values for the given keys', async () => {
      await adapter.mset([
        ['foo', 'baz', 1000],
        ['bar', 'qux', 2000],
      ]);

      const value = await redis.mget('foo', 'bar');

      expect(value).toEqual(['baz', 'qux']);
    });

    it('sets the values with an expiration', async () => {
      await adapter.mset([
        ['foo', 'bar', 1000],
        ['baz', 'qux', 2000],
      ]);

      expect(await redis.pttl('foo')).toBeLessThanOrEqual(1000);
      expect(await redis.pttl('bar')).toBeLessThanOrEqual(2000);
    });

    it('sets a single value for a given keys', async () => {
      await adapter.mset([['foo', 'baz', 1000]]);

      const value = await redis.mget('foo');

      expect(value).toEqual(['baz']);
    });

    it('sets a single value with an expiration', async () => {
      await adapter.mset([['foo', 'baz', 1000]]);

      expect(await redis.pttl('foo')).toBeLessThanOrEqual(1000);
    });

    describe('wraps Redis errors', () => {
      it('throws an error', async () => {
        jest.spyOn(redis, 'mset').mockRejectedValue(new Error());

        await expect(
          adapter.mset([
            ['foo', 'bar', 1000],
            ['baz', 'qux', 2000],
          ]),
        ).rejects.toThrow('Failed to set keys in Redis.');
      });

      it('includes the original error', async () => {
        const error = new Error();
        jest.spyOn(redis, 'mset').mockRejectedValue(error);

        try {
          await adapter.mset([
            ['foo', 'bar', 1000],
            ['baz', 'qux', 2000],
          ]);
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          assert(err instanceof Error);

          expect(err.cause).toBe(error);
        }
      });
    });
  });

  describe('mdel', () => {
    it('handles deleting no values', async () => {
      await adapter.mdel([]);
    });

    it('deletes the values for the given keys', async () => {
      await redis.mset('foo', 'bar', 'baz', 'qux');

      await adapter.mdel(['foo', 'baz']);

      const exists = await redis.exists('foo', 'baz');

      expect(exists).toBe(0);
    });

    describe('wraps Redis errors', () => {
      it('throws an error', async () => {
        jest.spyOn(redis, 'del').mockRejectedValue(new Error());

        await expect(adapter.mdel(['foo', 'baz'])).rejects.toThrow(
          'Failed to delete keys from Redis.',
        );
      });

      it('includes the original error', async () => {
        const error = new Error();
        jest.spyOn(redis, 'del').mockRejectedValue(error);

        try {
          await adapter.mdel(['foo', 'baz']);
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          assert(err instanceof Error);

          expect(err.cause).toBe(error);
        }
      });
    });
  });

  describe('pdel', () => {
    it('does nothing if the database is empty', async () => {
      await adapter.pdel('foo-*');
    });

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

    it("runs flushdb if the pattern is '*'", async () => {
      await redis.mset('foo-1', 'bar', 'foo-2', 'baz');
      const flushdb = jest.spyOn(redis, 'flushdb');

      await adapter.pdel('*');

      const keys = await redis.keys('*');

      expect(flushdb).toHaveBeenCalled();
      expect(keys).toHaveLength(0);
    });

    it("collects failed keys and errors if they can't be deleted", async () => {
      jest
        .spyOn(redis, 'scanStream')
        .mockReturnValue(
          new MockScanStream([
            ['foo-1', 'foo-2'],
            ['foo-3', 'foo-4'],
            ['foo-5'],
          ]),
        );
      const error = new Error();
      const error2 = new Error();
      jest
        .spyOn(redis, 'del')
        .mockResolvedValueOnce(2)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error2);

      try {
        await adapter.pdel('foo-*');
      } catch (err) {
        expect(err).toBeInstanceOf(AggregateError);
        assert(err instanceof AggregateError);

        expect(err.message).toBe(
          'Failed to delete keys from Redis. Some keys might have been deleted.',
        );
        expect(err.errors).toEqual([error, error2]);
        expect((err.cause as Record<string, unknown>).failedKeys).toEqual([
          'foo-3',
          'foo-4',
          'foo-5',
        ]);
      }
    });

    describe('wraps Redis errors', () => {
      describe('flushdb', () => {
        describe('wraps Redis errors', () => {
          it('throws an error', async () => {
            jest.spyOn(redis, 'flushdb').mockRejectedValue(new Error());

            await expect(adapter.pdel('*')).rejects.toThrow(
              'Failed to clear Redis.',
            );
          });

          it('includes the original error', async () => {
            const error = new Error();
            jest.spyOn(redis, 'flushdb').mockRejectedValue(error);

            try {
              await adapter.pdel('*');
            } catch (err) {
              expect(err).toBeInstanceOf(Error);
              assert(err instanceof Error);

              expect(err.cause).toBe(error);
            }
          });
        });
      });

      describe('other', () => {
        it('throws an error', async () => {
          jest
            .spyOn(redis, 'scanStream')
            .mockReturnValue(new MockErrorScanStream());

          await expect(adapter.pdel('foo-*')).rejects.toThrow(
            'Failed to delete keys from Redis. Some keys might have been deleted.',
          );
        });

        it('includes the original error', async () => {
          const error = new Error();
          jest
            .spyOn(redis, 'scanStream')
            .mockReturnValue(new MockErrorScanStream(error));

          try {
            await adapter.pdel('foo-*');
          } catch (err) {
            expect(err).toBeInstanceOf(Error);
            assert(err instanceof Error);

            expect(err.cause).toBe(error);
          }
        });
      });
    });
  });

  describe('mhas', () => {
    it('returns true if no keys are requested', async () => {
      const exists = await adapter.mhas([]);

      expect(exists).toBe(true);
    });

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

    describe('wraps Redis errors', () => {
      it('throws an error', async () => {
        jest.spyOn(redis, 'exists').mockRejectedValue(new Error());

        await expect(adapter.mhas(['foo', 'baz'])).rejects.toThrow(
          'Failed to check if keys exist in Redis.',
        );
      });

      it('includes the original error', async () => {
        const error = new Error();
        jest.spyOn(redis, 'exists').mockRejectedValue(error);

        try {
          await adapter.mhas(['foo', 'baz']);
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          assert(err instanceof Error);

          expect(err.cause).toBe(error);
        }
      });
    });
  });

  describe('getRemainingTtl', () => {
    it('returns the remaining TTL for the key', async () => {
      await redis.set('foo', 'bar', 'PX', 1000);

      const ttl = await adapter.getRemainingTtl('foo');

      expect(ttl).toBeLessThanOrEqual(1000);
    });

    it("returns Infinity if the key doesn't expire", async () => {
      await redis.set('foo', 'bar');

      const ttl = await adapter.getRemainingTtl('foo');

      expect(ttl).toBe(Infinity);
    });

    it('returns undefined if the key does not exist', async () => {
      const ttl = await adapter.getRemainingTtl('foo');

      expect(ttl).toBeUndefined();
    });

    describe('wraps Redis errors', () => {
      it('throws an error', async () => {
        jest.spyOn(redis, 'pttl').mockRejectedValue(new Error());

        await expect(adapter.getRemainingTtl('foo')).rejects.toThrow(
          'Failed to get remaining TTL from Redis.',
        );
      });

      it('includes the original error', async () => {
        const error = new Error();
        jest.spyOn(redis, 'pttl').mockRejectedValue(error);

        try {
          await adapter.getRemainingTtl('foo');
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          assert(err instanceof Error);

          expect(err.cause).toBe(error);
        }
      });
    });
  });
});
