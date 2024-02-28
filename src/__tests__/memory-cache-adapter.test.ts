import * as fs from 'fs';
import {
  CacheAdapter,
  CacheBackupSaver,
  DiskCacheBackupSaver,
  MemoryCacheAdapter,
  TTLCache,
} from '..';

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  promises: {
    writeFile: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockFsPromises = fs.promises as jest.Mocked<typeof fs.promises>;

const mockCache: jest.Mocked<TTLCache<string, string>> = {
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
    mockCache.entries.mockReturnValue([][Symbol.iterator]());
    mockDiskSaver.loadCacheBackup.mockReturnValue({});

    adapter = new MemoryCacheAdapter(mockCache, mockDiskSaver);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('get', async () => {
    await adapter.get('foo');

    expect(mockCache.get).toHaveBeenCalledWith('foo');
  });

  test('mget', async () => {
    mockCache.get.mockReturnValueOnce('bar').mockReturnValueOnce('qux');

    const res = await adapter.mget(['foo', 'baz']);

    expect(mockCache.get).toHaveBeenCalledWith('foo');
    expect(mockCache.get).toHaveBeenCalledWith('baz');
    expect(res).toEqual(['bar', 'qux']);
  });

  test('set', async () => {
    await adapter.set('foo', 'bar', 1000);

    expect(mockCache.set).toHaveBeenCalledWith('foo', 'bar', {
      ttl: 1000,
    });
  });

  test('mset', async () => {
    await adapter.mset(['foo', 'baz'], ['bar', 'qux'], 1000);

    expect(mockCache.set).toHaveBeenCalledWith('foo', 'bar', {
      ttl: 1000,
    });
    expect(mockCache.set).toHaveBeenCalledWith('baz', 'qux', {
      ttl: 1000,
    });
  });

  test('del', async () => {
    await adapter.del('foo');

    expect(mockCache.delete).toHaveBeenCalledWith('foo');
  });

  test('mdel', async () => {
    await adapter.mdel(['foo', 'bar']);

    expect(mockCache.delete).toHaveBeenCalledWith('foo');
  });

  describe('pdel', () => {
    it('deletes the keys that match the given pattern', async () => {
      mockCache.keys.mockReturnValue(
        ['foo-1', 'foo-2', 'qux-1', 'qux-2'][Symbol.iterator](),
      );

      await adapter.pdel('foo-*');

      expect(mockCache.delete).toHaveBeenCalledWith('foo-1');
      expect(mockCache.delete).toHaveBeenCalledWith('foo-2');
      expect(mockCache.delete).not.toHaveBeenCalledWith('qux-1');
      expect(mockCache.delete).not.toHaveBeenCalledWith('qux-2');
    });

    it("clears the cache if the pattern is '*'", async () => {
      await adapter.pdel('*');

      expect(mockCache.clear).toHaveBeenCalled();
    });
  });

  test('has', async () => {
    await adapter.has('foo');

    expect(mockCache.has).toHaveBeenCalledWith('foo');
  });

  test('mhas', async () => {
    mockCache.has.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const res = await adapter.mhas(['foo', 'bar']);

    expect(mockCache.has).toHaveBeenCalledWith('foo');
    expect(mockCache.has).toHaveBeenCalledWith('bar');
    expect(res).toEqual(false);
  });

  it('saves the cache backup after set', async () => {
    await adapter.set('foo', 'bar', 1000);

    expect(mockDiskSaver.saveCacheBackup).toHaveBeenCalled();
  });

  it('saves the cache backup after mset', async () => {
    await adapter.mset(['foo', 'baz'], ['bar', 'qux'], 1000);

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
    mockCache.keys.mockReturnValue([][Symbol.iterator]());

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
    new MemoryCacheAdapter(mockCache, mockDiskSaver);

    expect(mockCache.set).toHaveBeenCalledWith('foo', 'bar', {
      ttl: 1000,
    });

    jest.useRealTimers();
  });

  it('ignores values that expired in the past', () => {
    mockDiskSaver.loadCacheBackup.mockReturnValue({
      foo: { value: 'bar', expireAtMs: 500 },
    });

    jest.useFakeTimers().setSystemTime(1000);

    expect(mockCache.set).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('exports the cache correctly', async () => {
    mockCache.entries.mockReturnValue(
      [['foo', 'bar'] as [string, string], ['baz', 'qux'] as [string, string]][
        Symbol.iterator
      ](),
    );

    mockCache.getRemainingTTL.mockReturnValue(1000);

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
    mockCache.entries.mockReturnValue(
      [['foo', 'bar'] as [string, string]][Symbol.iterator](),
    );

    jest.useFakeTimers().setSystemTime(1000);

    mockCache.getRemainingTTL.mockReturnValue(1000);

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
    const adapter = new MemoryCacheAdapter(mockCache);

    await adapter.set('foo', 'bar', 1000);

    expect(mockDiskSaver.saveCacheBackup).not.toHaveBeenCalled();
  });
});

describe('DiskCacheBackupSaver', () => {
  let saver: CacheBackupSaver;

  beforeEach(() => {
    saver = new DiskCacheBackupSaver('/tmp/mock-backup');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("creates the backup file if it doesn't exist", () => {
    saver.loadCacheBackup();

    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/tmp', { recursive: true });
  });

  it('loads the backup file if it exists', () => {
    mockFs.existsSync.mockReturnValue(true);

    saver.loadCacheBackup();

    expect(mockFs.readFileSync).toHaveBeenCalledWith(
      '/tmp/mock-backup',
      'utf8',
    );
  });

  it('returns an empty object if the backup file does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);

    expect(saver.loadCacheBackup()).toEqual({});
  });

  it('returns an empty object if the backup file is invalid JSON', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('Hello There!');

    expect(saver.loadCacheBackup()).toEqual({});
  });

  it('saves the cache backup', async () => {
    await saver.saveCacheBackup({ foo: { value: 'bar', expireAtMs: 1000 } });

    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      '/tmp/mock-backup',
      '{"foo":{"value":"bar","expireAtMs":1000}}',
      expect.anything(),
    );
  });

  it("doesn't save the cache backup if it's already saving", async () => {
    let resolveSaveA: () => void;

    // Capture the resolve function for save A
    mockFsPromises.writeFile.mockReturnValueOnce(
      new Promise((res) => {
        resolveSaveA = res;
      }),
    );

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
    expect(fs.promises.writeFile).toHaveBeenCalledTimes(1);
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      '/tmp/mock-backup',
      '{"foo":{"value":"bar","expireAtMs":1000}}',
      expect.anything(),
    );
  });
});
