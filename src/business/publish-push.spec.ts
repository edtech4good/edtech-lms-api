import AdmZip from "adm-zip";
import axios from "axios";
import FormData from "form-data";
import { Config, Logger } from "src/config";
import { OrgContext } from "src/decorators/org.decorator";
import { curriculumpublications } from "src/models/data-models/curriculumpublications";
import { organisations } from "src/models/data-models/organisations";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { LmsUserToken } from "src/models/token.model";
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import { queriesBetween } from "src/test-support/queries-between";
import { cloudConfigured } from "./cloud-push";
import { CurriculumBusiness } from "./curriculum.business";
import { publishCurriculum, retireCurriculum } from "./curriculum-publication";
import { buildPublishedOrganisationContent } from "./published-content";
import { PUSH_TIMEOUT_MS, pushAfterDelete, pushOrganisationSet, pushPublishedSet, publishAndPush, retireAndPush } from "./publish-push";

/**
 * The push that follows a publish, a retire and the delete of a published curriculum (A4 step 3, design decision 3): what is
 * pushed, that it is made after the act has committed, and that a failed push never undoes the act. Driven against the
 * in-memory tables, with the student server (axios) replaced by a target that records what it was sent. The routes are in
 * modules/content-scope.leak.spec.ts, the manual re-push in modules/sync/sync-scope.leak.spec.ts.
 */
jest.mock("axios", () => ({ __esModule: true, default: { put: jest.fn(), post: jest.fn(), get: jest.fn() } }));

const db = new ContentFake();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const orgX: OrgContext = { organisationid: X, isplatform: false, permissions: [] };
const USER = id(7);
const user = { lmsuserid: USER } as LmsUserToken;
const LEARNER_SERVER = "http://learner.test";
const [A, B, CY] = [id(100), id(200), id(300)];
const [GA, VA, L1] = [id(101), id(102), id(103)];
const [GB, VB, LB] = [id(201), id(202), id(203)];
const Q = (n: number) => id(500 + n);
const SUBJECT = id(50);
const COUNTRY = id(70);
const SCHOOL = id(60);

const lessonRow = (lessonid: string, levelid: string, name: string, order: number) => ({
  lessonid, levelid, lessonname: name, lessonorder: order, lessonstatus: true, total_points: 100, passing_points: 0,
});

// A (Reading): one lesson, one quiz using Q1. B (Maths): one lesson, one quiz using Q2. CY is Y's, unpublished.
const seed = () => {
  db.add("organisations", { organisationid: X, organisationcode: "xorg", organisationname: "Org X", organisationstatus: true, uitheme: "kids", brandingconfig: null, settingsconfig: null, contentlanguage: "en", isdeleted: false });
  db.add("subjects", { subjectid: SUBJECT, subjectname: "Reading", organisationid: X, subjectstatus: true });
  db.add("countries", { countryid: COUNTRY, countryname: "Land" });
  db.add("organisationcountry", { organisationcountryid: id(71), organisationid: X, countryid: COUNTRY });
  db.add("schools", { schoolid: SCHOOL, schoolname: "School", organisationid: X, countryid: COUNTRY, curriculums: [A, B] });
  db.add("curriculums", { curriculumid: A, curriculumname: "Reading", organisationid: X, subjectid: SUBJECT, curriculumstatus: true, isdeleted: false });
  db.add("curriculums", { curriculumid: B, curriculumname: "Maths", organisationid: X, subjectid: SUBJECT, curriculumstatus: true, isdeleted: false });
  db.add("curriculums", { curriculumid: CY, curriculumname: "Other", organisationid: Y, curriculumstatus: true, isdeleted: false });
  db.add("curriculumcountry", { curriculumcountryid: id(72), curriculumid: A, countryid: COUNTRY });
  db.add("grades", { gradeid: GA, curriculumid: A, gradename: "Grade A", gradeorder: 1, gradestatus: true });
  db.add("levels", { levelid: VA, gradeid: GA, levelname: "Level A", levelorder: 1, levelstatus: true });
  db.add("lessons", lessonRow(L1, VA, "Lesson one", 1));
  db.add("grades", { gradeid: GB, curriculumid: B, gradename: "Grade B", gradeorder: 1, gradestatus: true });
  db.add("levels", { levelid: VB, gradeid: GB, levelname: "Level B", levelorder: 1, levelstatus: true });
  db.add("lessons", lessonRow(LB, VB, "Lesson maths", 1));
  for (const n of [1, 2]) {
    db.add("questions", { questionid: Q(n), questionidentifier: `q-${n}`, questiontext: `Question ${n}`, templatetypeid: 1, organisationid: X, questionstatus: true });
  }
  db.add("lessonquizzes", { lessonquizid: id(704), lessonid: L1, lessonquizname: "Quiz", lessonquizorder: 1, lessonquizstatus: true, points: 10 });
  db.add("lessonquizquestions", { lessonquizquestionid: id(706), lessonquizid: id(704), questionid: Q(1), lessonquizquestionorder: 1, lessonquizquestionstatus: true });
  db.add("lessonquizzes", { lessonquizid: id(804), lessonid: LB, lessonquizname: "Maths quiz", lessonquizorder: 1, lessonquizstatus: true, points: 10 });
  db.add("lessonquizquestions", { lessonquizquestionid: id(806), lessonquizid: id(804), questionid: Q(2), lessonquizquestionorder: 1, lessonquizquestionstatus: true });
};

/** The state of the transaction the act holds: open from `transaction()` to `commit` or `rollback`. */
const tx = { open: false, commit: jest.fn(), rollback: jest.fn(), LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" } };
const stored = (table: Parameters<ContentFake["add"]>[0], key: string, value: string) => db.tables[table].find((r) => r[key] === value)!;
const put = axios.put as jest.Mock;
const ids = (rows: Array<Record<string, unknown>>, key: string) => rows.map((r) => r[key] as string).sort();

/**
 * The pool rule for the act that has just run (its LAST transaction): every query made between its begin and its commit takes
 * the transaction, and no request to the learner server starts in there. The reads and the push come before and after.
 */
const heldOnlyByQueriesThatTakeIt = () => {
  const begins = (dbinstance.getdbinstance().transaction as unknown as jest.Mock).mock.invocationCallOrder;
  const commits = tx.commit.mock.invocationCallOrder;
  const begin = begins[begins.length - 1];
  const commit = commits[commits.length - 1];
  expect(commit).toBeGreaterThan(begin);
  const between = queriesBetween(db, tx, begin, commit);
  const requests = put.mock.invocationCallOrder.filter((order) => order > begin && order < commit);
  return { between, requests };
};

/** What was PUT to the student server, call `n`: the url, the options, and the file inside the zip. */
const pushed = (n = 0) => {
  const [url, form, options] = put.mock.calls[n] as [string, FormData, { headers: Record<string, string>; timeout?: number }];
  const buffer = form.getBuffer();
  const start = buffer.indexOf("\r\n\r\n") + 4;
  const end = buffer.lastIndexOf(`\r\n--${form.getBoundary()}--`);
  const zip = new AdmZip(buffer.subarray(start, end));
  const entries = zip.getEntries().map((e) => e.entryName);
  return { url, headers: options.headers, timeout: options.timeout, entries, json: JSON.parse(zip.readAsText(entries[0])) as Record<string, Array<Record<string, unknown>>> };
};

const cloudBefore = Config.fortyk.api.rpi.cloud;
let events: string[];

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(Logger, "error").mockImplementation(() => Logger);
  db.install();
  seed();
  Config.fortyk.api.rpi.cloud = LEARNER_SERVER;
  events = [];
  tx.open = false;
  tx.commit.mockReset().mockImplementation(async () => {
    tx.open = false;
    events.push("commit");
  });
  tx.rollback.mockReset().mockImplementation(async () => {
    tx.open = false;
    events.push("rollback");
  });
  jest.spyOn(dbinstance.getdbinstance(), "transaction").mockImplementation((async () => {
    tx.open = true;
    events.push("begin");
    return tx;
  }) as never);
  put.mockReset().mockImplementation(async () => {
    events.push(tx.open ? "put-while-open" : "put");
    return { status: 200 };
  });
});
afterEach(() => {
  Config.fortyk.api.rpi.cloud = cloudBefore;
});

describe("publish pushes the published set", () => {
  it("pushes once, after the commit, to the student server's master import with the server key and the organisation's id", async () => {
    const res = await publishAndPush(orgX, USER, A);
    expect(res.push).toMatchObject({ status: "pushed", message: "Published. The learner server has the organisation's published curricula." });
    expect(put).toHaveBeenCalledTimes(1);
    const call = pushed();
    expect(call.url).toBe(`${LEARNER_SERVER}/import/master`);
    expect(call.headers).toMatchObject({ Authorization: Config.fortyk.api.serversynckey, "X-Organisation-Id": X });
    expect(call.timeout).toBe(PUSH_TIMEOUT_MS);
    expect(call.entries).toEqual(["syncfile.ini"]);
    expect(call.json.organisationid).toBe(X);
    expect(ids(call.json.curriculums, "curriculumid")).toEqual([A]);
    // the answer still names the publication, as it did before the push
    expect(res.publicationid).toBe(db.tables.curriculumpublications[0].publicationid);
    expect(res.summary).toMatchObject({ previous: null });
  });

  it("pushes exactly what the sync serves for the organisation: the published copies, never a draft edit", async () => {
    await publishAndPush(orgX, USER, A);
    // a draft edit of A after its publish: the next push (B's publish) must still carry A's published lesson name
    stored("lessons", "lessonid", L1).lessonname = "Lesson one, edited and not published";
    await publishAndPush(orgX, USER, B);
    expect(put).toHaveBeenCalledTimes(2);
    const second = pushed(1).json;
    expect(ids(second.curriculums, "curriculumid")).toEqual([A, B].sort());
    expect(second.lessons.find((l) => l.lessonid === L1)?.lessonname).toBe("Lesson one");
    const served = JSON.parse(JSON.stringify(await buildPublishedOrganisationContent(stored("organisations", "organisationid", X) as unknown as organisations)));
    expect(second).toEqual(served);
    expect(JSON.stringify(second)).not.toContain("edited and not published");
  });

  it("makes no query and no request while the publish's transaction is open: the push is entirely after the commit", async () => {
    const spy = jest.spyOn(organisations, "findOne");
    const original = spy.getMockImplementation();
    spy.mockImplementation(((...args: Parameters<typeof organisations.findOne>) => {
      events.push(tx.open ? "read-while-open" : "read");
      return original ? (original as (...a: unknown[]) => unknown)(...args) : undefined;
    }) as never);
    const publications = jest.spyOn(curriculumpublications, "findAll");
    const publicationsOriginal = publications.getMockImplementation();
    publications.mockImplementation(((...args: Array<{ transaction?: unknown }>) => {
      // a query that takes the transaction is part of the publish; one that does not is the push's, and must find it closed
      events.push(args[0]?.transaction ? "publications-in-tx" : tx.open ? "publications-while-open" : "publications");
      return publicationsOriginal ? (publicationsOriginal as (...a: unknown[]) => unknown)(...args) : undefined;
    }) as never);
    await publishAndPush(orgX, USER, A);
    expect(events).not.toContain("put-while-open");
    expect(events).not.toContain("read-while-open");
    expect(events).not.toContain("publications-while-open");
    const begin = events.indexOf("begin");
    const commit = events.indexOf("commit");
    expect(begin).toBeGreaterThan(-1);
    expect(commit).toBeGreaterThan(begin);
    // while it is held, the only queries are the ones that take it; the push's reads and its request come after the commit
    expect(events.slice(begin + 1, commit).filter((e) => e !== "publications-in-tx")).toEqual([]);
    const after = events.slice(commit + 1);
    for (const step of ["read", "publications", "put"]) expect(after).toContain(step);
    expect(events.filter((e) => e === "begin")).toHaveLength(1);
  });

  it("a publish repeated with nothing changed still pushes (it is how a failed push is repeated)", async () => {
    await publishAndPush(orgX, USER, A);
    const again = await publishAndPush(orgX, USER, A);
    expect(again.push.status).toBe("pushed");
    expect(put).toHaveBeenCalledTimes(2);
  });
});

describe("a push that fails does not undo the publish", () => {
  const SECRET = "secret-detail";
  const refuses = (status: number, data: unknown = {}) => ({ isAxiosError: true, message: SECRET, response: { status, data }, config: { headers: { Authorization: Config.fortyk.api.serversynckey }, url: `${LEARNER_SERVER}/import/master` } });
  const LEAD = "Published. The push to the learner server failed; an Admin or Organisation Admin can send it again with Sync Content.";

  it.each([
    ["the server key is refused (401)", refuses(401), ErrorCode.BAD_GATEWAY, "The student server refused this server's request."],
    ["the role is refused (403)", refuses(403), ErrorCode.BAD_GATEWAY, "The student server refused this server's request."],
    ["the student server fails (500)", refuses(500, { errormessage: SECRET }), ErrorCode.INTERNAL, "Something went wrong on our side."],
    ["a 400 with no message", refuses(400), ErrorCode.INTERNAL, "Something went wrong on our side."],
    ["the student server cannot be reached", { isAxiosError: true, message: `connect ECONNREFUSED ${SECRET}`, code: "ECONNREFUSED" }, ErrorCode.SERVICE_UNAVAILABLE, "The service is temporarily unavailable."],
    ["the student server does not answer in time", { isAxiosError: true, message: `timeout of 30000ms exceeded ${SECRET}`, code: "ECONNABORTED" }, ErrorCode.SERVICE_UNAVAILABLE, "The service is temporarily unavailable."],
  ])("%s: the publish stands, and the answer says why in the catalogue's words", async (_name, rejection, code, cause) => {
    put.mockRejectedValue(rejection);
    const res = await publishAndPush(orgX, USER, A);
    expect(res.push).toMatchObject({ status: "failed", code, cause, message: `${LEAD} ${cause}` });
    // the publication is there, published, committed, and nothing was rolled back
    expect(db.tables.curriculumpublications.map((p) => [p.curriculumid, p.status])).toEqual([[A, "published"]]);
    expect(tx.commit).toHaveBeenCalledTimes(1);
    expect(tx.rollback).not.toHaveBeenCalled();
    // neither the student server's own words, nor its address, nor the key reach the answer
    const text = JSON.stringify(res.push);
    for (const secret of [SECRET, "learner.test", Config.fortyk.api.serversynckey]) expect(text).not.toContain(secret);
  });

  it("the student server's 400 for an invalid payload is relayed as it said it (counts, never rows)", async () => {
    put.mockRejectedValue(refuses(400, { errormessage: "lessons: 2 rows name a level that is not in the payload." }));
    const res = await publishAndPush(orgX, USER, A);
    expect(res.push).toMatchObject({ status: "failed", code: ErrorCode.INVALID_INPUT, cause: "lessons: 2 rows name a level that is not in the payload." });
    expect(res.push.message).toBe(`${LEAD} lessons: 2 rows name a level that is not in the payload.`);
    expect(db.tables.curriculumpublications).toHaveLength(1);
  });

  it("the hint never points at a reference: the answer carries none (the catalogue's sentence about it is dropped, the rest is kept)", async () => {
    for (const [rejection, hint] of [
      [refuses(401), "This is a setup problem between the two servers, not your sign-in."],
      [refuses(500), "Try again."],
    ] as Array<[object, string]>) {
      put.mockRejectedValueOnce(rejection);
      const res = await publishAndPush(orgX, USER, A);
      expect(res.push.hint).toBe(hint);
      expect(JSON.stringify(res.push)).not.toContain("reference");
    }
    // a cause whose catalogue hint says nothing but that is left without one
    put.mockRejectedValueOnce({ isAxiosError: true, message: "connect ECONNREFUSED", code: "ECONNREFUSED" });
    const unreachable = await publishAndPush(orgX, USER, A);
    expect(JSON.stringify(unreachable.push)).not.toContain("reference");
  });

  it("a set that cannot be built (a stored copy is missing) is a failed push, not an error: nothing is sent and the publish stands", async () => {
    await publishAndPush(orgX, USER, A);
    stored("curriculumpublications", "curriculumid", A).payload = null;
    put.mockClear();
    const res = await publishAndPush(orgX, USER, B);
    expect(res.push.status).toBe("failed");
    expect(res.push.cause).toMatch(/^Content can't be sent: .* Nothing was sent\.$/);
    expect(put).not.toHaveBeenCalled();
    expect(db.tables.curriculumpublications.map((p) => p.curriculumid).sort()).toEqual([A, B].sort());
  });

  it("the next publish pushes again and catches the student server up", async () => {
    put.mockRejectedValueOnce(refuses(401));
    expect((await publishAndPush(orgX, USER, A)).push.status).toBe("failed");
    const next = await publishAndPush(orgX, USER, A);
    expect(next.push.status).toBe("pushed");
    expect(ids(pushed(1).json.curriculums, "curriculumid")).toEqual([A]);
  });
});

describe("no learner server set up: skipped", () => {
  it.each([["the placeholder the configuration falls back to", "your-cloud-endpoint"], ["an empty value", ""], ["blanks", "   "]])("%s", async (_name, value) => {
    Config.fortyk.api.rpi.cloud = value;
    expect(cloudConfigured()).toBe(false);
    const res = await publishAndPush(orgX, USER, A);
    expect(res.push).toEqual({ status: "skipped", reason: "nocloud", message: "Published. No learner server is set up here, so nothing was pushed." });
    expect(put).not.toHaveBeenCalled();
    // the publish is made all the same
    expect(db.tables.curriculumpublications.map((p) => p.status)).toEqual(["published"]);
  });

  it("a configured one is configured", () => {
    expect(cloudConfigured()).toBe(true);
  });
});

describe("retire pushes the published set", () => {
  it("a retired curriculum is in no later push, at once", async () => {
    await publishAndPush(orgX, USER, A);
    await publishAndPush(orgX, USER, B);
    put.mockClear();
    events.length = 0;
    const res = await retireAndPush(orgX, A);
    expect(res).toMatchObject({ curriculumid: A, retired: true, publicationstatus: "withdrawn", push: { status: "pushed", message: "Retired. The learner server has the organisation's published curricula." } });
    expect(put).toHaveBeenCalledTimes(1);
    const call = pushed();
    expect(ids(call.json.curriculums, "curriculumid")).toEqual([B]);
    expect(call.json.grades.map((g) => g.gradeid)).toEqual([GB]);
    // after the commit
    expect(events).toEqual(["begin", "commit", "put"]);
  });

  it("holds its transaction only through queries that take it, and starts no request to the learner server meanwhile", async () => {
    await publishAndPush(orgX, USER, A);
    await retireAndPush(orgX, A);
    const { between, requests } = heldOnlyByQueriesThatTakeIt();
    // the lock and the withdraw run in there, and every one of them takes the transaction
    expect(between.map((q) => q.method).sort()).toEqual(["findOne", "update"]);
    expect(between.filter((q) => !q.inTransaction)).toEqual([]);
    expect(requests).toEqual([]);
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("the last published curriculum retired pushes an empty set: that is how the student server learns it is gone", async () => {
    await publishAndPush(orgX, USER, A);
    put.mockClear();
    const res = await retireAndPush(orgX, A);
    expect(res.push.status).toBe("pushed");
    const call = pushed();
    expect(call.json.curriculums).toEqual([]);
    expect(call.json.lessons).toEqual([]);
    expect(call.json.questions).toEqual([]);
    // the live tables the organisation owns outright are still sent
    expect(call.json.schools).toHaveLength(1);
  });

  it("a curriculum that was never published has nothing to push", async () => {
    const res = await retireAndPush(orgX, B);
    expect(res).toMatchObject({ retired: false, publicationstatus: "never", push: { status: "skipped", reason: "nothingpublished", message: "Retired. That curriculum was not published, so there was nothing to push." } });
    expect(put).not.toHaveBeenCalled();
  });

  it("one already retired pushes again, so that a retire whose push failed can be repeated", async () => {
    await publishAndPush(orgX, USER, A);
    put.mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } });
    const failed = await retireAndPush(orgX, A);
    expect(failed).toMatchObject({ retired: true, publicationstatus: "withdrawn", push: { status: "failed" } });
    expect(db.tables.curriculumpublications.map((p) => p.status)).toEqual(["withdrawn"]);
    const again = await retireAndPush(orgX, A);
    expect(again).toMatchObject({ retired: false, publicationstatus: "withdrawn", push: { status: "pushed" } });
    expect(pushed(1).json.curriculums).toEqual([]);
  });

  it("a retire whose push fails stands", async () => {
    await publishAndPush(orgX, USER, A);
    put.mockRejectedValue({ isAxiosError: true, response: { status: 403 } });
    const res = await retireAndPush(orgX, A);
    expect(res.push).toMatchObject({ status: "failed", code: ErrorCode.BAD_GATEWAY, message: "Retired. The push to the learner server failed; an Admin or Organisation Admin can send it again with Sync Content. The student server refused this server's request." });
    expect(res.retired).toBe(true);
    expect(tx.rollback).not.toHaveBeenCalled();
  });

  it("retires a curriculum that was deleted without being withdrawn (a delete made before this step): 200, withdrawn, then pushed", async () => {
    await publishAndPush(orgX, USER, A);
    // soft-deleted by a path that did not withdraw it
    stored("curriculums", "curriculumid", A).isdeleted = true;
    put.mockClear();
    const res = await retireAndPush(orgX, A);
    expect(res).toMatchObject({ curriculumid: A, retired: true, publicationstatus: "withdrawn", push: { status: "pushed" } });
    expect(db.tables.curriculumpublications.map((p) => p.status)).toEqual(["withdrawn"]);
    expect(pushed().json.curriculums).toEqual([]);
  });

  it("retire (without the push) is unchanged: it commits and answers, and reads nothing of the learner server", async () => {
    await publishCurriculum(orgX, USER, A);
    const res = await retireCurriculum(orgX, A);
    expect(res).toMatchObject({ retired: true });
    expect(put).not.toHaveBeenCalled();
  });
});

describe("delete withdraws the curriculum's publication, then pushes", () => {
  const deleteA = () => new CurriculumBusiness(orgX).deleteCurriculum(A, user);

  it("deletes and withdraws in ONE transaction, and keeps the curriculum's countries", async () => {
    await publishAndPush(orgX, USER, A);
    events.length = 0;
    tx.commit.mockClear();
    const updates = jest.spyOn(curriculumpublications, "update");
    const done = await deleteA();
    expect(done).toEqual({ organisationid: X, withdrew: true });
    expect(stored("curriculums", "curriculumid", A)).toMatchObject({ isdeleted: true, deleted_by: USER });
    expect(db.tables.curriculumpublications.map((p) => p.status)).toEqual(["withdrawn"]);
    // one transaction opened, one commit; the withdraw was made inside it
    expect(events).toEqual(["begin", "commit"]);
    expect(updates).toHaveBeenCalledWith({ status: "withdrawn" }, expect.objectContaining({ transaction: tx }));
    // the countries are kept, so a later restore of the curriculum does not lose them
    expect(db.tables.curriculumcountry.map((r) => [r.curriculumid, r.countryid])).toEqual([[A, COUNTRY]]);
  });

  it("holds its transaction only through queries that take it, and starts no request to the learner server meanwhile", async () => {
    await publishAndPush(orgX, USER, A);
    await deleteA();
    const { between, requests } = heldOnlyByQueriesThatTakeIt();
    // the lock and the withdraw run in there (the row's own save is an instance call), and every query takes the transaction
    expect(between.map((q) => q.method).sort()).toEqual(["findOne", "update"]);
    expect(between.filter((q) => !q.inTransaction)).toEqual([]);
    expect(requests).toEqual([]);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("then the push sends a set without it, after the commit", async () => {
    await publishAndPush(orgX, USER, A);
    await publishAndPush(orgX, USER, B);
    put.mockClear();
    events.length = 0;
    const done = await deleteA();
    if (done === false) throw new Error("the curriculum was not deleted");
    const push = await pushAfterDelete(done);
    expect(push).toMatchObject({ status: "pushed", message: "Deleted. The learner server has the organisation's published curricula." });
    expect(ids(pushed().json.curriculums, "curriculumid")).toEqual([B]);
    expect(events).toEqual(["begin", "commit", "put"]);
  });

  it("a curriculum that was never published is deleted and nothing is pushed", async () => {
    const done = await new CurriculumBusiness(orgX).deleteCurriculum(B, user);
    expect(done).toEqual({ organisationid: X, withdrew: false });
    if (done === false) throw new Error("the curriculum was not deleted");
    expect(await pushAfterDelete(done)).toEqual({ status: "skipped", reason: "nothingpublished", message: "Deleted. That curriculum was not published, so there was nothing to push." });
    expect(put).not.toHaveBeenCalled();
  });

  it("a curriculum that is not there, or already deleted, is not deleted again", async () => {
    expect(await new CurriculumBusiness().deleteCurriculum(id(999), user)).toBe(false);
    await deleteA();
    expect(await new CurriculumBusiness().deleteCurriculum(A, user)).toBe(false);
  });

  it("a delete whose withdraw fails is rolled back whole and pushes nothing", async () => {
    await publishAndPush(orgX, USER, A);
    put.mockClear();
    events.length = 0;
    jest.spyOn(curriculumpublications, "update").mockRejectedValue(new Error("lock wait timeout"));
    await expect(deleteA()).rejects.toThrow("lock wait timeout");
    expect(events).toEqual(["begin", "rollback"]);
    expect(put).not.toHaveBeenCalled();
  });

  it("a delete whose push fails stands", async () => {
    await publishAndPush(orgX, USER, A);
    put.mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
    const done = await deleteA();
    if (done === false) throw new Error("the curriculum was not deleted");
    expect(await pushAfterDelete(done)).toMatchObject({ status: "failed", code: ErrorCode.BAD_GATEWAY });
    expect(stored("curriculums", "curriculumid", A).isdeleted).toBe(true);
  });

  it("a publish that was waiting on the lock when the curriculum was deleted finds it deleted: 404, nothing written", async () => {
    // the payload is read before the lock; the delete commits in between
    const original = dbinstance.getdbinstance().transaction as unknown as jest.Mock;
    original.mockImplementation((async () => {
      stored("curriculums", "curriculumid", A).isdeleted = true;
      tx.open = true;
      events.push("begin");
      return tx;
    }) as never);
    await expect(publishCurriculum(orgX, USER, A)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    expect(db.tables.curriculumpublications).toHaveLength(0);
    expect(events).toEqual(["begin", "rollback"]);
  });
});

describe("pushes of one organisation take turns", () => {
  it("the second push is built after the first has been answered, so it carries every act that committed meanwhile", async () => {
    let release: () => void = () => undefined;
    put.mockReset();
    put.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ status: 200 });
        }),
    );
    put.mockResolvedValue({ status: 200 });
    const first = publishAndPush(orgX, USER, A);
    // wait until the first push is in flight
    for (let i = 0; i < 200 && put.mock.calls.length === 0; i += 1) await new Promise((r) => setImmediate(r));
    expect(put).toHaveBeenCalledTimes(1);
    // B is published and its push asked for while the first is still waiting on the student server
    const second = publishAndPush(orgX, USER, B);
    for (let i = 0; i < 50; i += 1) await new Promise((r) => setImmediate(r));
    expect(put).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(put).toHaveBeenCalledTimes(2);
    expect(ids(pushed(0).json.curriculums, "curriculumid")).toEqual([A]);
    expect(ids(pushed(1).json.curriculums, "curriculumid")).toEqual([A, B].sort());
  });

  it("a push that fails does not stop the next one", async () => {
    put.mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } });
    const [a, b] = await Promise.all([pushPublishedSet(X, "Published"), pushPublishedSet(X, "Published")]);
    expect([a.status, b.status]).toEqual(["failed", "pushed"]);
  });

  it("an organisation that is not there is a failed push, not an error", async () => {
    const res = await pushPublishedSet(Y, "Published");
    expect(res).toMatchObject({ status: "failed", code: ErrorCode.NOT_FOUND });
    expect(put).not.toHaveBeenCalled();
  });

  it("no organisation (an unowned curriculum) has nothing to push", async () => {
    expect((await pushPublishedSet(null, "Deleted")).status).toBe("skipped");
    expect(put).not.toHaveBeenCalled();
  });
});

describe("acts that arrive while a push is in flight share one later push", () => {
  const held: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
  const hold = () => {
    held.length = 0;
    put.mockReset().mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          held.push({ resolve, reject });
        }),
    );
  };
  const settle = async (until: () => boolean) => {
    for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setImmediate(r));
  };
  const idle = async () => {
    for (let i = 0; i < 50; i += 1) await new Promise((r) => setImmediate(r));
  };
  const timedOut = { isAxiosError: true, message: "timeout of 30000ms exceeded", code: "ECONNABORTED" };

  it("three acts at once send twice, not three times: the first, then ONE push for the two that waited", async () => {
    await publishCurriculum(orgX, USER, A);
    await publishCurriculum(orgX, USER, B);
    hold();
    const first = pushPublishedSet(X, "Published");
    await settle(() => held.length === 1);
    // A is retired meanwhile, and the pushes of two more acts are asked for while the first is still in flight
    await retireCurriculum(orgX, A);
    const second = pushPublishedSet(X, "Retired");
    const third = pushPublishedSet(X, "Deleted");
    await idle();
    expect(put).toHaveBeenCalledTimes(1);
    held[0].resolve({ status: 200 });
    await settle(() => held.length === 2);
    await idle();
    expect(put).toHaveBeenCalledTimes(2);
    held[1].resolve({ status: 200 });
    const [a, b, c] = await Promise.all([first, second, third]);
    expect(put).toHaveBeenCalledTimes(2);
    // every waiter has that one push's outcome, each in its own words
    expect([a.status, b.status, c.status]).toEqual(["pushed", "pushed", "pushed"]);
    expect([a.message, b.message, c.message]).toEqual([
      "Published. The learner server has the organisation's published curricula.",
      "Retired. The learner server has the organisation's published curricula.",
      "Deleted. The learner server has the organisation's published curricula.",
    ]);
    // the first push was built before the retire; the shared one was built when it finished, so the newest state wins
    expect(ids(pushed(0).json.curriculums, "curriculumid")).toEqual([A, B].sort());
    expect(ids(pushed(1).json.curriculums, "curriculumid")).toEqual([B]);
  });

  it("with a student server that does not answer, three queued acts answer after the first one's timeout and ONE more, not one timeout each", async () => {
    hold();
    const first = pushPublishedSet(X, "Published");
    await settle(() => held.length === 1);
    const second = pushPublishedSet(X, "Published");
    const third = pushPublishedSet(X, "Retired");
    await idle();
    held[0].reject(timedOut);
    expect((await first).status).toBe("failed");
    await settle(() => held.length === 2);
    held[1].reject(timedOut);
    const [b, c] = await Promise.all([second, third]);
    expect([b.status, c.status]).toEqual(["failed", "failed"]);
    expect(b.cause).toBe("The service is temporarily unavailable.");
    expect(c.message.startsWith("Retired. The push to the learner server failed")).toBe(true);
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("an act that arrives while the shared push is in flight gets the next one: the newest state wins, and the lane is free afterwards", async () => {
    hold();
    const first = pushPublishedSet(X, "Published");
    await settle(() => held.length === 1);
    const second = pushPublishedSet(X, "Published");
    await idle();
    held[0].resolve({ status: 200 });
    await settle(() => held.length === 2);
    // the shared push is in flight now; this one is neither the first's nor the shared one's
    const third = pushPublishedSet(X, "Deleted");
    await idle();
    expect(put).toHaveBeenCalledTimes(2);
    held[1].resolve({ status: 200 });
    await settle(() => held.length === 3);
    held[2].resolve({ status: 200 });
    expect((await Promise.all([first, second, third])).map((o) => o.status)).toEqual(["pushed", "pushed", "pushed"]);
    expect(put).toHaveBeenCalledTimes(3);
    // free again: the next act sends at once
    const fourth = pushPublishedSet(X, "Published");
    await settle(() => held.length === 4);
    expect(put).toHaveBeenCalledTimes(4);
    held[3].resolve({ status: 200 });
    expect((await fourth).status).toBe("pushed");
  });

  it("another organisation's push is not made to wait", async () => {
    hold();
    const x = pushPublishedSet(X, "Published");
    await settle(() => held.length === 1);
    db.add("organisations", { organisationid: Y, organisationcode: "yorg", organisationname: "Org Y", organisationstatus: true, uitheme: "kids", brandingconfig: null, settingsconfig: null, contentlanguage: "en", isdeleted: false });
    const y = pushPublishedSet(Y, "Published");
    await settle(() => held.length === 2);
    expect(put).toHaveBeenCalledTimes(2);
    held[0].resolve({ status: 200 });
    held[1].resolve({ status: 200 });
    expect((await Promise.all([x, y])).map((o) => o.status)).toEqual(["pushed", "pushed"]);
  });
});

describe("the manual re-push takes the same turn", () => {
  it("settles with the student server's answer, with the timeout, and without the cloudConfigured skip", async () => {
    const settled = await pushOrganisationSet(X);
    expect(settled).toEqual({ ok: true, answer: { error: false, data: true } });
    expect(pushed().timeout).toBe(PUSH_TIMEOUT_MS);
    Config.fortyk.api.rpi.cloud = "your-cloud-endpoint";
    put.mockClear();
    await pushOrganisationSet(X);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("settles with the original error, for the route to throw as it always has", async () => {
    const failure = { isAxiosError: true, response: { status: 401 } };
    put.mockRejectedValueOnce(failure);
    expect(await pushOrganisationSet(X)).toEqual({ ok: false, error: failure });
  });

  it("waits for a push in flight and shares the later one, as an act's push does", async () => {
    const held: Array<(v: unknown) => void> = [];
    put.mockReset().mockImplementation(() => new Promise((resolve) => held.push(resolve)));
    const first = pushPublishedSet(X, "Published");
    for (let i = 0; i < 400 && held.length < 1; i += 1) await new Promise((r) => setImmediate(r));
    const manual = pushOrganisationSet(X);
    const act = pushPublishedSet(X, "Retired");
    for (let i = 0; i < 50; i += 1) await new Promise((r) => setImmediate(r));
    expect(put).toHaveBeenCalledTimes(1);
    held[0]({ status: 200 });
    for (let i = 0; i < 400 && held.length < 2; i += 1) await new Promise((r) => setImmediate(r));
    held[1]({ status: 200 });
    const [, settled, outcome] = await Promise.all([first, manual, act]);
    expect(put).toHaveBeenCalledTimes(2);
    expect(settled.ok).toBe(true);
    expect(outcome.status).toBe("pushed");
  });
});
