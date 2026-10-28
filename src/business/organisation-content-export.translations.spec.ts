import { createHash } from "crypto";
import { Logger } from "src/config";
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import { contentProblems, TABLE_KEYS as CONTRACT_KEYS } from "src/test-support/student-api-content-contract";
import {
  buildOrganisationContent,
  confine,
  CONTENT_TABLE_KEYS,
  exportableTranslations,
  organisationRowOf,
  Row,
  SHAPE,
} from "./organisation-content-export";

/**
 * Translations in the export (bilingual content, the central side). `contenttranslations` is the LAST key of the
 * export; `confine` DROPS (with a count in the log) a translation whose parent is not in the payload, where the student
 * API refuses it; what the student API would refuse for any other reason is not sent; the organisation's row carries
 * `contentlanguage`. A payload built from tables must pass the student API's own rules (the contract port in
 * src/test-support/student-api-content-contract.ts, ported from its B-1 validator).
 */
const db = new ContentFake();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const OPT1 = "11111111-1111-4111-8111-111111111111-opt-1";
const AT = new Date("2026-10-28T05:00:00.000Z");

const [CUR, GRADE, LEVEL, LESSON, PRACTICE, QUESTION] = [id(1), id(2), id(3), id(4), id(5), id(6)];

const translation = (n: number, over: Row = {}) => ({
  translationid: id(900 + n), organisationid: X, tablename: "lessons", rowid: LESSON, field: "lessonname", subkey: "", language: "km", text: "translated",
  sourcehash: sha("Lesson one"), lastupdated: AT, ...over,
});

const seed = (contentlanguage: string | null = "en") => {
  db.add("organisations", { organisationid: X, contentlanguage });
  db.add("curriculums", { curriculumid: CUR, curriculumname: "Reading", organisationid: X, curriculumstatus: true });
  db.add("grades", { gradeid: GRADE, curriculumid: CUR, gradename: "Grade", gradeorder: 1, gradestatus: true });
  db.add("levels", { levelid: LEVEL, gradeid: GRADE, levelname: "Level", levelorder: 1, levelstatus: true });
  db.add("lessons", { lessonid: LESSON, levelid: LEVEL, lessonname: "Lesson one", lessonorder: 1, lessonstatus: true, total_points: 1, passing_points: 0 });
  db.add("lessonpractices", { lessonpracticeid: PRACTICE, lessonid: LESSON, lessonpracticename: "Practice", lessonpracticeorder: 1, lessonpracticestatus: true, points: 1 });
  db.add("questions", {
    questionid: QUESTION, questionidentifier: "q-1", questiontext: "Question text", templatetypeid: 1, organisationid: X, questionstatus: true,
    questionoptions: [{ questionoptionid: OPT1, questionoptiontext: "Cat", questionoptioniscorrect: true, questionoptionsequence: 1 }],
  });
  db.add("lessonpracticequestions", { lessonpracticequestionid: id(7), lessonpracticeid: PRACTICE, questionid: QUESTION, lessonpracticequestionorder: 1, lessonpracticequestionstatus: true });
};

const organisation = (contentlanguage: string | null = "en") =>
  ({ organisationid: X, organisationname: "Org X", organisationcode: "xorg", organisationstatus: true, uitheme: "kids", brandingconfig: null, settingsconfig: null, contentlanguage, isdeleted: false }) as never;

beforeEach(() => {
  jest.restoreAllMocks();
  db.install();
  jest.spyOn(Logger, "info").mockImplementation(() => Logger);
  jest.spyOn(dbinstance.getdbinstance(), "transaction").mockRejectedValue(new Error("not under test"));
});

describe("the shape", () => {
  it("contenttranslations is the last key of the export's table list, and of the student API's (the contract port)", () => {
    expect(CONTENT_TABLE_KEYS[CONTENT_TABLE_KEYS.length - 1]).toBe("contenttranslations");
    expect(CONTRACT_KEYS[CONTRACT_KEYS.length - 1]).toBe("contenttranslations");
    expect([...CONTENT_TABLE_KEYS].sort()).toEqual([...CONTRACT_KEYS].sort());
  });
  it("has a polymorphic parent over the nine translatable tables and no plain parent", () => {
    expect(SHAPE.contenttranslations.pk).toBe("translationid");
    expect(SHAPE.contenttranslations.parent).toBeUndefined();
    expect(SHAPE.contenttranslations.polymorphic).toEqual({
      tablefield: "tablename",
      idfield: "rowid",
      tables: ["curriculums", "grades", "levels", "lessons", "lessonlearnings", "lessonpractices", "lessonquizzes", "lessonplans", "questions"],
    });
  });
});

describe("confine and a translation whose parent is missing", () => {
  const given = () => ({
    lessons: [{ lessonid: LESSON, levelid: LEVEL }],
    questions: [{ questionid: QUESTION }],
    contenttranslations: [
      translation(1),
      translation(2, { tablename: "questions", rowid: QUESTION, field: "headingtext" }),
      translation(3, { rowid: id(404) }),
      translation(4, { tablename: "questions", rowid: id(405), field: "headingtext" }),
    ],
  });
  const left = (list: Row[]) => list.map((t) => t.translationid);

  it("DROPS a translation whose parent row is not in the payload, with a count in the log and no error", () => {
    const out = confine({ ...given(), levels: [{ levelid: LEVEL, gradeid: id(2) }], grades: [{ gradeid: id(2), curriculumid: id(1) }], curriculums: [{ curriculumid: id(1) }] });
    expect(left(out.contenttranslations!)).toEqual([id(901), id(902)]);
    expect(Logger.info).toHaveBeenCalledTimes(1);
    expect((Logger.info as jest.Mock).mock.calls[0][0]).toBe(
      "organisation content export: rows left out because the row they hang from is not in the payload (contenttranslations: 2)",
    );
  });

  it("drops a translation of a table that may not have any (and of a table name that is not one), whatever its parent", () => {
    const out = confine({ ...given(), contenttranslations: [translation(1), translation(5, { tablename: "documents", rowid: id(77) }), translation(6, { tablename: "x" })] });
    expect(left(out.contenttranslations!)).toEqual([id(901)]);
    expect((Logger.info as jest.Mock).mock.calls[0][0]).toContain("contenttranslations: 2");
  });

  it("follows the parents that are themselves dropped: a lesson with no level takes its translation with it", () => {
    const out = confine({ lessons: [{ lessonid: LESSON, levelid: id(405) }], levels: [], contenttranslations: [translation(1)] });
    expect(out.lessons).toEqual([]);
    expect(out.contenttranslations).toEqual([]);
    expect((Logger.info as jest.Mock).mock.calls[0][0]).toBe(
      "organisation content export: rows left out because the row they hang from is not in the payload (lessons: 1, contenttranslations: 1)",
    );
  });

  it("matches a parent id in any case, and checks only the tables it was given", () => {
    const withLetters = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
    const out = confine({
      lessons: [{ lessonid: withLetters.toUpperCase() }],
      contenttranslations: [translation(1, { rowid: withLetters }), translation(2, { tablename: "questions", rowid: id(405), field: "headingtext" })],
    });
    // the questions table was not given: that translation cannot be judged, and is kept; the lesson's matches in the other case
    expect(left(out.contenttranslations!)).toEqual([id(901), id(902)]);
  });

  it("still refuses (400) a row that names a question that is not the organisation's: dropping is only for translations", () => {
    expect(() => confine({ questions: [], lessonpracticequestions: [{ lessonpracticeid: PRACTICE, questionid: QUESTION }], lessonpractices: [{ lessonpracticeid: PRACTICE }] })).toThrow();
  });
});

describe("what the student API would refuse is not sent", () => {
  const rows = (list: Row[], language: string | null = "en", questions: Row[] = [{ questionid: QUESTION, templatetypeid: 1 }]) => exportableTranslations(list, language, questions);
  const reason = () => (Logger.info as jest.Mock).mock.calls.map((c) => c[0] as string).filter((m) => m.includes("would refuse"));

  it("keeps a well-formed translation, with its language as its primary subtag in lower case", () => {
    expect(rows([translation(1, { language: "KM" })]).map((t) => t.language)).toEqual(["km"]);
    expect(reason()).toEqual([]);
  });
  it("sends none when the organisation has no content language", () => {
    expect(rows([translation(1)], null)).toEqual([]);
    expect(reason()).toEqual(["organisation content export: translations left out because the student API would refuse them (1 the organisation has no content language)"]);
  });
  it.each([["en"], ["EN"], ["En"]])("leaves out a row in the organisation's own language (%s)", (language) => {
    expect(rows([translation(1, { language }), translation(2)])).toHaveLength(1);
    expect(reason()[0]).toContain("1 in the organisation's own content language");
  });
  it("leaves out a table or field that is not translatable", () => {
    expect(rows([translation(1, { tablename: "documents" }), translation(2, { field: "lessonorder" }), translation(3, { tablename: "toString" })])).toEqual([]);
    expect(reason()[0]).toContain("3 a table or field that is not translatable");
  });
  it.each([
    [21, "questionoptiontext", OPT1],
    [21, "questiontext", ""],
    [8, "questiontext", ""],
    [23, "questiontext", ""],
  ])("leaves out a field an answer is graded by on the question's template AS IT IS NOW: template %s %s", (templatetypeid, field, subkey) => {
    const t = translation(1, { tablename: "questions", rowid: QUESTION, field, subkey });
    expect(rows([t], "en", [{ questionid: QUESTION, templatetypeid }])).toEqual([]);
    expect(reason()[0]).toContain("1 a field an answer is graded by");
    // the same row is sent while the template does not grade by it
    expect(rows([t], "en", [{ questionid: QUESTION, templatetypeid: 1 }])).toHaveLength(1);
  });
  it("keeps the option text of template 23 (graded by value, not by text)", () => {
    const t = translation(1, { tablename: "questions", rowid: QUESTION, field: "questionoptiontext", subkey: OPT1 });
    expect(rows([t], "en", [{ questionid: QUESTION, templatetypeid: 23 }])).toHaveLength(1);
  });
  it.each([
    ["an option with no subkey", { tablename: "questions", rowid: QUESTION, field: "questionoptiontext", subkey: "" }],
    ["a plain field with a subkey", { subkey: "x" }],
    ["a subkey of 65 characters", { tablename: "questions", rowid: QUESTION, field: "questionoptiontext", subkey: "a".repeat(65) }],
    ["a feedback key that is not one", { tablename: "questions", rowid: QUESTION, field: "feedback", subkey: "other" }],
  ])("leaves out %s", (_what, over) => {
    expect(rows([translation(1, over)])).toEqual([]);
    expect(reason()[0]).toContain("1 a subkey that does not follow the field's rule");
  });
  it.each([
    ["a language that is not a code", { language: "k" }],
    ["an empty text", { text: "" }],
    ["a text over 65535 bytes", { text: "x".repeat(65536) }],
    ["a hash that is not 64 hex characters", { sourcehash: "abc" }],
    ["a date that is not one", { lastupdated: "never" }],
    ["no date", { lastupdated: null }],
  ])("leaves out %s", (_what, over) => {
    expect(rows([translation(1, over)])).toEqual([]);
    expect(reason()[0]).toContain("1 a language, text, hash or date the student API would refuse");
  });
  it("logs counts per reason and never a row, an id or a text", () => {
    rows([translation(1, { language: "en", text: "secret text" }), translation(2, { text: "" })]);
    const message = reason().join(" ");
    expect(message).not.toContain("secret text");
    expect(message).not.toContain(id(901));
  });
});

describe("the whole payload, built from the tables", () => {
  const OPTION_TRANSLATION = { tablename: "questions", rowid: QUESTION, field: "questionoptiontext", subkey: OPT1, text: "Cat (km)", sourcehash: sha("Cat") };

  it("carries the organisation's contentlanguage on its row, and null when it has none", async () => {
    expect(organisationRowOf(organisation("en")).contentlanguage).toBe("en");
    expect(organisationRowOf(organisation(null)).contentlanguage).toBeNull();
    expect(organisationRowOf({ ...(organisation() as object), contentlanguage: undefined } as never).contentlanguage).toBeNull();
  });

  it("ends with contenttranslations, holds the organisation's translations in the order of table, row, field, subkey and language, and passes the student API's rules", async () => {
    seed("en");
    db.add("contenttranslations", translation(2, OPTION_TRANSLATION));
    db.add("contenttranslations", translation(1));
    db.add("contenttranslations", translation(3, { language: "fr", text: "leçon" }));
    const payload = await buildOrganisationContent(organisation("en"));
    const keys = Object.keys(payload);
    expect(keys[keys.length - 1]).toBe("contenttranslations");
    expect((payload.contenttranslations as Row[]).map((t) => [t.tablename, t.field, t.subkey, t.language])).toEqual([
      ["lessons", "lessonname", "", "fr"],
      ["lessons", "lessonname", "", "km"],
      ["questions", "questionoptiontext", OPT1, "km"],
    ]);
    expect((payload.contenttranslations as Row[])[0]).toMatchObject({ organisationid: X, rowid: LESSON, sourcehash: sha("Lesson one") });
    expect(payload.organisations[0].contentlanguage).toBe("en");
    // exactly what the student API accepts, as a JSON file
    expect(contentProblems(JSON.parse(JSON.stringify(payload)))).toEqual([]);
  });

  it("sends an empty list, and the organisation's null language, when there are no translations (the student API requires the key)", async () => {
    seed(null);
    const payload = await buildOrganisationContent(organisation(null));
    expect(payload.contenttranslations).toEqual([]);
    expect(payload.organisations[0].contentlanguage).toBeNull();
    expect(contentProblems(JSON.parse(JSON.stringify(payload)))).toEqual([]);
  });

  it("sends none when the organisation has no content language, though rows exist, and the payload still passes", async () => {
    seed(null);
    db.add("contenttranslations", translation(1));
    const payload = await buildOrganisationContent(organisation(null));
    expect(payload.contenttranslations).toEqual([]);
    expect(contentProblems(JSON.parse(JSON.stringify(payload)))).toEqual([]);
  });

  it("leaves out a translation in the organisation's own language and one the template now grades by, and the payload passes", async () => {
    seed("en");
    db.add("contenttranslations", translation(1));
    db.add("contenttranslations", translation(2, { language: "EN" }));
    db.add("contenttranslations", translation(3, OPTION_TRANSLATION));
    db.add("contenttranslations", translation(4, { tablename: "questions", rowid: QUESTION, field: "headingtext", subkey: "", text: "x", sourcehash: sha("h") }));
    db.tables.questions[0].templatetypeid = 21;
    const payload = await buildOrganisationContent(organisation("en"));
    expect((payload.contenttranslations as Row[]).map((t) => t.translationid)).toEqual([id(901), id(904)]);
    expect(contentProblems(JSON.parse(JSON.stringify(payload)))).toEqual([]);
  });

  it("DROPS a translation whose lesson is not in the payload (its level is gone), and the payload passes where the student API would have refused it", async () => {
    seed("en");
    db.add("contenttranslations", translation(1));
    db.tables.levels = [];
    const payload = await buildOrganisationContent(organisation("en"));
    expect(payload.lessons).toEqual([]);
    expect(payload.contenttranslations).toEqual([]);
    expect((Logger.info as jest.Mock).mock.calls.map((c) => c[0]).join("\n")).toContain("contenttranslations: 1");
    expect(contentProblems(JSON.parse(JSON.stringify(payload)))).toEqual([]);
    // the contract port refuses the same payload with the row put back: the asymmetry is central drops, the student API refuses
    const refused = JSON.parse(JSON.stringify(payload));
    refused.contenttranslations = [{ ...translation(1), lastupdated: AT.toISOString() }];
    expect(contentProblems(refused)).toEqual(["contenttranslations: 1 row names a lessons row (rowid) that is not in the payload"]);
  });

  it("sends none of another organisation's translations", async () => {
    seed("en");
    db.add("contenttranslations", translation(1));
    db.add("contenttranslations", translation(2, { organisationid: Y }));
    const payload = await buildOrganisationContent(organisation("en"));
    expect((payload.contenttranslations as Row[]).map((t) => t.translationid)).toEqual([id(901)]);
  });
});
