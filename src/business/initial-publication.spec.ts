import { lmsusers } from "src/models/data-models/lmsusers";
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import { contentProblems } from "src/test-support/student-api-content-contract";
import { hashTables, payloadHashOf, publishCurriculum, retireCurriculum } from "./curriculum-publication";
import { initialPublisher, organisationsToPublish, parseArgs, publishInitial, SEEDED_PLATFORM_ACCOUNT } from "./initial-publication";
import { buildPublishedOrganisationContent } from "./published-content";
import { organisations } from "src/models/data-models/organisations";
import { Row } from "./organisation-content-export";

/** The one-shot initial publication (npm run publish:initial) against the in-memory tables; the live run is on a scratch database. */
const db = new ContentFake();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PUBLISHER = id(7);
const [A, B] = [id(100), id(200)];
const [CY1, CY2] = [id(300), id(400)];
const orgRow = (organisationid: string, organisationcode: string) => ({
  organisationid, organisationcode, organisationname: "Org", organisationstatus: true, uitheme: "kids", brandingconfig: null, settingsconfig: null, contentlanguage: null, isdeleted: false,
});

/** A curriculum with a grade, level, lesson and a quiz that uses one question of the owner. */
const tree = (organisationid: string, curriculumid: string, name: string, n: number) => {
  db.add("curriculums", { curriculumid, curriculumname: name, organisationid, curriculumstatus: true });
  db.add("grades", { gradeid: id(n + 1), curriculumid, gradename: name + " grade", gradeorder: 1, gradestatus: true });
  db.add("levels", { levelid: id(n + 2), gradeid: id(n + 1), levelname: "Level", levelorder: 1, levelstatus: true });
  db.add("lessons", { lessonid: id(n + 3), levelid: id(n + 2), lessonname: "មេរៀន " + name, lessonorder: 1, lessonstatus: true, total_points: 100, passing_points: 0 });
  db.add("questions", { questionid: id(n + 4), questionidentifier: "q" + n, questiontext: "Q", templatetypeid: 1, organisationid, questionstatus: true });
  db.add("lessonquizzes", { lessonquizid: id(n + 5), lessonid: id(n + 3), lessonquizname: "Quiz", lessonquizorder: 1, lessonquizstatus: true, points: 10 });
  db.add("lessonquizquestions", { lessonquizquestionid: id(n + 6), lessonquizid: id(n + 5), questionid: id(n + 4), lessonquizquestionorder: 1, lessonquizquestionstatus: true });
};

const transaction = { commit: jest.fn(), rollback: jest.fn(), LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" } };
beforeEach(() => {
  jest.restoreAllMocks();
  db.install();
  transaction.commit.mockClear();
  transaction.rollback.mockClear();
  jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
  db.add("organisations", orgRow(X, "xorg"));
  db.add("organisations", orgRow(Y, "yorg"));
  tree(X, A, "Reading", 1000);
  tree(X, B, "Maths", 2000);
  tree(Y, CY1, "Other", 3000);
  tree(Y, CY2, "Another", 4000);
});

const publications = () => db.tables.curriculumpublications;

describe("publishInitial", () => {
  it("publishes every curriculum that has no publication, one row each, and says which", async () => {
    const out = await publishInitial(X, PUBLISHER);
    expect(out).toEqual({ organisationid: X, status: "published", curricula: [B, A], problems: [] }); // by curriculum name: Maths, Reading
    expect(publications().map((p) => p.curriculumid).sort()).toEqual([A, B].sort());
    for (const p of publications()) {
      expect(p).toMatchObject({ organisationid: X, publishedby: PUBLISHER, status: "published" });
      const payload = p.payload as { tables: Parameters<typeof hashTables>[0]; curriculumid: string };
      expect(payload.curriculumid).toBe(p.curriculumid);
      expect(p.payloadhash).toBe(payloadHashOf(hashTables(payload.tables)));
      expect((p.summary as { previous: string | null }).previous).toBeNull();
    }
    // the other organisation is untouched
    expect(publications().some((p) => p.organisationid === Y)).toBe(false);
    // one transaction
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    // times are strictly increasing, so no two of a run tie
    const times = publications().map((p) => (p.publishedat as Date).getTime());
    expect(new Set(times).size).toBe(times.length);
  });

  it("the row is the row a publish makes: the same payload hash as publishing the curriculum by hand", async () => {
    await publishInitial(X, PUBLISHER);
    const initial = publications().find((p) => p.curriculumid === A)!;
    db.tables.curriculumpublications = [];
    await publishCurriculum({ organisationid: X, isplatform: false, permissions: [] }, PUBLISHER, A);
    expect(publications()[0].payloadhash).toBe(initial.payloadhash);
  });

  it("run again, it publishes nothing and writes nothing", async () => {
    await publishInitial(X, PUBLISHER);
    const snapshot = JSON.stringify(db.snapshot());
    db.created.length = 0;
    expect(await publishInitial(X, PUBLISHER)).toEqual({ organisationid: X, status: "nothing", curricula: [], problems: [] });
    db.nothingCreated();
    expect(JSON.stringify(db.snapshot())).toBe(snapshot);
  });

  it("leaves a curriculum that has a publication of any status alone, a retired one included, and publishes the rest", async () => {
    const orgX = { organisationid: X, isplatform: false, permissions: [] };
    await publishCurriculum(orgX, PUBLISHER, A);
    await retireCurriculum(orgX, A);
    const out = await publishInitial(X, PUBLISHER);
    expect(out.curricula).toEqual([B]);
    expect(publications().filter((p) => p.curriculumid === A).map((p) => p.status)).toEqual(["withdrawn"]);
  });

  it("does not publish a deleted curriculum", async () => {
    db.tables.curriculums.find((c) => c.curriculumid === B)!.isdeleted = true;
    expect((await publishInitial(X, PUBLISHER)).curricula).toEqual([A]);
  });

  it("a dry run builds and checks everything and writes nothing", async () => {
    const out = await publishInitial(X, PUBLISHER, { dryRun: true });
    expect(out).toEqual({ organisationid: X, status: "published", curricula: [B, A], problems: [] });
    db.nothingCreated();
    expect(publications()).toEqual([]);
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  it("a dry run on an organisation that would be refused says so, and writes nothing either way", async () => {
    db.tables.lessonquizquestions.find((r) => r.lessonquizquestionid === id(3006))!.questionid = id(1004);
    const out = await publishInitial(Y, PUBLISHER, { dryRun: true });
    expect(out.status).toBe("refused");
    db.nothingCreated();
  });

  describe("an organisation whose content names a row it does not own", () => {
    // Y's first curriculum has a quiz question that names X's question: a dangling link
    beforeEach(() => {
      db.tables.lessonquizquestions.find((r) => r.lessonquizquestionid === id(3006))!.questionid = id(1004);
    });

    it("is refused, naming the table and the count and no id, and nothing is written for it, its good curriculum included", async () => {
      const out = await publishInitial(Y, PUBLISHER);
      expect(out.status).toBe("refused");
      expect(out.curricula).toEqual([]);
      expect(out.problems).toEqual([{ field: "lessonquizquestions", message: "lessonquizquestions: 1 row names a question that is not this organisation's." }]);
      expect(JSON.stringify(out)).not.toContain(id(1004));
      db.nothingCreated();
      expect(publications()).toEqual([]);
      expect(transaction.commit).not.toHaveBeenCalled();
    });

    it("does not stop the others: the next organisation is published", async () => {
      const outcomes = [];
      for (const organisationid of [Y, X]) outcomes.push(await publishInitial(organisationid, PUBLISHER));
      expect(outcomes.map((o) => o.status)).toEqual(["refused", "published"]);
      expect(publications().every((p) => p.organisationid === X)).toBe(true);
      expect(publications()).toHaveLength(2);
    });
  });

  it("an error that is not a refusal (the store failing) rolls the transaction back and is thrown", async () => {
    jest.spyOn(transaction, "commit").mockRejectedValueOnce(new Error("store failed"));
    await expect(publishInitial(X, PUBLISHER)).rejects.toThrow("store failed");
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });

  it("what is published is what the live export would have sent, once every curriculum is published", async () => {
    await publishInitial(X, PUBLISHER);
    const payload = JSON.parse(JSON.stringify(await buildPublishedOrganisationContent({ ...orgRow(X, "xorg") } as unknown as organisations))) as Record<string, Row[]> & { organisations: Row[] };
    expect(payload.curriculums.map((c) => c.curriculumid).sort()).toEqual([A, B].sort());
    expect(payload.questions).toHaveLength(2);
    expect(contentProblems(payload)).toEqual([]);
  });
});

describe("organisationsToPublish and initialPublisher", () => {
  it("--all is every organisation that is not deleted; one is that organisation, which must exist", async () => {
    db.tables.organisations.find((o) => o.organisationid === Y)!.isdeleted = true;
    expect(await organisationsToPublish({ all: true })).toEqual([X]);
    expect(await organisationsToPublish({ organisationid: X })).toEqual([X]);
    await expect(organisationsToPublish({ organisationid: Y })).rejects.toThrow("not in this database");
    await expect(organisationsToPublish({ organisationid: id(999) })).rejects.toThrow("not in this database");
  });

  it("the publisher is the seeded platform account, or the one named, and must exist", async () => {
    const find = jest.spyOn(lmsusers, "findOne").mockImplementation((async (options: { where: { lmsuserid: string } }) =>
      options.where.lmsuserid === id(5) || options.where.lmsuserid === SEEDED_PLATFORM_ACCOUNT ? { lmsuserid: options.where.lmsuserid } : null) as never);
    expect(await initialPublisher()).toBe(SEEDED_PLATFORM_ACCOUNT);
    expect(await initialPublisher(id(5))).toBe(id(5));
    await expect(initialPublisher(id(6))).rejects.toThrow("--as is not in this database");
    find.mockResolvedValue(null as never);
    await expect(initialPublisher()).rejects.toThrow("Name an existing staff account with --as");
  });
});

describe("the command line", () => {
  it.each([
    [["--organisation", X], { all: false, dryRun: false, organisationid: X }],
    [["--all"], { all: true, dryRun: false }],
    [["--all", "--dry-run", "--as", id(5)], { all: true, dryRun: true, as: id(5) }],
    [["--dry-run", "--organisation", X], { all: false, dryRun: true, organisationid: X }],
  ])("%j is read", (argv, want) => {
    expect(parseArgs(argv as string[])).toEqual(want);
  });

  it.each([
    [[], "exactly one of"],
    [["--all", "--organisation", X], "exactly one of"],
    [["--organisation"], "--organisation needs a value"],
    [["--organisation", "--all"], "--organisation needs a value"],
    [["--as", id(5)], "exactly one of"],
    [["--all", "--force"], "unknown argument --force"],
    [["--all", "everything"], "unknown argument everything"],
  ])("%j is refused", (argv, message) => {
    expect(() => parseArgs(argv as string[])).toThrow(message);
  });
});
