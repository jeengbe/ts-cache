import ms, { StringValue } from 'ms';

export type TtlString = StringValue;

export type TtlExpression<A extends unknown[]> =
  | number
  | TtlString
  | ((this: void, ...args: A) => TtlExpression<A>);

export function ttlToMs<A extends unknown[]>(
  this: void,
  ttl: TtlExpression<A>,
  fnArgs: A,
): number {
  if (typeof ttl === 'function') {
    return ttlToMs(ttl(...fnArgs), fnArgs);
  }

  if (typeof ttl === 'number') {
    return ttl;
  }

  return ms(ttl);
}
