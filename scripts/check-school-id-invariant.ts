/**
 * Counts the rows that break the school identity invariant (see
 * src/db/school-id-invariant.ts) in the database named by .env, and exits 1
 * when there are any:
 *
 *   npm run db:check-schoolid
 *
 * Read-only. Prints counts, never names.
 */
import { dbinstance } from "src/services/dbservice";
import { checkSchoolIdInvariant, invariantHolds } from "src/db/school-id-invariant";

async function main() {
  const db = dbinstance.getdbinstance();
  (db as unknown as { options: { logging: boolean } }).options.logging = false;
  const result = await checkSchoolIdInvariant(db);
  for (const r of result) {
    console.log(
      `${r.table}: rows=${r.rows} null_schoolid=${r.nullSchoolId} (no_name=${r.nullBecauseNoName}) ` +
        `mismatched_name=${r.mismatchedName} (loose_only=${r.looseOnlyName} different=${r.differentName})`,
    );
  }
  const ok = invariantHolds(result);
  console.log(ok ? "OK: every row has a schoolid and the school's name is the row's name." : "INVARIANT BROKEN");
  await db.close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
