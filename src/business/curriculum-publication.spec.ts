import { OrgContext } from "src/decorators/org.decorator";
import { ApiError } from "src/models/ApiError";
import { curriculumpublications } from "src/models/data-models/curriculumpublications";
import { questions } from "src/models/data-models/questions";
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import {
  canonicalJson,
  changedSincePublish,
  confineCurriculumTables,
  diffHashes,
  hashTables,
  NAME_LIMIT,
  payloadHashOf,
  payloadOf,
  publicationOverview,
  publicationStates,
  publishCurriculum,
  publishingOrganisation,
  retireCurriculum,
  rowHash,
  selectCurriculumTables,
  sharedRows,
  summarise,
  Tables,
} from "./curriculum-publication";
import { readCurriculumContent } from "./organisation-content-export";

/**
 * Publishing one curriculum: the payload builder's pure functions (closure, confine, hashes, diff) and the publish and
 * retire acts against an in-memory copy of the tables. The routes, the scope and the other organisations are proved over
 * HTTP in modules/content-scope.leak.spec.ts.
 */
const db = new ContentFake();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const orgX: OrgContext = { organisationid: X, isplatform: false, permissions: [] };
const platform: OrgContext = { organisationid: null, isplatform: true, permissions: [] };
const USER = id(7);

// Curriculum A (id 100s): grade, level, lesson L1 and L2; L1 holds a learning item (document D1), a plan (document D2), a practice
// (question Q1), a quiz (questions Q1 and Q2); the level has a level quiz question (Q3, on L1); a baseline holds Q4.
// Curriculum B (id 200s): one lesson whose quiz uses Q1 (shared with A). The bank also holds Q9 and D9, which nobody uses, and
// Y has a curriculum and a question of its own.
const A = id(100), B = id(200), CY = id(300);
const [GA, VA, L1, L2] = [id(101), id(102), id(103), id(104)];
const [GB, VB, LB] = [id(201), id(202), id(203)];
const Q = (n: number) => id(500 + n);
const D = (n: number) => id(600 + n);

const lessonRow = (lessonid: string, levelid: string, name: string, order: number) => ({
  lessonid, levelid, lessonname: name, lessonorder: order, lessonstatus: true, total_points: 100, passing_points: 0,
});

const seed = () => {
  db.add("curriculums", { curriculumid: A, curriculumname: "Reading", organisationid: X, curriculumstatus: true });
  db.add("curriculums", { curriculumid: B, curriculumname: "Maths", organisationid: X, curriculumstatus: true });
  db.add("curriculums", { curriculumid: CY, curriculumname: "Other", organisationid: Y, curriculumstatus: true });
  db.add("grades", { gradeid: GA, curriculumid: A, gradename: "Grade A", gradeorder: 1, gradestatus: true });
  db.add("levels", { levelid: VA, gradeid: GA, levelname: "Level A", levelorder: 1, levelstatus: true });
  db.add("lessons", lessonRow(L1, VA, "Lesson one", 1));
  db.add("lessons", lessonRow(L2, VA, "Lesson two", 2));
  db.add("grades", { gradeid: GB, curriculumid: B, gradename: "Grade B", gradeorder: 1, gradestatus: true });
  db.add("levels", { levelid: VB, gradeid: GB, levelname: "Level B", levelorder: 1, levelstatus: true });
  db.add("lessons", lessonRow(LB, VB, "Lesson maths", 1));
  for (const n of [1, 2, 3, 4, 9]) {
    db.add("questions", { questionid: Q(n), questionidentifier: `q-${n}`, questiontext: `Question ${n}`, templatetypeid: 1, organisationid: X, questionstatus: true });
  }
  db.add("questions", { questionid: Q(50), questionidentifier: "q-theirs", templatetypeid: 1, organisationid: Y, questionstatus: true });
  for (const n of [1, 2, 9]) db.add("documents", { documentid: D(n), documentname: `doc-${n}.png`, documenttypeid: 2, organisationid: X, documenttags: [] });
  db.add("lessonlearnings", { lessonlearningid: id(701), lessonid: L1, documentid: D(1), lessonlearningname: "Learning", lessonlearningorder: 1, lessonlearningstatus: true });
  db.add("lessonplans", { lessonplanid: id(702), lessonid: L1, documentid: D(2), lessonplanname: "Plan", lessonplanorder: 1, lessonplanstatus: true });
  db.add("lessonpractices", { lessonpracticeid: id(703), lessonid: L1, lessonpracticename: "Practice", lessonpracticeorder: 1, lessonpracticestatus: true, points: 10 });
  db.add("lessonquizzes", { lessonquizid: id(704), lessonid: L1, lessonquizname: "Quiz", lessonquizorder: 1, lessonquizstatus: true, points: 10 });
  db.add("lessonpracticequestions", { lessonpracticequestionid: id(705), lessonpracticeid: id(703), questionid: Q(1), lessonpracticequestionorder: 1, lessonpracticequestionstatus: true });
  db.add("lessonquizquestions", { lessonquizquestionid: id(706), lessonquizid: id(704), questionid: Q(1), lessonquizquestionorder: 1, lessonquizquestionstatus: true });
  db.add("lessonquizquestions", { lessonquizquestionid: id(707), lessonquizid: id(704), questionid: Q(2), lessonquizquestionorder: 2, lessonquizquestionstatus: true });
  db.add("levelquizquestions", { levelquizquestionid: id(708), levelid: VA, questionid: Q(3), lessonid: L1, levelquizquestionorder: 1, levelquizquestionstatus: true });
  db.add("curriculumbaseline", { curriculumbaselineid: id(709), curriculumid: A, baselineid: A, baselinename: "Baseline", baselinetype: 1, baselinestatus: true, schoolid: [] });
  db.add("baselinequestion", { baselinequestionid: id(710), curriculumbaselineid: id(709), questionid: Q(4), baselinequestionorder: 1, baselinequestionstatus: true });
  // B's quiz uses Q1 as well
  db.add("lessonquizzes", { lessonquizid: id(804), lessonid: LB, lessonquizname: "Maths quiz", lessonquizorder: 1, lessonquizstatus: true, points: 10 });
  db.add("lessonquizquestions", { lessonquizquestionid: id(806), lessonquizid: id(804), questionid: Q(1), lessonquizquestionorder: 1, lessonquizquestionstatus: true });
};

const transaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" } };

beforeEach(() => {
  jest.restoreAllMocks();
  db.install();
  seed();
  transaction.commit.mockClear();
  transaction.rollback.mockClear();
  jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
});

const content = async (): Promise<Tables> => readCurriculumContent(orgX) as Promise<Tables>;
const ids = (rows: Array<Record<string, unknown>>, key: string) => rows.map((r) => r[key] as string).sort();
const sorted = (...v: string[]) => [...v].sort();
const stored = (table: Parameters<ContentFake["add"]>[0], key: string, value: string) => db.tables[table].find((r) => r[key] === value)!;
const publications = () => db.tables.curriculumpublications;

describe("hashing", () => {
  it("is the sha256 of the key-sorted JSON: key order, at any depth, does not change it; a value does", () => {
    const a = { b: 1, a: { d: [1, { y: 1, x: 2 }], c: null } };
    const b = { a: { c: null, d: [1, { x: 2, y: 1 }] }, b: 1 };
    expect(canonicalJson(a)).toBe('{"a":{"c":null,"d":[1,{"x":2,"y":1}]},"b":1}');
    expect(rowHash(a)).toBe(rowHash(b));
    expect(rowHash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(rowHash({ ...a, b: 2 })).not.toBe(rowHash(a));
    // an array keeps its order
    expect(rowHash({ l: [1, 2] })).not.toBe(rowHash({ l: [2, 1] }));
  });

  it("reads a date as its ISO text, so a date and its text hash alike", () => {
    expect(rowHash({ at: new Date("2026-01-01T00:00:00.000Z") })).toBe(rowHash({ at: "2026-01-01T00:00:00.000Z" }));
  });

  it("does not depend on the order the rows were read in", async () => {
    const all = await content();
    const one = payloadOf(X, all, A).tables;
    const reversed = Object.fromEntries(Object.entries(one).map(([k, rows]) => [k, [...rows].reverse()])) as Tables;
    expect(payloadHashOf(hashTables(reversed))).toBe(payloadHashOf(hashTables(one)));
  });

  it("changes when one field of one row does", async () => {
    const before = payloadHashOf(hashTables(payloadOf(X, await content(), A).tables));
    stored("lessons", "lessonid", L1).lessonname = "Lesson uno";
    expect(payloadHashOf(hashTables(payloadOf(X, await content(), A).tables))).not.toBe(before);
  });
});

describe("the curriculum's rows and the closure", () => {
  it("takes the curriculum, what hangs from it, and exactly the questions and documents those rows name", async () => {
    const t = selectCurriculumTables(await content(), A);
    expect(ids(t.curriculums, "curriculumid")).toEqual([A]);
    expect(ids(t.grades, "gradeid")).toEqual([GA]);
    expect(ids(t.lessons, "lessonid")).toEqual(sorted(L1, L2));
    expect(ids(t.lessonquizquestions, "lessonquizquestionid")).toEqual(sorted(id(706), id(707)));
    // questions named by a practice link (Q1), quiz links (Q1, Q2), a level-quiz link (Q3) and a baseline question (Q4); never Q9 or Y's
    expect(ids(t.questions, "questionid")).toEqual(sorted(Q(1), Q(2), Q(3), Q(4)));
    // documents named by a learning item (D1) and a plan (D2); never D9
    expect(ids(t.documents, "documentid")).toEqual(sorted(D(1), D(2)));
    // and nothing of B's
    expect(ids(t.lessons, "lessonid")).not.toContain(LB);
    expect(ids(t.lessonquizzes, "lessonquizid")).toEqual([id(704)]);
  });

  it("picks a document named only by a learning item's link row", async () => {
    db.add("lessonlearningdocuments", { lessonlearningdocumentid: id(711), lessonlearningid: id(701), documentid: D(9), lessonlearningdocumentrole: "asset", lessonlearningdocumentorder: 1 });
    const t = selectCurriculumTables(await content(), A);
    expect(ids(t.documents, "documentid")).toEqual(sorted(D(1), D(2), D(9)));
    expect(ids(t.lessonlearningdocuments, "lessonlearningdocumentid")).toEqual([id(711)]);
  });

  it("puts a question that two curricula share in both payloads", async () => {
    const all = await content();
    expect(ids(selectCurriculumTables(all, A).questions, "questionid")).toContain(Q(1));
    expect(ids(selectCurriculumTables(all, B).questions, "questionid")).toEqual([Q(1)]);
  });

  it("is a payload with every table present, empty when there is nothing", async () => {
    const t = selectCurriculumTables(await content(), B);
    expect(t.lessonlearningdocuments).toEqual([]);
    expect(t.curriculumbaselines).toEqual([]);
    expect(Object.keys(t)).toHaveLength(16);
  });

  it("closes over the bank without a document: remove the documents and the payload is refused for the learning item that names one", async () => {
    const all = await content();
    const picked = selectCurriculumTables(all, A);
    expect(() => confineCurriculumTables({ ...picked, documents: [] })).toThrow(ApiError);
  });
});

describe("confine", () => {
  it("refuses a payload whose row names a question that is not in the bank (another organisation's, or gone), naming table and count only", async () => {
    stored("lessonquizquestions", "lessonquizquestionid", id(706)).questionid = Q(50);
    const all = await content();
    let thrown: ApiError | undefined;
    try {
      payloadOf(X, all, A);
    } catch (e) {
      thrown = e as ApiError;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown!.getStatus()).toBe(400);
    expect(thrown!.message).toBe("This curriculum can't be published yet. lessonquizquestions: 1 row names a question that is not this organisation's.");
    expect(thrown!.hint).toBe("Fix or remove the rows named, then publish again. Nothing was published.");
    expect(thrown!.fields).toEqual([{ field: "lessonquizquestions", message: "lessonquizquestions: 1 row names a question that is not this organisation's." }]);
    expect(JSON.stringify(thrown)).not.toContain(Q(50));
  });

  it("refuses a payload that confine would trim (a row whose parent is not in it), naming table and count", async () => {
    const picked = selectCurriculumTables(await content(), A);
    const orphan = { ...picked, lessonquizquestions: [...picked.lessonquizquestions, { lessonquizquestionid: id(999), lessonquizid: id(998), questionid: Q(1) }] };
    expect(() => confineCurriculumTables(orphan)).toThrow("lessonquizquestions: 1 row hang from a row that is not in this curriculum.");
  });

  it("refuses a curriculum that is deleted or absent as a curriculum that is not there", async () => {
    stored("curriculums", "curriculumid", B).isdeleted = true;
    const all = await content();
    for (const gone of [B, id(12345)]) {
      let thrown: ApiError | undefined;
      try {
        payloadOf(X, all, gone);
      } catch (e) {
        thrown = e as ApiError;
      }
      expect(thrown!.getStatus()).toBe(404);
    }
  });
});

describe("the diff", () => {
  const hashesOf = async (curriculumid: string) => hashTables(payloadOf(X, await content(), curriculumid).tables);

  it("is exact per table: added, removed and changed ids", async () => {
    const before = await hashesOf(A);
    stored("lessons", "lessonid", L1).lessonname = "Lesson uno";
    db.tables.lessons = db.tables.lessons.filter((l) => l.lessonid !== L2);
    db.add("lessons", lessonRow(id(105), VA, "Lesson three", 3));
    const diff = diffHashes(await hashesOf(A), before);
    expect(diff.lessons).toEqual({ added: [id(105)], removed: [L2], changed: [L1] });
    for (const [table, d] of Object.entries(diff)) if (table !== "lessons") expect(d).toEqual({ added: [], removed: [], changed: [] });
  });

  it("treats every row as added when there is nothing to compare with", async () => {
    const diff = diffHashes(await hashesOf(A), null);
    expect(diff.lessons.added.sort()).toEqual(sorted(L1, L2));
    expect(diff.lessons.removed).toEqual([]);
  });
});

describe("the summary", () => {
  it("names the lessons and questions affected, and keeps names so that a later publish can name what it removed", async () => {
    const first = payloadOf(X, await content(), A).tables;
    const firstSummary = summarise(first, hashTables(first), null);
    expect(firstSummary.previous).toBeNull();
    expect(firstSummary.affected.lessons.added).toEqual(expect.arrayContaining([{ id: L1, name: "Lesson one" }, { id: L2, name: "Lesson two" }]));
    expect(firstSummary.names.questions[Q(1)]).toBe("q-1");

    stored("lessons", "lessonid", L1).lessonname = "Lesson uno";
    db.tables.lessons = db.tables.lessons.filter((l) => l.lessonid !== L2);
    const second = payloadOf(X, await content(), A).tables;
    const s = summarise(second, hashTables(second), { publicationid: "p1", summary: firstSummary });
    expect(s.previous).toBe("p1");
    expect(s.changes.lessons).toEqual({ added: 0, removed: 1, changed: 1 });
    expect(s.affected.lessons).toEqual({ added: [], removed: [{ id: L2, name: "Lesson two" }], changed: [{ id: L1, name: "Lesson uno" }] });
    expect(s.counts.lessons).toBe(1);
  });

  it("keeps the counts exact and lists at most NAME_LIMIT names of a kind, saying it cut", async () => {
    const many: Tables = { ...(selectCurriculumTables(await content(), A)) };
    many.lessons = Array.from({ length: NAME_LIMIT + 5 }, (_, n) => lessonRow(id(10000 + n), VA, `Lesson ${n}`, n));
    const s = summarise(many, hashTables(many), null);
    expect(s.changes.lessons.added).toBe(NAME_LIMIT + 5);
    expect(s.affected.lessons.added).toHaveLength(NAME_LIMIT);
    expect(s.affected.truncated).toBe(true);
  });

  it("names the bank rows a publish adds or changes that another curriculum also uses, and that curriculum", async () => {
    const all = await content();
    const mine = payloadOf(X, all, B).tables;
    const diff = diffHashes(hashTables(mine), null);
    expect(sharedRows(all, B, mine, diff)).toEqual([{ table: "questions", id: Q(1), name: "q-1", curricula: [{ id: A, name: "Reading" }] }]);
    // nothing is shared when nothing of the shared row is touched
    expect(sharedRows(all, B, mine, diffHashes(hashTables(mine), hashTables(mine)))).toEqual([]);
  });
});

describe("publishing", () => {
  it("stores the payload, its hashes and a summary, as the caller's organisation, and answers without the hashes", async () => {
    const res = await publishCurriculum(orgX, USER, A);
    expect(publications()).toHaveLength(1);
    const row = publications()[0];
    expect(row).toMatchObject({ publicationid: res.publicationid, curriculumid: A, organisationid: X, publishedby: USER, status: "published" });
    expect(row.publishedat).toEqual(res.publishedat);
    expect(row.payloadhash).toBe(payloadHashOf(hashTables(payloadOf(X, await content(), A).tables)));
    expect(Object.keys((row.summary as { hashes: object }).hashes)).toHaveLength(16);
    expect(Object.keys(res.summary).sort()).toEqual(["affected", "changes", "counts", "format", "previous", "shared"]);
    expect(res.summary.previous).toBeNull();
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it("is exact on a curriculum after one lesson rename and one question delete", async () => {
    await publishCurriculum(orgX, USER, A);
    stored("lessons", "lessonid", L1).lessonname = "Lesson uno";
    // delete the quiz link to Q2: Q2 is then named by nothing and leaves the payload
    db.tables.lessonquizquestions = db.tables.lessonquizquestions.filter((r) => r.lessonquizquestionid !== id(707));
    const res = await publishCurriculum(orgX, USER, A);
    expect(res.summary.changes).toEqual({
      ...Object.fromEntries(Object.keys(res.summary.changes).map((t) => [t, { added: 0, removed: 0, changed: 0 }])),
      lessons: { added: 0, removed: 0, changed: 1 },
      lessonquizquestions: { added: 0, removed: 1, changed: 0 },
      questions: { added: 0, removed: 1, changed: 0 },
    });
    expect(res.summary.affected.lessons.changed).toEqual([{ id: L1, name: "Lesson uno" }]);
    // the removed question is named although the payload that held it may be pruned: its name was kept
    expect(res.summary.affected.questions.removed).toEqual([{ id: Q(2), name: "q-2" }]);
  });

  it("changes a question soft-deleted as one changed row, still in the payload", async () => {
    await publishCurriculum(orgX, USER, A);
    stored("questions", "questionid", Q(2)).isdeleted = true;
    const res = await publishCurriculum(orgX, USER, A);
    expect(res.summary.changes.questions).toEqual({ added: 0, removed: 0, changed: 1 });
    expect(res.summary.affected.questions.changed).toEqual([{ id: Q(2), name: "q-2" }]);
  });

  it("records a publication even when nothing changed, with a summary of 0, 0, 0", async () => {
    await publishCurriculum(orgX, USER, A);
    const res = await publishCurriculum(orgX, USER, A);
    expect(publications()).toHaveLength(2);
    for (const change of Object.values(res.summary.changes)) expect(change).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(res.summary.affected).toEqual({ lessons: { added: [], removed: [], changed: [] }, questions: { added: [], removed: [], changed: [] }, truncated: false });
  });

  it("carries a shared question's change to the other curriculum's name in the summary", async () => {
    await publishCurriculum(orgX, USER, A);
    await publishCurriculum(orgX, USER, B);
    stored("questions", "questionid", Q(1)).questiontext = "Question one, edited";
    const res = await publishCurriculum(orgX, USER, B);
    expect(res.summary.changes.questions).toEqual({ added: 0, removed: 0, changed: 1 });
    expect(res.summary.shared).toEqual([{ table: "questions", id: Q(1), name: "q-1", curricula: [{ id: A, name: "Reading" }] }]);
    // and A now differs from its publication, though nothing of A's own was touched
    const overview = await publicationOverview(orgX, A);
    expect(overview.changedsincepublish).toBe(true);
  });

  it("gives each publication a later time than the one before, even when the clock has not moved", async () => {
    jest.useFakeTimers({ now: new Date("2026-10-27T03:00:00.000Z") });
    try {
      const first = await publishCurriculum(orgX, USER, A);
      const second = await publishCurriculum(orgX, USER, A);
      const third = await publishCurriculum(orgX, USER, A);
      expect([first, second, third].map((r) => r.publishedat.getTime())).toEqual([
        new Date("2026-10-27T03:00:00.000Z").getTime(),
        new Date("2026-10-27T03:00:00.001Z").getTime(),
        new Date("2026-10-27T03:00:00.002Z").getTime(),
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("refuses a curriculum of another organisation as an absent one, and a platform user who is not acting", async () => {
    await expect(publishCurriculum(orgX, USER, CY)).rejects.toMatchObject({ status: 404 });
    await expect(publishCurriculum(orgX, USER, id(4242))).rejects.toMatchObject({ status: 404 });
    await expect(publishCurriculum(platform, USER, A)).rejects.toMatchObject({ status: 400 });
    expect(publications()).toEqual([]);
    expect(() => publishingOrganisation(platform)).toThrow("Choose an organisation to act in before you publish a curriculum.");
  });

  it("rolls the transaction back and rethrows when the write fails", async () => {
    jest.spyOn(curriculumpublications, "create").mockRejectedValueOnce(new Error("disk"));
    await expect(publishCurriculum(orgX, USER, A)).rejects.toThrow("disk");
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
  });
});

describe("retention (decision 9)", () => {
  const payloadsOf = (curriculumid: string) =>
    publications()
      .filter((p) => p.curriculumid === curriculumid)
      .sort((a, b) => (a.publishedat as Date).getTime() - (b.publishedat as Date).getTime())
      .map((p) => p.payload !== null && p.payload !== undefined);

  it("keeps the payload of the latest two publications of a curriculum; older ones lose it and keep their summary", async () => {
    await publishCurriculum(orgX, USER, A);
    expect(payloadsOf(A)).toEqual([true]);
    await publishCurriculum(orgX, USER, A);
    expect(payloadsOf(A)).toEqual([true, true]);
    await publishCurriculum(orgX, USER, A);
    expect(payloadsOf(A)).toEqual([false, true, true]);
    await publishCurriculum(orgX, USER, A);
    await publishCurriculum(orgX, USER, A);
    expect(payloadsOf(A)).toEqual([false, false, false, true, true]);
    for (const p of publications()) {
      expect(p.summary).toBeTruthy();
      expect(p.payloadhash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("prunes one curriculum's publications and no other's", async () => {
    await publishCurriculum(orgX, USER, B);
    await publishCurriculum(orgX, USER, A);
    await publishCurriculum(orgX, USER, A);
    await publishCurriculum(orgX, USER, A);
    expect(payloadsOf(B)).toEqual([true]);
    expect(payloadsOf(A)).toEqual([false, true, true]);
  });

  it("compares with a publication whose payload was pruned, from its summary alone", async () => {
    await publishCurriculum(orgX, USER, A);
    await publishCurriculum(orgX, USER, A);
    await publishCurriculum(orgX, USER, A);
    stored("lessons", "lessonid", L2).lessonname = "Lesson dos";
    const res = await publishCurriculum(orgX, USER, A);
    expect(res.summary.affected.lessons.changed).toEqual([{ id: L2, name: "Lesson dos" }]);
  });
});

describe("retiring and the state", () => {
  it("withdraws the published rows, says so once, and is then a no-op that says it changed nothing", async () => {
    await publishCurriculum(orgX, USER, A);
    await publishCurriculum(orgX, USER, A);
    const first = await retireCurriculum(orgX, A);
    expect(first).toMatchObject({ curriculumid: A, retired: true, publicationstatus: "withdrawn", publishedat: null });
    // no older row is left `published` under a withdrawn latest one
    expect(publications().map((p) => p.status)).toEqual(["withdrawn", "withdrawn"]);
    const again = await retireCurriculum(orgX, A);
    expect(again).toMatchObject({ retired: false, publicationstatus: "withdrawn" });
  });

  it("answers a curriculum never published with retired false, and touches nothing", async () => {
    const res = await retireCurriculum(orgX, B);
    expect(res).toEqual({ curriculumid: B, retired: false, publicationid: null, publishedat: null, publicationstatus: "never" });
    expect(publications()).toEqual([]);
  });

  it("refuses another organisation's curriculum as an absent one, and a platform user who is not acting", async () => {
    await expect(retireCurriculum(orgX, CY)).rejects.toMatchObject({ status: 404 });
    await expect(retireCurriculum(platform, A)).rejects.toMatchObject({ status: 400 });
  });

  it("publishes again after a retire, with everything new against the learners' nothing", async () => {
    await publishCurriculum(orgX, USER, A);
    await retireCurriculum(orgX, A);
    const res = await publishCurriculum(orgX, USER, A);
    expect(res.summary.previous).toBeNull();
    expect(res.summary.changes.lessons).toEqual({ added: 2, removed: 0, changed: 0 });
    expect((await publicationStates([A])).get(A)).toMatchObject({ publicationstatus: "published", publicationid: res.publicationid, publishedat: res.publishedat });
  });

  it("reports never, published and withdrawn side by side", async () => {
    await publishCurriculum(orgX, USER, A);
    await publishCurriculum(orgX, USER, B);
    await retireCurriculum(orgX, B);
    const states = await publicationStates([A, B, CY]);
    expect([A, B, CY].map((c) => states.get(c)!.publicationstatus)).toEqual(["published", "withdrawn", "never"]);
    expect(states.get(B)!.publishedat).toBeNull();
    expect(states.get(A)!.publishedat).toBeInstanceOf(Date);
  });
});

describe("changed since publish", () => {
  const latestRow = async (curriculumid: string) => {
    const rows = await curriculumpublications.findAll({ where: { curriculumid }, order: [["publishedat", "DESC"]] });
    return rows[0] as never;
  };

  it("is false for what was just published, true after any edit to its rows, false again after a republish", async () => {
    await publishCurriculum(orgX, USER, A);
    expect((await publicationOverview(orgX, A)).changedsincepublish).toBe(false);
    stored("lessons", "lessonid", L1).lessonname = "Lesson uno";
    const changed = await publicationOverview(orgX, A);
    expect(changed.changedsincepublish).toBe(true);
    expect(changed.pending!.affected.lessons.changed).toEqual([{ id: L1, name: "Lesson uno" }]);
    await publishCurriculum(orgX, USER, A);
    expect((await publicationOverview(orgX, A)).changedsincepublish).toBe(false);
  });

  it("works every curriculum out of one read of the content", async () => {
    await publishCurriculum(orgX, USER, A);
    await publishCurriculum(orgX, USER, B);
    stored("lessons", "lessonid", LB).lessonname = "Lesson maths 2";
    jest.clearAllMocks();
    const states = new Map([[A, await latestRow(A)], [B, await latestRow(B)]]);
    const result = await changedSincePublish(X, states as never);
    expect([result.get(A)!.changed, result.get(B)!.changed]).toEqual([false, true]);
    // the question bank was read once for both
    expect((questions.findAll as unknown as jest.Mock).mock.calls).toHaveLength(1);
  });

  it("says a curriculum that cannot be published has changed, and why (tables and counts only)", async () => {
    await publishCurriculum(orgX, USER, A);
    stored("lessonquizquestions", "lessonquizquestionid", id(706)).questionid = Q(50);
    const overview = await publicationOverview(orgX, A);
    expect(overview.changedsincepublish).toBe(true);
    expect(overview.problem).toBe("This curriculum can't be published yet. lessonquizquestions: 1 row names a question that is not this organisation's.");
    expect(overview.pending).toBeNull();
  });

  it("is false for a curriculum never published or withdrawn, with no state to compare against", async () => {
    expect(await publicationOverview(orgX, A)).toEqual({
      curriculumid: A, publicationid: null, publishedat: null, publicationstatus: "never", changedsincepublish: false, problem: null, pending: null, latest: null,
    });
    await publishCurriculum(orgX, USER, A);
    await retireCurriculum(orgX, A);
    const withdrawn = await publicationOverview(orgX, A);
    expect(withdrawn).toMatchObject({ publicationstatus: "withdrawn", publishedat: null, changedsincepublish: false, pending: null });
    expect(withdrawn.latest!.status).toBe("withdrawn");
  });

  it("lets a platform user who is not acting read a curriculum through its owner; an unowned one has no state", async () => {
    await publishCurriculum(orgX, USER, A);
    expect((await publicationOverview(platform, A)).publicationstatus).toBe("published");
    db.add("curriculums", { curriculumid: id(400), curriculumname: "No owner", organisationid: null, curriculumstatus: true });
    await expect(publicationOverview(platform, id(400))).rejects.toMatchObject({ status: 404 });
  });
});
