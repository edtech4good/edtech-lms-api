import { createHash } from "crypto";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiError } from "src/models/ApiError";
import { curriculumpublications, PublicationStatus } from "src/models/data-models/curriculumpublications";
import { curriculums } from "src/models/data-models/curriculums";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { dbinstance, rollbackQuietly } from "src/services/dbservice";
import { assertInScope } from "./content-scope";
import { ownerOfCurriculum } from "./content-owner";
import { notFoundError, scopeOf } from "./org-scope";
import {
  confine,
  contextOfOrganisation,
  CURRICULUM_CONTENT_KEYS,
  CurriculumContentKey,
  keyOf,
  readCurriculumContent,
  Row,
  SHAPE,
} from "./organisation-content-export";

/**
 * Publishing one curriculum (docs/content-publishing-design.md, option A, step 1).
 *
 * A publication is the curriculum's own payload, taken from the live tables the moment an editor publishes, and stored
 * in `curriculumpublications` with a summary of what changed since the publication before it. This file builds that
 * payload, hashes it, compares it, and records and withdraws publications. It changes nothing about what the two sync
 * routes serve (step 2) and pushes nothing (step 3).
 *
 * ## The payload
 *
 * `payload.tables` holds sixteen of the export's tables (CURRICULUM_CONTENT_KEYS): the curriculum row; the rows that hang
 * from it (baselines and their questions, grades, levels, lessons, and what a lesson holds: learning items and their
 * documents, plans, practices, quizzes and the question links); and the REVERSE CLOSURE, the questions and documents
 * those rows name. The organisation's other curricula are not in it, and neither are the four tables the organisation
 * owns outright (countries, schools, standards, subjects): the sync keeps those live. The rows are read by the
 * export's own readers, in its order, so a row in a payload is the row the export would ship.
 *
 * The closure is picked from the SHAPE of the export (its parent and reference columns), then the result goes through
 * the export's `confine`. A payload that `confine` would change is not published: it is refused (400) with the tables and
 * counts that are wrong, because a payload that ships a dangling reference is exactly what the student API refuses.
 *
 * ## Hashes
 *
 * A row's hash is the sha256 of its JSON with the keys sorted at every level (arrays keep their order, a date is its
 * ISO text), so it is the same on every run and on every machine. The payload's hash is the sha256 of the table-then-id
 * map of those hashes, so it does not depend on the order the readers returned the rows in. "Changed since publish" is
 * the live payload's hash differing from the latest publication's.
 */

export type Tables = Record<CurriculumContentKey, Row[]>;

export interface CurriculumPayload {
  format: 1;
  curriculumid: string;
  organisationid: string;
  tables: Tables;
}

/** table -> row id -> sha256 of the row. */
export type RowHashes = Record<string, Record<string, string>>;

export interface RowRef {
  id: string;
  name: string;
}
export interface TableChange {
  added: number;
  removed: number;
  changed: number;
}
export interface Affected {
  added: RowRef[];
  removed: RowRef[];
  changed: RowRef[];
}
export interface SharedRow {
  table: "questions" | "documents";
  id: string;
  name: string;
  /** The organisation's other curricula that also use the row (their names are content, not people). */
  curricula: RowRef[];
}

/** What is stored in `curriculumpublications.summary`. */
export interface PublicationSummary {
  format: 1;
  /** The publication this one was compared with: the latest one, when it is `published`; else null (everything is new). */
  previous: string | null;
  counts: Record<string, number>;
  /** Exact, per table. */
  changes: Record<string, TableChange>;
  /** Lessons and questions whose rows changed, by name (at most NAME_LIMIT of each kind; the counts above are exact). */
  affected: { lessons: Affected; questions: Affected; truncated: boolean };
  /** Questions and documents added or changed here that another curriculum of the organisation also uses. */
  shared: SharedRow[];
  /** Names of this payload's lessons and questions, kept so that a later publish can name what it removed. */
  names: { lessons: Record<string, string>; questions: Record<string, string> };
  hashes: RowHashes;
}

/** The most names a summary lists of one kind of change (the counts are always exact). */
export const NAME_LIMIT = 200;

// ---- hashing -----------------------------------------------------------------------------------

const sortedValue = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") return value;
  const withJson = value as { toJSON?: () => unknown };
  if (typeof withJson.toJSON === "function") return sortedValue(withJson.toJSON());
  if (Array.isArray(value)) return value.map(sortedValue);
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, sortedValue(record[key])]),
  );
};

/** JSON with the keys of every object sorted, so equal values give equal text. */
export const canonicalJson = (value: unknown): string => JSON.stringify(sortedValue(value));

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** sha256 of the row's key-sorted JSON. */
export const rowHash = (row: Row): string => sha256(canonicalJson(row));

const idOf = (key: CurriculumContentKey, row: Row): string => String(row[SHAPE[key].pk]);

/** The hash of every row of every table. Every table is present, an empty one as `{}`. */
export const hashTables = (tables: Tables): RowHashes => {
  const hashes: RowHashes = {};
  for (const key of CURRICULUM_CONTENT_KEYS) {
    hashes[key] = {};
    for (const row of tables[key]) {
      hashes[key][idOf(key, row)] = rowHash(row);
    }
  }
  return hashes;
};

/** The hash of a payload: of the map of its row hashes, so the order of the rows does not matter. */
export const payloadHashOf = (hashes: RowHashes): string => sha256(canonicalJson(hashes));

// ---- picking the curriculum's rows -----------------------------------------------------------------

/**
 * One curriculum's rows out of the organisation's content: the curriculum, every row that hangs from it (found through
 * the export's SHAPE, parent before child), then the questions and documents those rows name. Nothing else: a bank row
 * that none of them names is left out. Pure; the rows are not copied, and their order is the readers'.
 */
export const selectCurriculumTables = (all: Tables, curriculumid: string): Tables => {
  const wanted = keyOf(curriculumid);
  const picked: Partial<Tables> = {};
  const idsIn = (key: CurriculumContentKey): Set<string> => {
    const list = picked[key];
    if (list === undefined) throw new Error(`curriculum publication: ${key} is read before the table it hangs from`);
    return new Set(list.map((r) => keyOf(r[SHAPE[key].pk])).filter((id): id is string => id !== null));
  };

  for (const key of CURRICULUM_CONTENT_KEYS) {
    if (key === "questions" || key === "documents") continue;
    if (key === "curriculums") {
      picked.curriculums = all.curriculums.filter((r) => keyOf(r.curriculumid) === wanted);
      continue;
    }
    const parent = SHAPE[key].parent;
    if (parent === undefined) throw new Error(`curriculum publication: ${key} has no parent in the export's shape`);
    const parents = idsIn(parent.to as CurriculumContentKey);
    picked[key] = all[key].filter((r) => {
      const id = keyOf(r[parent.fk]);
      return id !== null && parents.has(id);
    });
  }

  // The reverse closure: the bank rows the picked rows name.
  for (const bank of ["questions", "documents"] as const) {
    const named = new Set<string>();
    for (const key of CURRICULUM_CONTENT_KEYS) {
      if (key === "questions" || key === "documents") continue;
      for (const ref of SHAPE[key].refs ?? []) {
        if (ref.to !== bank) continue;
        for (const row of picked[key] ?? []) {
          const id = keyOf(row[ref.fk]);
          if (id !== null) named.add(id);
        }
      }
    }
    picked[bank] = all[bank].filter((r) => {
      const id = keyOf(r[SHAPE[bank].pk]);
      return id !== null && named.has(id);
    });
  }
  return picked as Tables;
};

const countText = (n: number) => (n === 1 ? "1 row" : `${n} rows`);

const unpublishable = (problems: string[], fields?: Array<{ field: string; message: string }>) =>
  new ApiError(
    ErrorCode.INVALID_INPUT,
    `This curriculum can't be published yet. ${problems.join(" ")}`,
    {
      hint: "Fix or remove the rows named, then publish again. Nothing was published.",
      ...(fields && fields.length > 0 ? { fields } : {}),
    },
  );

/**
 * The export's `confine` on one curriculum's rows. A payload it would change, by leaving rows out or by refusing a row
 * that names a question or document that is not in the organisation's own bank (another organisation's, nobody's, or
 * gone), is refused with 400, naming tables and counts and no row.
 */
export const confineCurriculumTables = (tables: Tables): Tables => {
  let confined: Tables;
  try {
    confined = confine(tables) as Tables;
  } catch (e) {
    if (e instanceof ApiError && e.fields !== undefined && e.fields.length > 0) {
      throw unpublishable(
        e.fields.map((f) => f.message),
        e.fields,
      );
    }
    throw e;
  }
  const dropped = CURRICULUM_CONTENT_KEYS.filter((key) => confined[key].length !== tables[key].length).map(
    (key) => `${key}: ${countText(tables[key].length - confined[key].length)} hang from a row that is not in this curriculum.`,
  );
  if (dropped.length > 0) {
    throw unpublishable(dropped);
  }
  return confined;
};

/**
 * The payload of one curriculum out of the organisation's content: its rows (selectCurriculumTables), confined. A
 * curriculum that is not in the content, or is deleted, is the 404 an absent one gets. Pure.
 */
export const payloadOf = (organisationid: string, content: Tables, curriculumid: string): CurriculumPayload => {
  const picked = selectCurriculumTables(content, curriculumid);
  const row = picked.curriculums[0];
  if (row === undefined || row.isdeleted === true || row.isdeleted === 1) {
    throw notFoundError("That curriculum doesn't exist.");
  }
  return { format: 1, curriculumid: String(row.curriculumid), organisationid, tables: confineCurriculumTables(picked) };
};

// ---- who a request publishes for -------------------------------------------------------------------

/**
 * The organisation a publish or a retire is for: the one the caller acts in. A platform user who is not acting as an
 * organisation has none: 400, as creating content has. The organisation always comes from the token.
 */
export const publishingOrganisation = (org: OrgContext): string => {
  const scope = scopeOf(org);
  if (scope.kind === "platform") {
    throw new ApiError(
      ErrorCode.INVALID_INPUT,
      "Choose an organisation to act in before you publish a curriculum. Use the organisation switcher, then try again.",
    );
  }
  return scope.organisationid;
};

/**
 * The organisation a read of a curriculum's publication is for: the one the caller acts in, or, for a platform user who is
 * not acting, the curriculum's owner (a curriculum with no owner has no publication: the 404 an absent one gets).
 */
const organisationOfRead = async (org: OrgContext, curriculumid: string): Promise<string> => {
  const scope = scopeOf(org);
  if (scope.kind === "organisation") return scope.organisationid;
  const owner = await ownerOfCurriculum(curriculumid);
  if (owner === null || owner === undefined) throw notFoundError("That curriculum doesn't exist.");
  return owner;
};

/** The payload of the curriculum as it is now, built from the live tables by the export's readers. */
export const buildCurriculumPayload = async (org: OrgContext, curriculumid: string): Promise<CurriculumPayload> => {
  const organisationid = publishingOrganisation(org);
  const content = await readCurriculumContent(contextOfOrganisation(organisationid));
  return payloadOf(organisationid, content, curriculumid);
};

// ---- comparing -----------------------------------------------------------------------------------------

/** Per table: the ids added, removed and changed between two sets of hashes (`null` is nothing: every row is added). */
export const diffHashes = (
  current: RowHashes,
  previous: RowHashes | null,
): Record<string, { added: string[]; removed: string[]; changed: string[] }> => {
  const out: Record<string, { added: string[]; removed: string[]; changed: string[] }> = {};
  for (const key of CURRICULUM_CONTENT_KEYS) {
    const now = current[key] ?? {};
    const before = previous?.[key] ?? {};
    out[key] = {
      added: Object.keys(now).filter((id) => !(id in before)),
      removed: Object.keys(before).filter((id) => !(id in now)),
      changed: Object.keys(now).filter((id) => id in before && before[id] !== now[id]),
    };
  }
  return out;
};

const nameOfQuestion = (row: Row): string => String(row.questionidentifier ?? "");
const nameOfLesson = (row: Row): string => String(row.lessonname ?? "");

const namesOf = (tables: Tables) => ({
  lessons: Object.fromEntries(tables.lessons.map((r) => [idOf("lessons", r), nameOfLesson(r)])),
  questions: Object.fromEntries(tables.questions.map((r) => [idOf("questions", r), nameOfQuestion(r)])),
});

const refs = (ids: string[], names: Record<string, string>): { list: RowRef[]; cut: boolean } => ({
  list: ids.slice(0, NAME_LIMIT).map((id) => ({ id, name: names[id] ?? "" })),
  cut: ids.length > NAME_LIMIT,
});

/**
 * The bank rows this publish adds or changes that another curriculum of the organisation also uses. The student side
 * keeps one copy of a shared question or document, and the newest publication's copy wins, so these are the rows whose
 * new copy reaches that other curriculum's learners too (docs/content-publishing-design.md, section 3). Pure.
 */
export const sharedRows = (
  content: Tables,
  curriculumid: string,
  tables: Tables,
  diff: ReturnType<typeof diffHashes>,
): SharedRow[] => {
  const touched = {
    questions: new Set([...diff.questions.added, ...diff.questions.changed]),
    documents: new Set([...diff.documents.added, ...diff.documents.changed]),
  };
  if (touched.questions.size === 0 && touched.documents.size === 0) return [];
  const users: Record<"questions" | "documents", Map<string, RowRef[]>> = { questions: new Map(), documents: new Map() };
  for (const other of content.curriculums) {
    if (keyOf(other.curriculumid) === keyOf(curriculumid) || other.isdeleted === true || other.isdeleted === 1) continue;
    const theirs = selectCurriculumTables(content, String(other.curriculumid));
    for (const bank of ["questions", "documents"] as const) {
      for (const row of theirs[bank]) {
        const id = idOf(bank, row);
        if (!touched[bank].has(id)) continue;
        users[bank].set(id, [...(users[bank].get(id) ?? []), { id: String(other.curriculumid), name: String(other.curriculumname ?? "") }]);
      }
    }
  }
  const out: SharedRow[] = [];
  for (const bank of ["questions", "documents"] as const) {
    for (const row of tables[bank]) {
      const id = idOf(bank, row);
      const curricula = users[bank].get(id);
      if (curricula !== undefined) {
        out.push({ table: bank, id, name: bank === "questions" ? nameOfQuestion(row) : String(row.documentname ?? ""), curricula });
      }
    }
  }
  return out;
};

/**
 * The summary of a payload against the publication before it (`previous`: its hashes and names, or null when there is
 * none to compare with). Exact counts per table; the lessons and questions named. Pure.
 */
export const summarise = (
  tables: Tables,
  hashes: RowHashes,
  previous: { publicationid: string; summary: PublicationSummary } | null,
  shared: SharedRow[] = [],
): PublicationSummary => {
  const diff = diffHashes(hashes, previous?.summary.hashes ?? null);
  const names = namesOf(tables);
  const before = previous?.summary.names ?? { lessons: {}, questions: {} };
  let truncated = false;
  const affected = (kind: "lessons" | "questions"): Affected => {
    const d = diff[kind];
    const added = refs(d.added, names[kind]);
    const removed = refs(d.removed, before[kind]);
    const changed = refs(d.changed, names[kind]);
    truncated = truncated || added.cut || removed.cut || changed.cut;
    return { added: added.list, removed: removed.list, changed: changed.list };
  };
  const lessons = affected("lessons");
  const questions = affected("questions");
  return {
    format: 1,
    previous: previous?.publicationid ?? null,
    counts: Object.fromEntries(CURRICULUM_CONTENT_KEYS.map((key) => [key, tables[key].length])),
    changes: Object.fromEntries(
      CURRICULUM_CONTENT_KEYS.map((key) => [key, { added: diff[key].added.length, removed: diff[key].removed.length, changed: diff[key].changed.length }]),
    ),
    affected: { lessons, questions, truncated },
    shared,
    names,
    hashes,
  };
};

/** The summary as an answer: everything but the per-row hashes and the names kept for the next publish. */
export const summaryForAnswer = (summary: PublicationSummary) => {
  const { hashes: _hashes, names: _names, ...rest } = summary;
  return rest;
};

// ---- the stored publications ----------------------------------------------------------------------------

const LIGHT = ["publicationid", "curriculumid", "organisationid", "publishedat", "publishedby", "status", "payloadhash"] as const;

interface LightRow {
  publicationid: string;
  curriculumid: string;
  organisationid: string;
  publishedat: Date;
  publishedby: string;
  status: PublicationStatus;
  payloadhash: string;
}

/** The latest publication of each of the curricula, without its payload or its summary. */
const latestOf = async (curriculumids: string[]): Promise<Map<string, LightRow>> => {
  const latest = new Map<string, LightRow>();
  if (curriculumids.length === 0) return latest;
  const rows = await curriculumpublications.findAll({
    where: { curriculumid: { [Op.in]: curriculumids } },
    attributes: [...LIGHT],
    order: [["publishedat", "DESC"]],
  });
  for (const row of rows) {
    if (!latest.has(row.curriculumid)) latest.set(row.curriculumid, row as unknown as LightRow);
  }
  return latest;
};

export type PublicationStatusOfCurriculum = "never" | "published" | "withdrawn";

export interface PublicationState {
  publicationid: string | null;
  /** When the curriculum was last published; null when it never was, or has been withdrawn. */
  publishedat: Date | null;
  publicationstatus: PublicationStatusOfCurriculum;
}

const stateOf = (latest: LightRow | undefined): PublicationState =>
  latest === undefined
    ? { publicationid: null, publishedat: null, publicationstatus: "never" }
    : {
        publicationid: latest.publicationid,
        publishedat: latest.status === "published" ? latest.publishedat : null,
        publicationstatus: latest.status,
      };

/** The publication state of each curriculum, in one query (no payloads). A curriculum with no publication is `never`. */
export const publicationStates = async (curriculumids: string[]): Promise<Map<string, PublicationState>> => {
  const latest = await latestOf(curriculumids);
  return new Map(curriculumids.map((id) => [id, stateOf(latest.get(id))]));
};

// ---- publish, retire, read --------------------------------------------------------------------------------

const nextTime = (latest: Date | undefined): Date => {
  const now = new Date();
  // strictly after the curriculum's latest publication, so that "the latest" is never a tie
  return latest !== undefined && now.getTime() <= new Date(latest).getTime() ? new Date(new Date(latest).getTime() + 1) : now;
};

export interface PublishResult {
  publicationid: string;
  publishedat: Date;
  summary: ReturnType<typeof summaryForAnswer>;
}

/**
 * Publishes the curriculum: builds its payload now, compares it with the latest publication (when that is `published`),
 * stores the new publication, and drops the payloads of the curriculum's publications beyond the latest two (the row and
 * its summary stay). A publish with nothing changed still records a publication, with a summary of 0, 0, 0: the act is
 * the record (who and when), and a publish repeated after a push that failed must still push (step 3).
 *
 * The caller has not checked the curriculum: it is in the caller's organisation, or the 404 an absent one gets.
 */
export const publishCurriculum = async (org: OrgContext, publishedby: string, curriculumid: string): Promise<PublishResult> => {
  const organisationid = publishingOrganisation(org);
  await assertInScope(org, "curriculum", curriculumid);
  const content = await readCurriculumContent(contextOfOrganisation(organisationid));
  const payload = payloadOf(organisationid, content, curriculumid);
  const hashes = hashTables(payload.tables);
  const payloadhash = payloadHashOf(hashes);

  const transaction = await dbinstance.getdbinstance().transaction();
  try {
    // two publishes of one curriculum at once take turns
    await curriculums.findOne({ where: { curriculumid }, attributes: ["curriculumid"], lock: transaction.LOCK.UPDATE, transaction });
    const history = await curriculumpublications.findAll({
      where: { curriculumid },
      attributes: { exclude: ["payload"] },
      order: [["publishedat", "DESC"]],
      transaction,
    });
    const latest = history[0];
    const previous =
      latest !== undefined && latest.status === "published"
        ? { publicationid: latest.publicationid, summary: latest.summary as unknown as PublicationSummary }
        : null;
    const diff = diffHashes(hashes, previous?.summary.hashes ?? null);
    const summary = summarise(payload.tables, hashes, previous, sharedRows(content, curriculumid, payload.tables, diff));

    const publicationid = uuidv4();
    const publishedat = nextTime(latest?.publishedat);
    await curriculumpublications.create(
      {
        publicationid,
        curriculumid: payload.curriculumid,
        organisationid,
        publishedat,
        publishedby,
        status: "published",
        payload: payload as unknown as object,
        summary: summary as unknown as object,
        payloadhash,
      },
      { transaction },
    );
    // retention (decision 9): the latest two payloads are kept, this one and the one before it; older ones are dropped
    const older = history.slice(1).map((h) => h.publicationid);
    if (older.length > 0) {
      await curriculumpublications.update(
        { payload: null },
        { where: { publicationid: { [Op.in]: older }, payload: { [Op.ne]: null } }, transaction },
      );
    }
    await transaction.commit();
    return { publicationid, publishedat, summary: summaryForAnswer(summary) };
  } catch (e) {
    await rollbackQuietly(transaction);
    throw e;
  }
};

export interface RetireResult extends PublicationState {
  curriculumid: string;
  /** True when this call withdrew a published curriculum; false when it was already withdrawn, or never published. */
  retired: boolean;
}

/**
 * Retires the curriculum: its publications that are `published` become `withdrawn`, so the next payload leaves it out
 * (step 2) and learners' progress stays. Idempotent: a curriculum already withdrawn, or never published, answers with
 * `retired: false` and changes nothing.
 */
export const retireCurriculum = async (org: OrgContext, curriculumid: string): Promise<RetireResult> => {
  publishingOrganisation(org);
  await assertInScope(org, "curriculum", curriculumid);
  const transaction = await dbinstance.getdbinstance().transaction();
  let retired = false;
  try {
    await curriculums.findOne({ where: { curriculumid }, attributes: ["curriculumid"], lock: transaction.LOCK.UPDATE, transaction });
    const [changed] = await curriculumpublications.update(
      { status: "withdrawn" },
      { where: { curriculumid, status: "published" }, transaction },
    );
    retired = changed > 0;
    await transaction.commit();
  } catch (e) {
    await rollbackQuietly(transaction);
    throw e;
  }
  return { curriculumid, retired, ...stateOf((await latestOf([curriculumid])).get(curriculumid)) };
};

export interface PublicationOverview extends PublicationState {
  curriculumid: string;
  changedsincepublish: boolean;
  /** Null when the live rows can be published; else what stops them (tables and counts only). */
  problem: string | null;
  /** What a publish now would record against the latest publication, when that is `published`. */
  pending: ReturnType<typeof summaryForAnswer> | null;
  /** The latest publication's own summary. */
  latest: { publicationid: string; publishedat: Date; publishedby: string; status: PublicationStatus; summary: ReturnType<typeof summaryForAnswer> } | null;
}

/**
 * Where a curriculum stands: its state, whether it has changed since it was published, and the change a publish would
 * record. Reads the organisation's content once, for this curriculum.
 */
export const publicationOverview = async (org: OrgContext, curriculumid: string): Promise<PublicationOverview> => {
  await assertInScope(org, "curriculum", curriculumid);
  const organisationid = await organisationOfRead(org, curriculumid);
  const [latest] = await curriculumpublications.findAll({
    where: { curriculumid },
    attributes: { exclude: ["payload"] },
    order: [["publishedat", "DESC"]],
    limit: 1,
  });
  const state = stateOf(latest as unknown as LightRow | undefined);
  const base: PublicationOverview = { curriculumid, ...state, changedsincepublish: false, problem: null, pending: null, latest: null };
  if (latest !== undefined) {
    base.latest = {
      publicationid: latest.publicationid,
      publishedat: latest.publishedat,
      publishedby: latest.publishedby,
      status: latest.status,
      summary: summaryForAnswer(latest.summary as unknown as PublicationSummary),
    };
  }
  if (latest === undefined || latest.status !== "published") {
    return base;
  }
  const content = await readCurriculumContent(contextOfOrganisation(organisationid));
  try {
    const payload = payloadOf(organisationid, content, curriculumid);
    const hashes = hashTables(payload.tables);
    base.changedsincepublish = payloadHashOf(hashes) !== latest.payloadhash;
    const diff = diffHashes(hashes, (latest.summary as unknown as PublicationSummary).hashes);
    base.pending = summaryForAnswer(
      summarise(payload.tables, hashes, { publicationid: latest.publicationid, summary: latest.summary as unknown as PublicationSummary }, sharedRows(content, curriculumid, payload.tables, diff)),
    );
  } catch (e) {
    if (e instanceof ApiError && e.code === ErrorCode.INVALID_INPUT) {
      base.changedsincepublish = true;
      base.problem = e.message;
    } else if (!(e instanceof ApiError && e.code === ErrorCode.NOT_FOUND)) {
      throw e;
    }
  }
  return base;
};
