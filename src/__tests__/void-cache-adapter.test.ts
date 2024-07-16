import { CacheAdapter, VoidCacheAdapter } from '..';

describe('VoidCacheAdapter', () => {
  let adapter: CacheAdapter;

  beforeEach(() => {
    adapter = new VoidCacheAdapter();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('set does nothing', async () => {
    await adapter.set('foo', 'bar', 1000);

    expect(await adapter.get('foo')).toBeUndefined();
  });

  test('mset does nothing', async () => {
    await adapter.mset(['foo'], ['bar'], 1000);

    expect(await adapter.mget(['foo'])).toEqual([undefined]);
  });

  test('del does nothing', async () => {
    await adapter.del('foo');

    expect(await adapter.get('foo')).toBeUndefined();
  });

  test('mdel does nothing', async () => {
    await adapter.mdel(['foo']);

    expect(await adapter.get('foo')).toBeUndefined();
  });

  test('pdel does nothing', async () => {
    await adapter.pdel('foo');

    expect(await adapter.get('foo')).toBeUndefined();
  });

  test('has returns false', async () => {
    expect(await adapter.has('foo')).toBe(false);
  });

  test('mhas returns false', async () => {
    expect(await adapter.mhas(['foo'])).toBe(false);
  });

  test('getRemainingTtl returns undefined', async () => {
    expect(await adapter.getRemainingTtl('foo')).toBeUndefined();
  });
});
