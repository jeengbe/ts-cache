import * as fs from 'fs';
import micromatch from 'micromatch';
import * as path from 'path';
import type { CacheAdapter } from '.';

export interface TtlCacheEngine<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V, options: { ttl: number }): this;
  delete(key: K): boolean;
  has(key: K): boolean;
  entries(): IterableIterator<[K, V]>;
  keys(): IterableIterator<K>;
  clear(): void;
  // Not camel case to match lru-cache's API
  getRemainingTTL(key: K): number | undefined;
}

type CacheBackup = Record<string, { value: string; expireAtMs: number }>;

export interface CacheBackupSaver {
  loadCacheBackup(): CacheBackup;
  saveCacheBackup(cacheBackup: CacheBackup): Promise<void>;
}

export class MemoryCacheAdapter implements CacheAdapter {
  constructor(
    private readonly cache: TtlCacheEngine<string, string>,
    private readonly backupSaver?: CacheBackupSaver,
  ) {
    if (this.backupSaver) {
      const cacheBackup = this.backupSaver.loadCacheBackup();

      this.importCacheFromBackup(cacheBackup);
    }
  }

  async mget(keys: readonly string[]): Promise<(string | undefined)[]> {
    return keys.map((k) => this.cache.get(k));
  }

  async mset(
    entries: readonly [key: string, value: string, ttlMs: number][],
  ): Promise<void> {
    entries.forEach(([key, value, ttlMs]) => {
      this.cache.set(key, value, {
        ttl: ttlMs,
      });
    });

    // Don't wait for the save to complete
    void this.saveBackup();
  }

  async mdel(keys: readonly string[]): Promise<void> {
    keys.forEach((key) => this.cache.delete(key));

    // Don't wait for the save to complete
    void this.saveBackup();
  }

  async pdel(pattern: string): Promise<void> {
    if (pattern === '*') {
      this.cache.clear();
      return;
    }

    const keys = Array.from(this.cache.keys());

    const keysToDelete = micromatch(keys, pattern);

    keysToDelete.forEach((key) => this.cache.delete(key));

    // Don't wait for the save to complete
    void this.saveBackup();
  }

  async mhas(keys: readonly string[]): Promise<boolean> {
    return keys.every((k) => this.cache.has(k));
  }

  async getRemainingTtl(key: string): Promise<number | undefined> {
    return this.cache.getRemainingTTL(key);
  }

  private importCacheFromBackup(cacheBackup: CacheBackup): void {
    const now = Date.now();

    Object.entries(cacheBackup).forEach(([key, { value, expireAtMs }]) => {
      if (expireAtMs > now) {
        this.cache.set(key, value, {
          ttl: expireAtMs - now,
        });
      }
    });
  }

  private async saveBackup(): Promise<void> {
    if (!this.backupSaver) return;

    const cacheBackup = this.createCacheBackup();

    await this.backupSaver.saveCacheBackup(cacheBackup);
  }

  private createCacheBackup(): CacheBackup {
    const now = Date.now();

    return Array.from(this.cache.entries()).reduce<CacheBackup>(
      (cacheBackup, [key, value]) => {
        const ttl = this.cache.getRemainingTTL(key);

        /* istanbul ignore else -- All keys should have a TTL, but just to be sure... */
        if (ttl) {
          const expireAt = now + ttl;

          cacheBackup[key] = { value, expireAtMs: expireAt };
        }

        return cacheBackup;
      },
      {},
    );
  }
}

export class DiskCacheBackupSaver implements CacheBackupSaver {
  constructor(private readonly filePath: string) {}

  loadCacheBackup(): CacheBackup {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    return this.tryToLoadFromDisk() ?? {};
  }

  /**
   * @returns The cache backup if it was successfully loaded from disk, otherwise null
   */
  private tryToLoadFromDisk(): CacheBackup | null {
    if (!fs.existsSync(this.filePath)) {
      return null;
    }

    const cacheBackupString = fs.readFileSync(this.filePath, 'utf8');

    try {
      return JSON.parse(cacheBackupString) as CacheBackup;
    } catch {
      // The cache file did not manage to save correctly, so don't restore it.
      return null;
    }
  }

  private saving = false;

  async saveCacheBackup(cacheBackup: CacheBackup): Promise<void> {
    if (this.saving) return;
    this.saving = true;

    const cacheBackupString = JSON.stringify(cacheBackup);

    try {
      await fs.promises.writeFile(this.filePath, cacheBackupString, {
        encoding: 'utf8',
      });
    } finally {
      this.saving = false;
    }
  }
}
