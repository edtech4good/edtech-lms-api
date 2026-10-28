import { createHash } from "crypto";
import { dbinstance } from "src/services/dbservice";
import { OrgContext } from "src/decorators/org.decorator";
import { ContentFake } from "src/test-support/content-fake";
import {
  confineCurriculumTables,
  diffHashes,
  hashTables,
  payloadHashOf,
  payloadOf,
  publicationOverview,
  publishCurriculum,
  readLiveSubjects,
  rowHash,
  selectCurriculumTables,
  Tables,
} from "./curriculum-publication";
import { contextOfOrganisation, readCurriculumContent, Row } from "./organisation-content-export";
import { lessons } from "src/models/data-models/lessons";

/**
 * Translations in a curriculum's publication (bilingual content, decision 10): the payload carries the translations of
 * every row it carries, the pulled-in questions included; a translation is a row with its own hash; the summary counts
 * them; and a payload with none hashes as it did before the table existed.
 */
const db = new ContentFake();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orgX: OrgContext = { organisationid: X, isplatform: false, permissions: [] };
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const AT = new Date("2026-10-28T05:00:00.000Z");
const OPT1 = "11111111-1111-4111-8111-111111111111-opt-1";

const [A, B] = [id(100), id(200)];
const [GA, VA, L1, L2] = [id(101), id(102), id(103), id(104)];
const [GB, VB, LB] = [id(201), id(202), id(203)];
const [Q1, Q9] = [id(501), id(509)];
const T = (n: number) => id(900 + n);

const translation = (n: number, tablename: string, rowid: string, field: string, base: string, over: Row = {}, subkey = "") => ({
  translationid: T(n), organisationid: X, tablename, rowid, field, subkey, language: "km", text: `${field} (km)`, sourcehash: sha(base), lastupdated: AT, ...over,
});

const seed = (contentlanguage: string | null = "en") => {
  db.add("organisations", { organisationid: X, contentlanguage });
  db.add("curriculums", { curriculumid: A, curriculumname: "Reading", organisationid: X, curriculumstatus: true });
  db.add("curriculums", { curriculumid: B, curriculumname: "Maths", organisationid: X, curriculumstatus: true });
  db.add("grades", { gradeid: GA, curriculumid: A, gradename: "Grade A", gradeorder: 1, gradestatus: true });
  db.add("levels", { levelid: VA, gradeid: GA, levelname: "Level A", levelorder: 1, levelstatus: true });
  for (const [lessonid, name, order] of [[L1, "Lesson one", 1], [L2, "Lesson two", 2]] as const) {
    db.add("lessons", { lessonid, levelid: VA, lessonname: name, lessondescription: `${name} description`, lessonorder: order, lessonstatus: true, total_points: 1, passing_points: 0 });
  }
  db.add("grades", { gradeid: GB, curriculumid: B, gradename: "Grade B", gradeorder: 1, gradestatus: true });
  db.add("levels", { levelid: VB, gradeid: GB, levelname: "Level B", levelorder: 1, levelstatus: true });
  db.add("lessons", { lessonid: LB, levelid: VB, lessonname: "Lesson maths", lessonorder: 1, lessonstatus: true, total_points: 1, passing_points: 0 });
  db.add("questions", {
    questionid: Q1, questionidentifier: "q-1", questiontext: "Question one", templatetypeid: 1, organisationid: X, questionstatus: true,
    questionoptions: [{ questionoptionid: OPT1, questionoptiontext: "Cat", questionoptioniscorrect: true, questionoptionsequence: 1 }],
  });
  db.add("questions", { questionid: Q9, questionidentifier: "q-9", questiontext: "Question nine", templatetypeid: 1, organisationid: X, questionstatus: true });
  // A's practice uses Q1; B's quiz uses Q1 as well; nobody uses Q9
  db.add("lessonpractices", { lessonpracticeid: id(703), lessonid: L1, lessonpracticename: "Practice", lessonpracticeorder: 1, lessonpracticestatus: true, points: 10 });
  db.add("lessonpracticequestions", { lessonpracticequestionid: id(705), lessonpracticeid: id(703), questionid: Q1, lessonpracticequestionorder: 1, lessonpracticequestionstatus: true });
  db.add("lessonquizzes", { lessonquizid: id(804), lessonid: LB, lessonquizname: "Maths quiz", lessonquizorder: 1, lessonquizstatus: true, points: 10 });
  db.add("lessonquizquestions", { lessonquizquestionid: id(806), lessonquizid: id(804), questionid: Q1, lessonquizquestionorder: 1, lessonquizquestionstatus: true });
  // translations: A's curriculum and lesson one, the shared question's option, B's lesson, and an unused question
  db.add("contenttranslations", translation(1, "curriculums", A, "curriculumname", "Reading"));
  db.add("contenttranslations", translation(2, "lessons", L1, "lessonname", "Lesson one"));
  db.add("contenttranslations", translation(3, "questions", Q1, "questionoptiontext", "Cat", {}, OPT1));
  db.add("contenttranslations", translation(4, "lessons", LB, "lessonname", "Lesson maths"));
  db.add("contenttranslations", translation(5, "questions", Q9, "questiontext", "Question nine"));
};

const transaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" } };
beforeEach(() => {
  jest.restoreAllMocks();
  db.install();
  transaction.commit.mockClear();
  jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
});

const content = async (): Promise<Tables> => readCurriculumContent(orgX) as Promise<Tables>;
const ids = (rows: Row[], key: string) => rows.map((r) => r[key] as string).sort();
const sorted = (...v: string[]) => [...v].sort();
const stored = (table: Parameters<ContentFake["add"]>[0], key: string, value: string) => db.tables[table].find((r) => r[key] === value)!;

describe("the closure and the translations", () => {
  beforeEach(() => seed());

  it("a curriculum's payload carries the translations of its own rows and of the bank rows it pulls in, and no others", async () => {
    const t = selectCurriculumTables(await content(), A);
    // the curriculum, lesson one, and the option of the question the practice names; not B's lesson, not the unused question
    expect(ids(t.contenttranslations, "translationid")).toEqual(sorted(T(1), T(2), T(3)));
    expect(ids(t.questions, "questionid")).toEqual([Q1]);
  });

  it("the same shared question's translation is in the other curriculum's payload too, and A's rows' translations are not", async () => {
    const t = selectCurriculumTables(await content(), B);
    expect(ids(t.contenttranslations, "translationid")).toEqual(sorted(T(3), T(4)));
  });

  it("a translation is picked through its parent only: a question nobody in the curriculum names takes its translation with it", async () => {
    const t = selectCurriculumTables(await content(), A);
    expect(ids(t.contenttranslations, "translationid")).not.toContain(T(5));
  });

  it("has every table present, seventeen with the translations, empty when there are none", async () => {
    db.tables.contenttranslations = [];
    const t = selectCurriculumTables(await content(), A);
    expect(t.contenttranslations).toEqual([]);
    expect(Object.keys(t)).toHaveLength(17);
    expect(Object.keys(t)[16]).toBe("contenttranslations");
  });

  it("takes no translation when the organisation has no content language, and none in that language", async () => {
    db.tables.organisations[0].contentlanguage = null;
    expect(selectCurriculumTables(await content(), A).contenttranslations).toEqual([]);
    db.tables.organisations[0].contentlanguage = "km";
    expect(selectCurriculumTables(await content(), A).contenttranslations).toEqual([]);
  });

  it("keeps a stale translation (the translator's text is kept; the student API does not serve it)", async () => {
    stored("lessons", "lessonid", L1).lessonname = "Lesson uno";
    expect(ids(selectCurriculumTables(await content(), A).contenttranslations, "translationid")).toContain(T(2));
  });

  it("confine refuses a payload that holds a translation of a row it does not carry (publishing never drops a row quietly)", async () => {
    const picked = selectCurriculumTables(await content(), A);
    const orphan = { ...picked, contenttranslations: [...picked.contenttranslations, { ...picked.contenttranslations[0], translationid: T(80), tablename: "lessons", rowid: id(999) }] };
    expect(() => confineCurriculumTables(orphan, [])).toThrow("contenttranslations: 1 row hang from a row that is not in this curriculum.");
  });

  it("publishes the translations in the stored payload", async () => {
    await publishCurriculum(orgX, id(7), A);
    const payload = db.createdIn("curriculumpublications")[0].payload as { tables: Tables };
    expect(ids(payload.tables.contenttranslations, "translationid")).toEqual(sorted(T(1), T(2), T(3)));
    const summary = db.createdIn("curriculumpublications")[0].summary as { counts: Record<string, number>; changes: Record<string, unknown> };
    expect(summary.counts.contenttranslations).toBe(3);
    expect(summary.changes.contenttranslations).toEqual({ added: 3, removed: 0, changed: 0 });
  });
});

describe("hashes", () => {
  beforeEach(() => seed());
  const hashesOf = async (curriculumid: string) => hashTables(payloadOf(X, await content(), curriculumid, await readLiveSubjects(X)).tables);

  it("a translation row has a hash of its own columns: its text, its hash and its key", async () => {
    const before = await hashesOf(A);
    expect(Object.keys(before.contenttranslations).sort()).toEqual(sorted(T(1), T(2), T(3)));
    stored("contenttranslations", "translationid", T(2)).text = "edited";
    const after = await hashesOf(A);
    expect(after.contenttranslations[T(2)]).not.toBe(before.contenttranslations[T(2)]);
    expect(after.contenttranslations[T(1)]).toBe(before.contenttranslations[T(1)]);
    expect(payloadHashOf(after)).not.toBe(payloadHashOf(before));
    expect(diffHashes(after, before).contenttranslations).toEqual({ added: [], removed: [], changed: [T(2)] });
  });

  it("saving a translation again with the same text is not a change (its time is left out of the hash, as every audit column is)", async () => {
    const before = await hashesOf(A);
    stored("contenttranslations", "translationid", T(2)).lastupdated = new Date("2027-01-01T00:00:00.000Z");
    expect(payloadHashOf(await hashesOf(A))).toBe(payloadHashOf(before));
  });

  it("a text updated in place keeps its id, so it is one changed row and not a removed and an added one", async () => {
    const before = await hashesOf(A);
    const row = stored("contenttranslations", "translationid", T(3));
    row.text = "other text";
    row.sourcehash = sha("Dog");
    const diff = diffHashes(await hashesOf(A), before).contenttranslations;
    expect(diff).toEqual({ added: [], removed: [], changed: [T(3)] });
  });

  it("a translation that is deleted is a removed row; one that is added is an added row", async () => {
    const before = await hashesOf(A);
    db.tables.contenttranslations = db.tables.contenttranslations.filter((t) => t.translationid !== T(1));
    db.add("contenttranslations", translation(6, "lessons", L2, "lessonname", "Lesson two"));
    const diff = diffHashes(await hashesOf(A), before).contenttranslations;
    expect(diff).toEqual({ added: [T(6)], removed: [T(1)], changed: [] });
  });

  it("a payload with no translations hashes as it did before the table existed, so a curriculum published earlier does not show as changed", () => {
    const earlier = { curriculums: { a: "1" }, lessons: { b: "2" } };
    expect(payloadHashOf({ ...earlier, contenttranslations: {} })).toBe(payloadHashOf(earlier));
    expect(payloadHashOf({ ...earlier, contenttranslations: { t: "3" } })).not.toBe(payloadHashOf(earlier));
  });

  it("the hash of a row ignores nothing of a translation but the audit columns", () => {
    const row = { translationid: T(1), organisationid: X, tablename: "lessons", rowid: L1, field: "lessonname", subkey: "", language: "km", text: "t", sourcehash: sha("x"), lastupdated: AT };
    expect(rowHash({ ...row, lastupdated: new Date("2030-01-01") })).toBe(rowHash(row));
    for (const change of [{ text: "u" }, { sourcehash: sha("y") }, { language: "fr" }, { subkey: "k" }, { rowid: L2 }]) {
      expect(rowHash({ ...row, ...change })).not.toBe(rowHash(row));
    }
  });
});

describe("the overview's coverage", () => {
  beforeEach(() => seed());

  // a read of the organisation's content is a read of its lessons (every curriculum's content has them), through the export's reader
  const contentReads = (): number => (jest.mocked(lessons.findAll) as unknown as jest.Mock).mock.calls.length;
  const clearReads = () => (jest.mocked(lessons.findAll) as unknown as jest.Mock).mockClear();

  it("is not there before the curriculum is ever published, and reads none of the organisation's content", async () => {
    clearReads();
    const overview = await publicationOverview(orgX, A);
    expect(overview.publicationstatus).toBe("never");
    expect(overview.translationcoverage).toBeNull();
    expect(overview.pending).toBeNull();
    expect(contentReads()).toBe(0);
  });

  it("is there once it is published (untranslated and stale per lesson, per language), from one read of the content", async () => {
    await publishCurriculum(orgX, id(7), A);
    stored("lessons", "lessonid", L1).lessonname = "Lesson uno"; // T(2) is now stale
    clearReads();
    await readCurriculumContent(contextOfOrganisation(X)); // the read the overview makes
    const oneRead = contentReads();
    expect(oneRead).toBeGreaterThan(0);
    clearReads();
    const overview = await publicationOverview(orgX, A);
    expect(overview.publicationstatus).toBe("published");
    // the same number of reads of the tables as ONE read of the organisation's content: the coverage and the pending change share it
    expect(contentReads()).toBe(oneRead);
    const km = overview.translationcoverage!.languages.km;
    expect(overview.translationcoverage!.contentlanguage).toBe("en");
    expect(km.lessons[L1]).toEqual({ untranslated: expect.any(Number), stale: 1 });
    expect(km.lessons[L2].stale).toBe(0);
    // the pending change is worked out from the same rows
    expect(overview.changedsincepublish).toBe(true);
  });

  it("counts only the curriculum's own lessons, not those of the organisation's other curricula", async () => {
    await publishCurriculum(orgX, id(7), A);
    const overview = await publicationOverview(orgX, A);
    expect(Object.keys(overview.translationcoverage!.languages.km.lessons).sort()).toEqual(sorted(L1, L2));
    expect(JSON.stringify(overview.translationcoverage)).not.toContain(LB);
  });
});
