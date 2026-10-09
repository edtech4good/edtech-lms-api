import { DataTypes, QueryInterface, QueryTypes, Transaction } from "sequelize";
import { addColumnIfMissing, removeColumnIfPresent } from "../migration-helpers";
import { inStrictMode, relaxColumns, RequiredColumn, requireColumns } from "../required-columns";

/**
 * LI-1 (docs/content-learning-items-design.md, section 11, step C-LI1): a lesson's learning
 * becomes a typed item. Three changes to `lessonlearnings`:
 *
 *  - `lessonlearningtype` VARCHAR(16) NOT NULL DEFAULT 'video'. MySQL fills every existing row
 *    with the default as part of the ALTER: no row is updated by a statement and no id changes.
 *    The set of types is not in the column (adding a type is a code change, not an ALTER); the
 *    validator refuses an unknown one.
 *  - `lessonlearningbody` JSON NULL (null for a video item).
 *  - `documentid` becomes NULL-able, keeping its type, collation and foreign key (an item that is
 *    not a single file has none). Driven by a LOCAL one-column list, not REQUIRED_COLUMNS, so
 *    `npm run db:check-owners` is untouched.
 *
 * ## Reports (read-only, nothing is renumbered)
 *
 * Before any DDL, `up()` prints (a) the lessons whose learnings share an order value, since the
 * admin takes the order as a typed number and ties are possible; they are reported, not fixed
 * (the reorder route writes 1..n from then on), and (b) how many learnings point at a document
 * that is not a video, an input to the "a video item must point at a video document" decision.
 * Counts and ids only.
 *
 * ## Idempotence, down()
 *
 * Every step checks before it acts, so a re-run is a no-op. `down()` is GUARDED: before any DDL
 * it throws once, naming the offending ids and counts, if any item has a type other than 'video', a body, or no
 * document; otherwise it makes `documentid` NOT NULL again and drops both columns. (The link
 * table is dropped by the later migration's own `down()`, which runs first.)
 */
const TABLE = "lessonlearnings";
const TYPE = "lessonlearningtype";
const BODY = "lessonlearningbody";
const VIDEO_DOCUMENT_TYPE = 2; // models/enums/filetype.enum..ts: VIDEO = 2
const LISTED = 50;

/** The one column this migration relaxes: a local list, so the shared REQUIRED_COLUMNS stay as they are. */
const DOCUMENT_COLUMN: readonly RequiredColumn[] = [{ table: TABLE, column: "documentid", pk: "lessonlearningid" }];

type Row = Record<string, unknown>;

const select = async (queryInterface: QueryInterface, sql: string, transaction: Transaction): Promise<Row[]> => {
  const rows = (await queryInterface.sequelize.query(sql, { type: QueryTypes.SELECT, transaction })) as unknown;
  return Array.isArray(rows) ? (rows.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Row[]) : [];
};

const columnsOf = async (queryInterface: QueryInterface): Promise<Record<string, unknown>> => {
  try {
    return (await queryInterface.describeTable(TABLE)) as Record<string, unknown>;
  } catch {
    return {};
  }
};

/** Lessons whose learnings share an order value, and learnings on a document that is not a video. Reads only. */
async function report(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  const ties = await select(
    queryInterface,
    `SELECT lessonid, lessonlearningorder AS ord, COUNT(*) AS n FROM \`${TABLE}\`
      GROUP BY lessonid, lessonlearningorder HAVING COUNT(*) > 1 ORDER BY lessonid, lessonlearningorder`,
    transaction,
  );
  const lessons = new Set(ties.map((t) => String(t.lessonid)));
  console.log(`C-LI1 order ties: ${lessons.size} lesson(s) hold learnings that share an order value (reported, not renumbered)`);
  for (const t of ties.slice(0, LISTED)) {
    console.log(`C-LI1 order tie: lesson ${t.lessonid}: order ${t.ord} is shared by ${t.n} learnings`);
  }
  if (ties.length > LISTED) {
    console.log(`C-LI1 order ties: ${ties.length - LISTED} more not listed`);
  }
  const notVideo = await select(
    queryInterface,
    `SELECT COUNT(*) AS n FROM \`${TABLE}\` l JOIN documents d ON d.documentid = l.documentid
      WHERE d.documenttypeid <> ${VIDEO_DOCUMENT_TYPE}`,
    transaction,
  );
  console.log(`C-LI1 learnings on a document that is not a video: ${Number(notVideo[0]?.n ?? 0)}`);
}

/**
 * Throws ONCE, before any DDL, naming every item a `down()` cannot take back: one whose type is not 'video' or that holds
 * a body (dropping the columns would lose them), and one with no document (`documentid` could not be NOT NULL again).
 * Each reason lists its item ids (at most 50) and the exact count.
 */
async function assertNothingToLose(queryInterface: QueryInterface, desc: Record<string, unknown>, transaction: Transaction): Promise<void> {
  const problems: string[] = [];
  const list = async (label: string, where: string): Promise<void> => {
    const counted = await select(queryInterface, `SELECT COUNT(*) AS n FROM \`${TABLE}\` WHERE ${where}`, transaction);
    const n = Number(counted[0]?.n ?? 0);
    if (n === 0) {
      return;
    }
    const ids = await select(
      queryInterface,
      `SELECT \`lessonlearningid\` AS id FROM \`${TABLE}\` WHERE ${where} ORDER BY \`lessonlearningid\` LIMIT ${LISTED}`,
      transaction,
    );
    problems.push(`${label}: ${n} item(s) (${ids.length < n ? `first ${ids.length} of ${n}` : `all ${n}`}): ${ids.map((r) => r.id).join(", ")}`);
  };
  if (desc[TYPE]) {
    await list(`${TABLE}.${TYPE} is not 'video'`, `\`${TYPE}\` <> 'video'`);
  }
  if (desc[BODY]) {
    await list(`${TABLE}.${BODY} holds a body`, `\`${BODY}\` IS NOT NULL`);
  }
  await list(`${TABLE}.documentid holds no document (it could not be required again)`, "`documentid` IS NULL");
  if (problems.length > 0) {
    throw new Error(
      "C-LI1 (learning item type and body) down() refused, so nothing was changed. These items cannot be taken back:\n" +
        `${problems.join("\n")}\nRemove those items, or give them a document and clear any body, then run down() again.`,
    );
  }
}

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await report(queryInterface, transaction);
      await addColumnIfMissing(
        queryInterface,
        TABLE,
        TYPE,
        { type: DataTypes.STRING(16), allowNull: false, defaultValue: "video" },
        transaction,
      );
      await addColumnIfMissing(queryInterface, TABLE, BODY, { type: DataTypes.JSON, allowNull: true }, transaction);
      await inStrictMode(queryInterface, transaction, async () => {
        await relaxColumns(queryInterface, DOCUMENT_COLUMN, transaction);
      });
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const desc = await columnsOf(queryInterface);
      await assertNothingToLose(queryInterface, desc, transaction);
      await requireColumns(queryInterface, DOCUMENT_COLUMN, transaction);
      await removeColumnIfPresent(queryInterface, TABLE, BODY, transaction);
      await removeColumnIfPresent(queryInterface, TABLE, TYPE, transaction);
    }),
};
