import { createHash } from "crypto";
import { textsOf, translationCoverage } from "./translation-coverage";

/**
 * Untranslated and stale counts per language and lesson (bilingual content, decision 6). Pure: the tables are the ones
 * of a curriculum's payload. A text is translated, stale (the base text has changed) or untranslated; an answer-bearing
 * text and a text that is gone are not counted.
 */
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [CUR, GRADE, LEVEL, L1, L2, PRACTICE, QUIZ, Q1, Q2, Q3] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(id);
const OPT = "11111111-1111-4111-8111-111111111111-opt-1";
type Row = Record<string, unknown>;

const tr = (tablename: string, rowid: string, field: string, base: string, language = "km", subkey = ""): Row => ({
  tablename, rowid, field, subkey, language, sourcehash: sha(base),
});

const tables = (over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  curriculums: [{ curriculumid: CUR, curriculumname: "Reading", curriculumdescription: null }],
  grades: [{ gradeid: GRADE, gradename: "Grade", gradedescription: "" }],
  levels: [{ levelid: LEVEL, levelname: "Level", leveldescription: "  " }],
  lessons: [
    { lessonid: L1, lessonname: "One", lessondescription: "About one" },
    { lessonid: L2, lessonname: "Two", lessondescription: null },
  ],
  lessonlearnings: [],
  lessonplans: [],
  lessonpractices: [{ lessonpracticeid: PRACTICE, lessonid: L1, lessonpracticename: "Practice", lessonpracticedescription: null }],
  lessonquizzes: [{ lessonquizid: QUIZ, lessonid: L2, lessonquizname: "Quiz", lessonquizdescription: null }],
  questions: [
    { questionid: Q1, templatetypeid: 1, questiontext: "Q one", questionoptions: [{ questionoptionid: OPT, questionoptiontext: "Cat", questionassociate: { questionoptionid: OPT, questionassociatetext: "Meow" } }], questionfeedback: { correctmessage: "Yes" } },
    { questionid: Q2, templatetypeid: 21, questiontext: "Type it", questionoptions: [{ questionoptionid: OPT, questionoptiontext: "answer" }] },
    { questionid: Q3, templatetypeid: 1, questiontext: "Only a baseline", questionoptions: [] },
  ],
  lessonpracticequestions: [{ lessonpracticeid: PRACTICE, questionid: Q1 }],
  lessonquizquestions: [{ lessonquizid: QUIZ, questionid: Q1 }, { lessonquizid: QUIZ, questionid: Q2 }],
  levelquizquestions: [],
  baselinequestion: [{ questionid: Q3 }],
  contenttranslations: [],
  ...over,
});

describe("the texts of a row", () => {
  it("are the translatable columns that have a text; a null, empty or blank column has none", () => {
    expect(textsOf("lessons", { lessonid: L1, lessonname: "One", lessondescription: "  " }).map((t) => t.field)).toEqual(["lessonname"]);
    expect(textsOf("lessonplans", { lessonplanname: "Plan", lessonplandescription: "About" }).map((t) => t.field)).toEqual(["lessonplanname", "lessonplandescription"]);
  });
  it("for a question: its text, heading, each option's text and partner, each distractor, and the two messages that exist", () => {
    const q = {
      templatetypeid: 1, questiontext: "T", questionheading: { headingtext: "H" },
      questionoptions: [{ questionoptionid: "o1", questionoptiontext: "A", questionassociate: { questionassociatetext: "P" } }, { questionoptionid: "o2", questionoptiontext: "B" }],
      questiondistractors: [{ questiondistractorid: "d1", questiondistractortext: "D" }], questionfeedback: { correctmessage: "C" },
    };
    expect(textsOf("questions", q).map((t) => `${t.field}.${t.subkey}`)).toEqual([
      "questiontext.", "headingtext.", "questionoptiontext.o1", "questionassociatetext.o1", "questionoptiontext.o2", "questiondistractortext.d1", "feedback.correctmessage",
    ]);
  });
  it("leave out what an answer is graded by on the question's template (21: the typed text and the options)", () => {
    const q = { templatetypeid: 21, questiontext: "T", questionheading: { headingtext: "H" }, questionoptions: [{ questionoptionid: "o1", questionoptiontext: "A" }] };
    expect(textsOf("questions", q).map((t) => t.field)).toEqual(["headingtext"]);
  });
  it("read JSON columns held as text", () => {
    expect(textsOf("questions", { templatetypeid: 1, questionoptions: JSON.stringify([{ questionoptionid: "o1", questionoptiontext: "A" }]) }).map((t) => t.subkey)).toEqual(["o1"]);
    expect(textsOf("questions", { templatetypeid: 1, questionoptions: "not json" })).toEqual([]);
  });
});

describe("coverage", () => {
  it("names no language when there are no translations (nothing to translate into)", () => {
    expect(translationCoverage(tables(), "en")).toEqual({ contentlanguage: "en", languages: {} });
  });

  it("counts, per lesson, the texts with no translation, and the texts whose base text has changed since", () => {
    const t = tables({
      contenttranslations: [
        tr("lessons", L1, "lessonname", "One"), // translated
        tr("lessons", L1, "lessondescription", "About one before"), // stale
        tr("lessonpractices", PRACTICE, "lessonpracticename", "Practice"), // translated
      ],
    });
    const { languages } = translationCoverage(t, "en");
    expect(Object.keys(languages)).toEqual(["km"]);
    // L1: its name (done), description (stale), the practice (done), Q1 (text, option, partner, message: all untranslated)
    expect(languages.km.lessons[L1]).toEqual({ untranslated: 4, stale: 1 });
    // L2: its name, its quiz, Q1 again (4) and Q2 (nothing: template 21 grades by its text and option)
    expect(languages.km.lessons[L2]).toEqual({ untranslated: 1 + 1 + 4, stale: 0 });
  });

  it("counts a question used by two lessons in both, and once in the total; the rest is outside lessons", () => {
    const { languages } = translationCoverage(tables({ contenttranslations: [tr("lessons", L1, "lessonname", "One")] }), "en");
    const km = languages.km;
    // outside lessons: the curriculum name, the grade name, the level name (blank and null descriptions are not texts) and Q3's text (a baseline-only question)
    expect(km.outsidelessons).toEqual({ untranslated: 4, stale: 0 });
    // Q1 (text, option, partner, message = 4) is in lesson one (its practice) and in lesson two (its quiz)
    expect(km.lessons[L1].untranslated).toBe(1 /* description */ + 1 /* practice name */ + 4);
    expect(km.lessons[L2].untranslated).toBe(1 /* name */ + 1 /* quiz name */ + 4);
    // the total counts Q1 once: 4 outside + (1 + 1) + (1 + 1) + 4
    expect(km.total).toEqual({ untranslated: 4 + 2 + 2 + 4, stale: 0 });
  });

  it("a stale translation is not also untranslated, and a translation of a text that is gone is neither", () => {
    const { languages } = translationCoverage(
      tables({
        contenttranslations: [
          tr("questions", Q1, "questionoptiontext", "Cat before", "km", OPT), // stale
          tr("questions", Q1, "questionoptiontext", "Gone", "km", "removed-option"), // its option is gone
        ],
      }),
      "en",
    );
    expect(languages.km.lessons[L1].stale).toBe(1);
    expect(languages.km.lessons[L1].untranslated).toBe(1 /* lesson name */ + 1 /* lesson desc */ + 1 /* practice */ + 3 /* Q1 text, partner, message */);
  });

  it("is per language: a text translated in one language and not in another", () => {
    const { languages } = translationCoverage(tables({ contenttranslations: [tr("lessons", L1, "lessonname", "One", "km"), tr("lessons", L1, "lessonname", "One", "fr")] }), "en");
    expect(Object.keys(languages).sort()).toEqual(["fr", "km"]);
    expect(languages.fr.lessons[L1]).toEqual(languages.km.lessons[L1]);
  });

  it("does not count a deleted row, and lists every lesson even when it has nothing to translate", () => {
    const t = tables({
      lessons: [{ lessonid: L1, lessonname: "One", isdeleted: true }, { lessonid: L2, lessonname: null }],
      contenttranslations: [tr("curriculums", CUR, "curriculumname", "Reading")],
    });
    const km = translationCoverage(t, "en").languages.km;
    expect(Object.keys(km.lessons)).toEqual([L2]);
    expect(km.lessons[L2].untranslated).toBeGreaterThanOrEqual(0);
  });

  it("holds counts only: no text and no id but the lesson's", () => {
    const out = JSON.stringify(translationCoverage(tables({ contenttranslations: [tr("lessons", L1, "lessonname", "One")] }), "en"));
    expect(out).not.toContain("About one");
    expect(out).not.toContain(OPT);
    expect(out).not.toContain(Q1);
  });
});
