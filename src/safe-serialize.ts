export interface SafeJsonOptions {
  /**
   * Specifies whether `undefined` values are allowed for object properties during serialization.
   * - If `true`, properties with `undefined` values will be serialized.
   * - If `false`, if any object contains a property with an `undefined` value, the function will throw an error.
   *
   * In most cases, `{ }` and `{ key: undefined }` are considered equivalent. This option allows for
   * greater control in situations they are not.
   *
   * @default true
   */
  allowUndefined?: boolean;

  /**
   * An array of types that will be whitelisted during serialization. These types will be treated
   * as serializable, even if they are normally excluded by default (e.g., `Date`, `Promise`, `Map`, etc.).
   * - You can specify built-in types like `Date`, `Promise`, or any custom class that you want to be serialized.
   *
   * This allows for custom handling of specific types that would otherwise require special serialization logic.
   * Checks are performed using the `instanceof` operator.
   *
   * @default []
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  whitelistTypes?: Function[];
}

/**
 * Serializes a value to JSON with strict structural integrity.
 *
 * This function converts a given value to a JSON string while ensuring that the resulting
 * string, when parsed back with `JSON.parse`, produces a value that is structurally identical
 * to the original. If any part of the value would be transformed, omitted, or lose information
 * during the JSON conversion process (e.g. Dates, Promises, functions, cyclic references, etc.),
 * the function throws an error.
 */
export function safeJsonSerialize(
  value: unknown,
  options: SafeJsonOptions = {},
): string {
  if (!isFullyJsonSerializable(value, options)) {
    throw new Error('Value is not fully JSON-serializable.', {
      cause: {
        value,
      },
    });
  }

  return JSON.stringify(value);
}

function isFullyJsonSerializable(
  value: unknown,
  options: SafeJsonOptions,
  seen = new WeakSet<object>(),
): boolean {
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return true;
    case 'number':
      return Number.isFinite(value);
    case 'bigint':
    case 'undefined': // if 'allowUndefined' is enabled, this case is checked in the 'object' branch directly
    case 'function':
    case 'symbol':
      return false;
    case 'object': {
      if (value === null) return true;

      if (seen.has(value)) return false;
      seen.add(value);

      if (Array.isArray(value)) {
        return value.every((item) =>
          isFullyJsonSerializable(item, options, seen),
        );
      }

      if (options.whitelistTypes?.some((type) => value instanceof type)) {
        return true;
      }

      // Check if it's a plain object: either has Object.prototype or null as its prototype.
      // Do this to prevent serializing Date, Promise, etc.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return false;

      return Object.keys(value).every((key) => {
        const keyValue = value[key as keyof typeof value] as unknown;

        if (keyValue === undefined) {
          return options.allowUndefined ?? true;
        }

        return isFullyJsonSerializable(keyValue, options, seen);
      });
    }
  }
}
