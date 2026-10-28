import { Op } from "sequelize";
import { Logger } from "src/config";
import {
  FEEDBACK_KEYS,
  LANGUAGE_CODE,
  NO_SUBKEY,
  SUBKEYED_FIELDS,
  SUBKEY_MAX_LENGTH,
  TRANSLATABLE_FIELDS,
  TRANSLATION_TABLES,
  TRANSLATION_TEXT_MAX_BYTES,
  isAnswerBearing,
  normaliseLanguage,
} from "src/constants/content-translations";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiError } from "src/models/ApiError";
import { contenttranslations } from "src/models/data-models/contenttranslations";
import { countries } from "src/models/data-models/countries";
import { organisationcountry } from "src/models/data-models/organisationcountry";
import { organisations } from "src/models/data-models/organisations";
import { schools } from "src/models/data-models/school";
import { standards } from "src/models/data-models/standard";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { BaselineQuestionBusiness } from "./baslinequestion.business";
import { CurriculumBaseLineBusiness } from "./curriculumbaseline.business";
import { CurriculumBusiness } from "./curriculum.business";
import { DocumentBusiness } from "./document.business";
import { GradeBusiness } from "./grade.business";
import { LessonBusiness } from "./lesson.business";
import { LessonLearningBusiness } from "./lessonlearning.business";
import { LessonPlanBusiness } from "./lessonplan.business";
import { LessonPracticeBusiness } from "./lessonpractice.business";
import { LessonPracticeQuestionBusiness } from "./lessonpracticequestion.business";
import { LessonQuizBusiness } from "./lessonquiz.business";
import { LessonQuizQuestionBusiness } from "./lessonquizquestion.business";
import { LevelBusiness } from "./level.business";
import { LevelQuizQuestionBusiness } from "./levelquizquestion.business";
import { ownedWhere, scopeOf } from "./org-scope";
import { QuestionBusiness } from "./question.business";
import { inOwnedSchools } from "./school-scope";
import { SubjectBusiness } from "./subject.business";

/**
 * One organisation's content, as the student API reads it (format 3).
 *
 * ```
 * { format: 3, organisationid, organisationcode, scope: "organisation",
 *   organisations: [ <the organisation's row> ],
 *   <every table below, an empty list when the organisation has none> }
 * ```
 *
 * `contenttranslations` (bilingual content) is the LAST key. Its rows are translations of learner-visible text of rows
 * of the payload: a polymorphic parent `(tablename, rowid)` over the nine translatable tables (see SHAPE). What the
 * student API REFUSES, central does not send: translations when the organisation has no `contentlanguage`, rows in
 * that language, rows for a table, field, subkey or text the student API's rules do not allow, and rows for a field an
 * answer is graded by on the question's template as it is NOW (`exportableTranslations`); and `confine` DROPS (with a
 * count in the log, never an error) a translation whose parent row is not in the payload, where the student API
 * refuses it. The organisation's row carries `contentlanguage`.
 *
 * A learning item (`lessonlearnings`) ships whole: its type and body are columns of the row. The documents an item
 * references beyond its own `documentid` ship in `lessonlearningdocuments` (a link row each), which hangs from the item
 * and names a document of the payload; the key is always present.
 *
 * Three kinds of table:
 *  - owned (`schools`, `curriculums`, `questions`, `documents`, `subjects`): the rows
 *    the organisation owns, each carrying its `organisationid`;
 *  - inherited (the standards of its schools, and everything under its
 *    curriculums): the rows that hang from an owned row, with no owner column of their own;
 *  - global (`countries`): the countries the organisation is linked to, and any
 *    country one of its schools names.
 *
 * Every row is read through a business class built with the organisation's own
 * context (content-scope.ts, school-scope.ts), so the query itself carries the
 * owner filter; nothing is read whole and cut down afterwards.
 *
 * What the student API checks before it writes anything is checked here first
 * (`confine`): every row hangs from a row that is in the payload, and every
 * question, document, subject, country and lesson a row names is in it too. A row
 * that names something that is not the organisation's (another organisation's, or
 * nobody's) stops the export: that is content the organisation cannot take with it,
 * and the answer says which table and how many rows, not which ones. The two lists of
 * ids a row can hold (a school's curricula, the schools of a baseline) are trimmed to
 * the rows of the payload instead (ID_LISTS), since central keeps them as typed in.
 */

export type Row = Record<string, unknown>;

/** The tables of the payload, parents before the rows that hang from them. */
export const CONTENT_TABLE_KEYS = [
  "countries",
  "schools",
  "standards",
  "subjects",
  "curriculums",
  "questions",
  "documents",
  "curriculumbaselines",
  "baselinequestion",
  "grades",
  "levels",
  "lessons",
  "lessonlearnings",
  "lessonlearningdocuments",
  "lessonplans",
  "lessonpractices",
  "lessonquizzes",
  "lessonpracticequestions",
  "lessonquizquestions",
  "levelquizquestions",
  // translations of text of rows above; last, so that every parent comes before it
  "contenttranslations",
] as const;
export type ContentTableKey = (typeof CONTENT_TABLE_KEYS)[number];

export interface Reference {
  fk: string;
  to: ContentTableKey;
  optional?: boolean;
}
export interface Shape {
  pk: string;
  /** For a row with no owner of its own: the row it hangs from. */
  parent?: Reference;
  /** Other rows it names, which must be in the payload too. */
  refs?: Reference[];
  /**
   * A row that names its parent by a table name column and an id column over an allow-list of tables (translations):
   * `confine` leaves it out when the table is not on the list or the parent is not a row of the payload.
   */
  polymorphic?: { tablefield: string; idfield: string; tables: readonly string[] };
}

// What the student API requires of the payload (organisation-content.validator.ts there: CONTENT_TABLES).
export const SHAPE: Record<ContentTableKey, Shape> = {
  countries: { pk: "countryid" },
  schools: { pk: "schoolid", refs: [{ fk: "countryid", to: "countries", optional: true }] },
  standards: { pk: "standardid", parent: { fk: "schoolid", to: "schools" } },
  subjects: { pk: "subjectid" },
  curriculums: { pk: "curriculumid", refs: [{ fk: "subjectid", to: "subjects", optional: true }] },
  questions: { pk: "questionid" },
  documents: { pk: "documentid" },
  curriculumbaselines: { pk: "curriculumbaselineid", parent: { fk: "curriculumid", to: "curriculums" } },
  baselinequestion: {
    pk: "baselinequestionid",
    parent: { fk: "curriculumbaselineid", to: "curriculumbaselines" },
    refs: [{ fk: "questionid", to: "questions" }],
  },
  grades: { pk: "gradeid", parent: { fk: "curriculumid", to: "curriculums" } },
  levels: { pk: "levelid", parent: { fk: "gradeid", to: "grades" } },
  lessons: { pk: "lessonid", parent: { fk: "levelid", to: "levels" } },
  lessonlearnings: { pk: "lessonlearningid", parent: { fk: "lessonid", to: "lessons" }, refs: [{ fk: "documentid", to: "documents", optional: true }] },
  lessonlearningdocuments: {
    pk: "lessonlearningdocumentid",
    parent: { fk: "lessonlearningid", to: "lessonlearnings" },
    refs: [{ fk: "documentid", to: "documents" }],
  },
  lessonplans: { pk: "lessonplanid", parent: { fk: "lessonid", to: "lessons" }, refs: [{ fk: "documentid", to: "documents", optional: true }] },
  lessonpractices: { pk: "lessonpracticeid", parent: { fk: "lessonid", to: "lessons" } },
  lessonquizzes: { pk: "lessonquizid", parent: { fk: "lessonid", to: "lessons" } },
  lessonpracticequestions: {
    pk: "lessonpracticequestionid",
    parent: { fk: "lessonpracticeid", to: "lessonpractices" },
    refs: [{ fk: "questionid", to: "questions" }],
  },
  lessonquizquestions: {
    pk: "lessonquizquestionid",
    parent: { fk: "lessonquizid", to: "lessonquizzes" },
    refs: [{ fk: "questionid", to: "questions" }],
  },
  levelquizquestions: {
    pk: "levelquizquestionid",
    parent: { fk: "levelid", to: "levels" },
    refs: [
      { fk: "questionid", to: "questions" },
      { fk: "lessonid", to: "lessons", optional: true },
    ],
  },
  // owned by the organisation, with a polymorphic parent over the translatable tables (the student API's CONTENT_TABLES says the same)
  contenttranslations: { pk: "translationid", polymorphic: { tablefield: "tablename", idfield: "rowid", tables: TRANSLATION_TABLES } },
};

/**
 * The columns that hold a LIST of ids of rows of the payload: a school's curricula, and the schools a baseline is for.
 * Central keeps these lists as typed in, so they can name a curriculum of another organisation (from before enrolment was
 * limited to one owner), an id that no longer exists, or a school outside the organisation. What is sent is trimmed to the
 * entries that are rows of the payload; the student API reads the rest as refused or dropped, and the two sides must agree
 * on that (student-api-content-contract.ts has the same rule).
 */
const ID_LISTS: Partial<Record<ContentTableKey, Array<{ column: string; to: ContentTableKey }>>> = {
  schools: [{ column: "curriculums", to: "curriculums" }],
  curriculumbaselines: [{ column: "schoolid", to: "schools" }],
};

const listOf = (value: unknown): unknown[] | null => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const NOUN: Record<ContentTableKey, string> = {
  countries: "country",
  schools: "school",
  standards: "standard",
  subjects: "subject",
  curriculums: "curriculum",
  questions: "question",
  documents: "document",
  curriculumbaselines: "baseline",
  baselinequestion: "baseline question",
  grades: "grade",
  levels: "level",
  lessons: "lesson",
  lessonlearnings: "lesson learning item",
  lessonlearningdocuments: "lesson learning item document",
  lessonplans: "lesson plan",
  lessonpractices: "lesson practice",
  lessonquizzes: "lesson quiz",
  lessonpracticequestions: "lesson practice question",
  lessonquizquestions: "lesson quiz question",
  levelquizquestions: "level quiz question",
  contenttranslations: "translation",
};

const ORGANISATION_CODE = /^[a-z0-9]{2,16}$/;

/** The caller context that limits a read to one organisation (what a token acting in it carries). */
export const contextOfOrganisation = (organisationid: string): OrgContext => ({
  organisationid,
  isplatform: false,
  permissions: [],
});

export const plain = (list: Array<{ get: (o: { plain: true }) => unknown }>): Row[] => list.map((r) => r.get({ plain: true }) as Row);
export const keyOf = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value.toLowerCase() : null);
const rowsText = (n: number) => (n === 1 ? "1 row" : `${n} rows`);

// ---- the rows that are not read through a content business class -----------------------------

/** The organisation's schools, with their owner. */
export const readSchools = async (org: OrgContext): Promise<Row[]> =>
  plain(await schools.findAll({ where: ownedWhere(org), order: [["schoolname", "ASC"]] }));

/** The classes of the organisation's schools. */
export const readStandards = async (org: OrgContext): Promise<Row[]> =>
  plain(await standards.findAll({ where: await inOwnedSchools(org), order: [["standardname", "ASC"]] }));

/** The countries the organisation is linked to, and those its schools name. */
export const readCountries = async (org: OrgContext, schoolRows: Row[]): Promise<Row[]> => {
  const links = await organisationcountry.findAll({ attributes: ["countryid"], where: ownedWhere(org) });
  const wanted = new Map<string, string>();
  for (const id of [...links.map((l) => l.countryid), ...schoolRows.map((s) => s.countryid)]) {
    const key = keyOf(id);
    if (key !== null && !wanted.has(key)) wanted.set(key, id as string);
  }
  if (wanted.size === 0) {
    return [];
  }
  return plain(await countries.findAll({ where: { countryid: { [Op.in]: [...wanted.values()] } }, order: [["countryname", "ASC"]] }));
};

/**
 * The lists of ids a row can hold (ID_LISTS) trimmed to the entries that are rows of the payload given; a count per
 * column is logged, never the ids. Only the tables given are touched, and only against the tables given. Pure apart from
 * the log line. `confine` calls it last; the published-content merge (published-content.ts) reaches it through `confine`.
 */
export const trimIdLists = (given: Partial<Record<ContentTableKey, Row[]>>): Partial<Record<ContentTableKey, Row[]>> => {
  const tables: Partial<Record<ContentTableKey, Row[]>> = { ...given };
  const idsIn = (key: ContentTableKey): Set<string> | undefined => {
    const list = tables[key];
    if (list === undefined) return undefined;
    const pk = SHAPE[key].pk;
    return new Set(list.map((r) => keyOf(r[pk])).filter((id): id is string => id !== null));
  };
  const trimmed: string[] = [];
  for (const key of CONTENT_TABLE_KEYS) {
    for (const { column, to } of ID_LISTS[key] ?? []) {
      const targets = idsIn(to);
      if (tables[key] === undefined || targets === undefined) continue;
      let left = 0;
      tables[key] = (tables[key] as Row[]).map((row) => {
        if (row[column] === null || row[column] === undefined) return row;
        const entries = listOf(row[column]);
        const kept = (entries ?? []).filter((entry) => {
          const id = keyOf(entry);
          return id !== null && targets.has(id);
        });
        left += entries === null ? 1 : entries.length - kept.length;
        return { ...row, [column]: kept };
      });
      if (left > 0) trimmed.push(`${key}.${column}: ${left}`);
    }
  }
  if (trimmed.length > 0) {
    Logger.info(`organisation content export: list entries left out because they name a row that is not in the payload (${trimmed.join(", ")})`);
  }
  return tables;
};

// ---- the check the student API makes -----------------------------------------------------------

/**
 * Leaves out the rows that hang from a row that is not in the payload (a baseline question under a
 * baseline that is deleted, say: nothing can reach it), then refuses the export (400) when a row
 * names a question, document, subject, country or lesson that is not in it. Only the tables given
 * are checked, and only against the tables given.
 */
export const confine = (given: Partial<Record<ContentTableKey, Row[]>>): Partial<Record<ContentTableKey, Row[]>> => {
  const tables: Partial<Record<ContentTableKey, Row[]>> = { ...given };
  const idsIn = (key: ContentTableKey): Set<string> | undefined => {
    const list = tables[key];
    if (list === undefined) return undefined;
    const pk = SHAPE[key].pk;
    return new Set(list.map((r) => keyOf(r[pk])).filter((id): id is string => id !== null));
  };

  const dropped: string[] = [];
  for (const key of CONTENT_TABLE_KEYS) {
    const list = tables[key];
    const parent = SHAPE[key].parent;
    const parents = parent ? idsIn(parent.to) : undefined;
    if (list === undefined || parent === undefined || parents === undefined) continue;
    const kept = list.filter((r) => {
      const id = keyOf(r[parent.fk]);
      return id !== null && parents.has(id);
    });
    if (kept.length !== list.length) {
      dropped.push(`${key}: ${list.length - kept.length}`);
      tables[key] = kept;
    }
  }
  // A row with a polymorphic parent (a translation) hangs from the row named by its table and id columns. It is left
  // out when it names a table that may not have such rows, or a row that is not in the payload (the tables are those
  // of the payload already trimmed above, parents first). A table that was not given cannot be checked, as above.
  for (const key of CONTENT_TABLE_KEYS) {
    const list = tables[key];
    const poly = SHAPE[key].polymorphic;
    if (list === undefined || poly === undefined) continue;
    const parentIds = new Map<string, Set<string> | undefined>(poly.tables.map((t) => [t, idsIn(t as ContentTableKey)]));
    const kept = list.filter((r) => {
      const table = r[poly.tablefield];
      if (typeof table !== "string" || !parentIds.has(table)) return false;
      const ids = parentIds.get(table);
      if (ids === undefined) return true;
      const id = keyOf(r[poly.idfield]);
      return id !== null && ids.has(id);
    });
    if (kept.length !== list.length) {
      dropped.push(`${key}: ${list.length - kept.length}`);
      tables[key] = kept;
    }
  }
  if (dropped.length > 0) {
    Logger.info(`organisation content export: rows left out because the row they hang from is not in the payload (${dropped.join(", ")})`);
  }

  const problems: Array<{ field: string; message: string }> = [];
  for (const key of CONTENT_TABLE_KEYS) {
    const list = tables[key];
    if (list === undefined) continue;
    for (const ref of SHAPE[key].refs ?? []) {
      const targets = idsIn(ref.to);
      if (targets === undefined) continue;
      let missing = 0;
      for (const row of list) {
        const id = keyOf(row[ref.fk]);
        if (id === null ? ref.optional !== true : !targets.has(id)) {
          missing += 1;
        }
      }
      if (missing > 0) {
        problems.push({
          field: key,
          message: `${key}: ${rowsText(missing)} ${missing === 1 ? "names" : "name"} a ${NOUN[ref.to]} that is not this organisation's.`,
        });
      }
    }
  }
  if (problems.length > 0) {
    throw new ApiError(
      ErrorCode.INVALID_INPUT,
      `This organisation's content names rows that are not its own, so it cannot be exported. ${problems.map((p) => p.message).join(" ")}`,
      { fields: problems },
    );
  }

  return trimIdLists(tables);
};

// ---- the payload --------------------------------------------------------------------------------

export interface OrganisationRow {
  organisationid: string;
  organisationname: string;
  organisationcode: string;
  organisationstatus: boolean;
  uitheme: string;
  brandingconfig: object | null;
  settingsconfig: object | null;
  /** The language of the organisation's content text (the base language of its translations); null = no translations yet. */
  contentlanguage: string | null;
  isdeleted: boolean;
}

export type OrganisationContentPayload = {
  format: 3;
  organisationid: string;
  organisationcode: string;
  scope: "organisation";
  organisations: [OrganisationRow];
} & Record<ContentTableKey, Row[]>;

const isTrue = (value: unknown): boolean => value === true || value === 1 || value === "1";

/** The organisation's row, as the student API reads it. */
export const organisationRowOf = (organisation: organisations): OrganisationRow => {
  const code = organisation.organisationcode;
  if (!ORGANISATION_CODE.test(code)) {
    throw new ApiError(ErrorCode.INVALID_INPUT, "This organisation's code is not one the student API accepts (2 to 16 lower-case letters and digits).", {
      fields: [{ field: "organisationcode", message: "organisationcode must be 2 to 16 lower-case letters and digits." }],
    });
  }
  return {
    organisationid: organisation.organisationid,
    organisationname: organisation.organisationname,
    organisationcode: code,
    organisationstatus: isTrue(organisation.organisationstatus),
    uitheme: organisation.uitheme,
    brandingconfig: organisation.brandingconfig ?? null,
    settingsconfig: organisation.settingsconfig ?? null,
    contentlanguage: organisation.contentlanguage ?? null,
    isdeleted: isTrue(organisation.isdeleted),
  };
};

// ---- translations -------------------------------------------------------------------------------

const REASONS = {
  noLanguage: "the organisation has no content language",
  baseLanguage: "in the organisation's own content language",
  table: "a table or field that is not translatable",
  answer: "a field an answer is graded by",
  subkey: "a subkey that does not follow the field's rule",
  value: "a language, text, hash or date the student API would refuse",
} as const;

/**
 * The translation rows the student API will ACCEPT, out of the organisation's own. It refuses a payload for every row
 * it finds wrong, so central leaves those out instead (a count per reason in the log, never the rows): all of them
 * when the organisation has no content language (`contentlanguage`), a row in that language (the columns already hold
 * it), a table or field that is not on the translatable list, a field an answer is graded by on the question's template
 * AS IT IS NOW (a question whose template changed after it was translated), a subkey that does not follow its field's
 * rule, and a language, text, hash or date that is malformed. A row whose parent is not in the payload is not judged
 * here: `confine` drops it. A language is sent as its primary subtag in lower case. Pure.
 */
export const exportableTranslations = (rows: Row[], contentlanguage: string | null, questionRows: Row[]): Row[] => {
  const templates = new Map<string, unknown>();
  for (const q of questionRows) {
    const id = keyOf(q.questionid);
    if (id !== null) templates.set(id, q.templatetypeid);
  }
  const base = contentlanguage === null ? null : contentlanguage.toLowerCase();
  const left: Record<string, number> = {};
  const leave = (reason: string) => {
    left[reason] = (left[reason] ?? 0) + 1;
    return false;
  };
  const kept = rows.filter((r) => {
    if (base === null) return leave(REASONS.noLanguage);
    const { tablename, rowid, field, subkey, language, text, sourcehash, lastupdated } = r;
    if (typeof tablename !== "string" || !Object.prototype.hasOwnProperty.call(TRANSLATABLE_FIELDS, tablename)) return leave(REASONS.table);
    if (typeof field !== "string" || !TRANSLATABLE_FIELDS[tablename].includes(field)) return leave(REASONS.table);
    if (typeof language !== "string" || !LANGUAGE_CODE.test(language)) return leave(REASONS.value);
    if (language.toLowerCase() === base) return leave(REASONS.baseLanguage);
    if (tablename === "questions" && typeof rowid === "string" && isAnswerBearing(templates.get(rowid.toLowerCase()), field)) return leave(REASONS.answer);
    const needsSubkey = SUBKEYED_FIELDS.includes(field);
    const subkeyOk = typeof subkey === "string" && (needsSubkey ? subkey !== NO_SUBKEY && subkey.length <= SUBKEY_MAX_LENGTH : subkey === NO_SUBKEY);
    if (!subkeyOk || (field === "feedback" && !FEEDBACK_KEYS.includes(subkey as string))) return leave(REASONS.subkey);
    const lastupdatedOk = lastupdated instanceof Date ? !Number.isNaN(lastupdated.getTime()) : typeof lastupdated === "string" && !Number.isNaN(Date.parse(lastupdated));
    if (
      typeof text !== "string" ||
      text.length === 0 ||
      Buffer.byteLength(text, "utf8") > TRANSLATION_TEXT_MAX_BYTES ||
      typeof sourcehash !== "string" ||
      !/^[0-9a-f]{64}$/i.test(sourcehash) ||
      !lastupdatedOk
    ) {
      return leave(REASONS.value);
    }
    return true;
  });
  const summary = Object.entries(left).map(([reason, n]) => `${n} ${reason}`);
  if (summary.length > 0) {
    Logger.info(`organisation content export: translations left out because the student API would refuse them (${summary.join("; ")})`);
  }
  return kept.map((r) => ({ ...r, language: normaliseLanguage(r.language as string) }));
};

/** The organisation's content language, null when it has none (or is not there). */
export const readContentLanguage = async (organisationid: string): Promise<string | null> => {
  const organisation = await organisations.findOne({ where: { organisationid }, attributes: ["organisationid", "contentlanguage"] });
  return organisation?.contentlanguage ?? null;
};

/**
 * The organisation's translations as they are exported: all its rows (`contenttranslations`, ordered by table, row,
 * field, subkey and language so the file is the same on every run), filtered by `exportableTranslations` against its
 * content language and the questions read for the same export. A context with no organisation (the platform not
 * acting) has no content language and so no translations.
 */
export const readTranslations = async (org: OrgContext, questionRows: Row[]): Promise<Row[]> => {
  const scope = scopeOf(org);
  if (scope.kind !== "organisation") return [];
  const contentlanguage = await readContentLanguage(scope.organisationid);
  const rows = plain(
    await contenttranslations.findAll({
      where: ownedWhere(org),
      order: [["tablename", "ASC"], ["rowid", "ASC"], ["field", "ASC"], ["subkey", "ASC"], ["language", "ASC"]],
    }),
  );
  return exportableTranslations(rows, contentlanguage, questionRows);
};

/** The content tables that hang from the organisation's curriculums or are drawn on by them (every table but the four the organisation owns outright), and the translations of their rows. */
export const CURRICULUM_CONTENT_KEYS = [
  "curriculums",
  "questions",
  "documents",
  "curriculumbaselines",
  "baselinequestion",
  "grades",
  "levels",
  "lessons",
  "lessonlearnings",
  "lessonlearningdocuments",
  "lessonplans",
  "lessonpractices",
  "lessonquizzes",
  "lessonpracticequestions",
  "lessonquizquestions",
  "levelquizquestions",
  "contenttranslations",
] as const;
export type CurriculumContentKey = (typeof CURRICULUM_CONTENT_KEYS)[number];

/**
 * The organisation's curriculum content as the export reads it: curriculums, the whole question and document bank, and
 * everything under the curriculums, each through the business class built with the organisation's own context. The
 * order of the reads is the export's. Not confined: the caller does that with the tables it keeps.
 */
export const readCurriculumContent = async (org: OrgContext): Promise<Record<CurriculumContentKey, Row[]>> => {
  const questionRows = plain(await new QuestionBusiness(org).getquestionsWithOwner());
  return {
    curriculums: plain(await new CurriculumBusiness(org).getCurriculums()),
    questions: questionRows,
    documents: plain(await new DocumentBusiness(org).getdocumentsWithOwner()),
    curriculumbaselines: plain(await new CurriculumBaseLineBusiness(org).getCurriculumBaseLines()),
    baselinequestion: plain(await new BaselineQuestionBusiness(org).getBaselineQuestion()),
    grades: plain(await new GradeBusiness(org).getGrades()),
    levels: plain(await new LevelBusiness(org).getLevels()),
    lessons: plain(await new LessonBusiness(org).getLessons()),
    lessonlearnings: plain(await new LessonLearningBusiness(org).getLessonLearnings()),
    lessonlearningdocuments: plain(await new LessonLearningBusiness(org).getLessonLearningDocuments()),
    lessonplans: plain(await new LessonPlanBusiness(org).getLessonPlans()),
    lessonpractices: plain(await new LessonPracticeBusiness(org).getLessonPractices()),
    lessonquizzes: plain(await new LessonQuizBusiness(org).getLessonQuizzes()),
    lessonpracticequestions: plain(await new LessonPracticeQuestionBusiness(org).getLessonPracticeQuestions()),
    lessonquizquestions: plain(await new LessonQuizQuestionBusiness(org).getLessonQuizQuestions()),
    levelquizquestions: plain(await new LevelQuizQuestionBusiness(org).getLevelQuizQuestions()),
    contenttranslations: await readTranslations(org, questionRows),
  };
};

/** The four tables the organisation owns outright, with the countries its schools name: the tables a publication does not carry (they are always live). */
export const LIVE_TABLE_KEYS = ["countries", "schools", "standards", "subjects"] as const;
export type LiveTableKey = (typeof LIVE_TABLE_KEYS)[number];

/** Countries, schools, standards and subjects of the organisation, read live, the readers' order, not confined. */
export const readLiveTables = async (org: OrgContext): Promise<Record<LiveTableKey, Row[]>> => {
  const schoolRows = await readSchools(org);
  return {
    countries: await readCountries(org, schoolRows),
    schools: schoolRows,
    standards: await readStandards(org),
    subjects: plain(await new SubjectBusiness(org).getSubjectsWithOwner()),
  };
};

/** The checked tables as the payload the student API reads, in the order it documents them (see the top of this file). */
export const shapePayload = (row: OrganisationRow, checked: Record<ContentTableKey, Row[]>): OrganisationContentPayload => ({
  format: 3,
  organisationid: row.organisationid,
  organisationcode: row.organisationcode,
  scope: "organisation",
  organisations: [row],
  schools: checked.schools,
  standards: checked.standards,
  countries: checked.countries,
  curriculums: checked.curriculums,
  curriculumbaselines: checked.curriculumbaselines,
  baselinequestion: checked.baselinequestion,
  grades: checked.grades,
  levels: checked.levels,
  lessons: checked.lessons,
  lessonlearnings: checked.lessonlearnings,
  lessonplans: checked.lessonplans,
  lessonpractices: checked.lessonpractices,
  lessonquizzes: checked.lessonquizzes,
  lessonpracticequestions: checked.lessonpracticequestions,
  lessonquizquestions: checked.lessonquizquestions,
  levelquizquestions: checked.levelquizquestions,
  questions: checked.questions,
  documents: checked.documents,
  subjects: checked.subjects,
  // Always present, an empty list when no item has a link row (the student API refuses a payload without the key,
  // and one with it when it does not know it). Last, so that the two tables it hangs from (lessonlearnings and
  // documents) come before it in the file.
  lessonlearningdocuments: checked.lessonlearningdocuments,
  // The last key, as in the student API's list of tables.
  contenttranslations: checked.contenttranslations,
});

/**
 * The content of the organisation, whole, in the format the student API reads (see the top of this file), from the LIVE
 * tables. No sync route serves this any more (A4 step 2): they serve `buildPublishedOrganisationContent`
 * (published-content.ts), the published copy of each curriculum. This is the draft view: what the organisation would
 * serve if every curriculum were published as it stands now.
 */
export const buildOrganisationContent = async (organisation: organisations): Promise<OrganisationContentPayload> => {
  const row = organisationRowOf(organisation);
  const org = contextOfOrganisation(row.organisationid);

  const tables: Record<ContentTableKey, Row[]> = {
    ...(await readLiveTables(org)),
    ...(await readCurriculumContent(org)),
  };
  return shapePayload(row, confine(tables) as Record<ContentTableKey, Row[]>);
};
