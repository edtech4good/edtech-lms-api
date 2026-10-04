import { Op } from "sequelize";

/**
 * Test support: does a row satisfy a Sequelize `where`? Understands the small
 * subset the scoped helpers produce (`{}`; `{ column: value }`; `Op.and` and
 * `Op.or` lists; `Op.in`, `Op.ne`, `Op.not`, `Op.like` with `%`; a key `$alias.column$`
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

const read = (row: Row, key: string): unknown => {
  const path = /^\$(.+)\$$/.exec(key);
  if (!path) return row[key];
  let value: unknown = row;
  for (const part of path[1].split(".")) {
    value = value !== null && typeof value === "object" ? (value as Row)[part] : undefined;
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
    } else if (!matchesValue(read(row, key), value, ignoreCase.includes(key))) {
      return false;
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
