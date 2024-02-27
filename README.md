<h1 align="center">@jeengbe/cache</h1>
<div align="center">

A strongly typed caching framework that works with several cache engines.

[![License](https://img.shields.io/npm/l/@jeengbe/cache)](https://github.com/jeengbe/cache/blob/LICENSE.md)
[![Version](https://img.shields.io/npm/v/@jeengbe/cache)](https://www.npmjs.com/package/@jeengbe/cache)
![Coverage Badge](https://img.shields.io/badge/Coverage-100%25-brightgreen)

</div>

It provides a general `Cache` class that interacts with cache adapters, which are responsible for communicating with the cache backend (e.g. Redis). The package comes with a cache adapter for an in-memory cache that saves its content to the disk, one that does absolutely nothing (no values saved and never returns a value) and a cache adapter for Redis.

To use several cache instances on the same cache engine, every cache accepts a prefix parameter that is prepended to all keys before they are stored. This allows for different namespaces and versioning stored in the same cache backend.

Values are serialized to string for storage in the cache. By default, `JSON.stringify`/`JSON.parse` are used, but custom serializers may be provided for serializing e.g. with Protocol Buffers.

## Installation

The package is published as `@jeengbe/cache`. Versions follow Semantic Versioning.

## Usage

### Create a new cache object

The generic `Cache` class takes a type parameter that dictates which cache keys correspond to which values.
First, decare the type as an object where the object properties are available cache keys and values the respective values in the cache. Use [template literal types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html) to account for patterns like `` `cached-${id}` `` in your keys. Intersect several [mapped types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html) to merge several objects with template literal types:

```ts
type XCacheTypes = {
  [K in `cached-a-${string}`]: number;
} & {
  [K in `cached-b-${number}`]: string;
} & {
  'general-c': string;
  'general-d': boolean;
};
```

A cache with the above types accepts the following:

- Keys that start with "cached-a-" may cache a number.
- Keys that start with "cached-b-" followed by a number may cache a string.
- The key "general-c" may cache a string.
- The key "general-d" may cache a boolean.

All read/write operations on corresponding instance are strongly typed. To create a new cache object, instantiate the class with a suiting cache adapter and optionally a prefix.

```ts
import { Cache, VoidCacheAdapter } from '@jeengbe/cache';

const xCache = new Cache<XCacheTypes>(new VoidCacheAdapter(), 'x:1');
```

---

Consider this context for all following code examples in this document:

```ts
type Result = { id: string; calculated: number };

declare const resultCache: Cache<{
  [K in `expensive-${string}`]: Result;
}>;
```

### Get (`get`/`mget`)

Use `get` to get the value for a single cached key.

To get the values for several keys in one operation, use `mget`.

If you want to get the value, and, if none present, calculate and store a new one, consider using `cached`/`mcached` instead.

### Set (`set`/`mset`)

Use `set` to set the cached value for a single key.

To set the cached values for several keys, use `mset`.

Unlike conventional cache packages, `mset` takes an array of values and a function to determine the cache key for each value.

```ts
declare const items: readonly Result[];

await resultCache.mset(items, (item) => `expensive-${item.id}`, '1d');
```

### Delete (`del`/`mdel`)

Use `del` to delete the cached value for a single key.

To delete the cached values for several keys, use `mdel`.

### Delete by pattern (`pdel`)

Use `pdel` to delete the cached values for all keys that match the given glob-style pattern.

Please note that the pattern is not fully typed and can be any string. PRs welcome. :)

### Query whether in cache (`has`/`mhas`)

Use `has` to check whether there exists a cached value for a single key.

To delete whether several keys have a cached value, use `mhas`. `mhas` only reports whether all of the provided keys have a value cached and returns no inforation about which/how many of the given keys have no value cached.

### Get and if not present, calculate and set (`cached`/`mcached`)

Use `cached` to get the cached value for a cache, and if the value is not in the cache, run a function to produce a value and cache that.

Because this is a commonly used pattern, this package provides a convenience method for this.

Use `mcached` if you want to get several cached values and only compute those for which there is no value stored in the cache. It takes an array of data, from which each the cache key is generated. If at least one key has no cached value, the producer is called with an array of those data items for whose key no value was cached.

Note that this is no atomic operation and the key is in no way locked while the producer is awaited.

```ts
declare function expensiveFunction(id: string): Promise<Result>;
declare const id: string;

const result = await resultCache.cached(
  //  ^? Result
  `expensive-${id}`,
  () => expensiveFunction(id),
  '1d',
);
```

```ts
declare function expensiveBatchFunction(
  ids: readonly string[],
): Promise<Result[]>;
declare const ids: string[];

const results = await resultCache.mcached(
  //  ^? Result[]
  ids,
  (id) => `expensive-${id}`,
  (m) => expensiveBatchFunction(m),
  '1d',
);
```

## Cache Adapters

### Redis

```ts
import { RedisCacheAdapter } from '@jeengbe/cache';
import { Redis } from 'ioredis';

const cacheAdapter = new RedisCacheAdapter(new Redis(redisConfig));
```

### Void

Stores no values, get operations always return undefined and has always returns false.

```ts
import { VoidCacheAdapter } from '@jeengbe/cache';

const cacheAdapter = new VoidCacheAdapter();
```

### Memory

Keeps the values in memory.

The package `@isaacs/ttlcache` can be used for the cache implementation.

```ts
import TTLCache from '@isaacs/ttlcache';
import { MemoryCacheAdapter } from '@jeengbe/cache';

const cacheAdapter = new MemoryCacheAdapter(new TTLCache());
```

It is also possible to back up the memory after every write operation. To do that, construct the adapter with a cache backup saver. To save the memory to disk, pass it a `DiskCacheBackupSaver` as shown:

```ts
import TTLCache from '@isaacs/ttlcache';
import { DiskCacheBackupSaver, MemoryCacheAdapter } from '@jeengbe/cache';

const cacheAdapter = new MemoryCacheAdapter(
  new TTLCache(),
  new DiskCacheBackupSaver(diskCacheBackupLocation),
);
```

## Notes

### `ms` duration format

All methods that take a duration (`set`/`cached`, etc.) accept either a ttl in milliseconds, or any duration string that can be parsed by the [`ms`](https://www.npmjs.com/package/ms) package.

### `Array.map` and `mget`, `mdel`, `mhas`

For the operations `mget`, `mdel`, `mhas`, you may run into compiler errors if you map over an input array normally (see example below). To fix this, add an [`as const` assertion](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions) to ensure that mapped keys are properly typed.

```ts
declare const ids: string[];

// Missing 'as const':
await resultCache.mget(
  ids.map((id) => `expensive-${id}`),
  // ~~~~~ Type 'string' is not assignable to type '`expensive-${string}`'.
);

// Correctly typed:
await resultCache.mget(ids.map((id) => `expensive-${id}` as const));
```

The longer explanation is that for a variety of reasons, ``ids.map((id) => `expensive-${id}`)`` results in a `string[]` instead of exactly `` `expensive-${string}`[] ``. So when `string[]` is used as keys for a strongly typed signature like `mget`, the compiler (rightfully so) complains. By changing it to ``ids.map((id) => `expensive-${id}` as const)``, we make the type as exact as possible, which then gives the explicit string types we need.

The reason `as const` is not necessary for `mset`, `mcached` is that the compiler is able to infer the `as const` automatically here. Normally, `` (item) => `expensive-${item.id}` `` results in `() => string`, but because the compiler expects an explicit `` () => `expensive-${string}` `` it also tries to determine a stricter signature for the method, which satisfies the strongly typed signature.

In theory, this would also work with the above described `map` limitation, but the compiler does not check that deep, so the inferring from `mget` signature -> `map` return type -> `map` callback is not made, and `.map` results in `string[]`.

```ts
declare const items: readonly Result[];

await resultCache.mset(items, (item) => `expensive-${item.id}`, '1d');
```

Alternatively, you can pass a type parameter to `map`, but that's less elegant if you ask me:

```ts
declare const ids: string[];

await resultCache.mget(
  ids.map<`expensive-${string}`>((id) => `expensive-${id}`),
);
```
