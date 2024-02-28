import { CacheAdapter, NoTTLCache, NoTtlMemoryCacheAdapter } from '..';

const mockCache: jest.Mocked<NoTTLCache<string, string>> = {
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
    adapter = new NoTtlMemoryCacheAdapter(mockCache);
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

    expect(mockCache.set).toHaveBeenCalledWith('foo', 'bar');
  });

  test('mset', async () => {
    await adapter.mset(['foo', 'baz'], ['bar', 'qux'], 1000);

    expect(mockCache.set).toHaveBeenCalledWith('foo', 'bar');
    expect(mockCache.set).toHaveBeenCalledWith('baz', 'qux');
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
});
