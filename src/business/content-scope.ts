import { FindOptions, ModelStatic, Op, Transaction, WhereOptions } from "sequelize";
import { OrgContext, orgOrServerOf } from "src/decorators/org.decorator";
import { hasSchoolUserId } from "src/services/organisation-claims";
import { notFoundError, ownedWhere, scopeOf } from "./org-scope";
import {
  Owner,
  ownerOfCurriculum,
  ownerOfCurriculumBaseline,
  ownerOfDocument,
  ownerOfDocumentTag,
  ownerOfFeedback,
  ownerOfGrade,
  ownerOfLearning,
  ownerOfLearningDocument,
  ownerOfLesson,
  ownerOfLevel,
  ownerOfPlan,
  ownerOfPractice,
  ownerOfQuestion,
  ownerOfQuestionTag,
  ownerOfQuiz,
  ownerOfSubject,
  ownersOfBaselineQuestion,
  ownersOfLevelQuizQuestion,
  ownersOfPracticeQuestion,
  ownersOfQuizQuestion,
} from "./content-owner";
import { baselinequestion } from "src/models/data-models/baselinequestion";
import { curriculumbaseline } from "src/models/data-models/curriculumbaseline";
import { curriculums } from "src/models/data-models/curriculums";
import { documents } from "src/models/data-models/documents";
import { documenttags } from "src/models/data-models/documenttags";
import { feedbacks } from "src/models/data-models/feedback";
import { grades } from "src/models/data-models/grades";
import { lessonlearningdocuments } from "src/models/data-models/lessonlearningdocuments";
import { lessonlearnings } from "src/models/data-models/lessonlearnings";
import { lessonplans } from "src/models/data-models/lessonplan";
import { lessonpracticequestions } from "src/models/data-models/lessonpracticequestions";
import { lessonpractices } from "src/models/data-models/lessonpractices";
import { lessonquizquestions } from "src/models/data-models/lessonquizquestions";
import { lessonquizzes } from "src/models/data-models/lessonquizzes";
import { lessons } from "src/models/data-models/lessons";
import { levelquizquestions } from "src/models/data-models/levelquizquestions";
import { levels } from "src/models/data-models/levels";
import { questions } from "src/models/data-models/questions";
import { questiontags } from "src/models/data-models/questiontags";
import { subjects } from "src/models/data-models/subjects";

/**
 * Confining content to the caller's organisation.
 *
 * Six tables carry their owner (`organisationid`): curriculums, questions, documents, question tags, document
 * tags and subjects. Every other piece of content takes its owner from its curriculum (content-owner.ts has the
 * resolvers): grades, levels, lessons and everything under a lesson; a baseline, its questions and the feedback
 * about a curriculum. A row is IN SCOPE for an organisation caller when its owner is the caller's. A row with no
 * owner (the column is NULL, or the tree sits under an unowned curriculum) is in scope for the platform only,
 * until every row has an owner and the column is made required.
 *
 * Three families, all taking the caller's `OrgContext`:
 *  - `inScope` / `assertInScope`: is this one row in scope? Reads the owner through the resolvers; the platform is
 *    never refused here (a row that is not there is the route's own business).
 *  - `findOwned<Kind>`: the row, or the same 404 as a row that is not there (a row of another organisation, an
 *    unowned row and an absent one are reported identically). The platform gets the row if it exists.
 *  - `scopeWhere` / `andScope`: a where-fragment limiting a list, a count or an existence check to the rows in
 *    scope (nothing added for the platform). The ids of a parent kind are read once per caller context.
 *
 * A business class is built with the caller's context to be scoped; built without one it is exactly what it was
 * before scoping, which is how the sync payloads (and other server-side readers) keep their exact queries.
 */
export type ContentKind =
  | "curriculum"
  | "question"
  | "document"
  | "questiontag"
  | "documenttag"
  | "subject"
  | "grade"
  | "level"
  | "lesson"
  | "learning"
  | "learningdocument"
  | "plan"
  | "practice"
  | "quiz"
  | "practicequestion"
  | "quizquestion"
  | "levelquizquestion"
  | "baseline"
  | "baselinequestion"
  | "feedback";

export interface KindRows {
  curriculum: curriculums;
  question: questions;
  document: documents;
  questiontag: questiontags;
  documenttag: documenttags;
  subject: subjects;
  grade: grades;
  level: levels;
  lesson: lessons;
  learning: lessonlearnings;
  learningdocument: lessonlearningdocuments;
  plan: lessonplans;
  practice: lessonpractices;
  quiz: lessonquizzes;
  practicequestion: lessonpracticequestions;
  quizquestion: lessonquizquestions;
  levelquizquestion: levelquizquestions;
  baseline: curriculumbaseline;
  baselinequestion: baselinequestion;
  feedback: feedbacks;
}

type Tx = Transaction | undefined;

interface KindInfo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: ModelStatic<any>;
  key: string;
  /** The message a route gives for a row that is not there (the wording the request validators use). */
  missing: string;
  ownerOf: (id: string, tx?: Tx) => Promise<Owner>;
  /** A row of this kind with no owner column hangs under a parent kind through this column. */
  parent?: { kind: ContentKind; column: string };
}

const KINDS: Record<ContentKind, KindInfo> = {
  curriculum: { model: curriculums, key: "curriculumid", missing: "That curriculum doesn't exist.", ownerOf: ownerOfCurriculum },
  question: { model: questions, key: "questionid", missing: "That question doesn't exist.", ownerOf: ownerOfQuestion },
  document: { model: documents, key: "documentid", missing: "That document doesn't exist.", ownerOf: ownerOfDocument },
  questiontag: { model: questiontags, key: "questiontagid", missing: "That question tag doesn't exist.", ownerOf: ownerOfQuestionTag },
  documenttag: { model: documenttags, key: "documenttagid", missing: "That document tag doesn't exist.", ownerOf: ownerOfDocumentTag },
  subject: { model: subjects, key: "subjectid", missing: "That subject doesn't exist.", ownerOf: ownerOfSubject },
  grade: {
    model: grades, key: "gradeid", missing: "That grade doesn't exist.", ownerOf: ownerOfGrade,
    parent: { kind: "curriculum", column: "curriculumid" },
  },
  level: {
    model: levels, key: "levelid", missing: "That level doesn't exist.", ownerOf: ownerOfLevel,
    parent: { kind: "grade", column: "gradeid" },
  },
  lesson: {
    model: lessons, key: "lessonid", missing: "That lesson doesn't exist.", ownerOf: ownerOfLesson,
    parent: { kind: "level", column: "levelid" },
  },
  learning: {
    model: lessonlearnings, key: "lessonlearningid", missing: "That lesson learning item doesn't exist.", ownerOf: ownerOfLearning,
    parent: { kind: "lesson", column: "lessonid" },
  },
  learningdocument: {
    model: lessonlearningdocuments, key: "lessonlearningdocumentid", missing: "That learning item document doesn't exist.", ownerOf: ownerOfLearningDocument,
    parent: { kind: "learning", column: "lessonlearningid" },
  },
  plan: {
    model: lessonplans, key: "lessonplanid", missing: "That lesson plan doesn't exist.", ownerOf: ownerOfPlan,
    parent: { kind: "lesson", column: "lessonid" },
  },
  practice: {
    model: lessonpractices, key: "lessonpracticeid", missing: "That lesson practice doesn't exist.", ownerOf: ownerOfPractice,
    parent: { kind: "lesson", column: "lessonid" },
  },
  quiz: {
    model: lessonquizzes, key: "lessonquizid", missing: "That lesson quiz doesn't exist.", ownerOf: ownerOfQuiz,
    parent: { kind: "lesson", column: "lessonid" },
  },
  practicequestion: {
    model: lessonpracticequestions, key: "lessonpracticequestionid", missing: "That lesson practice question doesn't exist.",
    ownerOf: async (id, tx) => (await ownersOfPracticeQuestion(id, tx)).parent,
    parent: { kind: "practice", column: "lessonpracticeid" },
  },
  quizquestion: {
    model: lessonquizquestions, key: "lessonquizquestionid", missing: "That lesson quiz question doesn't exist.",
    ownerOf: async (id, tx) => (await ownersOfQuizQuestion(id, tx)).parent,
    parent: { kind: "quiz", column: "lessonquizid" },
  },
  levelquizquestion: {
    model: levelquizquestions, key: "levelquizquestionid", missing: "That level quiz question doesn't exist.",
    ownerOf: async (id, tx) => (await ownersOfLevelQuizQuestion(id, tx)).parent,
    parent: { kind: "level", column: "levelid" },
  },
  baseline: {
    model: curriculumbaseline, key: "curriculumbaselineid", missing: "That baseline curriculum doesn't exist.", ownerOf: ownerOfCurriculumBaseline,
    parent: { kind: "curriculum", column: "curriculumid" },
  },
  baselinequestion: {
    model: baselinequestion, key: "baselinequestionid", missing: "That baseline question doesn't exist.",
    ownerOf: async (id, tx) => (await ownersOfBaselineQuestion(id, tx)).parent,
    parent: { kind: "baseline", column: "curriculumbaselineid" },
  },
  feedback: {
    model: feedbacks, key: "feedbackid", missing: "That feedback doesn't exist.", ownerOf: ownerOfFeedback,
    parent: { kind: "curriculum", column: "curriculumid" },
  },
};

/** The 404 a route answers with for a row of this kind that is not there or not the caller's. */
export const missingOf = (kind: ContentKind) => () => notFoundError(KINDS[kind].missing);

/**
 * Is this row in scope? An organisation caller: its owner is the caller's (a row that is not there, one of another
 * organisation and an unowned one are all "no"). The platform: always (a row that is not there is the route's own
 * business; use `findOwned` to require it).
 */
export const inScope = async (org: OrgContext, kind: ContentKind, id: unknown, tx?: Tx): Promise<boolean> => {
  const scope = scopeOf(org); // throws first when there is no scope
  if (scope.kind === "platform") {
    return true;
  }
  if (typeof id !== "string" || id.length === 0) {
    return false;
  }
  return (await KINDS[kind].ownerOf(id, tx)) === scope.organisationid;
};

/** `inScope`, or the 404 a row that is not there gets (or `notFound`'s). */
export const assertInScope = async (org: OrgContext, kind: ContentKind, id: unknown, notFound?: () => Error, tx?: Tx): Promise<void> => {
  if (!(await inScope(org, kind, id, tx))) {
    throw (notFound ?? missingOf(kind))();
  }
};

export interface FindOwnedOptions extends Omit<FindOptions, "where"> {
  where?: WhereOptions;
  /** The error for a row that is absent or not the caller's; default: the kind's 404. */
  notFound?: () => Error;
}

/**
 * One row by primary key, in scope: found, or the same 404 as an absent row (`options.notFound`, else the kind's).
 * The check is made first, on the owner, so no row of another organisation is ever read into the handler.
 * A `where` in the options is kept and ANDed with the key.
 */
export const findOwned = async <K extends ContentKind>(
  org: OrgContext,
  kind: K,
  id: string,
  options: FindOwnedOptions = {},
): Promise<KindRows[K]> => {
  const { where, notFound, ...rest } = options;
  // an id that is not a string names nothing, for the platform too (it must never reach a query as an undefined key)
  if (typeof id !== "string" || id.length === 0) {
    throw (notFound ?? missingOf(kind))();
  }
  await assertInScope(org, kind, id, notFound, rest.transaction ?? undefined);
  const info = KINDS[kind];
  const row = await info.model.findOne({
    ...rest,
    where: { [Op.and]: [where ?? {}, { [info.key]: id }] },
  } as FindOptions);
  if (!row) {
    throw (notFound ?? missingOf(kind))();
  }
  return row as KindRows[K];
};

export const findOwnedCurriculum = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "curriculum", id, o);
export const findOwnedQuestion = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "question", id, o);
export const findOwnedDocument = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "document", id, o);
export const findOwnedQuestionTag = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "questiontag", id, o);
export const findOwnedDocumentTag = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "documenttag", id, o);
export const findOwnedSubject = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "subject", id, o);
export const findOwnedGrade = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "grade", id, o);
export const findOwnedLevel = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "level", id, o);
export const findOwnedLesson = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "lesson", id, o);
export const findOwnedLearning = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "learning", id, o);
export const findOwnedPlan = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "plan", id, o);
export const findOwnedPractice = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "practice", id, o);
export const findOwnedQuiz = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "quiz", id, o);
export const findOwnedPracticeQuestion = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "practicequestion", id, o);
export const findOwnedQuizQuestion = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "quizquestion", id, o);
export const findOwnedLevelQuizQuestion = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "levelquizquestion", id, o);
export const findOwnedBaseline = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "baseline", id, o);
export const findOwnedBaselineQuestion = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "baselinequestion", id, o);
export const findOwnedFeedback = (org: OrgContext, id: string, o?: FindOwnedOptions) => findOwned(org, "feedback", id, o);

// ---- lists, counts and existence checks ------------------------------------------

// The ids are read once per caller context: a request's `@Org()` value is built for that request and never shared
// between requests, so the memo lives as long as the request does. A failed read is not kept.
const idsByContext = new WeakMap<object, Map<ContentKind, Promise<string[]>>>();

/**
 * The ids of the rows of `kind` in scope, or `undefined` for the platform (every row, owned or not).
 * Read through the parent chain: the curriculums the organisation owns, the grades under them, and so on.
 */
export const ownedIds = async (org: OrgContext, kind: ContentKind): Promise<string[] | undefined> => {
  const scope = scopeOf(org);
  if (scope.kind === "platform") {
    return undefined;
  }
  let byKind = idsByContext.get(org);
  if (!byKind) {
    byKind = new Map();
    idsByContext.set(org, byKind);
  }
  let ids = byKind.get(kind);
  if (!ids) {
    ids = readOwnedIds(org, kind);
    byKind.set(kind, ids);
    ids.catch(() => byKind!.delete(kind));
  }
  return ids;
};

const readOwnedIds = async (org: OrgContext, kind: ContentKind): Promise<string[]> => {
  const info = KINDS[kind];
  const where = await scopeWhere(org, kind);
  const rows = (await info.model.findAll({ attributes: [info.key], where })) as Array<Record<string, unknown>>;
  return rows.map((r) => r[info.key] as string);
};

/**
 * A where-fragment limiting a table to the rows in scope, or `{}` for the platform. A table with an owner column
 * is limited on it (so an unowned row is not in scope); any other table is limited to the rows under the parents in
 * scope. Combine it with other conditions through `Op.and` (`andScope`).
 */
export const scopeWhere = async (org: OrgContext, kind: ContentKind): Promise<WhereOptions> => {
  const scope = scopeOf(org);
  if (scope.kind === "platform") {
    return {};
  }
  const parent = KINDS[kind].parent;
  if (!parent) {
    return ownedWhere(org);
  }
  const ids = (await ownedIds(org, parent.kind)) ?? [];
  return { [parent.column]: { [Op.in]: ids } };
};

/**
 * `where` AND the rows of `kind` in scope. With no caller context at all (`undefined`) the where is returned
 * untouched: that is how a business class built without a context (the sync payloads) reads, deliberately. A
 * context that has no scope (neither platform nor organisation) is refused (403), never read as "everything".
 */
export const andScope = async (org: OrgContext | undefined, kind: ContentKind, where?: WhereOptions): Promise<WhereOptions> => {
  if (org === undefined) {
    return where ?? {};
  }
  const limit = await scopeWhere(org, kind);
  return Object.keys(limit).length === 0 && Object.getOwnPropertySymbols(limit).length === 0 ? (where ?? {}) : { [Op.and]: [where ?? {}, limit] };
};

/**
 * The caller context a request-level rule (a business validator) runs under: a staff token's own, the platform's
 * for the application's server token, and `undefined` (no limit) for a school-user token. Only a route that admits
 * those tokens ever sees them: the guards run before the rules.
 */
export const requestScope = (request: { user?: unknown }): OrgContext | undefined => {
  const user = request.user;
  if (hasSchoolUserId(user)) {
    return undefined;
  }
  // one context per request, so the ids a rule reads are read once for all the rules of the request
  if (typeof user === "object" && user !== null) {
    let context = contextByUser.get(user);
    if (!context) {
      context = orgOrServerOf(user);
      contextByUser.set(user, context);
    }
    return context;
  }
  return orgOrServerOf(user);
};
const contextByUser = new WeakMap<object, OrgContext>();

/**
 * The caller context a NAME check runs under. Names are unique within an organisation, so the check is made among the
 * organisation's rows: an organisation caller's own, and for a platform user not acting (who has none) the organisation
 * that owns the row being renamed (an update) or whose parent the new row goes under. A row with no owner has no
 * organisation to compare within, so the check is across everything, as it was.
 */
export const nameScope = async (
  request: { user?: unknown },
  ownerOf: (id: string) => Promise<Owner>,
  id: unknown,
): Promise<OrgContext | undefined> => {
  const org = requestScope(request);
  if (org !== undefined && scopeOf(org).kind === "platform" && typeof id === "string" && id.length > 0) {
    const owner = await ownerOf(id);
    if (owner !== null) {
      return { organisationid: owner, isplatform: false, permissions: [] };
    }
  }
  return org;
};

/** The name of the primary key of a kind. */
export const keyOf = (kind: ContentKind): string => KINDS[kind].key;
