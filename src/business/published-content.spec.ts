import { createHash } from "crypto";
import { OrgContext } from "src/decorators/org.decorator";
import { organisations } from "src/models/data-models/organisations";
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import { contentProblems, TABLE_KEYS } from "src/test-support/student-api-content-contract";
import { LmsUserToken } from "src/models/token.model";
import { CurriculumBusiness } from "./curriculum.business";
import { publishCurriculum, retireCurriculum, Tables, CurriculumPayload } from "./curriculum-publication";
import { buildOrganisationContent, CURRICULUM_CONTENT_KEYS, keyOf, Row, SHAPE, trimIdLists } from "./organisation-content-export";
import { buildPublishedOrganisationContent, mergePublished, PublishedSet } from "./published-content";

/**
 * What the sync serves (A4 step 2): the merged latest publications plus the live tables. The pure merge is driven with
 * hand-made publications; the whole builder against the in-memory tables, publishing with the real publish act.
 */
const db = new ContentFake();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const orgX: OrgContext = { organisationid: X, isplatform: false, permissions: [] };
const USER = id(7);
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const AT = new Date("2026-10-28T05:00:00.000Z");

const [A, B, C] = [id(100), id(200), id(300)];
const [GA, VA, L1, L2] = [id(101), id(102), id(103), id(104)];
const [GB, VB, LB] = [id(201), id(202), id(203)];
const [GC, VC, LC] = [id(301), id(302), id(303)];
const Q = (n: number) => id(500 + n);
const D = (n: number) => id(600 + n);
const T = (n: number) => id(900 + n);
const SUBJECT = id(50);
const SCHOOL = id(60);
const COUNTRY = id(70);
const KHMER_LESSON = "មេរៀនទីមួយ";

const lessonRow = (lessonid: string, levelid: string, name: string, order: number) => ({
  lessonid, levelid, lessonname: name, lessonorder: order, lessonstatus: true, total_points: 100, passing_points: 0,
});
const translation = (n: number, tablename: string, rowid: string, field: string, base: string, over: Row = {}) => ({
  translationid: T(n), organisationid: X, tablename, rowid, field, subkey: "", language: "km", text: `${field} (km)`, sourcehash: sha(base), lastupdated: AT, ...over,
});

// A (Reading): lessons L1, L2; practice and quiz use Q1; quiz also Q2; level quiz Q3; learning D1; plan D2.
// B (Maths): a quiz using Q1 (shared with A) and Q5 (B's own).
// C (Science): a quiz using Q6 only. Q9 and D9 are used by nobody.
const seed = (contentlanguage: string | null = "en") => {
  db.add("organisations", { organisationid: X, organisationcode: "xorg", organisationname: "Org X", organisationstatus: true, uitheme: "kids", brandingconfig: null, settingsconfig: null, contentlanguage, isdeleted: false });
  db.add("subjects", { subjectid: SUBJECT, subjectname: "Reading", organisationid: X, subjectstatus: true });
  db.add("countries", { countryid: COUNTRY, countryname: "Land" });
  db.add("organisationcountry", { organisationcountryid: id(71), organisationid: X, countryid: COUNTRY });
  db.add("schools", { schoolid: SCHOOL, schoolname: "School", organisationid: X, countryid: COUNTRY, curriculums: [A, B, C, id(999)] });
  for (const [curriculumid, name] of [[A, "Reading"], [B, "Maths"], [C, "Science"]] as const) {
    db.add("curriculums", { curriculumid, curriculumname: name, organisationid: X, subjectid: SUBJECT, curriculumstatus: true });
  }
  db.add("grades", { gradeid: GA, curriculumid: A, gradename: "Grade A", gradeorder: 1, gradestatus: true });
  db.add("levels", { levelid: VA, gradeid: GA, levelname: "Level A", levelorder: 1, levelstatus: true });
  db.add("lessons", lessonRow(L1, VA, KHMER_LESSON, 1));
  db.add("lessons", lessonRow(L2, VA, "Lesson two", 2));
  db.add("grades", { gradeid: GB, curriculumid: B, gradename: "Grade B", gradeorder: 1, gradestatus: true });
  db.add("levels", { levelid: VB, gradeid: GB, levelname: "Level B", levelorder: 1, levelstatus: true });
  db.add("lessons", lessonRow(LB, VB, "Lesson maths", 1));
  db.add("grades", { gradeid: GC, curriculumid: C, gradename: "Grade C", gradeorder: 1, gradestatus: true });
  db.add("levels", { levelid: VC, gradeid: GC, levelname: "Level C", levelorder: 1, levelstatus: true });
  db.add("lessons", lessonRow(LC, VC, "Lesson science", 1));
  for (const n of [1, 2, 3, 5, 6, 9]) {
    db.add("questions", { questionid: Q(n), questionidentifier: `q-${n}`, questiontext: `Question ${n}`, templatetypeid: 1, organisationid: X, questionstatus: true });
  }
  for (const n of [1, 2, 9]) db.add("documents", { documentid: D(n), documentname: `doc-${n}.png`, documenttypeid: 2, organisationid: X, documenttags: [] });
  db.add("lessonlearnings", { lessonlearningid: id(701), lessonid: L1, documentid: D(1), lessonlearningname: "Learning", lessonlearningorder: 1, lessonlearningstatus: true, lessonlearningtype: "video", lessonlearningbody: null });
  db.add("lessonplans", { lessonplanid: id(702), lessonid: L1, documentid: D(2), lessonplanname: "Plan", lessonplanorder: 1, lessonplanstatus: true });
  db.add("lessonpractices", { lessonpracticeid: id(703), lessonid: L1, lessonpracticename: "Practice", lessonpracticeorder: 1, lessonpracticestatus: true, points: 10 });
  db.add("lessonquizzes", { lessonquizid: id(704), lessonid: L1, lessonquizname: "Quiz", lessonquizorder: 1, lessonquizstatus: true, points: 10 });
  db.add("lessonpracticequestions", { lessonpracticequestionid: id(705), lessonpracticeid: id(703), questionid: Q(1), lessonpracticequestionorder: 1, lessonpracticequestionstatus: true });
  db.add("lessonquizquestions", { lessonquizquestionid: id(706), lessonquizid: id(704), questionid: Q(1), lessonquizquestionorder: 1, lessonquizquestionstatus: true });
  db.add("lessonquizquestions", { lessonquizquestionid: id(707), lessonquizid: id(704), questionid: Q(2), lessonquizquestionorder: 2, lessonquizquestionstatus: true });
  db.add("levelquizquestions", { levelquizquestionid: id(708), levelid: VA, questionid: Q(3), lessonid: L1, levelquizquestionorder: 1, levelquizquestionstatus: true });
  db.add("lessonquizzes", { lessonquizid: id(804), lessonid: LB, lessonquizname: "Maths quiz", lessonquizorder: 1, lessonquizstatus: true, points: 10 });
  db.add("lessonquizquestions", { lessonquizquestionid: id(806), lessonquizid: id(804), questionid: Q(1), lessonquizquestionorder: 1, lessonquizquestionstatus: true });
  db.add("lessonquizquestions", { lessonquizquestionid: id(807), lessonquizid: id(804), questionid: Q(5), lessonquizquestionorder: 2, lessonquizquestionstatus: true });
  db.add("lessonquizzes", { lessonquizid: id(904), lessonid: LC, lessonquizname: "Science quiz", lessonquizorder: 1, lessonquizstatus: true, points: 10 });
  db.add("lessonquizquestions", { lessonquizquestionid: id(906), lessonquizid: id(904), questionid: Q(6), lessonquizquestionorder: 1, lessonquizquestionstatus: true });
  // translations: the shared question's text, and lesson one's name
  db.add("contenttranslations", translation(1, "questions", Q(1), "questiontext", "Question 1"));
  db.add("contenttranslations", translation(2, "lessons", L1, "lessonname", KHMER_LESSON));
};

const organisation = (contentlanguage: string | null = "en") =>
  ({ organisationid: X, organisationcode: "xorg", organisationname: "Org X", organisationstatus: true, uitheme: "kids", brandingconfig: null, settingsconfig: null, contentlanguage, isdeleted: false }) as unknown as organisations;

const transaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" } };
beforeEach(() => {
  jest.restoreAllMocks();
  db.install();
  transaction.commit.mockClear();
  jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
});

const stored = (table: Parameters<ContentFake["add"]>[0], key: string, value: string) => db.tables[table].find((r) => r[key] === value)!;
const ids = (rows: Row[], key: string) => rows.map((r) => r[key] as string).sort();
const sorted = (...v: string[]) => [...v].sort();
let clock = Date.parse("2026-10-28T06:00:00.000Z");
/** Publishes the curriculum and gives the new publication a distinct, increasing time (two publishes in one millisecond would tie). */
const publish = async (curriculumid: string) => {
  const res = await publishCurriculum(orgX, USER, curriculumid);
  clock += 1000;
  stored("curriculumpublications", "publicationid", res.publicationid).publishedat = new Date(clock);
  return res;
};
const served = async (contentlanguage: string | null = "en") => JSON.parse(JSON.stringify(await buildPublishedOrganisationContent(organisation(contentlanguage)))) as Record<string, Row[]> & { organisations: Row[] };
const pk = (table: string) => SHAPE[table as keyof typeof SHAPE].pk;
/** Every table of a payload holds each id once (the student API refuses a repeated id). */
const repeated = (payload: Record<string, unknown>) =>
  Object.entries(payload)
    .filter(([table, rows]) => table in SHAPE && Array.isArray(rows))
    .flatMap(([table, rows]) => {
      const seen = (rows as Row[]).map((r) => keyOf(r[pk(table)]));
      return seen.filter((k, i) => seen.indexOf(k) !== i).map((k) => `${table}:${k}`);
    });

describe("mergePublished (pure)", () => {
  const base = (n: number, curriculumid: string, at: string, name: string): PublishedSet => ({
    publicationid: id(4000 + n),
    curriculumid,
    publishedat: new Date(at),
    payload: {
      format: 1, curriculumid, organisationid: X,
      tables: Object.fromEntries(CURRICULUM_CONTENT_KEYS.map((k) => [k, k === "curriculums" ? [{ curriculumid, curriculumname: name }] : []])) as unknown as Tables,
    } as CurriculumPayload,
  });
  const set = (n: number, curriculumid: string, at: string, tables: Partial<Tables>, name = "c"): PublishedSet => {
    const s = base(n, curriculumid, at, name);
    for (const [k, rows] of Object.entries(tables)) (s.payload.tables as unknown as Record<string, Row[]>)[k] = rows as Row[];
    return s;
  };

  it("takes the newest publication's copy of a row two publications hold, once, whichever order they are given in", () => {
    const old = set(1, A, "2026-10-28T06:00:00.000Z", { questions: [{ questionid: Q(1), questiontext: "old" }] }, "Reading");
    const fresh = set(2, B, "2026-10-28T07:00:00.000Z", { questions: [{ questionid: Q(1), questiontext: "new" }] }, "Maths");
    for (const order of [[old, fresh], [fresh, old]]) {
      expect(mergePublished(order).questions).toEqual([{ questionid: Q(1), questiontext: "new" }]);
    }
  });

  it("compares ids without regard to case, as confine does", () => {
    const old = set(1, A, "2026-10-28T06:00:00.000Z", { questions: [{ questionid: Q(1).toUpperCase(), questiontext: "old" }] });
    const fresh = set(2, B, "2026-10-28T07:00:00.000Z", { questions: [{ questionid: Q(1), questiontext: "new" }] });
    expect(mergePublished([old, fresh]).questions.map((r) => r.questiontext)).toEqual(["new"]);
  });

  it("breaks a tie in publishedat by the larger publicationid, not by the order the rows were read in", () => {
    const a = set(1, A, "2026-10-28T06:00:00.000Z", { questions: [{ questionid: Q(1), questiontext: "from-1" }] });
    const b = set(2, B, "2026-10-28T06:00:00.000Z", { questions: [{ questionid: Q(1), questiontext: "from-2" }] });
    expect(mergePublished([a, b]).questions[0].questiontext).toBe("from-2");
    expect(mergePublished([b, a]).questions[0].questiontext).toBe("from-2");
  });

  it("a row that moved between curricula (a grade) comes from the newer publication, once", () => {
    const old = set(1, A, "2026-10-28T06:00:00.000Z", { grades: [{ gradeid: GA, curriculumid: A }] }, "Reading");
    const fresh = set(2, B, "2026-10-28T07:00:00.000Z", { grades: [{ gradeid: GA, curriculumid: B }] }, "Maths");
    expect(mergePublished([old, fresh]).grades).toEqual([{ gradeid: GA, curriculumid: B }]);
  });

  it("takes a translation from the publication its parent row was taken from, and drops it from the other", () => {
    const old = set(1, A, "2026-10-28T06:00:00.000Z", {
      questions: [{ questionid: Q(1), questiontext: "old" }],
      contenttranslations: [{ translationid: T(1), tablename: "questions", rowid: Q(1), text: "from old" }, { translationid: T(2), tablename: "lessons", rowid: L1, text: "lesson, only here" }],
      lessons: [{ lessonid: L1 }],
    }, "Reading");
    const fresh = set(2, B, "2026-10-28T07:00:00.000Z", {
      questions: [{ questionid: Q(1), questiontext: "new" }],
      contenttranslations: [{ translationid: T(3), tablename: "questions", rowid: Q(1), text: "from new" }],
    }, "Maths");
    const merged = mergePublished([old, fresh]);
    expect(merged.questions.map((r) => r.questiontext)).toEqual(["new"]);
    expect(ids(merged.contenttranslations, "translationid")).toEqual(sorted(T(2), T(3)));
  });

  it("drops a translation whose parent is in no publication, and one whose table is not one it knows", () => {
    const only = set(1, A, "2026-10-28T06:00:00.000Z", {
      contenttranslations: [{ translationid: T(1), tablename: "questions", rowid: Q(1) }, { translationid: T(2), tablename: "nonsense", rowid: Q(1) }, { translationid: T(3), tablename: "questions", rowid: null }],
    });
    expect(mergePublished([only]).contenttranslations).toEqual([]);
  });

  it("is every table present, empty for no publications", () => {
    const merged = mergePublished([]);
    expect(Object.keys(merged)).toEqual([...CURRICULUM_CONTENT_KEYS]);
    for (const k of CURRICULUM_CONTENT_KEYS) expect(merged[k]).toEqual([]);
  });
});

describe("trimIdLists", () => {
  it("keeps the entries that are rows of the tables given, from an array or JSON text, and leaves the others alone", () => {
    const out = trimIdLists({
      schools: [{ schoolid: "s1", curriculums: [A, B, "gone"] }, { schoolid: "s2", curriculums: JSON.stringify([B, A]) }, { schoolid: "s3", curriculums: null }],
      curriculums: [{ curriculumid: A }],
      curriculumbaselines: [{ curriculumbaselineid: "b1", schoolid: ["s1", "s9"] }],
    });
    expect((out.schools as Row[]).map((r) => r.curriculums)).toEqual([[A], [A], null]);
    expect((out.curriculumbaselines as Row[])[0].schoolid).toEqual(["s1"]);
  });
});

describe("what the sync serves", () => {
  beforeEach(() => seed());

  it("a draft edit (a lesson renamed, not published) is not served; publishing it is", async () => {
    await publish(A);
    stored("lessons", "lessonid", L2).lessonname = "Lesson two, renamed";
    const before = await served();
    expect(before.lessons.map((l) => l.lessonname).sort()).toEqual(sorted(KHMER_LESSON, "Lesson two"));
    expect(JSON.stringify(before)).not.toContain("renamed");
    await publish(A);
    const after = await served();
    expect(after.lessons.map((l) => l.lessonname).sort()).toEqual(sorted(KHMER_LESSON, "Lesson two, renamed"));
  });

  it("a curriculum that was never published is not in the payload, nor are the rows only it uses; the live tables are", async () => {
    await publish(A);
    const payload = await served();
    expect(ids(payload.curriculums, "curriculumid")).toEqual([A]);
    expect(ids(payload.questions, "questionid")).toEqual(sorted(Q(1), Q(2), Q(3)));
    expect(ids(payload.documents, "documentid")).toEqual(sorted(D(1), D(2)));
    expect(ids(payload.lessons, "lessonid")).toEqual(sorted(L1, L2));
    expect(ids(payload.subjects, "subjectid")).toEqual([SUBJECT]);
    expect(ids(payload.schools, "schoolid")).toEqual([SCHOOL]);
    expect(ids(payload.countries, "countryid")).toEqual([COUNTRY]);
    expect(Object.keys(payload).filter((k) => k !== "organisations" && k in SHAPE).sort()).toEqual([...TABLE_KEYS].sort());
    expect(contentProblems(payload)).toEqual([]);
  });

  it("trims schools.curriculums to the published curricula (an unpublished one, a retired one and an id that is not there are left out)", async () => {
    await publish(A);
    await publish(B);
    expect((await served()).schools[0].curriculums).toEqual([A, B]);
    await retireCurriculum(orgX, B);
    expect((await served()).schools[0].curriculums).toEqual([A]);
    // what central holds is unchanged
    expect(stored("schools", "schoolid", SCHOOL).curriculums).toEqual([A, B, C, id(999)]);
  });

  it("two curricula that share a question, only one republished: the newer copy is served once, and no table repeats an id", async () => {
    await publish(A);
    await publish(B);
    stored("questions", "questionid", Q(1)).questiontext = "Question 1, edited";
    const afterBoth = await served();
    expect(afterBoth.questions.find((q) => q.questionid === Q(1))!.questiontext).toBe("Question 1");
    // B is republished with the edit: A's learners get B's copy too
    await publish(B);
    const payload = await served();
    expect(payload.questions.filter((q) => q.questionid === Q(1)).map((q) => q.questiontext)).toEqual(["Question 1, edited"]);
    expect(repeated(payload)).toEqual([]);
    expect(contentProblems(payload)).toEqual([]);
    // and the other way round: A republished last carries A's copy
    stored("questions", "questionid", Q(1)).questiontext = "Question 1, edited again";
    await publish(A);
    expect((await served()).questions.find((q) => q.questionid === Q(1))!.questiontext).toBe("Question 1, edited again");
  });

  it("no table of a payload with every curriculum published repeats an id", async () => {
    await publish(A);
    await publish(B);
    await publish(C);
    const payload = await served();
    expect(repeated(payload)).toEqual([]);
    expect(ids(payload.questions, "questionid")).toEqual(sorted(Q(1), Q(2), Q(3), Q(5), Q(6)));
  });

  it("a retired curriculum leaves the payload, with the questions only it used; a question another curriculum shares stays; the merge still passes confine and the contract", async () => {
    await publish(A);
    await publish(B);
    await publish(C);
    await retireCurriculum(orgX, A);
    const payload = await served();
    expect(ids(payload.curriculums, "curriculumid")).toEqual(sorted(B, C));
    // Q2 and Q3 and the documents were only A's; Q1 is B's too
    expect(ids(payload.questions, "questionid")).toEqual(sorted(Q(1), Q(5), Q(6)));
    expect(payload.documents).toEqual([]);
    expect(ids(payload.lessons, "lessonid")).toEqual(sorted(LB, LC));
    expect(contentProblems(payload)).toEqual([]);
    expect(repeated(payload)).toEqual([]);
  });

  it("a curriculum deleted after publishing is not served, nor are the rows only it uses; a shared bank row stays", async () => {
    await publish(A);
    await publish(B);
    stored("curriculums", "curriculumid", A).isdeleted = true;
    const payload = await served();
    expect(ids(payload.curriculums, "curriculumid")).toEqual([B]);
    // Q2, Q3 and the documents were only A's; Q1 is B's too
    expect(ids(payload.questions, "questionid")).toEqual(sorted(Q(1), Q(5)));
    expect(payload.documents).toEqual([]);
    expect(ids(payload.lessons, "lessonid")).toEqual([LB]);
    expect(payload.schools[0].curriculums).toEqual([B]);
    expect(contentProblems(payload)).toEqual([]);
    expect(repeated(payload)).toEqual([]);
    // a deleted curriculum whose live row is gone altogether is not served either
    db.tables.curriculums = db.tables.curriculums.filter((c) => c.curriculumid !== A);
    expect(ids((await served()).curriculums, "curriculumid")).toEqual([B]);
    // every curriculum deleted: nothing served, no error
    stored("curriculums", "curriculumid", B).isdeleted = true;
    expect((await served()).curriculums).toEqual([]);
  });

  it("a curriculum is served only while it is live AND its latest publication is `published`: one deleted through the delete route and restored stays out until it is published again", async () => {
    await publish(A);
    await publish(B);
    // the delete route's own act: soft-delete and withdraw, in one transaction
    expect(await new CurriculumBusiness(orgX).deleteCurriculum(A, { lmsuserid: USER } as LmsUserToken)).toEqual({ organisationid: X, withdrew: true });
    expect(ids((await served()).curriculums, "curriculumid")).toEqual([B]);
    // restored by SQL (there is no restore route): live again, but its publication was withdrawn with the delete, so the
    // frozen copy is not resurrected
    stored("curriculums", "curriculumid", A).isdeleted = false;
    const restored = await served();
    expect(ids(restored.curriculums, "curriculumid")).toEqual([B]);
    expect(ids(restored.lessons, "lessonid")).toEqual([LB]);
    // only a new publish brings it back
    await publish(A);
    expect(ids((await served()).curriculums, "curriculumid")).toEqual(sorted(A, B));
  });

  it("a curriculum republished after being retired is served again", async () => {
    await publish(A);
    await retireCurriculum(orgX, A);
    expect((await served()).curriculums).toEqual([]);
    await publish(A);
    expect(ids((await served()).curriculums, "curriculumid")).toEqual([A]);
  });

  it("an organisation with no published curriculum: the live tables and every content table empty", async () => {
    const payload = await served();
    for (const table of ["curriculums", "questions", "documents", "curriculumbaselines", "baselinequestion", "grades", "levels", "lessons", "lessonlearnings", "lessonlearningdocuments", "lessonplans", "lessonpractices", "lessonquizzes", "lessonpracticequestions", "lessonquizquestions", "levelquizquestions", "contenttranslations"]) {
      expect(payload[table]).toEqual([]);
    }
    expect(ids(payload.schools, "schoolid")).toEqual([SCHOOL]);
    expect(payload.schools[0].curriculums).toEqual([]);
    expect(ids(payload.subjects, "subjectid")).toEqual([SUBJECT]);
    expect(ids(payload.countries, "countryid")).toEqual([COUNTRY]);
    expect(contentProblems(payload)).toEqual([]);
  });

  it("another organisation's publications are not served", async () => {
    await publish(A);
    db.add("curriculumpublications", { ...db.tables.curriculumpublications[0], publicationid: id(4999), organisationid: Y, publishedat: new Date(clock + 5000) });
    expect(ids((await served()).curriculums, "curriculumid")).toEqual([A]);
  });

  it("a stored copy that is for another organisation, or has no payload, refuses the sync instead of dropping the curriculum", async () => {
    const res = await publish(A);
    const row = stored("curriculumpublications", "publicationid", res.publicationid);
    const kept = row.payload;
    row.payload = null;
    await expect(served()).rejects.toThrow("Content can't be sent");
    row.payload = { ...(kept as object), organisationid: Y };
    await expect(served()).rejects.toThrow("Content can't be sent");
    row.payload = kept;
    expect(ids((await served()).curriculums, "curriculumid")).toEqual([A]);
  });

  it("serves a curriculum's latest publication, not an older one", async () => {
    await publish(A);
    stored("lessons", "lessonid", L2).lessonname = "v2";
    await publish(A);
    stored("lessons", "lessonid", L2).lessonname = "v3";
    await publish(A);
    expect((await served()).lessons.map((l) => l.lessonname).sort()).toEqual(sorted(KHMER_LESSON, "v3"));
  });

  it("the payload has the shape of the export: the same keys in the same order, and the same sorted rows when every curriculum is published, nothing is edited and every bank row is used", async () => {
    // Q9 and D9 are used by no curriculum: a publication does not carry them (the design's condition: every bank row is referenced)
    db.tables.questions = db.tables.questions.filter((q) => q.questionid !== Q(9));
    db.tables.documents = db.tables.documents.filter((d) => d.documentid !== D(9));
    await publish(A);
    await publish(B);
    await publish(C);
    const live = JSON.parse(JSON.stringify(await buildOrganisationContent(organisation()))) as Record<string, unknown>;
    const publishedPayload = await served();
    expect(Object.keys(publishedPayload)).toEqual(Object.keys(live));
    const canonical = (rows: Row[], table: string) => rows.map((r) => JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !["created_at", "updated_at", "deleted_at", "created_by", "updated_by", "deleted_by", "lastupdated"].includes(k)).sort(([a], [b]) => a.localeCompare(b))))).sort().join("\n") + table;
    for (const table of Object.keys(live)) {
      if (!Array.isArray(live[table])) continue;
      expect(canonical(publishedPayload[table], table)).toBe(canonical(live[table] as Row[], table));
    }
  });

  describe("translations", () => {
    it("a shared question's translation comes with the copy that is served", async () => {
      await publish(A);
      await publish(B);
      db.tables.contenttranslations.find((t) => t.translationid === T(1))!.text = "edited km";
      await publish(B);
      const payload = await served();
      expect(payload.contenttranslations.map((t) => [t.translationid, t.text]).sort()).toEqual([[T(1), "edited km"], [T(2), "lessonname (km)"]].sort());
      expect(repeated(payload)).toEqual([]);
    });

    it("a translation in the organisation's own content language is left out, and all of them while it has none", async () => {
      await publish(A);
      db.tables.contenttranslations.push({ ...translation(3, "lessons", L2, "lessonname", "Lesson two", { language: "en" }) });
      expect(ids((await served("en")).contenttranslations, "translationid")).toEqual(sorted(T(1), T(2)));
      expect((await served(null)).contenttranslations).toEqual([]);
      expect((await served(null)).organisations[0].contentlanguage).toBeNull();
    });

    it("a translation published with a lesson is not served after that lesson's curriculum is retired", async () => {
      await publish(A);
      await retireCurriculum(orgX, A);
      expect((await served()).contenttranslations).toEqual([]);
    });
  });
});
