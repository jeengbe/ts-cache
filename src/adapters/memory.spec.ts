import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { CacheAdapter } from './interface';
import {
  CacheBackupSaver,
  DiskCacheBackupSaver,
  MemoryCacheAdapter,
  TtlCacheEngine,
} from './memory';

const mockCacheEngine: jest.Mocked<TtlCacheEngine<string, string>> = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  has: jest.fn(),
  entries: jest.fn(),
  keys: jest.fn(),
  clear: jest.fn(),
  getRemainingTTL: jest.fn(),
};

const mockDiskSaver: jest.Mocked<CacheBackupSaver> = {
  loadCacheBackup: jest.fn().mockReturnValue({}),
  saveCacheBackup: jest.fn(),
};

describe('MemoryCacheAdapter', () => {
  let adapter: CacheAdapter;

  beforeEach(() => {
    mockCacheEngine.entries.mockReturnValue([][Symbol.iterator]());
    mockDiskSaver.loadCacheBackup.mockReturnValue({});

    adapter = new MemoryCacheAdapter(mockCacheEngine, mockDiskSaver);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('get', async () => {
    await adapter.get('foo');

    expect(mockCacheEngine.get).toHaveBeenCalledWith('foo');
  });

  test('mget', async () => {
    mockCacheEngine.get.mockReturnValueOnce('bar').mockReturnValueOnce('qux');

    const res = await adapter.mget(['foo', 'baz']);

    expect(mockCacheEngine.get).toHaveBeenCalledWith('foo');
    expect(mockCacheEngine.get).toHaveBeenCalledWith('baz');
    expect(res).toEqual(['bar', 'qux']);
  });

  test('set', async () => {
    await adapter.set('foo', 'bar', 1000);

    expect(mockCacheEngine.set).toHaveBeenCalledWith('foo', 'bar', {
      ttl: 1000,
    });
  });

  test('mset', async () => {
    await adapter.mset([
      ['foo', 'bar', 1000],
      ['baz', 'qux', 2000],
    ]);

    expect(mockCacheEngine.set).toHaveBeenCalledWith('foo', 'bar', {
      ttl: 1000,
    });
    expect(mockCacheEngine.set).toHaveBeenCalledWith('baz', 'qux', {
      ttl: 2000,
    });
  });

  test('del', async () => {
    await adapter.del('foo');

    expect(mockCacheEngine.delete).toHaveBeenCalledWith('foo');
  });

  test('mdel', async () => {
    await adapter.mdel(['foo', 'bar']);

    expect(mockCacheEngine.delete).toHaveBeenCalledWith('foo');
  });

  describe('pdel', () => {
    it('deletes the keys that match the given pattern', async () => {
      mockCacheEngine.keys.mockReturnValue(
        ['foo-1', 'foo-2', 'qux-1', 'qux-2'][Symbol.iterator](),
      );

      await adapter.pdel('foo-*');

      expect(mockCacheEngine.delete).toHaveBeenCalledWith('foo-1');
      expect(mockCacheEngine.delete).toHaveBeenCalledWith('foo-2');
      expect(mockCacheEngine.delete).not.toHaveBeenCalledWith('qux-1');
      expect(mockCacheEngine.delete).not.toHaveBeenCalledWith('qux-2');
    });

    it("clears the cache if the pattern is '*'", async () => {
      await adapter.pdel('*');

      expect(mockCacheEngine.clear).toHaveBeenCalled();
    });
  });

  test('has', async () => {
    await adapter.has('foo');

    expect(mockCacheEngine.has).toHaveBeenCalledWith('foo');
  });

  test('mhas', async () => {
    mockCacheEngine.has.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const res = await adapter.mhas(['foo', 'bar']);

    expect(mockCacheEngine.has).toHaveBeenCalledWith('foo');
    expect(mockCacheEngine.has).toHaveBeenCalledWith('bar');
    expect(res).toEqual(false);
  });

  test('getRemainingTtl', async () => {
    mockCacheEngine.getRemainingTTL.mockReturnValue(1000);

    const res = await adapter.getRemainingTtl('foo');

    expect(mockCacheEngine.getRemainingTTL).toHaveBeenCalledWith('foo');
    expect(res).toEqual(1000);
  });

  it('saves the cache backup after set', async () => {
    await adapter.set('foo', 'bar', 1000);

    expect(mockDiskSaver.saveCacheBackup).toHaveBeenCalled();
  });

  it('saves the cache backup after mset', async () => {
    await adapter.mset([
      ['foo', 'bar', 1000],
      ['baz', 'qux', 2000],
    ]);

    expect(mockDiskSaver.saveCacheBackup).toHaveBeenCalled();
  });

  it('saves the cache backup after del', async () => {
    await adapter.del('foo');

    expect(mockDiskSaver.saveCacheBackup).toHaveBeenCalled();
  });

  it('saves the cache backup after mdel', async () => {
    await adapter.mdel(['foo', 'bar']);

    expect(mockDiskSaver.saveCacheBackup).toHaveBeenCalled();
  });

  it('saves the cache backup after pdel', async () => {
    mockCacheEngine.keys.mockReturnValue([][Symbol.iterator]());

    await adapter.pdel('foo-*');

    expect(mockDiskSaver.saveCacheBackup).toHaveBeenCalled();
  });

  it('loads the cache backup on construction', () => {
    expect(mockDiskSaver.loadCacheBackup).toHaveBeenCalled();
  });

  it('imports the cache backup on construction', () => {
    mockDiskSaver.loadCacheBackup.mockReturnValue({
      foo: { value: 'bar', expireAtMs: 2000 },
    });

    jest.useFakeTimers().setSystemTime(1000);

    // Need to run the constructor again because that's when the backup is loaded
    new MemoryCacheAdapter(mockCacheEngine, mockDiskSaver);

    expect(mockCacheEngine.set).toHaveBeenCalledWith('foo', 'bar', {
      ttl: 1000,
    });

    jest.useRealTimers();
  });

  it('ignores values that expired in the past', () => {
    mockDiskSaver.loadCacheBackup.mockReturnValue({
      foo: { value: 'bar', expireAtMs: 500 },
    });

    jest.useFakeTimers().setSystemTime(1000);

    // Need to run the constructor again because that's when the backup is loaded
    new MemoryCacheAdapter(mockCacheEngine, mockDiskSaver);

    expect(mockCacheEngine.set).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('exports the cache correctly', async () => {
    mockCacheEngine.entries.mockReturnValue(
      [['foo', 'bar'] as [string, string], ['baz', 'qux'] as [string, string]][
        Symbol.iterator
      ](),
    );

    mockCacheEngine.getRemainingTTL.mockReturnValue(1000);

    // Trigger save
    await adapter.set('foo', 'bar', 1000);

    expect(mockDiskSaver.saveCacheBackup).toHaveBeenCalledWith({
      foo: {
        value: 'bar',
        expireAtMs: expect.any(Number),
      },
      baz: {
        value: 'qux',
        expireAtMs: expect.any(Number),
      },
    });
  });

  it('calculates the correct expireAtMs when exporting the cache', async () => {
    mockCacheEngine.entries.mockReturnValue(
      [['foo', 'bar'] as [string, string]][Symbol.iterator](),
    );

    jest.useFakeTimers().setSystemTime(1000);

    mockCacheEngine.getRemainingTTL.mockReturnValue(1000);

    // Trigger save
    await adapter.set('foo', 'bar', 1000);

    expect(mockDiskSaver.saveCacheBackup).toHaveBeenCalledWith({
      foo: {
        value: 'bar',
        expireAtMs: 2000,
      },
    });

    jest.useRealTimers();
  });

  it('handles no backup saver being provided', async () => {
    const adapter = new MemoryCacheAdapter(mockCacheEngine);

    await adapter.set('foo', 'bar', 1000);

    expect(mockDiskSaver.saveCacheBackup).not.toHaveBeenCalled();
  });
});

describe('DiskCacheBackupSaver', () => {
  let tempFile: string;
  let saver: CacheBackupSaver;

  beforeEach(() => {
    tempFile = `${fs.mkdtempSync('/tmp/mock-cache-backup')}/mock-backup`;
    saver = new DiskCacheBackupSaver(tempFile);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("creates the backup directory if it doesn't exist", () => {
    saver.loadCacheBackup();

    expect(fs.existsSync(path.dirname(tempFile))).toBe(true);
  });

  it('loads the backup file if it exists', () => {
    fs.writeFileSync(tempFile, '{}');

    const val = saver.loadCacheBackup();

    expect(val).toEqual({});
  });

  it('returns an empty object if the backup file does not exist', () => {
    expect(saver.loadCacheBackup()).toEqual({});
  });

  it('returns an empty object if the backup file is invalid JSON', () => {
    fs.writeFileSync(tempFile, 'Hello There!');

    expect(saver.loadCacheBackup()).toEqual({});
  });

  it('saves the cache backup', async () => {
    await saver.saveCacheBackup({ foo: { value: 'bar', expireAtMs: 1000 } });

    expect(fs.readFileSync(tempFile, 'utf8')).toEqual(
      '{"foo":{"value":"bar","expireAtMs":1000}}',
    );
  });

  it("doesn't save the cache backup if it's already saving", async () => {
    let resolveSaveA: () => void;

    const writeSpy = jest.spyOn(fs.promises, 'writeFile');

    // Capture the resolve function for save A
    writeSpy.mockImplementationOnce((file, data) => {
      assert(typeof file === 'string');
      assert(typeof data === 'string');
      fs.writeFileSync(file, data);

      return new Promise<void>((res) => {
        resolveSaveA = res;
      });
    });

    // Save twice
    const saveAPromise = saver.saveCacheBackup({
      foo: { value: 'bar', expireAtMs: 1000 },
    });
    const saveBPromise = saver.saveCacheBackup({
      foo: { value: 'baz', expireAtMs: 1000 },
    });

    // Now, we're done saving A
    resolveSaveA!();

    await saveAPromise;
    await saveBPromise;

    // Save B should have been ignored
    expect(fs.readFileSync(tempFile, 'utf8')).toEqual(
      '{"foo":{"value":"bar","expireAtMs":1000}}',
    );
  });
});
