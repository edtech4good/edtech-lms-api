import { QueryTypes } from "sequelize";

/**
 * The school identity invariant for the two tables that still tie a person to
 * a school by NAME: every row has a `schoolid`, and the school that id points
 * at carries the name the row does. Counts only, never names.
 *
 * Four categories. Two are failures, two are reported and tolerated until the
 * id becomes required:
 *
 *  - `nullWithName` (FAILURE): the row names a school but has no id. Nothing
 *    in the backfill or the writers should leave one.
 *  - `nameDifferent` (FAILURE): the row has an id, and its name is not even
 *    equal to the school's name under the collation (or is NULL).
 *  - `nullNoName` (reported): no id and no name either, so there is no school
 *    to point at. Someone has to decide which school the row belongs to.
 *  - `nameLooseOnly` (reported): the row has an id and a name that is equal to
 *    the school's only under the column collation (a trailing space, capitals,
 *    or a mark such as a Khmer nikahit), not byte for byte. The backfill gives
 *    a row like this its school when exactly one school matches; the writers
 *    never create one. It may be a typing difference, or it may be a
 *    different school whose name differs by a mark.
 *
 * Both reported categories must be resolved before the id becomes required.
 *
 * "Byte for byte" is the test, not the collation: the collation ignores
 * trailing spaces and gives several Khmer marks no weight.
 */
export const SCHOOL_ID_TABLES = ["students", "schoolusers"] as const;
export type SchoolIdTable = (typeof SCHOOL_ID_TABLES)[number];

export interface SchoolIdInvariantRow {
  table: SchoolIdTable;
  rows: number;
  nullWithName: number;
  nullNoName: number;
  nameDifferent: number;
  nameLooseOnly: number;
}

interface Queryable {
  query: (sql: string, options: { type: QueryTypes.SELECT }) => Promise<unknown>;
}

const sqlFor = (table: SchoolIdTable, nameCollation: string) => `
  SELECT
    COUNT(*) AS \`rows\`,
    COALESCE(SUM(t.schoolid IS NULL AND t.schoolname IS NOT NULL), 0) AS nullWithName,
    COALESCE(SUM(t.schoolid IS NULL AND t.schoolname IS NULL), 0) AS nullNoName,
    COALESCE(SUM(s.schoolid IS NOT NULL
      AND (t.schoolname IS NULL
        OR NOT (t.schoolname = s.schoolname COLLATE ${nameCollation}))), 0) AS nameDifferent,
    COALESCE(SUM(s.schoolid IS NOT NULL
      AND t.schoolname IS NOT NULL
      AND CAST(t.schoolname AS BINARY) <> CAST(s.schoolname AS BINARY)
      AND t.schoolname = s.schoolname COLLATE ${nameCollation}), 0) AS nameLooseOnly
  FROM \`${table}\` t
  LEFT JOIN schools s ON s.schoolid = t.schoolid`;

/** The collation of `schools.schoolname`, which is what "equal under the collation" means. */
async function schoolNameCollation(db: Queryable): Promise<string> {
  const rows = (await db.query(
    `SELECT COLLATION_NAME AS coll FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schools' AND COLUMN_NAME = 'schoolname' LIMIT 1`,
    { type: QueryTypes.SELECT },
  )) as Array<{ coll?: string }>;
  const coll = rows[0]?.coll ?? "utf8mb4_unicode_ci";
  // Interpolated into SQL below: only ever a plain identifier.
  if (!/^[A-Za-z0-9_]+$/.test(coll)) {
    throw new Error(`Unexpected collation name: ${coll}`);
  }
  return coll;
}

export async function checkSchoolIdInvariant(db: Queryable): Promise<SchoolIdInvariantRow[]> {
  const out: SchoolIdInvariantRow[] = [];
  const nameCollation = await schoolNameCollation(db);
  for (const table of SCHOOL_ID_TABLES) {
    const rows = (await db.query(sqlFor(table, nameCollation), { type: QueryTypes.SELECT })) as Array<
      Record<string, number | string>
    >;
    const r = rows[0] ?? {};
    out.push({
      table,
      rows: Number(r.rows ?? 0),
      nullWithName: Number(r.nullWithName ?? 0),
      nullNoName: Number(r.nullNoName ?? 0),
      nameDifferent: Number(r.nameDifferent ?? 0),
      nameLooseOnly: Number(r.nameLooseOnly ?? 0),
    });
  }
  return out;
}

/** True when no row names a school without an id and no row's name differs from its school's. */
export const invariantHolds = (result: SchoolIdInvariantRow[]): boolean =>
  result.every((r) => r.nullWithName === 0 && r.nameDifferent === 0);

/** True when something is reported that must be resolved before the id becomes required. */
export const hasReportedItems = (result: SchoolIdInvariantRow[]): boolean =>
  result.some((r) => r.nullNoName > 0 || r.nameLooseOnly > 0);

/**
 * Schools whose stored name has whitespace at either end. REPORTED, not a
 * failure: the school still works by id, but a by-name writer decides what a
 * name means after trimming, so such a school is matched only through the
 * lookup's `TRIM`, and its stored copies on learners keep the stray space. It
 * should be trimmed (rename it; the rename carries the new name to its
 * learners, logins, classes and fees rows). The API now trims names on create
 * and update, so only older rows can have it.
 */
export async function countSchoolsWithSurroundingWhitespace(db: Queryable): Promise<number> {
  const rows = (await db.query(
    "SELECT COUNT(*) AS n FROM schools WHERE schoolname REGEXP '^[[:space:]]|[[:space:]]$'",
    { type: QueryTypes.SELECT },
  )) as Array<{ n: number | string }>;
  return Number(rows[0]?.n ?? 0);
}
