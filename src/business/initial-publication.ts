import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { ApiError } from "src/models/ApiError";
import { curriculumpublications } from "src/models/data-models/curriculumpublications";
import { curriculums } from "src/models/data-models/curriculums";
import { lmsusers } from "src/models/data-models/lmsusers";
import { organisations } from "src/models/data-models/organisations";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { dbinstance, rollbackQuietly } from "src/services/dbservice";
import { hashTables, payloadHashOf, payloadOf, readSubjects, summarise, Tables, CurriculumPayload } from "./curriculum-publication";
import { contextOfOrganisation, keyOf, readCurriculumContent } from "./organisation-content-export";

/**
 * The one-shot initial publication (docs/content-publishing-design.md, decision 2; `npm run publish:initial`).
 *
 * Once the sync serves publications (A4 step 2), a curriculum that was never published is not sent to learners and the
 * student side marks it deleted. This command publishes, for each organisation asked for, every curriculum that has no
 * publication row at all, as it stands now, so that the first sync after the switch equals what the live export sent
 * (for an organisation whose every bank row is used by a curriculum). It is not a migration: it runs the publish builder,
 * which refuses a curriculum whose content names rows its organisation does not own, and one such organisation must not
 * fail a deploy.
 *
 * Per organisation, ALL OR NOTHING: every curriculum without a publication is built first (no transaction open), and when
 * any of them is refused the organisation gets none and is reported with the tables and counts that are wrong (never a row
 * or an id). Otherwise the publications are written in ONE transaction, with the curriculum rows locked as a publish locks
 * them; a curriculum that gained a publication in the meantime is left alone. A curriculum that has a publication row of
 * any status is left alone: a withdrawn one was retired on purpose and is not published again here. Run it twice and the
 * second run publishes nothing. Deleted curricula are not published.
 *
 * `publishedby` is NOT NULL and a foreign key to `lmsusers`, so a publication needs a real account: the one the migrations
 * seed on every deployment (the platform's superadmin, `SEEDED_PLATFORM_ACCOUNT`), or the account named with `--as`. The
 * account must exist; it is looked up before anything is written.
 */

/** The platform account `20230306155558-superadmin` seeds on every deployment. */
export const SEEDED_PLATFORM_ACCOUNT = "5ec8814c-4390-40e3-8d93-828adca9aa08";

export interface Args {
  organisationid?: string;
  all: boolean;
  dryRun: boolean;
  as?: string;
}

/** The command line of `npm run publish:initial`: exactly one of `--organisation <id>` and `--all`, and `--dry-run`, `--as <lmsuserid>`; anything else is refused. */
export const parseArgs = (argv: string[]): Args => {
  const args: Args = { all: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v === "" || v.startsWith("--")) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === "--organisation") args.organisationid = value();
    else if (arg === "--as") args.as = value();
    else if (arg === "--all") args.all = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (args.all === (args.organisationid !== undefined)) throw new Error("name exactly one of --organisation <id> and --all");
  return args;
};

export interface RefusedCurriculum {
  field: string;
  message: string;
}
export interface InitialOutcome {
  organisationid: string;
  status: "published" | "nothing" | "refused";
  /** The curricula published (or, in a dry run, that would be): ids only. */
  curricula: string[];
  /** Why the organisation was refused: the tables and counts the publish builder names. */
  problems: RefusedCurriculum[];
}

const refusalOf = (e: unknown): RefusedCurriculum[] | null => {
  if (e instanceof ApiError && e.code === ErrorCode.INVALID_INPUT) {
    return e.fields !== undefined && e.fields.length > 0 ? e.fields.map((f) => ({ field: f.field, message: f.message })) : [{ field: "", message: e.message }];
  }
  return null;
};

/** The account a publication is made as: `named`, or the seeded platform account; it must exist. */
export const initialPublisher = async (named?: string): Promise<string> => {
  const lmsuserid = named ?? SEEDED_PLATFORM_ACCOUNT;
  const found = await lmsusers.findOne({ where: { lmsuserid }, attributes: ["lmsuserid"] });
  if (found === null) {
    throw new Error(
      named === undefined
        ? "The platform account the migrations seed is not in this database. Name an existing staff account with --as <lmsuserid>."
        : "The account named with --as is not in this database.",
    );
  }
  return found.lmsuserid;
};

/** The live organisations to publish for: the one named (it must exist), or all of them. */
export const organisationsToPublish = async (which: { organisationid: string } | { all: true }): Promise<string[]> => {
  if ("all" in which) {
    const rows = await organisations.findAll({ where: { isdeleted: false }, attributes: ["organisationid"], order: [["organisationid", "ASC"]] });
    return rows.map((r) => r.organisationid);
  }
  const row = await organisations.findOne({ where: { organisationid: which.organisationid, isdeleted: false }, attributes: ["organisationid"] });
  if (row === null) throw new Error("That organisation is not in this database.");
  return [row.organisationid];
};

/** The curricula of the organisation (live ones) with no publication row of any status, with their payloads built; refused as a whole. */
const plan = async (organisationid: string): Promise<{ payloads: CurriculumPayload[]; problems: RefusedCurriculum[] }> => {
  const content = (await readCurriculumContent(contextOfOrganisation(organisationid))) as Tables;
  const subjects = await readSubjects(organisationid);
  const candidates = content.curriculums.filter((c) => !(c.isdeleted === true || c.isdeleted === 1));
  const have = new Set(
    (
      await curriculumpublications.findAll({
        where: { organisationid, curriculumid: { [Op.in]: candidates.map((c) => String(c.curriculumid)) } },
        attributes: ["curriculumid"],
      })
    ).map((r) => keyOf(r.curriculumid)),
  );
  const wanted = candidates
    .filter((c) => !have.has(keyOf(c.curriculumid)))
    .sort((a, b) => String(a.curriculumname ?? "").localeCompare(String(b.curriculumname ?? "")) || String(a.curriculumid).localeCompare(String(b.curriculumid)));
  const payloads: CurriculumPayload[] = [];
  const problems: RefusedCurriculum[] = [];
  for (const c of wanted) {
    try {
      payloads.push(payloadOf(organisationid, content, String(c.curriculumid), subjects));
    } catch (e) {
      const refusal = refusalOf(e);
      if (refusal === null) throw e;
      problems.push(...refusal);
    }
  }
  return { payloads, problems };
};

/**
 * Publishes the organisation's curricula that have no publication (see above). `dryRun` builds and checks everything and
 * writes nothing.
 */
export const publishInitial = async (organisationid: string, publishedby: string, options: { dryRun?: boolean } = {}): Promise<InitialOutcome> => {
  const { payloads, problems } = await plan(organisationid);
  if (problems.length > 0) return { organisationid, status: "refused", curricula: [], problems };
  if (payloads.length === 0) return { organisationid, status: "nothing", curricula: [], problems: [] };
  if (options.dryRun === true) return { organisationid, status: "published", curricula: payloads.map((p) => p.curriculumid), problems: [] };

  const transaction = await dbinstance.getdbinstance().transaction();
  try {
    // the curriculum rows are locked as a publish locks them, then the plan is checked again: one that gained a publication since is left alone
    await curriculums.findAll({
      where: { curriculumid: { [Op.in]: payloads.map((p) => p.curriculumid) } },
      attributes: ["curriculumid"],
      order: [["curriculumid", "ASC"]],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    const taken = new Set(
      (
        await curriculumpublications.findAll({
          where: { curriculumid: { [Op.in]: payloads.map((p) => p.curriculumid) } },
          attributes: ["curriculumid"],
          transaction,
        })
      ).map((r) => keyOf(r.curriculumid)),
    );
    const base = Date.now();
    const written: string[] = [];
    for (const [i, payload] of payloads.filter((p) => !taken.has(keyOf(p.curriculumid))).entries()) {
      const hashes = hashTables(payload.tables);
      await curriculumpublications.create(
        {
          publicationid: uuidv4(),
          curriculumid: payload.curriculumid,
          organisationid,
          // one millisecond apart, in curriculum order, so that no two of a run tie
          publishedat: new Date(base + i),
          publishedby,
          status: "published",
          payload: payload as unknown as object,
          summary: summarise(payload.tables, hashes, null) as unknown as object,
          payloadhash: payloadHashOf(hashes),
        },
        { transaction },
      );
      written.push(payload.curriculumid);
    }
    await transaction.commit();
    return { organisationid, status: written.length > 0 ? "published" : "nothing", curricula: written, problems: [] };
  } catch (e) {
    await rollbackQuietly(transaction);
    throw e;
  }
};
