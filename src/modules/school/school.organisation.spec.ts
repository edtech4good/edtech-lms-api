import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { curriculums } from "src/models/data-models/curriculums";
import { organisationcountry } from "src/models/data-models/organisationcountry";
import { organisations } from "src/models/data-models/organisations";
import { schools } from "src/models/data-models/school";
import { schoolcontributedata } from "src/models/data-models/schoolcontributedata";
import { schoolusers } from "src/models/data-models/schoolusers";
import { standards } from "src/models/data-models/standard";
import { students } from "src/models/data-models/students";
import { Role } from "src/models/enums";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { rowMatches } from "src/test-support/fakewhere";
import { SchoolController } from "./school.controller";

/**
 * A school is written with its organisation, the country must be one the
 * organisation is linked to, and only the platform changes a school's
 * organisation. (Reading schools and the other school writes are not scoped in
 * this package.)
 *
 * Driven over real HTTP through the real strategy, guards, controller and
 * business classes; the school and link tables are in memory and the caller's
 * `where` is applied to them.
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));

const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DELETED = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const UNKNOWN_ORG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const C1 = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const C2 = "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2";
const C3 = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
const SCHOOL_IN_X = "5a5a5a5a-0000-4000-8000-00000000000a";
const SCHOOL_IN_Y = "5b5b5b5b-0000-4000-8000-00000000000b";
// The same Khmer school name in two organisations.
const SAME_NAME = "សាលាបឋមសិក្សាគំរូ";

type School = { schoolid: string; schoolname: string; countryid: string; organisationid: string | null; isdeleted: boolean; curriculums: string[] };
let table: School[] = [];
let created: Array<Record<string, unknown>> = [];
let lockCalls: Array<{ organisationid: string; hasTransaction: boolean }> = [];
const links = [
  { organisationid: X, countryid: C1 },
  { organisationid: Y, countryid: C1 },
  { organisationid: Y, countryid: C2 },
];
const transaction = { commit: jest.fn(), rollback: jest.fn() };

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const callers = {
  platform: bearer({ lmsuserid: "caller", lmsuserroles: [Role.superadmin], permissions: ["superadmin"], organisationid: null, isplatform: true }),
  platformActingX: bearer({ lmsuserid: "caller", lmsuserroles: [Role.superadmin], permissions: ["superadmin"], organisationid: X, isplatform: true }),
  xSuperAdmin: bearer({ lmsuserid: "caller", lmsuserroles: [Role.superadmin], permissions: ["superadmin"], organisationid: X, isplatform: false }),
  xAdmin: bearer({ lmsuserid: "caller", lmsuserroles: [Role.admin], permissions: ["create_school", "update_school"], organisationid: X, isplatform: false }),
  unassigned: bearer({ lmsuserid: "caller", lmsuserroles: [Role.admin], permissions: ["create_school", "update_school"], organisationid: null, isplatform: false }),
};
const IN_X = ["platformActingX", "xSuperAdmin", "xAdmin"] as const;

const schoolRow = (s: School) => {
  const row: Record<string, unknown> = {
    ...s,
    save: jest.fn(async (o: { fields: string[] }) => {
      saves.push({ id: s.schoolid, fields: o.fields });
      for (const field of o.fields) {
        (s as unknown as Record<string, unknown>)[field] = row[field];
      }
    }),
  };
  return row;
};
let saves: Array<{ id: string; fields: string[] }> = [];

describe("schools write their organisation", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({ controllers: [SchoolController], providers: [JwtAccessStrategy] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterAll(async () => app.close());

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    tokenExists.mockResolvedValue(true);
    transaction.commit.mockReset();
    transaction.rollback.mockReset();
    created = [];
    saves = [];
    lockCalls = [];
    table = [
      { schoolid: SCHOOL_IN_X, schoolname: SAME_NAME, countryid: C1, organisationid: X, isdeleted: false, curriculums: [] },
      { schoolid: SCHOOL_IN_Y, schoolname: SAME_NAME, countryid: C1, organisationid: Y, isdeleted: false, curriculums: [] },
    ];
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
    // A rename also carries the new name to the four tables that hold a copy of it
    // (learners, logins, classes, Fees Collection rows); they are not under test here.
    for (const copy of [students, schoolusers, standards, schoolcontributedata]) {
      jest.spyOn(copy, "update").mockResolvedValue([0] as never);
    }
    // The name-already-used rule is the database's unique index today; the
    // fake table allows the same name in two organisations, as it will.
    jest.spyOn(schools, "count").mockImplementation((async (o: { where: Record<string, unknown> }) =>
      "schoolname" in o.where ? 0 : table.filter((s) => rowMatches(s, o.where)).length) as never);
    jest.spyOn(schools, "findOne").mockImplementation((async (o: { where: unknown }) => {
      const found = table.find((s) => rowMatches(s, o.where));
      return found ? schoolRow(found) : null;
    }) as never);
    jest.spyOn(schools, "create").mockImplementation((async (attrs: Record<string, unknown>) => {
      created.push({ ...attrs });
      return attrs;
    }) as never);
    jest.spyOn(organisationcountry, "count").mockImplementation((async (o: { where: { organisationid: string; countryid: string }; transaction?: unknown }) =>
      links.filter((l) => l.organisationid === o.where.organisationid && l.countryid === o.where.countryid).length) as never);
    jest.spyOn(organisations, "findOne").mockImplementation((async (o: { where: { organisationid: string }; transaction?: unknown }) => {
      lockCalls.push({ organisationid: o.where.organisationid, hasTransaction: o.transaction !== undefined });
      return [X, Y].includes(o.where.organisationid) ? { organisationid: o.where.organisationid, isdeleted: false } : null;
    }) as never);
  });

  const create = (token: string, body: object) =>
    request(app.getHttpServer()).post("/school/create").set("Authorization", token).send(body);
  const update = (token: string, id: string, body: object) =>
    request(app.getHttpServer()).put(`/school/update/${id}`).set("Authorization", token).send(body);
  const school = (over: Record<string, unknown> = {}) => ({ schoolname: "សាលាថ្មី", countryid: C1, curriculums: [], ...over });
  const nothingWritten = () => {
    expect(created).toEqual([]);
    expect(saves).toEqual([]);
    expect(transaction.commit).not.toHaveBeenCalled();
  };

  describe("POST /school/create", () => {
    describe.each(IN_X)("%s", (who) => {
      it("writes the caller's organisation, the organisation row locked and read inside the transaction", async () => {
        await create(callers[who], school()).expect(200);
        expect(created).toHaveLength(1);
        expect(created[0].organisationid).toBe(X);
        expect(lockCalls).toEqual([{ organisationid: X, hasTransaction: true }]);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
      });

      it("two organisations may each have a school of the same name", async () => {
        await create(callers[who], school({ schoolname: SAME_NAME })).expect(200);
        expect(created[0]).toMatchObject({ schoolname: SAME_NAME, organisationid: X });
        expect(table.filter((s) => s.schoolname === SAME_NAME).map((s) => s.organisationid).sort()).toEqual([X, Y].sort());
      });

      it("a body organisationid equal to X is accepted; any other is refused (403) and nothing is written", async () => {
        await create(callers[who], school({ organisationid: X })).expect(200);
        created = [];
        transaction.commit.mockClear();
        for (const other of [Y, null, DELETED]) {
          await create(callers[who], school({ organisationid: other })).expect(403);
        }
        nothingWritten();
      });

      it("a country the organisation is not linked to is 400 on countryid, and nothing is written", async () => {
        const res = await create(callers[who], school({ countryid: C2 }));
        expect(res.status).toBe(400);
        expect(res.body.fields[0].field).toBe("countryid");
        nothingWritten();
      });
    });

    describe("the platform", () => {
      const token = callers.platform;

      it("may omit the organisation: the school is written with none (the column stays nullable until the backfill has run)", async () => {
        await create(token, school()).expect(200);
        expect(created[0].organisationid).toBeNull();
        expect(lockCalls).toEqual([]);
      });

      it("may send null: the same", async () => {
        await create(token, school({ organisationid: null })).expect(200);
        expect(created[0].organisationid).toBeNull();
      });

      it("may name an organisation: written, row locked inside the transaction, country must be one of its countries", async () => {
        await create(token, school({ organisationid: Y, countryid: C2 })).expect(200);
        expect(created[0].organisationid).toBe(Y);
        expect(lockCalls).toEqual([{ organisationid: Y, hasTransaction: true }]);
      });

      it("a country the named organisation is not linked to is 400 on countryid, nothing written", async () => {
        for (const [organisationid, countryid] of [[X, C2], [Y, C3]]) {
          const res = await create(token, school({ organisationid, countryid }));
          expect(res.status).toBe(400);
          expect(res.body.fields[0].field).toBe("countryid");
        }
        nothingWritten();
      });

      it("a deleted or unknown organisation is 400 on organisationid, nothing written", async () => {
        for (const organisationid of [DELETED, UNKNOWN_ORG]) {
          const res = await create(token, school({ organisationid }));
          expect(res.status).toBe(400);
          expect(res.body.fields[0].field).toBe("organisationid");
        }
        nothingWritten();
      });

      it("a malformed organisationid is 400", async () => {
        for (const bad of ["", "nope", 7, {}]) {
          await create(token, school({ organisationid: bad })).expect(400);
        }
        nothingWritten();
      });
    });

    it("an unassigned caller has no scope: 403, nothing written", async () => {
      await create(callers.unassigned, school()).expect(403);
      nothingWritten();
    });
  });

  describe("PUT /school/update/:schoolid", () => {
    describe.each(IN_X)("%s", (who) => {
      it("updates a school without naming an organisation: the school keeps its own", async () => {
        await update(callers[who], SCHOOL_IN_X, school({ schoolname: SAME_NAME })).expect(200);
        expect(saves).toHaveLength(1);
        expect(saves[0].fields).not.toContain("organisationid");
        expect(table[0].organisationid).toBe(X);
      });

      it("a body organisationid is refused (403) whatever it says, and nothing is written", async () => {
        for (const value of [X, Y, null]) {
          await update(callers[who], SCHOOL_IN_X, school({ organisationid: value })).expect(403);
        }
        nothingWritten();
      });

      it("moving a school that has an organisation to a country that organisation is not linked to is 400, nothing written", async () => {
        const res = await update(callers[who], SCHOOL_IN_X, school({ countryid: C2 }));
        expect(res.status).toBe(400);
        expect(res.body.fields[0].field).toBe("countryid");
        nothingWritten();
      });
    });

    describe("the platform", () => {
      const token = callers.platform;

      it("changes a school's organisation: the key is saved, the row locked inside the transaction, the country must be one of its countries", async () => {
        await update(token, SCHOOL_IN_X, school({ organisationid: Y, countryid: C2 })).expect(200);
        expect(saves[0].fields).toContain("organisationid");
        expect(table[0].organisationid).toBe(Y);
        expect(lockCalls).toEqual([{ organisationid: Y, hasTransaction: true }]);
      });

      it("a country the new organisation is not linked to is 400, nothing written", async () => {
        const res = await update(token, SCHOOL_IN_X, school({ organisationid: X, countryid: C2 }));
        expect(res.status).toBe(400);
        nothingWritten();
        await update(token, SCHOOL_IN_X, school({ organisationid: Y, countryid: C3 })).expect(400);
        nothingWritten();
      });

      it("a deleted or unknown organisation is 400, nothing written", async () => {
        for (const organisationid of [DELETED, UNKNOWN_ORG]) {
          await update(token, SCHOOL_IN_X, school({ organisationid })).expect(400);
        }
        nothingWritten();
      });

      it("null clears the organisation (no country check then)", async () => {
        await update(token, SCHOOL_IN_X, school({ organisationid: null, countryid: C3 })).expect(200);
        expect(table[0].organisationid).toBeNull();
      });
    });

    it("an unassigned caller has no scope: 403, nothing written", async () => {
      await update(callers.unassigned, SCHOOL_IN_X, school()).expect(403);
      nothingWritten();
    });
  });

  describe("a curriculum can only be attached to a school of the same organisation", () => {
    const CX = "c0000000-0000-4000-8000-0000000000a1"; // owned by X
    const CY = "c0000000-0000-4000-8000-0000000000b1"; // owned by Y
    const CU = "c0000000-0000-4000-8000-0000000000c1"; // not owned yet
    beforeEach(() => {
      const owners: Record<string, string | null> = { [CX]: X, [CY]: Y, [CU]: null };
      jest.spyOn(curriculums, "findOne").mockImplementation((async (o: { where: { curriculumid: string } }) =>
        o.where.curriculumid in owners ? { curriculumid: o.where.curriculumid, organisationid: owners[o.where.curriculumid] } : null) as never);
    });
    const refusal = (res: { status: number; body: { errormessage: string } }) => {
      expect(res.status).toBe(400);
      expect(res.body.errormessage).toBe("These belong to different organisations, so one can't be attached to the other.");
    };

    describe.each(IN_X)("%s", (who) => {
      it("create: a curriculum of X is attached; one of Y is refused (400) and nothing is written; an unowned one is allowed", async () => {
        await create(callers[who], school({ curriculums: [CX, CU] })).expect(200);
        expect(created).toHaveLength(1);
        created = [];
        transaction.commit.mockClear();
        refusal(await create(callers[who], school({ curriculums: [CX, CY] })));
        nothingWritten();
      });

      it("update: adding a curriculum of Y is refused (400), nothing saved; adding one of X or an unowned one is allowed", async () => {
        refusal(await update(callers[who], SCHOOL_IN_X, school({ curriculums: [CY] })));
        nothingWritten();
        await update(callers[who], SCHOOL_IN_X, school({ curriculums: [CX, CU] })).expect(200);
        expect(table[0].curriculums).toEqual([CX, CU]);
      });

      it("update: a link that is already there is not re-checked, so an edit that keeps it still works", async () => {
        table[0].curriculums = [CY];
        await update(callers[who], SCHOOL_IN_X, school({ curriculums: [CY] })).expect(200);
      });
    });

    it("a school with no organisation yet takes any curriculum (allowed until the owners are assigned)", async () => {
      await create(callers.platform, school({ curriculums: [CX, CY] })).expect(200);
      expect(created[0].organisationid).toBeNull();
    });

    it("the platform moving a school to another organisation re-checks every curriculum it has", async () => {
      table[0].curriculums = [CX];
      refusal(await update(callers.platform, SCHOOL_IN_X, school({ organisationid: Y, countryid: C2, curriculums: [CX] })));
      nothingWritten();
    });
  });
});
