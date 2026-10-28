import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ANSWER_BEARING_FIELDS,
  CONTENT_TRANSLATIONS_HEADER,
  FEEDBACK_KEYS,
  NO_SUBKEY,
  SUBKEYED_FIELDS,
  SUBKEY_MAX_LENGTH,
  TRANSLATABLE_FIELDS,
  TRANSLATION_TABLES,
  isAnswerBearing,
  normaliseLanguage,
  sourceHash,
} from "./content-translations";

/**
 * The translation rules are shared with the student API (edtech-lms-rpi-api), which refuses what they forbid: the
 * tables and fields that can be translated, the fields an answer is graded by, the subkey rules, the language code and
 * the hash of a base text. `src/constants/content-translations.ts` is a COPY of that API's file, pinned below by hash
 * to the student API's branch feat/content-translations at 63e1da6 (bilingual content B-1). When the student API's file
 * changes, re-copy it byte for byte and update the hash with it; a hand edit here, or a stale copy, is red. The student
 * API pins THIS file's hash the same way (the tier labels are pinned from the other side), so a change on either side
 * is red until both are brought level.
 */
const STUDENT_API_CONSTANTS_SHA256 = "695bd1530add6cc14d9a2378bebbb718282158dc3000d1fb1d2dc9ad9c173fdf";
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("the translation constants, shared with the student API", () => {
  it("src/constants/content-translations.ts is byte for byte the student API's (edtech-lms-rpi-api 63e1da6)", () => {
    expect(sha256(join(__dirname, "content-translations.ts"))).toBe(STUDENT_API_CONSTANTS_SHA256);
  });
});

describe("what the constants say", () => {
  it("name the nine translatable tables, each with its fields", () => {
    expect(TRANSLATION_TABLES).toEqual([
      "curriculums",
      "grades",
      "levels",
      "lessons",
      "lessonlearnings",
      "lessonpractices",
      "lessonquizzes",
      "lessonplans",
      "questions",
    ]);
    expect(TRANSLATABLE_FIELDS.lessons).toEqual(["lessonname", "lessondescription"]);
    expect(TRANSLATABLE_FIELDS.questions).toEqual(["questiontext", "headingtext", "questionoptiontext", "questionassociatetext", "questiondistractortext", "feedback"]);
  });

  it("keep the subkey rules: four question fields need one, feedback takes only its two message keys, 64 characters at most", () => {
    expect([...SUBKEYED_FIELDS]).toEqual(["questionoptiontext", "questionassociatetext", "questiondistractortext", "feedback"]);
    expect([...FEEDBACK_KEYS]).toEqual(["correctmessage", "incorrectmessage"]);
    expect(NO_SUBKEY).toBe("");
    expect(SUBKEY_MAX_LENGTH).toBe(64);
    // the seed's option ids (`<uuid>-opt-N`, 42 characters) fit
    expect(`${"0".repeat(36)}-opt-1`.length).toBeLessThanOrEqual(SUBKEY_MAX_LENGTH);
  });

  it("name the answer-bearing fields: template 21 option text and question text, template 8 and 23 question text", () => {
    expect(ANSWER_BEARING_FIELDS).toEqual({ 8: ["questiontext"], 21: ["questiontext", "questionoptiontext"], 23: ["questiontext"] });
    expect(isAnswerBearing(21, "questionoptiontext")).toBe(true);
    expect(isAnswerBearing("21", "questiontext")).toBe(true);
    expect(isAnswerBearing(23, "questiontext")).toBe(true);
    expect(isAnswerBearing(23, "questionoptiontext")).toBe(false);
    expect(isAnswerBearing(8, "questionoptiontext")).toBe(false);
    expect(isAnswerBearing(1, "questiontext")).toBe(false);
    expect(isAnswerBearing(undefined, "questiontext")).toBe(false);
  });

  it("keep a language as its primary subtag in lower case, and the header name the student API reads", () => {
    expect(normaliseLanguage("KM")).toBe("km");
    expect(normaliseLanguage("PT-BR")).toBe("pt-BR");
    expect(normaliseLanguage("km")).toBe("km");
    expect(CONTENT_TRANSLATIONS_HEADER).toBe("X-Content-Translations");
  });

  it("hash the exact UTF-8 text in lower-case hex: Khmer text with its marks is hashed as typed, and nothing is normalised", () => {
    // sha-256 of the UTF-8 bytes of "abc" is the well known value; Khmer is hashed by its bytes, as typed
    expect(sourceHash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const khmer = "ភាសាខ្មែរ"; // a fixture string the other specs already use (subscript marks); not written for this spec
    expect(sourceHash(khmer)).toBe(createHash("sha256").update(Buffer.from(khmer, "utf8")).digest("hex"));
    expect(sourceHash(khmer)).toMatch(/^[0-9a-f]{64}$/);
    // no normalisation: the same text in another Unicode form is another hash
    expect(sourceHash("\u00e9")).not.toBe(sourceHash("e\u0301"));
  });
});
