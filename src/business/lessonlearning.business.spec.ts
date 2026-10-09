import { ContentFake } from "src/test-support/content-fake";
import { dbinstance } from "src/services/dbservice";
import { LessonLearningBusiness } from "./lessonlearning.business";

/**
 * The learning item reads and rules that need no HTTP: an item with no primary document must be read without
 * dereferencing it, two such items are not duplicates of each other, and the link rows come back in the item's order.
 * (The routes, the scope and the type rules are proved over HTTP in modules/content-scope.leak.spec.ts.)
 */
const db = new ContentFake();
const L = "00000000-0000-4000-8000-0000000000a1";
const doc = (n: number) => `00000000-0000-4000-8000-0000000000d${n}`;
const item = (n: number, over: object = {}) => ({
  lessonlearningid: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
  lessonid: L, documentid: doc(1), lessonlearningname: `Item ${n}`, lessonlearningdescription: "ពិពណ៌នា",
  lessonlearningorder: n, lessonlearningstatus: true, lessonlearningtype: "video", lessonlearningbody: null, ...over,
});
const idOf = (n: number) => item(n).lessonlearningid;

beforeEach(() => {
  jest.restoreAllMocks();
  db.install();
  db.add("lessons", { lessonid: L, lessonname: "មេរៀន", lessondescription: "ពិពណ៌នា", lessonorder: 1 });
  db.add("documents", { documentid: doc(1), documentname: "one.mp4", documenttypeid: 2 });
  db.add("documents", { documentid: doc(2), documentname: "two.png", documenttypeid: 1 });
  // a document-less item of a later type, a video item, and a second document-less item
  db.add("lessonlearnings", item(1, { lessonlearningtype: "gallery", lessonlearningbody: { v: 1 }, documentid: null }));
  db.add("lessonlearnings", item(2));
  db.add("lessonlearnings", item(3, { lessonlearningtype: "gallery", lessonlearningbody: { v: 1 }, documentid: null }));
  db.add("lessonlearningdocuments", { lessonlearningdocumentid: "l-b", lessonlearningid: idOf(1), documentid: doc(2), lessonlearningdocumentrole: "asset", lessonlearningdocumentorder: 2 });
  db.add("lessonlearningdocuments", { lessonlearningdocumentid: "l-a", lessonlearningid: idOf(1), documentid: doc(1), lessonlearningdocumentrole: "asset", lessonlearningdocumentorder: 1 });
});

describe("reading an item with no primary document", () => {
  it("lists a lesson's items without dereferencing a missing document", async () => {
    const list = await new LessonLearningBusiness().getLessonLearningbyLessonid(L);
    expect(list!.map((x) => [x.lessonlearningid, x.documentid, x.documentname, x.documenttypeid, x.lessonlearningtype])).toEqual([
      [idOf(1), null, null, null, "gallery"],
      [idOf(2), doc(1), "one.mp4", 2, "video"],
      [idOf(3), null, null, null, "gallery"],
    ]);
  });

  it("reads one such item by id without dereferencing a missing document", async () => {
    const one = await new LessonLearningBusiness().getLessonLearningbyid(idOf(3));
    expect(one).toMatchObject({ lessonlearningid: idOf(3), documentid: null, documentname: null, documenttypeid: null, lessonname: "មេរៀន", lessonlearningbody: { v: 1 } });
  });

  it("an absent item reads as nothing, not as an error", async () => {
    expect(await new LessonLearningBusiness().getLessonLearningbyid("00000000-0000-4000-8000-000000000999")).toBeNull();
  });

  it("an item with no stored type reads as a video item (a row written before the column)", async () => {
    db.add("lessonlearnings", item(4, { lessonlearningtype: undefined, lessonlearningbody: undefined }));
    const one = await new LessonLearningBusiness().getLessonLearningbyid(idOf(4));
    expect(one).toMatchObject({ lessonlearningtype: "video", lessonlearningbody: null });
  });

  it("gives an item its link rows in the item's own order, each with its document's name and type", async () => {
    const one = await new LessonLearningBusiness().getLessonLearningbyid(idOf(1));
    expect(one!.documents).toEqual([
      { documentid: doc(1), role: "asset", order: 1, documentname: "one.mp4", documenttypeid: 2 },
      { documentid: doc(2), role: "asset", order: 2, documentname: "two.png", documenttypeid: 1 },
    ]);
    const other = await new LessonLearningBusiness().getLessonLearningbyid(idOf(2));
    expect(other!.documents).toEqual([]);
  });
});

describe("the one-document-per-lesson rule", () => {
  const exists = (documentid: string | null | undefined, self = "") => new LessonLearningBusiness().isexistsLessonLearningAdded(L, documentid, self);

  it("a document already on the lesson is a duplicate, unless it is the item itself", async () => {
    expect(await exists(doc(1))).toBe(true);
    expect(await exists(doc(1), idOf(2))).toBe(false);
    expect(await exists(doc(2))).toBe(false);
  });

  it("an item with no document is never a duplicate, though other items in the lesson have none either", async () => {
    expect(await exists(null)).toBe(false);
    expect(await exists(undefined)).toBe(false);
    expect(await exists(null, idOf(1))).toBe(false);
  });
});

describe("reordering without a caller's scope", () => {
  it("numbers the items 1..n in the order given, in one transaction", async () => {
    const tx = { commit: jest.fn(), rollback: jest.fn() };
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(tx as never);
    await new LessonLearningBusiness().reorderLessonLearnings(L, [idOf(3), idOf(1), idOf(2)]);
    expect(db.tables.lessonlearnings.map((x) => [x.lessonlearningid, x.lessonlearningorder])).toEqual([[idOf(1), 2], [idOf(2), 3], [idOf(3), 1]]);
    expect(tx.commit).toHaveBeenCalledTimes(1);
    expect(tx.rollback).not.toHaveBeenCalled();
  });

  it("rolls back and rethrows when a write fails, and commits nothing", async () => {
    const tx = { commit: jest.fn(), rollback: jest.fn() };
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(tx as never);
    const { lessonlearnings } = jest.requireActual("src/models/data-models/lessonlearnings");
    (lessonlearnings.update as jest.Mock).mockRejectedValueOnce(new Error("disk full"));
    await expect(new LessonLearningBusiness().reorderLessonLearnings(L, [idOf(3), idOf(1), idOf(2)])).rejects.toThrow("disk full");
    expect(tx.commit).not.toHaveBeenCalled();
    expect(tx.rollback).toHaveBeenCalledTimes(1);
  });
});
