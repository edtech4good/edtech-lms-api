import { ApiError } from "src/models/ApiError";
import { questiontags } from "src/models/data-models/questiontags";
import { ContentFake } from "src/test-support/content-fake";
import {
  assertSameOwner,
    assertTagsAllowed,
  assertTagsFitOwner,
  callerOwner,
  ownerForNewContent,
  ownerOfCurriculum,
  ownerOfCurriculumBaseline,
  ownerOfDocument,
  ownerOfFeedback,
  ownerOfGrade,
  ownerOfLearning,
  ownerOfLearningDocument,
  ownerOfLesson,
  ownerOfLevel,
  ownerOfPlan,
  ownerOfPractice,
  ownerOfQuestion,
  ownerOfQuiz,
  ownerOfSchool,
  ownersOfBaselineQuestion,
  ownersOfLevelQuizQuestion,
  ownersOfPracticeQuestion,
  ownersOfQuizQuestion,
} from "./content-owner";

const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const db = new ContentFake();

beforeEach(() => {
  jest.restoreAllMocks();
  db.install();
  // a curriculum tree owned by X, one by Y, one with no owner
  for (const [c, owner] of [["cx", X], ["cy", Y], ["cu", null]] as Array<[string, string | null]>) {
    db.add("curriculums", { curriculumid: c, organisationid: owner });
    db.add("grades", { gradeid: `g-${c}`, curriculumid: c });
    db.add("levels", { levelid: `lv-${c}`, gradeid: `g-${c}` });
    db.add("lessons", { lessonid: `ls-${c}`, levelid: `lv-${c}` });
    db.add("lessonlearnings", { lessonlearningid: `ln-${c}`, lessonid: `ls-${c}` });
    db.add("lessonplans", { lessonplanid: `pl-${c}`, lessonid: `ls-${c}` });
    db.add("lessonpractices", { lessonpracticeid: `pr-${c}`, lessonid: `ls-${c}` });
    db.add("lessonquizzes", { lessonquizid: `qz-${c}`, lessonid: `ls-${c}` });
    db.add("curriculumbaseline", { curriculumbaselineid: `bl-${c}`, curriculumid: c });
    db.add("questions", { questionid: `q-${c}`, organisationid: owner });
    db.add("lessonpracticequestions", { lessonpracticequestionid: `pq-${c}`, lessonpracticeid: `pr-${c}`, questionid: `q-${c}` });
    db.add("lessonquizquestions", { lessonquizquestionid: `zq-${c}`, lessonquizid: `qz-${c}`, questionid: `q-${c}` });
    db.add("levelquizquestions", { levelquizquestionid: `lq-${c}`, levelid: `lv-${c}`, questionid: `q-${c}` });
    db.add("baselinequestion", { baselinequestionid: `bq-${c}`, curriculumbaselineid: `bl-${c}`, questionid: `q-${c}` });
    db.add("documents", { documentid: `d-${c}`, organisationid: owner });
    db.add("lessonlearningdocuments", { lessonlearningdocumentid: `ld-${c}`, lessonlearningid: `ln-${c}`, documentid: `d-${c}`, lessonlearningdocumentrole: "asset" });
  }
});

describe("ownerOf...: the owner of anything in the content tree comes from its parent chain", () => {
  it.each([
    ["curriculum", ownerOfCurriculum, (c: string) => c],
    ["grade", ownerOfGrade, (c: string) => `g-${c}`],
    ["level", ownerOfLevel, (c: string) => `lv-${c}`],
    ["lesson", ownerOfLesson, (c: string) => `ls-${c}`],
    ["learning", ownerOfLearning, (c: string) => `ln-${c}`],
    ["learning document (link row)", ownerOfLearningDocument, (c: string) => `ld-${c}`],
    ["plan", ownerOfPlan, (c: string) => `pl-${c}`],
    ["practice", ownerOfPractice, (c: string) => `pr-${c}`],
    ["quiz", ownerOfQuiz, (c: string) => `qz-${c}`],
    ["curriculum baseline", ownerOfCurriculumBaseline, (c: string) => `bl-${c}`],
    ["question", ownerOfQuestion, (c: string) => `q-${c}`],
    ["document", ownerOfDocument, (c: string) => `d-${c}`],
  ] as Array<[string, (id: string) => Promise<string | null>, (c: string) => string]>)("%s", async (_n, ownerOf, idOf) => {
    expect(await ownerOf(idOf("cx"))).toBe(X);
    expect(await ownerOf(idOf("cy"))).toBe(Y);
    expect(await ownerOf(idOf("cu"))).toBeNull();
  });

  it("an id that matches nothing (or a broken chain) has no owner: null", async () => {
    expect(await ownerOfLesson("missing")).toBeNull();
    db.tables.levels = [];
    expect(await ownerOfLesson("ls-cx")).toBeNull();
    expect(await ownerOfFeedback("missing")).toBeNull();
    expect(await ownerOfLearningDocument("missing")).toBeNull();
    // a link row whose item is gone has no owner either
    db.tables.lessonlearnings = db.tables.lessonlearnings.filter((r) => r.lessonlearningid !== "ln-cx");
    expect(await ownerOfLearningDocument("ld-cx")).toBeNull();
  });

  it("feedback takes its owner from its curriculum", async () => {
    db.add("feedbacks", { feedbackid: "f1", curriculumid: "cx" });
    db.add("feedbacks", { feedbackid: "f2", curriculumid: "cy" });
    expect(await ownerOfFeedback("f1")).toBe(X);
    expect(await ownerOfFeedback("f2")).toBe(Y);
  });

  it("a school's owner is its organisation", async () => {
    db.add("schools", { schoolid: "s1", organisationid: Y });
    expect(await ownerOfSchool("s1")).toBe(Y);
  });
});

describe("the question-attach rows are read from both ends", () => {
  it("practice, quiz, level quiz and baseline rows: the parent's owner and the question's owner", async () => {
    expect(await ownersOfPracticeQuestion("pq-cx")).toEqual({ parent: X, question: X });
    expect(await ownersOfQuizQuestion("zq-cy")).toEqual({ parent: Y, question: Y });
    expect(await ownersOfLevelQuizQuestion("lq-cu")).toEqual({ parent: null, question: null });
    expect(await ownersOfBaselineQuestion("bq-cx")).toEqual({ parent: X, question: X });
  });

  it("a row whose two ends disagree shows both", async () => {
    db.tables.lessonpracticequestions[0].questionid = "q-cy";
    expect(await ownersOfPracticeQuestion("pq-cx")).toEqual({ parent: X, question: Y });
  });
});

describe("assertSameOwner", () => {
  it("allows two equal owners", () => {
    expect(() => assertSameOwner(X, X)).not.toThrow();
  });

  it("refuses two different owners with 400 and a message that names nothing private", () => {
    const error = (() => {
      try {
        assertSameOwner(X, Y);
      } catch (e) {
        return e as { code: string; message: string; getStatus: () => number };
      }
    })()!;
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.getStatus()).toBe(400);
    expect(error.message).toBe("These belong to different organisations, so one can't be attached to the other.");
    expect(error.message).not.toContain(X);
    expect(error.message).not.toContain(Y);
  });

  it("allows it when either side has no owner yet (legacy content), and when both have none", () => {
    expect(() => assertSameOwner(X, null)).not.toThrow();
    expect(() => assertSameOwner(null, Y)).not.toThrow();
    expect(() => assertSameOwner(null, null)).not.toThrow();
    expect(() => assertSameOwner(undefined, Y)).not.toThrow();
  });
});

describe("ownerForNewContent / callerOwner", () => {
  it("an organisation's staff, and a platform user acting as one, own what they create", () => {
    expect(ownerForNewContent({ organisationid: X, isplatform: false })).toBe(X);
    expect(ownerForNewContent({ organisationid: X, isplatform: true })).toBe(X);
    expect(callerOwner({ organisationid: X, isplatform: true })).toBe(X);
  });

  it("a platform user not acting as an organisation is refused with 400 and told to choose one", () => {
    const error = (() => {
      try {
        ownerForNewContent({ organisationid: null, isplatform: true });
      } catch (e) {
        return e as { code: string; message: string };
      }
    })()!;
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.message).toMatch(/Choose an organisation to act in/);
    expect(callerOwner({ organisationid: null, isplatform: true })).toBeNull();
  });

  it("no scope at all fails closed (403, NOT_ALLOWED)", () => {
    for (const org of [undefined, { organisationid: null, isplatform: false }]) {
      let refusal: ApiError | undefined;
      try {
        ownerForNewContent(org as never);
      } catch (e) {
        refusal = e as ApiError;
      }
      expect(refusal?.code).toBe("NOT_ALLOWED");
      expect(refusal?.getStatus()).toBe(403);
    }
  });
});

describe("assertTagsFitOwner", () => {
  beforeEach(() => {
    db.add("questiontags", { questiontagid: "t1", questiontagname: "easy", organisationid: X });
    db.add("questiontags", { questiontagid: "t2", questiontagname: "hard", organisationid: Y });
    db.add("questiontags", { questiontagid: "t3", questiontagname: "old", organisationid: null });
    db.add("questiontags", { questiontagid: "t4", questiontagname: "shared", organisationid: X });
    db.add("questiontags", { questiontagid: "t5", questiontagname: "shared", organisationid: Y });
    db.add("documenttags", { documenttagid: "dt1", documenttagname: "lesson", organisationid: Y });
  });
  const fits = (kind: "question" | "document", names: string[], owner: string | null) => assertTagsFitOwner(kind, names, owner);

  it("a tag of the same owner, an unowned tag and a name that matches no tag are allowed", async () => {
    await fits("question", ["easy", "old", "brand-new-name"], X);
  });

  it("a tag of another owner is refused (400)", async () => {
    await expect(fits("question", ["hard"], X)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(fits("question", ["easy", "hard"], X)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(fits("document", ["lesson"], X)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("the same name owned by two organisations is fine for either of them", async () => {
    await fits("question", ["shared"], X);
    await fits("question", ["shared"], Y);
  });

  it("names match without regard to case, as the database does: 'HARD' is Y's tag 'hard' and 'Lesson' is Y's document tag", async () => {
    // the fake compares tag names case-insensitively (as MySQL's collation does), so the lookup finds the row
    // for 'hard' when asked for 'HARD' and it is the function's own comparison that must still see it as Y's
    await expect(fits("question", ["HARD"], X)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(fits("document", ["Lesson"], X)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await fits("question", ["EASY"], X);
  });

  it("an unowned question or document takes any tag (for now), and no tags is nothing to check", async () => {
    await fits("question", ["hard"], null);
    await fits("question", [], X);
  });
});

describe("assertTagsAllowed", () => {
  beforeEach(() => {
    db.add("questiontags", { questiontagid: "t1", questiontagname: "easy", organisationid: X });
    db.add("questiontags", { questiontagid: "t2", questiontagname: "hard", organisationid: Y });
    db.add("documenttags", { documenttagid: "dt1", documenttagname: "lesson", organisationid: Y });
  });
  const asX = { organisationid: X, isplatform: false };
  const actingAsX = { organisationid: X, isplatform: true };
  const platform = { organisationid: null, isplatform: true };

  it("for an organisation caller, and a platform user acting as one, a name another organisation holds is a new name, as an unheld name is", async () => {
    for (const org of [asX, actingAsX]) {
      await assertTagsAllowed(org, "question", ["easy", "hard", "brand-new-name"], X);
      await assertTagsAllowed(org, "document", ["lesson"], X);
    }
  });

  it("no tag is read for an organisation caller, so nothing it asks can tell it who holds a name", async () => {
    const reads = jest.spyOn(questiontags, "findAll");
    await assertTagsAllowed(asX, "question", ["hard"], X);
    expect(reads).not.toHaveBeenCalled();
  });

  it("a platform user not acting is held to the owner of the row, as before", async () => {
    await assertTagsAllowed(platform, "question", ["easy", "brand-new-name"], X);
    await expect(assertTagsAllowed(platform, "question", ["hard"], X)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(assertTagsAllowed(platform, "document", ["lesson"], X)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("a caller with no scope is refused (403)", async () => {
    await expect(assertTagsAllowed({ organisationid: null, isplatform: false }, "question", ["easy"], X)).rejects.toMatchObject({ code: "NOT_ALLOWED" });
  });
});

