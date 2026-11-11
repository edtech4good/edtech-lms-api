import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import AdmZip from "adm-zip";
import axios from "axios";
import FormData from "form-data";
import { sign } from "jsonwebtoken";
import request from "supertest";
import * as publishedContent from "src/business/published-content";
import { Config, Logger } from "src/config";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { schools } from "src/models/data-models/school";
import { organisationcountry } from "src/models/data-models/organisationcountry";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { ContentFake } from "src/test-support/content-fake";
import { StandardController } from "../standard/standard.controller";
import { SchoolController } from "./school.controller";

/**
 * A school or class write sends the organisation's whole set to the learning server after it commits, and answers with what
 * happened to that push. Driven over real HTTP through the real strategy, guards, controllers, validators and business
 * classes; the tables are the in-memory copy in `ContentFake`, the transaction and the learning server (axios) are replaced,
 * and the set the push carries is replaced by one that names its organisation (the content builder has specs of its own).
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));
jest.mock("axios", () => ({ __esModule: true, default: { put: jest.fn(), post: jest.fn(), get: jest.fn() } }));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C1 = uuid(101);
const S_X = uuid(201);
const S_X2 = uuid(202);
const S_Y = uuid(203);
const S_GONE = uuid(204); // a deleted school of X that still holds its name
const K_X = uuid(501);
const K_Y = uuid(502);
const GONE_NAME = "សាលាដែលបានលុប";
const LEARNER_SERVER = "http://learner.invalid";

const db = new ContentFake();
const events: string[] = [];
const transaction = {
  commit: jest.fn(async () => {
    events.push("commit");
  }),
  rollback: jest.fn(async () => {
    events.push("rollback");
  }),
  LOCK: { SHARE: "SHARE", UPDATE: "UPDATE" },
};
const put = axios.put as jest.Mock;

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const PERMS = [...ORGANISATION_ADMIN_PERMISSIONS_20261002];
const callers = {
  // an Admin who holds no sync_content: the push after a write does not need it
  "X's Admin": bearer({ lmsuserid: "ad", lmsuserroles: [Role.admin], permissions: PERMS, organisationid: X, isplatform: false }),
  "a platform user not acting": bearer({ lmsuserid: "p", lmsuserroles: [Role.superadmin], permissions: ["superadmin", ...PERMS], organisationid: null, isplatform: true }),
} as const;
type Who = keyof typeof callers;

type Row = Record<string, unknown>;
const seed = () => {
  db.add("organisations", { organisationid: X, organisationname: "Org X", organisationstatus: true });
  db.add("organisations", { organisationid: Y, organisationname: "Org Y", organisationstatus: true });
  db.add("countries", { countryid: C1, countryname: "Land", expectedusage: 1 });
  db.add("schools", { schoolid: S_X, schoolname: "សាលា ក", organisationid: X, countryid: C1, curriculums: [] });
  db.add("schools", { schoolid: S_X2, schoolname: "សាលា គ", organisationid: X, countryid: C1, curriculums: [] });
  db.add("schools", { schoolid: S_Y, schoolname: "សាលា ខ", organisationid: Y, countryid: C1, curriculums: [] });
  db.add("schools", { schoolid: S_GONE, schoolname: GONE_NAME, organisationid: X, countryid: C1, curriculums: [], isdeleted: true });
  db.add("standards", { standardid: K_X, standardname: "ថ្នាក់ទី១", schoolid: S_X, schoolname: "សាលា ក" });
  db.add("standards", { standardid: K_Y, standardname: "ថ្នាក់ទី២", schoolid: S_Y, schoolname: "សាលា ខ" });
};

/** What was PUT to the learning server, call `n`: the url, the organisation named in the header, the timeout, and the file inside the zip. */
const sent = (n: number) => {
  const [url, form, options] = put.mock.calls[n] as [string, FormData, { headers: Record<string, string>; timeout?: number }];
  const buffer = form.getBuffer();
  const start = buffer.indexOf("\r\n\r\n") + 4;
  const end = buffer.lastIndexOf(`\r\n--${form.getBoundary()}--`);
  const zip = new AdmZip(buffer.subarray(start, end));
  return { url, organisation: options.headers["X-Organisation-Id"], timeout: options.timeout, json: JSON.parse(zip.readAsText(zip.getEntries()[0].entryName)) as Row };
};
const organisationsPushed = () => put.mock.calls.map((_, i) => sent(i).organisation).sort();

const FAILED_WORDS = "Saved, but the learning server did not answer. Run Sync Content on the Curricula screen to send it again.";

describe("a school or class write sends the organisation's set", () => {
  let app: INestApplication;
  const rpi = Config.fortyk.api.rpi as { cloud?: string };
  const savedCloud = rpi.cloud;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [SchoolController, StandardController], providers: [JwtAccessStrategy] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0);
  });
  afterAll(async () => {
    rpi.cloud = savedCloud;
    await app.close();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    jest.spyOn(Logger, "error").mockImplementation(() => Logger);
    jest.spyOn(Logger, "info").mockImplementation(() => Logger);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    tokenExists.mockResolvedValue(true);
    events.length = 0;
    transaction.commit.mockClear();
    transaction.rollback.mockClear();
    db.install();
    seed();
    rpi.cloud = LEARNER_SERVER;
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
    // a rename or create checks the school's country against the organisation's countries
    jest.spyOn(organisationcountry, "count").mockResolvedValue(1 as never);
    jest.spyOn(publishedContent, "buildPublishedOrganisationContent").mockImplementation((async (organisation: { organisationid: string }) => ({ organisationid: organisation.organisationid })) as never);
    put.mockReset().mockImplementation(async () => {
      events.push("put");
      return { status: 200, data: {} };
    });
  });

  const send = (who: Who, method: "post" | "put" | "delete", path: string, body?: object) => {
    const r = request(app.getHttpServer())[method](path).set("Authorization", callers[who]).set("Connection", "close");
    return body ? r.send(body) : r;
  };
  const school = (over: Row = {}) => ({ schoolname: "សាលាថ្មី", countryid: C1, curriculums: [], ...over });

  describe("the writes", () => {
    it("school create: the set of the school's organisation goes after the commit, and the answer says it was pushed", async () => {
      const res = await send("X's Admin", "post", "/school/create", school()).expect(200);
      expect(events).toEqual(["commit", "put"]);
      expect(put).toHaveBeenCalledTimes(1);
      const call = sent(0);
      expect(call.url).toBe(`${LEARNER_SERVER}/import/master`);
      expect(call.organisation).toBe(X);
      expect(call.timeout).toBe(30_000);
      expect(call.json.organisationid).toBe(X);
      expect(res.body.push.status).toBe("pushed");
      expect(res.body.data.schoolname).toBe("សាលាថ្មី");
    });
    it("school edit: the set goes after the commit", async () => {
      const res = await send("X's Admin", "put", `/school/update/${S_X}`, school({ schoolname: "សាលា ក ថ្មី" })).expect(200);
      expect(events).toEqual(["commit", "put"]);
      expect(organisationsPushed()).toEqual([X]);
      expect(res.body.push.status).toBe("pushed");
    });
    it("school labels (the school's theme and labels): the set goes after the save", async () => {
      const res = await send("X's Admin", "put", `/school/labels/${S_X}`, { labelPreset: null }).expect(200);
      expect(organisationsPushed()).toEqual([X]);
      expect(res.body.push.status).toBe("pushed");
    });
    it("school delete: the set goes, so the learning server marks it deleted", async () => {
      const res = await send("X's Admin", "delete", `/school/${S_X}`).expect(200);
      expect(organisationsPushed()).toEqual([X]);
      expect(res.body).toMatchObject({ error: false, data: true, push: { status: "pushed" } });
    });
    it("class create, edit and delete: each sends the set of its school's organisation", async () => {
      const created = await send("X's Admin", "post", "/standard/create", { standardname: "ថ្នាក់ថ្មី", schoolid: S_X }).expect(200);
      expect(created.body.push.status).toBe("pushed");
      const edited = await send("X's Admin", "put", `/standard/${K_X}`, { standardname: "ថ្នាក់ទី១ ក", schoolid: S_X }).expect(200);
      expect(edited.body.push.status).toBe("pushed");
      const deleted = await send("X's Admin", "delete", `/standard/${K_X}`).expect(200);
      expect(deleted.body).toMatchObject({ error: false, data: true, push: { status: "pushed" } });
      expect(organisationsPushed()).toEqual([X, X, X]);
    });
    it("a class moved to another school of the same organisation sends that organisation's set once", async () => {
      await send("X's Admin", "put", `/standard/${K_X}`, { standardname: "ថ្នាក់ទី១", schoolid: S_X2 }).expect(200);
      expect(organisationsPushed()).toEqual([X]);
    });
    it("with a learning server a school's organisation cannot change: 409 on organisationid, nothing written, nothing sent", async () => {
      const before = db.snapshot();
      const res = await send("a platform user not acting", "put", `/school/update/${S_X}`, school({ schoolname: "សាលា ក", organisationid: Y }));
      expect(res.status).toBe(409);
      expect(res.body.errormessage).toBe("A school can't be moved to another organisation yet. Create the school in the other organisation instead.");
      expect(res.body.fields).toEqual([{ field: "organisationid", message: res.body.errormessage }]);
      expect(db.snapshot()).toEqual(before);
      expect(put).not.toHaveBeenCalled();
    });
    it("with no learning server the move works as before and pushes nothing", async () => {
      rpi.cloud = undefined;
      const res = await send("a platform user not acting", "put", `/school/update/${S_X}`, school({ schoolname: "សាលា ក", organisationid: Y })).expect(200);
      expect(db.tables.schools.find((s) => s.schoolid === S_X)!.organisationid).toBe(Y);
      expect(res.body.push.status).toBe("skipped");
      expect(put).not.toHaveBeenCalled();
    });
    it("a school edit that keeps its organisation (naming it too) is not a move", async () => {
      await send("a platform user not acting", "put", `/school/update/${S_X}`, school({ schoolname: "សាលា ក", organisationid: X })).expect(200);
      expect(organisationsPushed()).toEqual([X]);
    });
    it("a saved write never answers 500 because the organisation to push could not be found: 200 with a failed push", async () => {
      const original = (schools.findOne as jest.Mock).getMockImplementation() as (...a: unknown[]) => Promise<unknown>;
      jest.spyOn(schools, "findOne").mockImplementation((async (o: { attributes?: string[] }) => {
        if (o?.attributes?.join() === "organisationid") throw new Error("read failed");
        return original(o);
      }) as never);
      const deleted = await send("X's Admin", "delete", `/school/${S_X}`);
      expect(deleted.status).toBe(200);
      expect(deleted.body.push).toEqual({ status: "failed", message: FAILED_WORDS });
      expect(put).not.toHaveBeenCalled();
    });
    it("the same for a class: its school's organisation cannot be read after the write", async () => {
      const original = (schools.findAll as jest.Mock).getMockImplementation() as (...a: unknown[]) => Promise<unknown>;
      jest.spyOn(schools, "findAll").mockImplementation((async (o: { attributes?: string[] }) => {
        if (o?.attributes?.join() === "organisationid") throw new Error("read failed");
        return original(o);
      }) as never);
      const res = await send("X's Admin", "post", "/standard/create", { standardname: "ថ្នាក់ថ្មី", schoolid: S_X });
      expect(res.status).toBe(200);
      expect(res.body.push).toEqual({ status: "failed", message: FAILED_WORDS });
      expect(put).not.toHaveBeenCalled();
    });
    it("someone without sync_content still triggers the push (it uses the server key)", async () => {
      expect(PERMS).not.toContain("sync_content");
      await send("X's Admin", "post", "/school/create", school()).expect(200);
      expect(put).toHaveBeenCalledTimes(1);
      expect(sent(0).organisation).toBe(X);
    });
    it("a write that is refused sends nothing and answers no push", async () => {
      const res = await send("X's Admin", "post", "/school/create", school({ schoolname: "សាលា ក" }));
      expect(res.status).toBe(409);
      expect(put).not.toHaveBeenCalled();
      expect(res.body).not.toHaveProperty("push");
      const missing = await send("X's Admin", "put", `/standard/${uuid(999)}`, { standardname: "x", schoolid: S_X });
      expect(missing.status).toBe(404);
      expect(put).not.toHaveBeenCalled();
    });
  });

  describe("the answer", () => {
    it("never fails the request when the learning server does not answer: the write stays, the push says to run Sync Content", async () => {
      put.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED"), { isAxiosError: true, config: { headers: { Authorization: "SECRET-KEY" } } }));
      const res = await send("X's Admin", "post", "/school/create", school()).expect(200);
      expect(res.body.push.status).toBe("failed");
      expect(res.body.push.message).toBe(FAILED_WORDS);
      expect(JSON.stringify(res.body)).not.toContain("SECRET-KEY");
      expect(db.tables.schools.some((s) => s.schoolname === "សាលាថ្មី")).toBe(true);
      expect(transaction.commit).toHaveBeenCalledTimes(1);
    });
    it("a timeout is the same failed outcome", async () => {
      put.mockRejectedValue(Object.assign(new Error("timeout of 30000ms exceeded"), { isAxiosError: true, code: "ECONNABORTED" }));
      const res = await send("X's Admin", "post", "/standard/create", { standardname: "ថ្នាក់ថ្មី", schoolid: S_X }).expect(200);
      expect(res.body.push).toMatchObject({ status: "failed", message: FAILED_WORDS });
    });
    it("a refusal central can name passes the reason on, never the server key", async () => {
      put.mockRejectedValue(
        Object.assign(new Error("Request failed with status code 400"), {
          isAxiosError: true,
          response: { status: 400, data: { errormessage: "A school name here is already held by another school.", fields: [] } },
          config: { headers: { Authorization: "SECRET-KEY" } },
        }),
      );
      const res = await send("X's Admin", "put", `/school/update/${S_X}`, school({ schoolname: "សាលា ក ថ្មី" })).expect(200);
      expect(res.body.push.status).toBe("failed");
      expect(res.body.push.message).toContain("A school name here is already held by another school.");
      expect(res.body.push.message).toContain("Run Sync Content");
      expect(JSON.stringify(res.body)).not.toContain("SECRET-KEY");
    });
    it("with no learning server set up the push is skipped and nothing is sent", async () => {
      rpi.cloud = undefined;
      const res = await send("X's Admin", "post", "/school/create", school()).expect(200);
      expect(res.body.push.status).toBe("skipped");
      expect(put).not.toHaveBeenCalled();
    });
  });

  describe("school names are unique where the learning server needs them", () => {
    it("a create is refused for a name a deleted school holds", async () => {
      const res = await send("X's Admin", "post", "/school/create", school({ schoolname: GONE_NAME }));
      expect(res.status).toBe(409);
      expect(res.body.errormessage).toBe("A school with this name existed before. Choose another name.");
      expect(res.body.fields).toEqual([{ field: "schoolname", message: "A school with this name existed before. Choose another name." }]);
      expect(db.createdIn("schools")).toEqual([]);
      expect(transaction.rollback).toHaveBeenCalledTimes(1);
      expect(put).not.toHaveBeenCalled();
    });
    it("a rename is refused for a name a deleted school holds, and writes nothing", async () => {
      const before = db.snapshot();
      const res = await send("X's Admin", "put", `/school/update/${S_X}`, school({ schoolname: GONE_NAME }));
      expect(res.status).toBe(409);
      expect(res.body.errormessage).toBe("A school with this name existed before. Choose another name.");
      expect(db.snapshot()).toEqual(before);
      expect(put).not.toHaveBeenCalled();
    });
    it("the name is held across organisations too: a deleted school of another organisation blocks it", async () => {
      db.tables.schools.find((s) => s.schoolid === S_GONE)!.organisationid = Y;
      const res = await send("X's Admin", "post", "/school/create", school({ schoolname: GONE_NAME }));
      expect(res.status).toBe(409);
      expect(res.body.errormessage).toBe("A school with this name existed before. Choose another name.");
    });
    it("a school keeps its own name on an edit, and a name nobody ever held is fine", async () => {
      await send("X's Admin", "put", `/school/update/${S_X}`, school({ schoolname: "សាលា ក" })).expect(200);
      await send("X's Admin", "put", `/school/update/${S_X}`, school({ schoolname: "សាលា ក ដែលមិនធ្លាប់មាន" })).expect(200);
    });
    it("a rename to the name of a live school is refused with 409 like a create", async () => {
      const res = await send("X's Admin", "put", `/school/update/${S_X}`, school({ schoolname: "សាលា គ" }));
      expect(res.status).toBe(409);
      expect(res.body.errormessage).toBe("That school already exists.");
    });
  });
});
