import { SafeJsonOptions, safeJsonSerialize } from './safe-serialize';

function makeCyclicObject() {
  const obj: any = {};
  obj.obj = obj;
  return obj;
}

class CustomType {
  constructor(public value: string) {}
}

describe('safeJsonSerialize', () => {
  allows('a boolean', true);
  allows('a string', 'hello');

  allows('a finite number', 42);
  disallows('an infinite number', Infinity);
  disallows('NaN', NaN);

  disallows('a BigInt', BigInt(42));
  disallows('undefined', undefined);
  disallows('a function', () => {});
  disallows('a symbol', Symbol('foo'));

  allows('null', null);
  allows('an empty object', {});
  allows('an object with string keys', { key: 'value' });
  allows('an object with number keys', { 42: 'value' });
  describe("an object with 'undefined' values", () => {
    allows('by default', { key: undefined });
    allows(
      'with allowUndefined: true',
      { key: undefined },
      { allowUndefined: true },
    );
    disallows(
      'with allowUndefined: false',
      { key: undefined },
      { allowUndefined: false },
    );
  });

  allows('an array', [1, 2, 3]);
  allows('an empty array', []);
  disallows('an array with undefined', [1, undefined, 3]);

  disallows('a date object', new Date());
  disallows('a promise object', Promise.resolve());
  allows('a plain object with null prototype', Object.create(null));
  allows('a date if whitelisted', new Date(), { whitelistTypes: [Date] });
  disallows("custom types that aren't whitelisted", new CustomType('foo'));
  allows('custom types that are whitelisted', new CustomType('foo'), {
    whitelistTypes: [CustomType],
  });
  disallows('an object with a cyclic reference', makeCyclicObject());

  function allows(
    description: string,
    value: unknown,
    options?: SafeJsonOptions,
  ) {
    it(`should serialize ${description}`, () => {
      expect(safeJsonSerialize(value, options)).toMatchSnapshot();
    });
  }

  function disallows(
    description: string,
    value: unknown,
    options?: SafeJsonOptions,
  ) {
    it(`should not serialize ${description}`, () => {
      expect(() => safeJsonSerialize(value, options)).toThrow(
        'Value is not fully JSON-serializable.',
      );
    });
  }
});
