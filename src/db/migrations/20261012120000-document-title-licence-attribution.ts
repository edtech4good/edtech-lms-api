import { DataTypes, QueryInterface, QueryTypes, Transaction } from "sequelize";
import { addColumnIfMissing, removeColumnIfPresent } from "../migration-helpers";

/**
 * C-ML1 (docs/media-library-phase0-design.md, sections 6, 8 and 12): three columns on `documents`.
 *
 *  - `documenttitle` VARCHAR(255) NULL: the name a person gave the file, for display. `documentname` keeps its meaning
 *    (the file's key in the store); null means "show `documentname`".
 *  - `documentlicence` VARCHAR(64) NOT NULL DEFAULT 'unspecified': an id from a closed list kept in code, so adding a
 *    licence is a code change and never an ALTER. MySQL fills every existing row with the default as part of the ALTER:
 *    no statement updates a row and no id, name or key changes.
 *  - `documentattribution` JSON NULL: a versioned object (author, source URL, adapted from).
 *
 * No index (a title search is LIKE %...%) and no owner column, so `REQUIRED_COLUMNS` is untouched.
 *
 * ## Reports (read-only)
 *
 * Before any DDL `up()` prints counts only: documents per `documenttypeid`; learnings whose document is not a video
 * (the video rule of phase 0 refuses them from now on; existing ones are reported, not changed); and how many names do
 * not fit the rule uploads used to apply (letters, digits and underscores, at most 25 before the extension), which
 * is information for an operator and changes nothing.
 *
 * ## Idempotence, down()
 *
 * Every step checks before it acts, so a re-run is a no-op. `down()` is GUARDED: before any DDL it throws once, naming
 * the document ids (at most 50 for each reason) and the exact counts, if any document has a title, an attribution or a
 * licence other than 'unspecified'; otherwise it drops the three columns.
 */
const TABLE = "documents";
const TITLE = "documenttitle";
const LICENCE = "documentlicence";
const ATTRIBUTION = "documentattribution";
const UNSPECIFIED = "unspecified";
const VIDEO_DOCUMENT_TYPE = 2; // models/enums/filetype.enum..ts: VIDEO = 2
const LISTED = 50;

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

/** Counts only; nothing is changed. */
async function report(queryInterface: QueryInterface, transaction: Transaction): Promise<void> {
  const perType = await select(
    queryInterface,
    `SELECT documenttypeid AS t, COUNT(*) AS n FROM \`${TABLE}\` GROUP BY documenttypeid ORDER BY documenttypeid`,
    transaction,
  );
  console.log(`C-ML1 documents per documenttypeid: ${perType.length === 0 ? "none" : perType.map((r) => `${r.t}=${Number(r.n)}`).join(", ")}`);
  const notVideo = await select(
    queryInterface,
    `SELECT COUNT(*) AS n FROM lessonlearnings l JOIN \`${TABLE}\` d ON d.documentid = l.documentid
      WHERE d.documenttypeid <> ${VIDEO_DOCUMENT_TYPE}`,
    transaction,
  );
  console.log(`C-ML1 learnings on a document that is not a video: ${Number(notVideo[0]?.n ?? 0)}`);
  const oldRule = await select(
    queryInterface,
    `SELECT COUNT(*) AS n FROM \`${TABLE}\` WHERE documentname NOT REGEXP '^[a-zA-Z0-9_]{1,25}[.][a-zA-Z0-9]+$'`,
    transaction,
  );
  console.log(`C-ML1 documents whose name fails the old upload name rule (letters, digits, _, at most 25, then an extension): ${Number(oldRule[0]?.n ?? 0)}`);
}

/**
 * Throws ONCE, before any DDL, naming every document a `down()` cannot take back: one holding a title, an attribution or a
 * licence other than 'unspecified' (dropping the columns would lose it). Each reason lists its ids (at most 50) and the
 * exact count.
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
      `SELECT \`documentid\` AS id FROM \`${TABLE}\` WHERE ${where} ORDER BY \`documentid\` LIMIT ${LISTED}`,
      transaction,
    );
    problems.push(`${label}: ${n} document(s) (${ids.length < n ? `first ${ids.length} of ${n}` : `all ${n}`}): ${ids.map((r) => r.id).join(", ")}`);
  };
  if (desc[TITLE]) {
    await list(`${TABLE}.${TITLE} holds a title`, `\`${TITLE}\` IS NOT NULL`);
  }
  if (desc[LICENCE]) {
    await list(`${TABLE}.${LICENCE} holds a licence other than '${UNSPECIFIED}'`, `\`${LICENCE}\` <> '${UNSPECIFIED}'`);
  }
  if (desc[ATTRIBUTION]) {
    await list(`${TABLE}.${ATTRIBUTION} holds an attribution`, `\`${ATTRIBUTION}\` IS NOT NULL`);
  }
  if (problems.length > 0) {
    throw new Error(
      "C-ML1 (document title, licence and attribution) down() refused, so nothing was changed. These documents cannot be taken back:\n" +
        `${problems.join("\n")}\nClear those fields (PUT /document/:documentid), then run down() again.`,
    );
  }
}

module.exports = {
  up: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      await report(queryInterface, transaction);
      await addColumnIfMissing(queryInterface, TABLE, TITLE, { type: DataTypes.STRING(255), allowNull: true }, transaction);
      await addColumnIfMissing(
        queryInterface,
        TABLE,
        LICENCE,
        { type: DataTypes.STRING(64), allowNull: false, defaultValue: UNSPECIFIED },
        transaction,
      );
      await addColumnIfMissing(queryInterface, TABLE, ATTRIBUTION, { type: DataTypes.JSON, allowNull: true }, transaction);
    }),

  down: (queryInterface: QueryInterface): Promise<void> =>
    queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      const desc = await columnsOf(queryInterface);
      await assertNothingToLose(queryInterface, desc, transaction);
      await removeColumnIfPresent(queryInterface, TABLE, ATTRIBUTION, transaction);
      await removeColumnIfPresent(queryInterface, TABLE, LICENCE, transaction);
      await removeColumnIfPresent(queryInterface, TABLE, TITLE, transaction);
    }),
};
