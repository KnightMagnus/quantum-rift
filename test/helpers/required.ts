/** Fail at the missing fixture value rather than on a later property access. */
export function requiredFixtureValue<Value>(value: Value | null | undefined): NonNullable<Value> {
  if (value === null || value === undefined)
    throw Error('Required regression fixture value is missing');
  return value;
}
