import { QueryInterface, Transaction } from "sequelize";
import { assertNoViolations, C5_COLUMNS, relaxColumns, requireColumns } from "../required-columns";

/**
 * C5 of the multi-organisation model: `schools.organisationid`,
 * `students.schoolid` and `schoolusers.schoolid` become NOT NULL. A school
 * always belongs to an organisation; a learner and a school login always belong
 * to a school. (`lmsusers.organisationid` stays nullable: a platform account
 * belongs to none, by design.)
 *
 * The columns, their indexes and their foreign keys (C3 and C4) already exist;
 * this only tightens them. NO DATA IS WRITTEN: the backfills are separate steps
 * that have to have run first.
 *
 * ## The guard
 *
 * Before any DDL, `up()` counts the rows of the three tables whose column is
 * NULL (soft-deleted rows included: an id is identity, not liveness). If there
 * are any it throws, with the count per column and the primary keys of the
 * offending rows (ids only, never names, at most 50 per column), and changes
 * nothing. `npm run db:check-owners` prints the same counts without migrating:
 * the pre-flight an operator runs before deploying.
 *
 * ## The change
 *
 * `MODIFY COLUMN ... NOT NULL`, with the type, charset and collation the column
 * really has (information_schema), so the foreign key keeps agreeing with
 * `schools.schoolid` / `organisations.organisationid`. Each column is skipped
 * when it is already required: a re-run on tightened tables is a no-op and a run
 * that stopped halfway finishes. A row inserted between the guard and a MODIFY
 * makes MySQL refuse that MODIFY, so nothing is ever forced to a value.
 *
 * ## down()
 *
 * Makes the three columns nullable again, in reverse order. It writes no data.
 */
module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await assertNoViolations(queryInterface, "C5 (require school and organisation links)", C5_COLUMNS, transaction);
      await requireColumns(queryInterface, C5_COLUMNS, transaction);
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await relaxColumns(queryInterface, C5_COLUMNS, transaction);
    }),
};
