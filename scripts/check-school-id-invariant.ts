/**
 * Counts the rows that break, or only strain, the school identity invariant
 * (see src/db/school-id-invariant.ts) in the database named by .env:
 *
 *   npm run db:check-schoolid
 *
 * Exits 1 when a row names a school but has no id (`null_with_name`), or has an
 * id whose school's name is different (`name_different`). `null_no_name` and
 * `name_loose_only` are reported with exit 0. Read-only. Prints counts, never names.
 */
import { dbinstance } from "src/services/dbservice";
import { checkSchoolIdInvariant, hasReportedItems, invariantHolds } from "src/db/school-id-invariant";

async function main() {
  const db = dbinstance.getdbinstance();
  (db as unknown as { options: { logging: boolean } }).options.logging = false;
  const result = await checkSchoolIdInvariant(db);
  for (const r of result) {
    console.log(
      `${r.table}: rows=${r.rows} null_with_name=${r.nullWithName} name_different=${r.nameDifferent} ` +
        `null_no_name=${r.nullNoName} name_loose_only=${r.nameLooseOnly}`,
    );
  }
  const ok = invariantHolds(result);
  if (hasReportedItems(result)) {
    console.log(
      "REPORTED (exit 0): null_no_name = no school id and no school name, so there is no school to point at; " +
        "name_loose_only = has an id, but the name is equal to the school's only under the column collation " +
        "(trailing space, capitals, or a mark such as a Khmer nikahit), not byte for byte. " +
        "Both must be resolved before the id becomes required.",
    );
  }
  console.log(
    ok
      ? "OK: no row names a school without an id, and no row's name differs from its school's."
      : "FAILED: null_with_name or name_different is not 0.",
  );
  await db.close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
