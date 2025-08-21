import { CacheAdapter } from './interface';
import { NoTtlCacheEngine, NoTtlMemoryCacheAdapter } from './memory-no-ttl';

const mockCacheEngine: jest.Mocked<NoTtlCacheEngine<string, string>> = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  has: jest.fn(),
  entries: jest.fn(),
  keys: jest.fn(),
  clear: jest.fn(),
};

describe('NoTtlMemoryCacheAdapter', () => {
  let adapter: CacheAdapter;

  beforeEach(() => {
    adapter = new NoTtlMemoryCacheAdapter(mockCacheEngine);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('uses a Map as the cache engine by default', async () => {
    const adapter = new NoTtlMemoryCacheAdapter();

    await adapter.set('foo', 'bar');

    await expect(adapter.get('foo')).resolves.toEqual('bar');
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

    expect(mockCacheEngine.set).toHaveBeenCalledWith('foo', 'bar');
  });

  test('mset', async () => {
    await adapter.mset([
      ['foo', 'bar', 1000],
      ['baz', 'qux', 2000],
    ]);

    expect(mockCacheEngine.set).toHaveBeenCalledWith('foo', 'bar');
    expect(mockCacheEngine.set).toHaveBeenCalledWith('baz', 'qux');
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

  describe('getRemainingTtl', () => {
    it('returns `Infinity` if the key exists', async () => {
      mockCacheEngine.has.mockReturnValue(true);

      const res = await adapter.getRemainingTtl('foo');

      expect(res).toEqual(Infinity);
    });

    it("returns `undefined` if the key doesn't exist", async () => {
      mockCacheEngine.has.mockReturnValue(false);

      const res = await adapter.getRemainingTtl('foo');

      expect(res).toBeUndefined();
    });
  });
});
