import { QueryTypes } from "sequelize";

/**
 * The school identity invariant for the two tables that still tie a person to
 * a school by NAME: every row has a `schoolid`, and the school that id points
 * at carries the same name the row does.
 *
 * "The same name" means the same TEXT, byte for byte. The column collation is
 * a poor judge: it ignores trailing spaces and gives several Khmer marks no
 * weight, so two different names can compare equal. A row whose name is equal
 * only under the collation is reported separately (`looseOnlyName`), because
 * it is the one kind of drift the backfill can legitimately leave behind;
 * `differentName` is a row whose name matches its school neither way.
 *
 * Counts only, never names: the output is meant to be pasted into a report.
 */
export const SCHOOL_ID_TABLES = ["students", "schoolusers"] as const;
export type SchoolIdTable = (typeof SCHOOL_ID_TABLES)[number];

export interface SchoolIdInvariantRow {
  table: SchoolIdTable;
  rows: number;
  /** `schoolid` IS NULL (includes the rows that also have no name). */
  nullSchoolId: number;
  /** Of `nullSchoolId`, the rows whose `schoolname` is NULL as well. */
  nullBecauseNoName: number;
  /** `schoolid` set, school's name is not the row's name, byte for byte. */
  mismatchedName: number;
  /** Of `mismatchedName`, names that still compare equal under the collation. */
  looseOnlyName: number;
  /** Of `mismatchedName`, names that are not equal even loosely. */
  differentName: number;
}

interface Queryable {
  query: (sql: string, options: { type: QueryTypes.SELECT }) => Promise<unknown>;
}

const sqlFor = (table: SchoolIdTable, nameCollation: string) => `
  SELECT
    COUNT(*) AS \`rows\`,
    COALESCE(SUM(t.schoolid IS NULL), 0) AS nullSchoolId,
    COALESCE(SUM(t.schoolid IS NULL AND t.schoolname IS NULL), 0) AS nullBecauseNoName,
    COALESCE(SUM(t.schoolid IS NOT NULL AND s.schoolid IS NOT NULL
      AND (t.schoolname IS NULL
        OR CAST(t.schoolname AS BINARY) <> CAST(s.schoolname AS BINARY))), 0) AS mismatchedName,
    COALESCE(SUM(t.schoolid IS NOT NULL AND s.schoolid IS NOT NULL
      AND t.schoolname IS NOT NULL
      AND CAST(t.schoolname AS BINARY) <> CAST(s.schoolname AS BINARY)
      AND t.schoolname = s.schoolname COLLATE ${nameCollation}), 0) AS looseOnlyName
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
    const mismatchedName = Number(r.mismatchedName ?? 0);
    const looseOnlyName = Number(r.looseOnlyName ?? 0);
    out.push({
      table,
      rows: Number(r.rows ?? 0),
      nullSchoolId: Number(r.nullSchoolId ?? 0),
      nullBecauseNoName: Number(r.nullBecauseNoName ?? 0),
      mismatchedName,
      looseOnlyName,
      differentName: mismatchedName - looseOnlyName,
    });
  }
  return out;
}

/** True when no row is missing its id and no row's name differs from its school's. */
export const invariantHolds = (result: SchoolIdInvariantRow[]): boolean =>
  result.every((r) => r.nullSchoolId === 0 && r.mismatchedName === 0);
