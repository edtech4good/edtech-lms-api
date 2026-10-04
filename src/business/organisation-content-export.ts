import { Op } from "sequelize";
import { Logger } from "src/config";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiError } from "src/models/ApiError";
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
import { ownedWhere } from "./org-scope";
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
 * and the answer says which table and how many rows, not which ones.
 */

type Row = Record<string, unknown>;

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
  "lessonplans",
  "lessonpractices",
  "lessonquizzes",
  "lessonpracticequestions",
  "lessonquizquestions",
  "levelquizquestions",
] as const;
export type ContentTableKey = (typeof CONTENT_TABLE_KEYS)[number];

interface Reference {
  fk: string;
  to: ContentTableKey;
  optional?: boolean;
}
interface Shape {
  pk: string;
  /** For a row with no owner of its own: the row it hangs from. */
  parent?: Reference;
  /** Other rows it names, which must be in the payload too. */
  refs?: Reference[];
}

// What the student API requires of the payload (organisation-content.validator.ts there: CONTENT_TABLES).
const SHAPE: Record<ContentTableKey, Shape> = {
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
  lessonplans: "lesson plan",
  lessonpractices: "lesson practice",
  lessonquizzes: "lesson quiz",
  lessonpracticequestions: "lesson practice question",
  lessonquizquestions: "lesson quiz question",
  levelquizquestions: "level quiz question",
};

const ORGANISATION_CODE = /^[a-z0-9]{2,16}$/;

/** The caller context that limits a read to one organisation (what a token acting in it carries). */
export const contextOfOrganisation = (organisationid: string): OrgContext => ({
  organisationid,
  isplatform: false,
  permissions: [],
});

const plain = (list: Array<{ get: (o: { plain: true }) => unknown }>): Row[] => list.map((r) => r.get({ plain: true }) as Row);
const keyOf = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value.toLowerCase() : null);
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
  return tables;
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
    isdeleted: isTrue(organisation.isdeleted),
  };
};

/** The content of the organisation, whole, in the format the student API reads (see the top of this file). */
export const buildOrganisationContent = async (organisation: organisations): Promise<OrganisationContentPayload> => {
  const row = organisationRowOf(organisation);
  const org = contextOfOrganisation(row.organisationid);

  const schoolRows = await readSchools(org);
  const tables: Record<ContentTableKey, Row[]> = {
    countries: await readCountries(org, schoolRows),
    schools: schoolRows,
    standards: await readStandards(org),
    subjects: plain(await new SubjectBusiness(org).getSubjectsWithOwner()),
    curriculums: plain(await new CurriculumBusiness(org).getCurriculums()),
    questions: plain(await new QuestionBusiness(org).getquestionsWithOwner()),
    documents: plain(await new DocumentBusiness(org).getdocumentsWithOwner()),
    curriculumbaselines: plain(await new CurriculumBaseLineBusiness(org).getCurriculumBaseLines()),
    baselinequestion: plain(await new BaselineQuestionBusiness(org).getBaselineQuestion()),
    grades: plain(await new GradeBusiness(org).getGrades()),
    levels: plain(await new LevelBusiness(org).getLevels()),
    lessons: plain(await new LessonBusiness(org).getLessons()),
    lessonlearnings: plain(await new LessonLearningBusiness(org).getLessonLearnings()),
    lessonplans: plain(await new LessonPlanBusiness(org).getLessonPlans()),
    lessonpractices: plain(await new LessonPracticeBusiness(org).getLessonPractices()),
    lessonquizzes: plain(await new LessonQuizBusiness(org).getLessonQuizzes()),
    lessonpracticequestions: plain(await new LessonPracticeQuestionBusiness(org).getLessonPracticeQuestions()),
    lessonquizquestions: plain(await new LessonQuizQuestionBusiness(org).getLessonQuizQuestions()),
    levelquizquestions: plain(await new LevelQuizQuestionBusiness(org).getLevelQuizQuestions()),
  };
  const checked = confine(tables) as Record<ContentTableKey, Row[]>;

  // The tables in the order the student API documents them.
  return {
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
  };
};
