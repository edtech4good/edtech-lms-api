import { Op } from "sequelize";

/**
 * Test support: does a row satisfy a Sequelize `where`? Understands the small
 * subset the scoped helpers produce (`{}`; `{ column: value }`; `Op.and` and
 * `Op.or` lists; `Op.in`, `Op.ne`, `Op.not`, `Op.is`, `Op.like` with `%`; a key `$alias.column$`
 * read from an included row held under `alias`; the school-name narrowing
 * `where(fn("TRIM", col(c)), text)`, compared without regard to case as MySQL's default
 * collation does), so specs can replace a model with an in-memory table and still see the
 * caller's organisation limit applied.
 */
type Row = Record<string, unknown>;

// MySQL keeps a boolean in a tinyint: `true` and `1` are the same stored value
const flag = (v: unknown) => (typeof v === "boolean" ? Number(v) : v);

const equal = (a: unknown, b: unknown, ignoreCase = false) =>
  ignoreCase && typeof a === "string" && typeof b === "string" ? a.toLowerCase() === b.toLowerCase() : (flag(a) ?? null) === (flag(b) ?? null);

// a date and a number compare as time, text as text; a missing value is below everything
const order = (a: unknown, b: unknown): number => {
  if (a === null || a === undefined) return -1;
  const x = a instanceof Date ? a.getTime() : (a as number | string);
  const y = b instanceof Date ? b.getTime() : (b as number | string);
  return x < y ? -1 : x > y ? 1 : 0;
};

const matchesValue = (actual: unknown, expected: unknown, ignoreCase = false): boolean => {
  // an array is the set the value must be one of, as Sequelize reads `{ column: [..] }`
  if (Array.isArray(expected)) {
    return expected.some((v) => equal(v, actual, ignoreCase));
  }
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    const symbols = Object.getOwnPropertySymbols(expected);
    if (symbols.length > 0) {
      return symbols.every((symbol) => {
        const operand = (expected as Record<symbol, unknown>)[symbol];
        if (symbol === Op.in) return (operand as unknown[]).some((v) => equal(v, actual, ignoreCase));
        if (symbol === Op.ne || symbol === Op.not) return !equal(operand, actual, ignoreCase);
        if (symbol === Op.is) return equal(operand, actual, ignoreCase); // `IS NULL`: a missing value is null
        if (symbol === Op.between) {
          const [low, high] = operand as [unknown, unknown];
          return order(actual, low) >= 0 && order(actual, high) <= 0;
        }
        if (symbol === Op.gte) return order(actual, operand) >= 0;
        if (symbol === Op.gt) return order(actual, operand) > 0;
        if (symbol === Op.lte) return order(actual, operand) <= 0;
        if (symbol === Op.lt) return order(actual, operand) < 0;
        if (symbol === Op.like) {
          const pattern = new RegExp(
            "^" + String(operand).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$",
            "i",
          );
          return typeof actual === "string" && pattern.test(actual);
        }
        throw new Error(`fakewhere: unsupported operator ${String(symbol.description)}`);
      });
    }
  }
  return equal(actual, expected, ignoreCase);
};

// `where(fn("TRIM", col(c)), text)`: Sequelize's `Where` object, not a plain clause
const isTrimWhere = (where: unknown): where is { attribute: { fn: string; args: Array<{ col: string }> }; logic: string } =>
  typeof where === "object" &&
  where !== null &&
  (where as { constructor: { name: string } }).constructor.name === "Where" &&
  (where as { attribute?: { fn?: string } }).attribute?.fn === "TRIM";

// a joined row holds what its include selected, and the whole stored row behind it (`__row`, not enumerable)
const column = (from: unknown, part: string): unknown => {
  if (from === null || typeof from !== "object") return undefined;
  const o = from as Row;
  return part in o ? o[part] : (o.__row as Row | undefined)?.[part];
};

const read = (row: Row, key: string): unknown => {
  const path = /^\$(.+)\$$/.exec(key);
  if (!path) return row[key];
  let value: unknown = row;
  for (const part of path[1].split(".")) {
    // a joined list (a learner's progress rows) is read through to each of its rows: the value is then every one of them
    value = Array.isArray(value) ? value.map((v) => column(v, part)) : column(value, part);
  }
  return value;
};

export const rowMatches = (row: Row, where: unknown, ignoreCase: ReadonlyArray<string> = []): boolean => {
  if (where === undefined || where === null) return true;
  if (isTrimWhere(where)) {
    return String(row[where.attribute.args[0].col] ?? "").trim().toLowerCase() === String(where.logic).toLowerCase();
  }
  const clause = where as Record<string | symbol, unknown>;
  for (const key of Reflect.ownKeys(clause)) {
    const value = clause[key];
    if (key === Op.and) {
      if (!(value as unknown[]).every((part) => rowMatches(row, part, ignoreCase))) return false;
    } else if (key === Op.or) {
      if (!(value as unknown[]).some((part) => rowMatches(row, part, ignoreCase))) return false;
    } else if (typeof key === "symbol") {
      throw new Error(`fakewhere: unsupported operator ${String(key.description)}`);
    } else {
      // Sequelize refuses a condition on `undefined` rather than reading it as "no condition"
      if (value === undefined) throw new Error(`WHERE parameter "${key}" has invalid "undefined" value`);
      const actual = read(row, key);
      // the key reads through a joined list: the row matches when any of its rows does (as an inner join finds it)
      const matched = /^\$.+\$$/.test(key) && Array.isArray(actual)
        ? actual.some((a) => matchesValue(a, value, ignoreCase.includes(key)))
        : matchesValue(actual, value, ignoreCase.includes(key));
      if (!matched) return false;
    }
  }
  return true;
};

/**
 * Test support: gives a model that has not been initialised against a database
 * (specs never connect) the primary key name the scoped helpers look up by.
 */
export const withPrimaryKey = (model: object, key: string) =>
  Object.defineProperty(model, "primaryKeyAttribute", { value: key, configurable: true });
