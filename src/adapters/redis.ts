import type { Redis } from 'ioredis';
import type { CacheAdapter } from '.';

export class RedisCacheAdapter implements CacheAdapter {
  constructor(private readonly client: Redis) {}

  async get(key: string): Promise<string | undefined> {
    return (await this.client.get(key)) ?? undefined;
  }

  async mget(keys: readonly string[]): Promise<(string | undefined)[]> {
    return (await this.client.mget(keys as string[])).map(
      (val) => val ?? undefined,
    );
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    await this.client.set(key, value, 'PX', ttlMs);
  }

  async mset(
    keys: readonly string[],
    values: readonly string[],
    ttlMs: number,
  ): Promise<void> {
    // MSET key1 value1 key2 value2 ...
    await this.client.mset(
      ...keys.reduce<readonly string[]>(
        (acc, key, i) => acc.concat([key, values[i]]),
        [],
      ),
    );

    const expireTransaction = keys.reduce(
      (acc, key) => acc.pexpire(key, ttlMs),
      this.client.multi(),
    );

    await expireTransaction.exec();
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async mdel(keys: readonly string[]): Promise<void> {
    await this.client.del(...keys);
  }

  async has(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async mhas(keys: readonly string[]): Promise<boolean> {
    return (await this.client.exists(...keys)) === keys.length;
  }
}
