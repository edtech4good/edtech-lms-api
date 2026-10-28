import { createHash } from "crypto";
import { ALL_UPDATE_PERMISSIONS, ALL_VIEW_PERMISSIONS, assertMay, baseTextOf, isStale, TABLES } from "./content-translations";
import { TRANSLATION_TABLES } from "src/constants/content-translations";
import { Permission } from "src/models/enums/permissions.enum";

/**
 * The base text a translation was made from, and when a translation is stale. The student API reads the text the same
 * way to decide whether to serve a translation, so a text read differently here would mark current what it leaves out.
 * The routes are proved over HTTP in modules/content-scope.leak.spec.ts.
 */
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const question = {
  questiontext: "Text",
  questionheading: { headingtext: "Heading" },
  questionoptions: [
    { questionoptionid: "o1", questionoptiontext: "Cat", questionassociate: { questionoptionid: "o1", questionassociatetext: "Meow" } },
    { questionoptionid: "o2", questionoptiontext: "Dog" },
  ],
  questiondistractors: [{ questiondistractorid: "d1", questiondistractortext: "Fish" }],
  questionfeedback: { correctmessage: "Yes", incorrectmessage: "No" },
};

describe("baseTextOf", () => {
  it.each([
    ["questiontext", "", "Text"],
    ["headingtext", "", "Heading"],
    ["questionoptiontext", "o1", "Cat"],
    ["questionoptiontext", "o2", "Dog"],
    ["questionassociatetext", "o1", "Meow"],
    ["questiondistractortext", "d1", "Fish"],
    ["feedback", "correctmessage", "Yes"],
    ["feedback", "incorrectmessage", "No"],
  ])("reads a question's %s (%s)", (field, subkey, text) => {
    expect(baseTextOf("questions", question, field, subkey)).toBe(text);
  });

  it("reads the same from a row whose JSON columns are held as text", () => {
    const held = { ...question, questionheading: JSON.stringify(question.questionheading), questionoptions: JSON.stringify(question.questionoptions), questionfeedback: JSON.stringify(question.questionfeedback) };
    expect(baseTextOf("questions", held, "headingtext", "")).toBe("Heading");
    expect(baseTextOf("questions", held, "questionoptiontext", "o2")).toBe("Dog");
    expect(baseTextOf("questions", held, "feedback", "correctmessage")).toBe("Yes");
  });

  it.each([
    ["an option that is not there", "questionoptiontext", "nope"],
    ["a partner of an option with none", "questionassociatetext", "o2"],
    ["a distractor that is not there", "questiondistractortext", "nope"],
    ["a feedback key that is not one", "feedback", "other"],
    ["a feedback key from the prototype", "feedback", "constructor"],
    ["a field that is not a text of a question", "questionstatus", ""],
  ])("has no text for %s", (_what, field, subkey) => {
    expect(baseTextOf("questions", question, field, subkey)).toBeUndefined();
  });

  it("has no text for a null column, a column that is not a string, or JSON that does not parse", () => {
    expect(baseTextOf("lessons", { lessonname: null }, "lessonname", "")).toBeUndefined();
    expect(baseTextOf("lessons", { lessonname: 5 }, "lessonname", "")).toBeUndefined();
    expect(baseTextOf("questions", { questionoptions: "{not json" }, "questionoptiontext", "o1")).toBeUndefined();
    expect(baseTextOf("questions", {}, "headingtext", "")).toBeUndefined();
  });

  it("reads a plain column of any other table", () => {
    expect(baseTextOf("lessons", { lessonname: "One" }, "lessonname", "")).toBe("One");
  });
});

describe("isStale", () => {
  const row = { lessonname: "One" };
  it("is false while the hash is that of the text now, whatever the case of the hash", () => {
    expect(isStale("lessons", row, { field: "lessonname", subkey: "", sourcehash: sha("One") })).toBe(false);
    expect(isStale("lessons", row, { field: "lessonname", subkey: "", sourcehash: sha("One").toUpperCase() })).toBe(false);
  });
  it("is true once the text has changed, and when the text is gone", () => {
    expect(isStale("lessons", { lessonname: "Uno" }, { field: "lessonname", subkey: "", sourcehash: sha("One") })).toBe(true);
    expect(isStale("lessons", { lessonname: null }, { field: "lessonname", subkey: "", sourcehash: sha("One") })).toBe(true);
    expect(isStale("questions", question, { field: "questionoptiontext", subkey: "gone", sourcehash: sha("Cat") })).toBe(true);
  });
  it("hashes the exact text: a trailing space is a change", () => {
    expect(isStale("lessons", { lessonname: "One " }, { field: "lessonname", subkey: "", sourcehash: sha("One") })).toBe(true);
  });
});

describe("the tables and their permissions", () => {
  it("cover exactly the nine translatable tables of the shared constants", () => {
    expect(Object.keys(TABLES).sort()).toEqual([...TRANSLATION_TABLES].sort());
  });
  it("write with the update permission of the parent entity, and read with its view permission", () => {
    expect(TABLES.lessons).toMatchObject({ update: Permission.UPDATE_LESSON, view: Permission.VIEW_LESSON });
    expect(TABLES.questions).toMatchObject({ update: Permission.UPDATE_QUESTION, view: Permission.VIEW_QUESTION });
    expect(TABLES.curriculums.update).toBe(Permission.UPDATE_CURRICULUM);
    expect(TABLES.lessonplans.update).toBe(Permission.UPDATE_LESSONLEARNING);
    expect(ALL_UPDATE_PERMISSIONS.every((p) => p.startsWith("update_"))).toBe(true);
    expect(ALL_VIEW_PERMISSIONS.every((p) => p.startsWith("view_"))).toBe(true);
  });
  it("assertMay refuses (403) a caller without the table's permission and a table that is not one (400), and names the table's entry otherwise", () => {
    const org = { organisationid: "x", isplatform: false, permissions: ["update_lesson"] };
    expect(assertMay(org, "lessons", "update")).toBe(TABLES.lessons);
    expect(() => assertMay(org, "questions", "update")).toThrow("You don't have permission to do that.");
    expect(() => assertMay(org, "lessons", "view")).toThrow("You don't have permission to do that.");
    expect(() => assertMay(org, "documents", "update")).toThrow("That kind of content can't be translated.");
    expect(() => assertMay(org, "constructor", "update")).toThrow("That kind of content can't be translated.");
    expect(assertMay({ ...org, permissions: ["superadmin"] }, "questions", "update")).toBe(TABLES.questions);
  });
});
