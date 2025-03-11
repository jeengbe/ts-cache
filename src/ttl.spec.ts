import { ttlToMs } from './ttl';

describe('ttlToMs', () => {
  it('should parse a number as milliseconds', () => {
    expect(ttlToMs(1000, [])).toBe(1000);
  });

  it('should parse a string as milliseconds', () => {
    expect(ttlToMs('1s', [])).toBe(1000);
  });

  it('should evaluate a function and parse the result as milliseconds', () => {
    expect(ttlToMs((x) => x, [1000])).toBe(1000);
  });

  it('should evaluate a function recursively and parse the result as milliseconds', () => {
    expect(ttlToMs((x) => (y) => x + y, [500])).toBe(1000);
  });
});
