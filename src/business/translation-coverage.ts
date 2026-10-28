import {
  TRANSLATABLE_FIELDS,
  isAnswerBearing,
  sourceHash,
} from "src/constants/content-translations";
import { baseTextOf } from "./content-translations";
import { keyOf, Row } from "./organisation-content-export";

/**
 * How much of a curriculum's learner-visible text is translated, per language (bilingual content, design note decision 6:
 * untranslated and stale counts per lesson; publishing is never blocked by them).
 *
 * The texts are the ones the translation routes accept (TRANSLATABLE_FIELDS) that have a base text now: a column with a
 * value, and for a question its heading, each option's text, each partner's, each distractor's and the two feedback
 * messages that exist. A text an answer is graded by on the question's template (template 21's option text and question
 * text, the question text of 8 and 23) cannot be translated and is not counted. A row that is deleted is not counted.
 *
 * Per language, a text is one of:
 *  - translated: a translation exists and its `sourcehash` is the hash of the base text now;
 *  - stale: a translation exists and the base text has changed since;
 *  - untranslated: no translation in that language.
 * A translation of a text that no longer exists (an option that was removed) is in none of them: nothing shows it.
 *
 * The languages are the ones the organisation has translations in (there is no list of languages to translate into).
 * They are the export's translations, so the organisation's own content language and a translation the student API would
 * refuse are not among them. A lesson's counts are those of its own row, its learning items, plans, practices and quizzes,
 * and the questions of its practices and quizzes and its level-quiz questions: a question used in two lessons counts in both,
 * and once in the `total`. `outsidelessons` holds the rest: the curriculum, its grades and levels, and the questions only
 * its baselines or its level quizzes (with no lesson) use. Counts only; no text, no id other than the lesson's.
 */
export interface CoverageCounts {
  untranslated: number;
  stale: number;
}

export interface LanguageCoverage {
  total: CoverageCounts;
  outsidelessons: CoverageCounts;
  /** By lesson id; every lesson of the curriculum is here. */
  lessons: Record<string, CoverageCounts>;
}

export interface TranslationCoverage {
  contentlanguage: string | null;
  languages: Record<string, LanguageCoverage>;
}

type Tables = Record<string, Row[]>;

const isDeleted = (r: Row) => r.isdeleted === true || r.isdeleted === 1;
const none = (): CoverageCounts => ({ untranslated: 0, stale: 0 });
const add = (into: CoverageCounts, from: CoverageCounts) => {
  into.untranslated += from.untranslated;
  into.stale += from.stale;
};

interface Text {
  field: string;
  subkey: string;
  base: string;
}

/** The translatable texts of one row that have a base text now (see the note above). */
export const textsOf = (tablename: string, row: Row): Text[] => {
  const out: Text[] = [];
  const consider = (field: string, subkey: string) => {
    if (tablename === "questions" && isAnswerBearing(row.templatetypeid, field)) return;
    const base = baseTextOf(tablename, row, field, subkey);
    if (base !== undefined && base.trim() !== "") out.push({ field, subkey, base });
  };
  if (tablename !== "questions") {
    for (const field of TRANSLATABLE_FIELDS[tablename] ?? []) consider(field, "");
    return out;
  }
  consider("questiontext", "");
  consider("headingtext", "");
  const list = (value: unknown): Row[] => {
    const parsed = typeof value === "string" ? safeParse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((e): e is Row => typeof e === "object" && e !== null) : [];
  };
  for (const option of list(row.questionoptions)) {
    if (typeof option.questionoptionid !== "string") continue;
    consider("questionoptiontext", option.questionoptionid);
    consider("questionassociatetext", option.questionoptionid);
  }
  for (const distractor of list(row.questiondistractors)) {
    if (typeof distractor.questiondistractorid === "string") consider("questiondistractortext", distractor.questiondistractorid);
  }
  consider("feedback", "correctmessage");
  consider("feedback", "incorrectmessage");
  return out;
};

const safeParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** The coverage of one curriculum's rows (the tables of its payload: `selectCurriculumTables`). Pure. */
export const translationCoverage = (tables: Tables, contentlanguage: string | null): TranslationCoverage => {
  const translations = tables.contenttranslations ?? [];
  const languages = [...new Set(translations.map((t) => String(t.language)))].sort();
  const have = new Map<string, string>(); // table/row/field/subkey/language -> sourcehash
  for (const t of translations) {
    have.set([t.tablename, t.rowid, t.field, t.subkey, t.language].map((v) => String(v).toLowerCase()).join("\u0000"), String(t.sourcehash).toLowerCase());
  }

  /** The counts of one row, per language. */
  const countsOf = (tablename: string, pk: string, row: Row): Map<string, CoverageCounts> => {
    const out = new Map<string, CoverageCounts>(languages.map((l) => [l, none()]));
    const id = String(row[pk]);
    for (const text of textsOf(tablename, row)) {
      for (const language of languages) {
        const hash = have.get([tablename, id, text.field, text.subkey, language].map((v) => v.toLowerCase()).join("\u0000"));
        const counts = out.get(language)!;
        if (hash === undefined) counts.untranslated += 1;
        else if (hash !== sourceHash(text.base)) counts.stale += 1;
      }
    }
    return out;
  };

  const result: Record<string, LanguageCoverage> = Object.fromEntries(
    languages.map((l) => [l, { total: none(), outsidelessons: none(), lessons: {} as Record<string, CoverageCounts> }]),
  );
  const lessonIds = new Set<string>();
  for (const lesson of tables.lessons ?? []) if (!isDeleted(lesson)) lessonIds.add(String(lesson.lessonid).toLowerCase());
  for (const l of languages) for (const lesson of tables.lessons ?? []) if (!isDeleted(lesson)) result[l].lessons[String(lesson.lessonid)] = none();

  const lessonOf = new Map<string, string>(); // a practice or quiz id -> its lesson id (lower case)
  for (const key of ["lessonpractices", "lessonquizzes"]) {
    const pk = key === "lessonpractices" ? "lessonpracticeid" : "lessonquizid";
    for (const r of tables[key] ?? []) {
      const lesson = keyOf(r.lessonid);
      const id = keyOf(r[pk]);
      if (lesson !== null && id !== null && lessonIds.has(lesson)) lessonOf.set(id, lesson);
    }
  }
  const lessonKey = new Map<string, string>(); // lower-case lesson id -> as stored
  for (const lesson of tables.lessons ?? []) lessonKey.set(String(lesson.lessonid).toLowerCase(), String(lesson.lessonid));

  /** Counts a row once in the total and once in `into` (a lesson id, or outside lessons). */
  const tally = (counts: Map<string, CoverageCounts>, lessons: string[]) => {
    for (const language of languages) {
      const c = counts.get(language)!;
      add(result[language].total, c);
      if (lessons.length === 0) add(result[language].outsidelessons, c);
      for (const lesson of lessons) add(result[language].lessons[lessonKey.get(lesson)!], c);
    }
  };

  const OWN: Array<[string, string, string | null]> = [
    ["curriculums", "curriculumid", null],
    ["grades", "gradeid", null],
    ["levels", "levelid", null],
    ["lessons", "lessonid", "self"],
    ["lessonlearnings", "lessonlearningid", "lessonid"],
    ["lessonplans", "lessonplanid", "lessonid"],
    ["lessonpractices", "lessonpracticeid", "lessonid"],
    ["lessonquizzes", "lessonquizid", "lessonid"],
  ];
  if (languages.length === 0) return { contentlanguage, languages: {} };
  for (const [table, pk, via] of OWN) {
    for (const row of tables[table] ?? []) {
      if (isDeleted(row)) continue;
      const lesson = via === null ? null : via === "self" ? keyOf(row.lessonid) : keyOf(row[via]);
      tally(countsOf(table, pk, row), lesson !== null && lessonIds.has(lesson) ? [lesson] : []);
    }
  }

  // a question: in the lessons whose practices and quizzes use it (and the lessons its level-quiz rows name)
  const lessonsOfQuestion = new Map<string, Set<string>>();
  const note = (questionid: unknown, lesson: string | undefined) => {
    const q = keyOf(questionid);
    if (q === null) return;
    const set = lessonsOfQuestion.get(q) ?? new Set<string>();
    if (lesson !== undefined) set.add(lesson);
    lessonsOfQuestion.set(q, set);
  };
  for (const r of tables.lessonpracticequestions ?? []) note(r.questionid, lessonOf.get(keyOf(r.lessonpracticeid) ?? ""));
  for (const r of tables.lessonquizquestions ?? []) note(r.questionid, lessonOf.get(keyOf(r.lessonquizid) ?? ""));
  for (const r of tables.levelquizquestions ?? []) {
    const lesson = keyOf(r.lessonid);
    note(r.questionid, lesson !== null && lessonIds.has(lesson) ? lesson : undefined);
  }
  for (const r of tables.baselinequestion ?? []) note(r.questionid, undefined);
  for (const question of tables.questions ?? []) {
    if (isDeleted(question)) continue;
    const id = keyOf(question.questionid);
    tally(countsOf("questions", "questionid", question), id === null ? [] : [...(lessonsOfQuestion.get(id) ?? [])]);
  }
  return { contentlanguage, languages: result };
};
