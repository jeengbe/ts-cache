import type { Redis } from 'ioredis';
import type { CacheAdapter } from '.';

export class RedisCacheAdapter implements CacheAdapter {
  constructor(private readonly client: Redis) {}

  async get(key: string): Promise<string | undefined> {
    try {
      return await this._get(key);
    } catch (err) {
      throw new Error('Failed to get key from Redis.', {
        cause: err,
      });
    }
  }

  private async _get(key: string): Promise<string | undefined> {
    return (await this.client.get(key)) ?? undefined;
  }

  async mget(keys: readonly string[]): Promise<(string | undefined)[]> {
    try {
      return await this._mget(keys);
    } catch (err) {
      throw new Error('Failed to get keys from Redis.', {
        cause: err,
      });
    }
  }

  private async _mget(
    keys: readonly string[],
  ): Promise<(string | undefined)[]> {
    return (await this.client.mget(keys as string[])).map(
      (val) => val ?? undefined,
    );
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    try {
      await this._set(key, value, ttlMs);
    } catch (err) {
      throw new Error('Failed to set key in Redis.', {
        cause: err,
      });
    }
  }

  private async _set(key: string, value: string, ttlMs: number): Promise<void> {
    await this.client.set(key, value, 'PX', ttlMs);
  }

  async mset(
    entries: readonly [key: string, value: string, ttlMs: number][],
  ): Promise<void> {
    try {
      await this._mset(entries);
    } catch (err) {
      throw new Error('Failed to set keys in Redis.', {
        cause: err,
      });
    }
  }

  private async _mset(
    entries: readonly [key: string, value: string, ttlMs: number][],
  ): Promise<void> {
    // MSET key1 value1 key2 value2 ...
    await this.client.mset(...entries.flatMap(([key, value]) => [key, value]));

    const expireTransaction = entries.reduce(
      (acc, [key, , ttlMs]) => acc.pexpire(key, ttlMs),
      this.client.multi(),
    );

    await expireTransaction.exec();
  }

  async del(key: string): Promise<void> {
    try {
      await this._del(key);
    } catch (err) {
      throw new Error('Failed to delete key from Redis.', {
        cause: err,
      });
    }
  }

  private async _del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async mdel(keys: readonly string[]): Promise<void> {
    try {
      await this._mdel(keys);
    } catch (err) {
      throw new Error('Failed to delete keys from Redis.', {
        cause: err,
      });
    }
  }

  private async _mdel(keys: readonly string[]): Promise<void> {
    await this.client.del(...keys);
  }

  async pdel(pattern: string): Promise<void> {
    if (pattern === '*') {
      try {
        await this.client.flushdb();
      } catch (err) {
        throw new Error('Failed to clear Redis.', {
          cause: err,
        });
      }

      return;
    }

    const keys = this.client.scanStream({
      match: pattern,
    });

    const failedKeys: string[] = [];
    const failedWith: unknown[] = [];

    await new Promise<void>((resolve, reject) => {
      keys.on('data', (data: readonly string[]) => {
        if (data.length) {
          this.client.del(...data).catch((err: unknown) => {
            failedKeys.push(...data);
            failedWith.push(err);
          });
        }
      });

      keys.on('error', (err: Error) => {
        reject(
          new Error(
            'Failed to delete keys from Redis. Some keys might have been deleted.',
            {
              cause: err,
            },
          ),
        );

        keys.close();
      });

      keys.on('end', resolve);
    });

    if (failedKeys.length) {
      throw new AggregateError(
        failedWith,
        'Failed to delete keys from Redis. Some keys might have been deleted.',
        {
          cause: {
            failedKeys,
          },
        },
      );
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      return await this._has(key);
    } catch (err) {
      throw new Error('Failed to check if key exists in Redis.', {
        cause: err,
      });
    }
  }

  private async _has(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async mhas(keys: readonly string[]): Promise<boolean> {
    try {
      return await this._mhas(keys);
    } catch (err) {
      throw new Error('Failed to check if keys exist in Redis.', {
        cause: err,
      });
    }
  }

  private async _mhas(keys: readonly string[]): Promise<boolean> {
    return (await this.client.exists(...keys)) === keys.length;
  }

  async getRemainingTtl(key: string): Promise<number | undefined> {
    try {
      return await this._getRemainingTtl(key);
    } catch (err) {
      throw new Error('Failed to get remaining TTL from Redis.', {
        cause: err,
      });
    }
  }

  private async _getRemainingTtl(key: string): Promise<number | undefined> {
    const res = await this.client.pttl(key);

    if (res === -2) {
      return undefined;
    }

    if (res === -1) {
      return Infinity;
    }

    return res;
  }
}
