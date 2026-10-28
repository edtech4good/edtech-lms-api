import { v4 as uuidv4 } from "uuid";
import { OrgContext } from "src/decorators/org.decorator";
import {
  FEEDBACK_KEYS,
  NO_SUBKEY,
  SUBKEYED_FIELDS,
  SUBKEY_MAX_LENGTH,
  TRANSLATABLE_FIELDS,
  TRANSLATION_TEXT_MAX_BYTES,
  isAnswerBearing,
  normaliseLanguage,
  sourceHash,
} from "src/constants/content-translations";
import { ApiError } from "src/models/ApiError";
import { contenttranslations } from "src/models/data-models/contenttranslations";
import { organisations } from "src/models/data-models/organisations";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { Permission, SUPERADMIN } from "src/models/enums/permissions.enum";
import { dbinstance, rollbackQuietly } from "src/services/dbservice";
import { ContentKind, findOwned } from "./content-scope";
import {
  Owner,
  ownerOfCurriculum,
  ownerOfGrade,
  ownerOfLearning,
  ownerOfLesson,
  ownerOfLevel,
  ownerOfPlan,
  ownerOfPractice,
  ownerOfQuestion,
  ownerOfQuiz,
} from "./content-owner";
import { notFoundError } from "./org-scope";

/**
 * Translations of the learner-visible text of content rows (bilingual content, the central side; the student API has
 * the same table and reads it, `src/constants/content-translations.ts` is the rules both share).
 *
 * `contenttranslations` holds a text per (table, row, field, subkey, language). The row's own columns keep the text
 * in the organisation's base language (`organisations.contentlanguage`); a translation row carries the sha-256 of the
 * base text it translated (`sourcehash`), and is STALE when that is no longer the hash of the row's text now. The
 * student API does not serve a stale translation; this API reports it (`stale: true`) and keeps it.
 *
 * Who may write: the parent row's own update permission (a lesson's translations need `update_lesson`, a question's
 * `update_question`, and so on, `TABLES` below), and the parent row must be in the caller's scope (`findOwned`: another
 * organisation's row answers as an absent one). The permission is checked BEFORE the row is looked up, so a caller
 * without it learns nothing about the row. A translation belongs to the organisation that owns the parent row, which a
 * platform user who is not acting as an organisation does not name: it is the row's own.
 */

export interface TableInfo {
  kind: ContentKind;
  ownerOf: (id: string) => Promise<Owner>;
  update: Permission;
  view: Permission;
  /** The parent model has an `isdeleted` flag, and a deleted row is not translatable. */
  softDeleted: boolean;
}

/** The nine translatable tables (TRANSLATABLE_FIELDS), each with the content kind that scopes it and the permissions it needs. */
export const TABLES: Readonly<Record<string, TableInfo>> = {
  curriculums: { kind: "curriculum", ownerOf: ownerOfCurriculum, update: Permission.UPDATE_CURRICULUM, view: Permission.VIEW_CURRICULUM, softDeleted: true },
  grades: { kind: "grade", ownerOf: ownerOfGrade, update: Permission.UPDATE_GRADE, view: Permission.VIEW_GRADE, softDeleted: true },
  levels: { kind: "level", ownerOf: ownerOfLevel, update: Permission.UPDATE_LEVEL, view: Permission.VIEW_LEVEL, softDeleted: true },
  lessons: { kind: "lesson", ownerOf: ownerOfLesson, update: Permission.UPDATE_LESSON, view: Permission.VIEW_LESSON, softDeleted: true },
  lessonlearnings: { kind: "learning", ownerOf: ownerOfLearning, update: Permission.UPDATE_LESSONLEARNING, view: Permission.VIEW_LESSONLEARNING, softDeleted: false },
  lessonpractices: { kind: "practice", ownerOf: ownerOfPractice, update: Permission.UPDATE_LESSONPRACTICE, view: Permission.VIEW_LESSONPRACTICE, softDeleted: false },
  lessonquizzes: { kind: "quiz", ownerOf: ownerOfQuiz, update: Permission.UPDATE_LESSONQUIZ, view: Permission.VIEW_LESSONQUIZ, softDeleted: false },
  // a lesson plan is written with the learning-item permissions (lesson.plan.controller.ts)
  lessonplans: { kind: "plan", ownerOf: ownerOfPlan, update: Permission.UPDATE_LESSONLEARNING, view: Permission.VIEW_LESSONLEARNING, softDeleted: false },
  questions: { kind: "question", ownerOf: ownerOfQuestion, update: Permission.UPDATE_QUESTION, view: Permission.VIEW_QUESTION, softDeleted: true },
};

/** Every permission that lets a caller write some translation: the route's guard admits a holder of any, the handler asks for the table's own. */
export const ALL_UPDATE_PERMISSIONS: Permission[] = [...new Set(Object.values(TABLES).map((t) => t.update))];
export const ALL_VIEW_PERMISSIONS: Permission[] = [...new Set(Object.values(TABLES).map((t) => t.view))];

const holds = (org: OrgContext, permission: Permission): boolean => {
  const held = org.permissions ?? [];
  return held.includes(permission) || held.includes(SUPERADMIN);
};

/** 403 unless the caller holds the permission the table's parent entity needs. Made before the row is looked up. */
export const assertMay = (org: OrgContext, tablename: string, what: "update" | "view"): TableInfo => {
  const info = Object.prototype.hasOwnProperty.call(TABLES, tablename) ? TABLES[tablename] : undefined;
  if (info === undefined) {
    throw invalid("tablename", "That kind of content can't be translated.");
  }
  if (!holds(org, info[what])) {
    throw new ApiError(ErrorCode.NOT_ALLOWED);
  }
  return info;
};

const invalid = (field: string, message: string, summary = "Some of the information isn't valid.") =>
  new ApiError(ErrorCode.INVALID_INPUT, summary, { fields: [{ field, message }] });

// ---- the base text a translation was made from -------------------------------------------------

type AnyRow = Record<string, unknown> & { get?: (options?: { plain: true }) => Record<string, unknown> };

/** The columns of a row as a plain object (a Sequelize instance or a plain row). */
const plainOf = (row: AnyRow): Record<string, unknown> => (typeof row.get === "function" ? row.get({ plain: true }) : row);

const asObject = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const entries = (value: unknown): Array<Record<string, unknown>> => {
  const list = asObject(value);
  return Array.isArray(list) ? list.filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null) : [];
};

const text = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/**
 * The base-language text that a translation of `field` (and `subkey`) of this row is a translation of, as the row
 * carries it now; `undefined` when the row has no such text (a null column, an option that no longer exists). The
 * student API reads the text the same way to decide whether a translation is still current.
 */
export const baseTextOf = (tablename: string, row: Record<string, unknown>, field: string, subkey: string): string | undefined => {
  if (tablename !== "questions") return text(row[field]);
  switch (field) {
    case "questiontext":
      return text(row.questiontext);
    case "headingtext":
      return text((asObject(row.questionheading) as { headingtext?: unknown } | null | undefined)?.headingtext);
    case "questionoptiontext":
      return text(entries(row.questionoptions).find((o) => o.questionoptionid === subkey)?.questionoptiontext);
    case "questionassociatetext": {
      const associate = entries(row.questionoptions).find((o) => o.questionoptionid === subkey)?.questionassociate as { questionassociatetext?: unknown } | null | undefined;
      return text(associate?.questionassociatetext);
    }
    case "questiondistractortext":
      return text(entries(row.questiondistractors).find((d) => d.questiondistractorid === subkey)?.questiondistractortext);
    case "feedback": {
      const feedback = asObject(row.questionfeedback) as Record<string, unknown> | null | undefined;
      return feedback && typeof feedback === "object" && Object.prototype.hasOwnProperty.call(feedback, subkey) ? text(feedback[subkey]) : undefined;
    }
    default:
      return undefined;
  }
};

/** Is a translation row still current: the row has the text it translated, and that text has the hash the translation recorded. */
export const isStale = (tablename: string, row: Record<string, unknown>, t: { field: string; subkey: string; sourcehash: string }): boolean => {
  const base = baseTextOf(tablename, row, t.field, t.subkey);
  return base === undefined || sourceHash(base) !== String(t.sourcehash).toLowerCase();
};

// ---- reading and writing ----------------------------------------------------------------------

export interface TranslationView {
  translationid: string;
  tablename: string;
  rowid: string;
  field: string;
  subkey: string;
  language: string;
  text: string;
  sourcehash: string;
  lastupdated: Date;
  /** The row's text is no longer the text this was translated from (or the option, partner or message it names is gone). */
  stale: boolean;
}

interface Parent {
  info: TableInfo;
  row: Record<string, unknown>;
  /** The organisation that owns the parent row; null for a row nobody owns yet. */
  organisationid: string | null;
}

/** The parent row in the caller's scope (the 404 of an absent row otherwise), its columns, and its owner. */
const parentOf = async (org: OrgContext, tablename: string, rowid: string, info: TableInfo): Promise<Parent> => {
  const found = await findOwned(org, info.kind, rowid, info.softDeleted ? { where: { isdeleted: false } } : {});
  return { info, row: plainOf(found as unknown as AnyRow), organisationid: await info.ownerOf(rowid) };
};

const viewOf = (tablename: string, parentRow: Record<string, unknown>, t: contenttranslations): TranslationView => ({
  translationid: t.translationid,
  tablename: t.tablename,
  rowid: t.rowid,
  field: t.field,
  subkey: t.subkey,
  language: t.language,
  text: t.text,
  sourcehash: t.sourcehash,
  lastupdated: t.lastupdated,
  stale: isStale(tablename, parentRow, t),
});

const byLanguageFieldSubkey = (a: TranslationView, b: TranslationView) =>
  a.language.localeCompare(b.language) || a.field.localeCompare(b.field) || a.subkey.localeCompare(b.subkey);

/** The organisation's content language: null when it has none, and the 404 of an absent one when it is gone. */
const contentLanguageOf = async (organisationid: string): Promise<string | null> => {
  const org = await organisations.findOne({ where: { organisationid, isdeleted: false }, attributes: ["organisationid", "contentlanguage"] });
  if (!org) throw notFoundError("That doesn't exist.");
  return org.contentlanguage ?? null;
};

/** `GET /translations/:tablename/:rowid`: every translation of the row, in every language, each marked stale when its text has changed. */
export const listTranslations = async (org: OrgContext, tablename: string, rowid: string) => {
  const info = assertMay(org, tablename, "view");
  const parent = await parentOf(org, tablename, rowid, info);
  if (parent.organisationid === null) {
    return { tablename, rowid, contentlanguage: null as string | null, translations: [] as TranslationView[] };
  }
  const rows = await contenttranslations.findAll({ where: { organisationid: parent.organisationid, tablename, rowid } });
  return {
    tablename,
    rowid,
    contentlanguage: await contentLanguageOf(parent.organisationid),
    translations: rows.map((t) => viewOf(tablename, parent.row, t)).sort(byLanguageFieldSubkey),
  };
};

/** `field` or `field.subkey` -> the two parts. The subkey is everything after the first dot. */
const splitKey = (key: string): { field: string; subkey: string } => {
  const dot = key.indexOf(".");
  return dot === -1 ? { field: key, subkey: NO_SUBKEY } : { field: key.slice(0, dot), subkey: key.slice(dot + 1) };
};

interface Checked {
  field: string;
  subkey: string;
  text: string;
  sourcehash: string;
}

/** Every entry of `fields` checked against the row; the first problem refuses the whole request (400) and nothing is written. */
const checkFields = (tablename: string, row: Record<string, unknown>, fields: ReadonlyMap<string, unknown>): Checked[] => {
  const allowed = TRANSLATABLE_FIELDS[tablename];
  const out: Checked[] = [];
  const seen = new Set<string>();
  for (const [key, value] of fields) {
    const { field, subkey } = splitKey(key);
    const label = `fields.${key}`;
    if (!allowed.includes(field)) {
      throw invalid(label, "That text can't be translated.");
    }
    if (tablename === "questions" && isAnswerBearing(row.templatetypeid, field)) {
      throw invalid(label, "A text that an answer is graded by can't be translated.");
    }
    if (SUBKEYED_FIELDS.includes(field)) {
      if (subkey === NO_SUBKEY) {
        throw invalid(label, field === "feedback" ? "Name the message: correctmessage or incorrectmessage." : "Name the option, partner or distractor this text belongs to.");
      }
      if (subkey.length > SUBKEY_MAX_LENGTH) {
        throw invalid(label, `Name an option, partner, distractor or message of at most ${SUBKEY_MAX_LENGTH} characters.`);
      }
      if (field === "feedback" && !FEEDBACK_KEYS.includes(subkey)) {
        throw invalid(label, "Name the message: correctmessage or incorrectmessage.");
      }
    } else if (key.includes(".")) {
      throw invalid(label, "That text has no part to name.");
    }
    if (typeof value !== "string" || value.length === 0) {
      throw invalid(label, "Give the translated text.");
    }
    if (Buffer.byteLength(value, "utf8") > TRANSLATION_TEXT_MAX_BYTES) {
      throw invalid(label, "That text is too long.");
    }
    const base = baseTextOf(tablename, row, field, subkey);
    if (base === undefined) {
      throw invalid(label, SUBKEYED_FIELDS.includes(field) ? "That option, partner, distractor or message isn't on this question." : "There is no text there to translate yet.");
    }
    const id = `${field}\u0000${subkey}`;
    if (seen.has(id)) {
      throw invalid(label, "Each text can be given once.");
    }
    seen.add(id);
    out.push({ field, subkey, text: value, sourcehash: sourceHash(base) });
  }
  return out;
};

/**
 * `PUT /translations/:tablename/:rowid`: sets the translations of some texts of the row in one language. Each entry is
 * checked first, and the request is refused whole (400, nothing written) if any is not allowed. Each saved translation
 * records the hash of the row's text AS IT IS NOW. A text that already has a translation in this language is updated
 * in place (its id stays, so a publication does not see it as removed and added). The organisation must have a
 * content language, and the language must not be it.
 */
export const putTranslations = async (org: OrgContext, tablename: string, rowid: string, body: { language: string; fields: Record<string, unknown> }) => {
  const info = assertMay(org, tablename, "update");
  const parent = await parentOf(org, tablename, rowid, info);
  if (parent.organisationid === null) {
    throw invalid("rowid", "That belongs to no organisation yet, so it can't have translations.");
  }
  const organisationid = parent.organisationid;
  const base = await contentLanguageOf(organisationid);
  if (base === null) {
    throw invalid("language", "Set the organisation's content language first.", "Set the organisation's content language first.");
  }
  const language = normaliseLanguage(body.language);
  if (language.toLowerCase() === base.toLowerCase()) {
    throw invalid("language", "That is the organisation's own content language: its text is the row's own text, not a translation.");
  }
  const checked = checkFields(tablename, parent.row, new Map(Object.entries(body.fields)));
  if (checked.length === 0) {
    throw invalid("fields", "Give at least one text to translate.");
  }

  // Written in one INSERT ... ON DUPLICATE KEY UPDATE, so two first-time saves of the same text cannot both insert (a read
  // then an insert would let one of them hit the unique key, or deadlock on its gap lock). A text that already has a
  // translation in this language is updated in place: only the text, the hash and the date are listed, so the id, the
  // owner and the key stay as they were (the key is case-insensitive in MySQL and the row is the same row, and a
  // publication does not see an update as removed and added). The rows go in one order, so two saves that share texts
  // take their locks in the same order.
  const rows = [...checked]
    .sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : a.subkey < b.subkey ? -1 : a.subkey > b.subkey ? 1 : 0))
    .map((c) => ({ translationid: uuidv4(), organisationid, tablename, rowid, field: c.field, subkey: c.subkey, language, text: c.text, sourcehash: c.sourcehash, lastupdated: new Date() }));

  const transaction = await dbinstance.getdbinstance().transaction();
  try {
    // The key holds one row whoever owns it, and the upsert would write the text of a row that is another organisation's.
    // Central never makes one (a translation's owner is always its parent's owner, which does not change), so this is
    // defence in depth, as the student API's refusal of a colliding row is: read the parent's rows once, before the upsert,
    // and refuse a key that is held by another organisation. A plain read, so it takes no lock the upsert would wait on.
    const held = await contenttranslations.findAll({ where: { tablename, rowid }, attributes: ["organisationid", "field", "subkey", "language"], transaction });
    const keyOf = (field: string, subkey: string, lang: string) => `${field.toLowerCase()}\u0000${subkey.toLowerCase()}\u0000${lang.toLowerCase()}`;
    const wanted = new Set(rows.map((r) => keyOf(r.field, r.subkey, r.language)));
    if (held.some((h) => h.organisationid !== organisationid && wanted.has(keyOf(h.field, h.subkey, h.language)))) {
      throw notFoundError("That doesn't exist.");
    }
    await contenttranslations.bulkCreate(rows, { updateOnDuplicate: ["text", "sourcehash", "lastupdated"], transaction });
    // what is stored now (an updated row keeps the id it had, which the statement does not return)
    const saved: contenttranslations[] = [];
    for (const r of rows) {
      const stored = await contenttranslations.findOne({ where: { tablename, rowid, field: r.field, subkey: r.subkey, language }, transaction });
      if (!stored) throw new Error("content translation: a saved translation could not be read back");
      saved.push(stored);
    }
    await transaction.commit();
    return { tablename, rowid, contentlanguage: base, translations: saved.map((t) => viewOf(tablename, parent.row, t)).sort(byLanguageFieldSubkey) };
  } catch (e) {
    await rollbackQuietly(transaction);
    throw e;
  }
};

/** `DELETE /translations/:tablename/:rowid/:language`: every translation of the row in that language (hard delete). Deleting none is not an error. */
export const deleteTranslations = async (org: OrgContext, tablename: string, rowid: string, languageGiven: string) => {
  const info = assertMay(org, tablename, "update");
  const parent = await parentOf(org, tablename, rowid, info);
  const language = normaliseLanguage(languageGiven);
  if (parent.organisationid === null) {
    return { tablename, rowid, language, deleted: 0 };
  }
  const deleted = await contenttranslations.destroy({ where: { organisationid: parent.organisationid, tablename, rowid, language } });
  return { tablename, rowid, language, deleted };
};

/** Does the organisation hold translations in this language? (`PUT /organisation/:id` refuses a content language that would turn some into base-language rows.) */
export const hasTranslationsIn = async (organisationid: string, language: string): Promise<boolean> =>
  (await contenttranslations.count({ where: { organisationid, language: normaliseLanguage(language) } })) > 0;
