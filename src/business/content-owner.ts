import { Op, Transaction } from "sequelize";
import { OrgContext } from "src/decorators/org.decorator";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { baselinequestion } from "src/models/data-models/baselinequestion";
import { curriculumbaseline } from "src/models/data-models/curriculumbaseline";
import { curriculumcountry } from "src/models/data-models/curriculumcountry";
import { curriculums } from "src/models/data-models/curriculums";
import { documents } from "src/models/data-models/documents";
import { documenttags } from "src/models/data-models/documenttags";
import { feedbacks } from "src/models/data-models/feedback";
import { grades } from "src/models/data-models/grades";
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
import { schools } from "src/models/data-models/school";
import { scopeOf } from "./org-scope";

/**
 * Who owns a piece of content, and what may be attached to what.
 *
 * Six tables carry their own owner (`organisationid`): curriculums, questions,
 * documents, question tags, document tags and subjects. Everything else in the
 * content tree takes its owner from a parent and has no column of its own, so a
 * second copy could never disagree: grades, levels, lessons, learnings,
 * practices, quizzes, plans, the curriculum-country links, feedback and
 * curriculum baselines from their curriculum; the question-attach rows from
 * both ends. The `ownerOf...` functions below resolve any of them from its
 * parent chain.
 *
 * An owner is an organisation id, or `null` for content that has none (a row
 * that exists before the owners are assigned, or one that is not found: the
 * routes check existence on their own). Reading is not scoped here.
 */
export type Owner = string | null;

type Tx = Transaction | undefined;

const column = async (
  model: { findOne: (o: never) => Promise<unknown> },
  key: string,
  id: string,
  attribute: string,
  transaction: Tx,
): Promise<string | null> => {
  const row = (await model.findOne({ where: { [key]: id }, attributes: [attribute], transaction } as never)) as
    | Record<string, unknown>
    | null;
  const value = row?.[attribute];
  return typeof value === "string" && value.length > 0 ? value : null;
};

// ---- the six tables that carry an owner -----------------------------------------

export const ownerOfCurriculum = (id: string, tx?: Tx): Promise<Owner> =>
  column(curriculums, "curriculumid", id, "organisationid", tx);
export const ownerOfQuestion = (id: string, tx?: Tx): Promise<Owner> =>
  column(questions, "questionid", id, "organisationid", tx);
export const ownerOfDocument = (id: string, tx?: Tx): Promise<Owner> =>
  column(documents, "documentid", id, "organisationid", tx);
export const ownerOfQuestionTag = (id: string, tx?: Tx): Promise<Owner> =>
  column(questiontags, "questiontagid", id, "organisationid", tx);
export const ownerOfDocumentTag = (id: string, tx?: Tx): Promise<Owner> =>
  column(documenttags, "documenttagid", id, "organisationid", tx);
export const ownerOfSubject = (id: string, tx?: Tx): Promise<Owner> =>
  column(subjects, "subjectid", id, "organisationid", tx);

/** A school's owner is its organisation (the column the schools package added). */
export const ownerOfSchool = (id: string, tx?: Tx): Promise<Owner> => column(schools, "schoolid", id, "organisationid", tx);

/**
 * The owner on the caller's side of a write that creates no content of its own
 * (a baseline for a curriculum): the organisation the token acts in, or none for a
 * platform user who is not acting.
 */
export const callerOwner = (org: OrgContext | undefined): Owner => {
  const scope = scopeOf(org);
  return scope.kind === "organisation" ? scope.organisationid : null;
};

// ---- the curriculum tree: the owner comes from the curriculum -------------------

export const ownerOfGrade = async (id: string, tx?: Tx): Promise<Owner> => {
  const curriculumid = await column(grades, "gradeid", id, "curriculumid", tx);
  return curriculumid ? ownerOfCurriculum(curriculumid, tx) : null;
};
export const ownerOfLevel = async (id: string, tx?: Tx): Promise<Owner> => {
  const gradeid = await column(levels, "levelid", id, "gradeid", tx);
  return gradeid ? ownerOfGrade(gradeid, tx) : null;
};
export const ownerOfLesson = async (id: string, tx?: Tx): Promise<Owner> => {
  const levelid = await column(lessons, "lessonid", id, "levelid", tx);
  return levelid ? ownerOfLevel(levelid, tx) : null;
};
const viaLesson = (model: { findOne: (o: never) => Promise<unknown> }, key: string) => async (id: string, tx?: Tx): Promise<Owner> => {
  const lessonid = await column(model, key, id, "lessonid", tx);
  return lessonid ? ownerOfLesson(lessonid, tx) : null;
};
export const ownerOfLearning = viaLesson(lessonlearnings, "lessonlearningid");
export const ownerOfPlan = viaLesson(lessonplans, "lessonplanid");
export const ownerOfPractice = viaLesson(lessonpractices, "lessonpracticeid");
export const ownerOfQuiz = viaLesson(lessonquizzes, "lessonquizid");

/** Feedback and the curriculum-country links name their curriculum directly. */
export const ownerOfFeedback = async (id: string, tx?: Tx): Promise<Owner> => {
  const curriculumid = await column(feedbacks, "feedbackid", id, "curriculumid", tx);
  return curriculumid ? ownerOfCurriculum(curriculumid, tx) : null;
};
export const ownerOfCurriculumCountry = async (id: string, tx?: Tx): Promise<Owner> => {
  const curriculumid = await column(curriculumcountry, "curriculumcountryid", id, "curriculumid", tx);
  return curriculumid ? ownerOfCurriculum(curriculumid, tx) : null;
};
/** A baseline has no owner of its own: its curriculum's. */
export const ownerOfCurriculumBaseline = async (id: string, tx?: Tx): Promise<Owner> => {
  const curriculumid = await column(curriculumbaseline, "curriculumbaselineid", id, "curriculumid", tx);
  return curriculumid ? ownerOfCurriculum(curriculumid, tx) : null;
};

// ---- the question-attach rows: both ends ----------------------------------------

/** The two owners an attach row joins: the parent it hangs under, and its question. Equal, or one of them unowned. */
export type AttachOwners = { parent: Owner; question: Owner };

const bothEnds = async (
  model: { findOne: (o: never) => Promise<unknown> },
  key: string,
  id: string,
  parentKey: string,
  parentOwner: (id: string, tx?: Tx) => Promise<Owner>,
  tx: Tx,
): Promise<AttachOwners> => {
  const row = (await model.findOne({ where: { [key]: id }, attributes: [parentKey, "questionid"], transaction: tx } as never)) as
    | Record<string, string | null>
    | null;
  if (!row) return { parent: null, question: null };
  return {
    parent: row[parentKey] ? await parentOwner(row[parentKey] as string, tx) : null,
    question: row.questionid ? await ownerOfQuestion(row.questionid, tx) : null,
  };
};
export const ownersOfPracticeQuestion = (id: string, tx?: Tx) =>
  bothEnds(lessonpracticequestions, "lessonpracticequestionid", id, "lessonpracticeid", ownerOfPractice, tx);
export const ownersOfQuizQuestion = (id: string, tx?: Tx) =>
  bothEnds(lessonquizquestions, "lessonquizquestionid", id, "lessonquizid", ownerOfQuiz, tx);
export const ownersOfLevelQuizQuestion = (id: string, tx?: Tx) =>
  bothEnds(levelquizquestions, "levelquizquestionid", id, "levelid", ownerOfLevel, tx);
export const ownersOfBaselineQuestion = (id: string, tx?: Tx) =>
  bothEnds(baselinequestion, "baselinequestionid", id, "curriculumbaselineid", ownerOfCurriculumBaseline, tx);

// ---- the rules ------------------------------------------------------------------

/**
 * The owner a new piece of content gets: the organisation the caller's token acts
 * in (its own, or the one a platform user is acting as). A platform user who is
 * not acting as an organisation has none to give and is refused with 400, naming
 * the way out; a caller with no scope at all is refused with 403 (`scopeOf`).
 * The owner always comes from the token, never from the request.
 */
export const ownerForNewContent = (org: OrgContext | undefined): string => {
  const scope = scopeOf(org);
  if (scope.kind === "platform") {
    throw new ApiError(
      ErrorCode.INVALID_INPUT,
      "Choose an organisation to act in before you create content. Use the organisation switcher, then try again.",
    );
  }
  return scope.organisationid;
};

/**
 * Attaching refuses a cross-owner link. When BOTH sides have an owner and the
 * owners differ, the attach is refused with 400. Every row of the six content
 * tables has an owner (the owner column is required), so a side with none (`null`)
 * is an id that matches no row. It is let through here: that is how it behaved
 * before the owner columns were required, and the callers do not all check that
 * the id exists first (a school create or update does not check that the curriculum
 * ids it is given exist at all). Whether a missing id should be refused is a
 * separate question from the owner rule.
 * The message names nothing private: no organisation, no row.
 */
export const assertSameOwner = (a: Owner | undefined, b: Owner | undefined): void => {
  if (typeof a === "string" && typeof b === "string" && a !== b) {
    throw new ApiError(
      ErrorCode.INVALID_INPUT,
      "These belong to different organisations, so one can't be attached to the other.",
    );
  }
};

/** `assertSameOwner` for the two ends of an attach row that already exists (e.g. when it is re-pointed). */
export const assertSameOwners = ({ parent, question }: AttachOwners): void => assertSameOwner(parent, question);

/**
 * A learner enrolled on curriculums is a link between a school and each curriculum: the school's owner and
 * every curriculum's must agree (see `assertSameOwner` for what a side with no owner means). A school always
 * has an organisation now (`schools.organisationid` is required); the early return is only for a caller that
 * has no school owner to compare.
 */
export const assertEnrolmentFits = async (schoolOwner: Owner | undefined, curriculumids: ReadonlyArray<string>, tx?: Tx): Promise<void> => {
  if (typeof schoolOwner !== "string") {
    return;
  }
  for (const id of curriculumids) {
    assertSameOwner(schoolOwner, await ownerOfCurriculum(id, tx));
  }
};

/**
 * Tags are stored on a question or document as a list of tag NAMES. A name that
 * matches tag rows is attached to that tag: when every row of that name belongs
 * to another organisation than `owner`, the attach is refused (400, same message
 * as `assertSameOwner`). A row with no owner, or the same owner, makes it
 * allowed; so does a name that matches no row at all, and an unowned `owner`
 * (see `assertSameOwner` for why unowned is allowed for now).
 */
export const assertTagsFitOwner = async (
  kind: "question" | "document",
  names: ReadonlyArray<string>,
  owner: Owner,
  tx?: Tx,
): Promise<void> => {
  const wanted = names.filter((n) => typeof n === "string" && n.length > 0);
  if (owner === null || wanted.length === 0) {
    return;
  }
  const rows: Array<{ name: string; owner: Owner }> =
    kind === "question"
      ? (await questiontags.findAll({
          where: { questiontagname: { [Op.in]: wanted }, isdeleted: false },
          attributes: ["questiontagname", "organisationid"],
          transaction: tx,
        })).map((r) => ({ name: r.questiontagname, owner: r.organisationid ?? null }))
      : (await documenttags.findAll({
          where: { documenttagname: { [Op.in]: wanted }, isdeleted: false },
          attributes: ["documenttagname", "organisationid"],
          transaction: tx,
        })).map((r) => ({ name: r.documenttagname, owner: r.organisationid ?? null }));
  for (const name of wanted) {
    const named = rows.filter((r) => r.name.toLowerCase() === name.toLowerCase());
    if (named.length > 0 && named.every((r) => typeof r.owner === "string" && r.owner !== owner)) {
      assertSameOwner(owner, named[0].owner);
    }
  }
};

/**
 * The tag rule for a caller. Tag names are unique within an organisation, so what a name means depends on who
 * asks: an organisation caller (or a platform user acting as one) means its OWN tag of that name, and a name it has
 * no tag of is simply a new name, so there is nothing to refuse and nothing about another organisation's tags to
 * reveal. Only a platform user not acting, who has no organisation of its own and may see every tag, is held to
 * `assertTagsFitOwner`: the names must not be held only by an organisation other than the owner of the row.
 */
export const assertTagsAllowed = async (
  org: OrgContext | undefined,
  kind: "question" | "document",
  names: ReadonlyArray<string>,
  owner: Owner,
  tx?: Tx,
): Promise<void> => {
  if (scopeOf(org).kind === "organisation") {
    return;
  }
  await assertTagsFitOwner(kind, names, owner, tx);
};
