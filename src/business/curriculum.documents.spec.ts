import { ContentFake } from "src/test-support/content-fake";
import { CurriculumBusiness } from "./curriculum.business";
import { QuestionBusiness } from "./question.business";

/**
 * The offline media list of a curriculum (`GET /export/documents/:curriculumid`, which is `CurriculumBusiness.getDocuments`) and the
 * learning path it is built from (`QuestionBusiness.getlessonquestions`): an item with no primary document names no file (it is not the
 * placeholder "invalid"), and the documents an item references through link rows are part of the set.
 * (The route and its scope are proved in modules/content-scope.leak.spec.ts, with this method replaced.)
 */
const db = new ContentFake();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const C = id(1);
const LESSON = id(4);
const item = (n: number, over: object = {}) => ({
  lessonlearningid: id(100 + n), lessonid: LESSON, documentid: id(200 + n), lessonlearningname: `Item ${n}`, lessonlearningdescription: "ពិពណ៌នា",
  lessonlearningorder: n, lessonlearningstatus: true, lessonlearningtype: "video", lessonlearningbody: null, ...over,
});
const link = (n: number, learning: number, document: number, order = 0) => ({
  lessonlearningdocumentid: id(300 + n), lessonlearningid: id(100 + learning), documentid: id(200 + document),
  lessonlearningdocumentrole: "asset", lessonlearningdocumentorder: order,
});

beforeEach(() => {
  jest.restoreAllMocks();
  db.install();
  db.add("curriculums", { curriculumid: C, curriculumname: "ភាសាខ្មែរ", curriculumstatus: true });
  db.add("grades", { gradeid: id(2), gradename: "ថ្នាក់", gradeorder: 1, gradestatus: true, curriculumid: C });
  db.add("levels", { levelid: id(3), levelname: "កម្រិត", levelorder: 1, levelstatus: true, gradeid: id(2) });
  db.add("lessons", { lessonid: LESSON, lessonname: "មេរៀន ១", lessonorder: 1, lessonstatus: true, levelid: id(3) });
  db.add("documents", { documentid: id(201), documentname: "one.mp4", documenttypeid: 2 });
  db.add("documents", { documentid: id(202), documentname: "ពីរ.png", documenttypeid: 1 });
  db.add("documents", { documentid: id(203), documentname: "three.mp3", documenttypeid: 3 });
  db.add("documents", { documentid: id(204), documentname: "four.png", documenttypeid: 1 });
});

describe("the media list of a curriculum", () => {
  it("names each video item's file", async () => {
    db.add("lessonlearnings", item(1));
    expect(await new CurriculumBusiness().getDocuments(C)).toEqual(["one.mp4"]);
  });

  it("an item with no primary document adds no file (not the placeholder 'invalid')", async () => {
    db.add("lessonlearnings", item(1));
    db.add("lessonlearnings", item(2, { documentid: null }));
    expect(await new CurriculumBusiness().getDocuments(C)).toEqual(["one.mp4"]);
  });

  it("a lesson whose only item has no document contributes nothing", async () => {
    db.add("lessonlearnings", item(2, { documentid: null }));
    expect(await new CurriculumBusiness().getDocuments(C)).toEqual([]);
  });

  it("an item's link-row documents are in the list, after its own file, once each", async () => {
    db.add("lessonlearnings", item(1));
    db.add("lessonlearnings", item(2, { documentid: null }));
    db.add("lessonlearningdocuments", link(1, 1, 3));
    db.add("lessonlearningdocuments", link(2, 2, 2, 1));
    db.add("lessonlearningdocuments", link(3, 2, 3, 2)); // the same document on a second item: named once
    const files = await new CurriculumBusiness().getDocuments(C);
    expect(files.slice(0, 1)).toEqual(["one.mp4"]);
    expect([...files].sort()).toEqual(["one.mp4", "three.mp3", "ពីរ.png"]);
  });

  it("the link rows of an item that is switched off, or of another curriculum's lesson, are not in the list", async () => {
    db.add("lessonlearnings", item(1));
    db.add("lessonlearnings", item(2, { lessonlearningstatus: false, documentid: null }));
    db.add("lessonlearnings", item(3, { lessonid: id(40), documentid: null }));
    db.add("lessonlearningdocuments", link(1, 2, 4));
    db.add("lessonlearningdocuments", link(2, 3, 4));
    expect(await new CurriculumBusiness().getDocuments(C)).toEqual(["one.mp4"]);
  });
});

describe("the learning path of a lesson", () => {
  it("an item with no primary document carries no file object; a video item carries its file's", async () => {
    db.add("lessonlearnings", item(1));
    db.add("lessonlearnings", item(2, { documentid: null }));
    const path = (await new QuestionBusiness().getlessonquestions(LESSON))!.learningpath;
    expect(path.map((p: { lessonlearningid: string; lessonlearningfileobject: unknown }) => [p.lessonlearningid, p.lessonlearningfileobject])).toEqual([
      [id(101), { filename: "one.mp4", filetype: expect.any(Number), fileext: "mp4" }],
      [id(102), null],
    ]);
  });

  it("an item whose document row is missing still gets the placeholder it always did (only a null documentid is skipped)", async () => {
    db.add("lessonlearnings", item(1, { documentid: id(999) }));
    const path = (await new QuestionBusiness().getlessonquestions(LESSON))!.learningpath;
    expect(path[0].lessonlearningfileobject).toMatchObject({ filename: "invalid" });
  });
});
