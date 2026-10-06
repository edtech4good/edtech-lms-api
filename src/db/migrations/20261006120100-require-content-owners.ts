import { QueryInterface, Transaction } from "sequelize";
import { assertNoViolations, C8_COLUMNS, relaxColumns, requireColumns } from "../required-columns";

/**
 * C8 of the multi-organisation model: `organisationid` becomes NOT NULL on the
 * six content tables that carry their own owner (`curriculums`, `questions`,
 * `documents`, `questiontags`, `documenttags`, `subjects`). Everything else in
 * the content tree takes its owner from its curriculum and has no column.
 *
 * The columns, indexes and foreign keys (C7) already exist; this only tightens
 * them, and writes NO DATA: the content backfill has to have run first.
 *
 * ## The guard
 *
 * Before any DDL, `up()` counts the rows of the six tables whose owner is NULL
 * (soft-deleted rows included). If there are any it throws, with the count per
 * table and the primary keys of the offending rows (ids only, at most 50 per
 * table), and changes nothing. `npm run db:check-owners` prints the same counts
 * without migrating.
 *
 * ## The change, idempotence, down()
 *
 * As C5 (see its header): `MODIFY COLUMN ... NOT NULL` keeping the column's real
 * type, charset and collation; an already-required column is skipped; `down()`
 * makes the six columns nullable again, in reverse order.
 */
module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await assertNoViolations(queryInterface, "C8 (require content owners)", C8_COLUMNS, transaction);
      await requireColumns(queryInterface, C8_COLUMNS, transaction);
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await relaxColumns(queryInterface, C8_COLUMNS, transaction);
    }),
};
