import { ContentFake } from "src/test-support/content-fake";
import { LessonPlanBusiness } from "./lessonplan.business";

/**
 * The plan reads that need no HTTP: a plan shows its document's title beside the document's name, as a learning does.
 * (The routes and the scope are proved over HTTP in modules/content-scope.leak.spec.ts.)
 */
const db = new ContentFake();
const L = "00000000-0000-4000-8000-0000000000a1";
const doc = (n: number) => `00000000-0000-4000-8000-0000000000d${n}`;
const plan = (n: number) => `00000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`;

beforeEach(() => {
  jest.restoreAllMocks();
  db.install();
  db.add("lessons", { lessonid: L, lessonname: "មេរៀន", lessondescription: "ពិពណ៌នា", lessonorder: 1 });
  db.add("documents", { documentid: doc(1), documentname: "one.pdf", documenttypeid: 6 });
  db.add("documents", { documentid: doc(2), documentname: "two.pdf", documenttypeid: 6 });
  db.add("lessonplans", { lessonplanid: plan(1), lessonid: L, documentid: doc(1), lessonplanname: "Plan 1", lessonplandescription: "ពិពណ៌នា", lessonplanorder: 1, lessonplanstatus: true });
  db.add("lessonplans", { lessonplanid: plan(2), lessonid: L, documentid: doc(2), lessonplanname: "Plan 2", lessonplandescription: "ពិពណ៌នា", lessonplanorder: 2, lessonplanstatus: true });
});

describe("a lesson plan's document title", () => {
  it("is shown beside the document's name on a plan read by id, and on a lesson's plan list; null when the document has none", async () => {
    db.tables.documents.find((d) => d.documentid === doc(1))!.documenttitle = "ភ្នំពេញ";
    const business = new LessonPlanBusiness();
    expect(await business.getLessonPlanbyid(plan(1))).toMatchObject({ documentname: "one.pdf", documenttitle: "ភ្នំពេញ" });
    expect(await business.getLessonPlanbyid(plan(2))).toMatchObject({ documentname: "two.pdf", documenttitle: null });
    expect((await business.getLessonPlanbyLessonid(L))!.map((x) => [x.lessonplanid, x.documentname, x.documenttitle])).toEqual([
      [plan(1), "one.pdf", "ភ្នំពេញ"],
      [plan(2), "two.pdf", null],
    ]);
  });
});
