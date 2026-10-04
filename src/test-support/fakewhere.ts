import { Op } from "sequelize";

/**
 * Test support: does a row satisfy a Sequelize `where`? Understands the small
 * subset the scoped helpers produce (`{}`; `{ column: value }`; `Op.and` and
 * `Op.or` lists; `Op.in`, `Op.ne`, `Op.not`, `Op.like` with `%`), so specs can replace a model with
 * an in-memory table and still see the caller's organisation limit applied.
 */
type Row = Record<string, unknown>;

const equal = (a: unknown, b: unknown, ignoreCase = false) =>
  ignoreCase && typeof a === "string" && typeof b === "string" ? a.toLowerCase() === b.toLowerCase() : (a ?? null) === (b ?? null);

const matchesValue = (actual: unknown, expected: unknown, ignoreCase = false): boolean => {
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

export const rowMatches = (row: Row, where: unknown, ignoreCase: ReadonlyArray<string> = []): boolean => {
  if (where === undefined || where === null) return true;
  const clause = where as Record<string | symbol, unknown>;
  for (const key of Reflect.ownKeys(clause)) {
    const value = clause[key];
    if (key === Op.and) {
      if (!(value as unknown[]).every((part) => rowMatches(row, part, ignoreCase))) return false;
    } else if (key === Op.or) {
      if (!(value as unknown[]).some((part) => rowMatches(row, part, ignoreCase))) return false;
    } else if (typeof key === "symbol") {
      throw new Error(`fakewhere: unsupported operator ${String(key.description)}`);
    } else if (!matchesValue(row[key], value, ignoreCase.includes(key))) {
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
