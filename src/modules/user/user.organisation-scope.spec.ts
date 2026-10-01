import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { lmsusers } from "src/models/data-models/lmsusers";
import { organisations } from "src/models/data-models/organisations";
import { roles } from "src/models/data-models/roles";
import { tokens } from "src/models/data-models/tokens";
import { Role } from "src/models/enums";
import { RolePermissionController } from "src/modules/role-permission/role-perm.controller";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { rowMatches, withPrimaryKey } from "src/test-support/fakewhere";
import { UserController } from "./user.controller";

/**
 * Staff administration is confined to the caller's organisation, and every
 * staff account that is not a platform account belongs to exactly one
 * organisation, given by whoever creates it.
 *
 * Callers, as the validated token states them (`@Org()`):
 *  - platform:           isplatform true, no organisation (sees everything);
 *  - platform acting X:  isplatform true, organisation X (scoped to X);
 *  - X's Super Admin:    a user of X holding Super Admin (not platform);
 *  - X's Admin:          a user of X holding the user permissions;
 *  - unassigned:         not platform and no organisation (no scope at all).
 * Targets: accounts in X, accounts in Y, and a platform account.
 *
 * Driven over real HTTP through the real strategy, guards, controllers and
 * business classes. Replaced: the models (an in-memory table of accounts that
 * applies the `where` it is given, so the caller's scope is really applied) and
 * the transaction. On every refusal nothing is written.
 */
const tokenExists = jest.fn();
jest.mock("src/business/token.business", () => ({
  ...jest.requireActual("src/business/token.business"),
  TokenBusiness: jest.fn().mockImplementation(() => ({
    tokenExists,
    validateStaffAccessToken: (...args: unknown[]) => tokenExists(...args),
  })),
}));

withPrimaryKey(lmsusers, "lmsuserid");

const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DELETED = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const UNKNOWN_ORG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
// Khmer organisation names, as in the real data.
const ORG_NAMES: Record<string, string> = { [X]: "សាលាគំរូ ក", [Y]: "សាលាគំរូ ខ" };

const ID = {
  x1: "11111111-0000-4000-8000-000000000001",
  x2: "11111111-0000-4000-8000-000000000002",
  y1: "22222222-0000-4000-8000-000000000001",
  y2: "22222222-0000-4000-8000-000000000002",
  p1: "33333333-0000-4000-8000-000000000001",
  gone: "99999999-0000-4000-8000-000000000009",
};

const ROLE_NAMES: Record<string, string> = {
  [Role.superadmin]: "Super Admin",
  [Role.admin]: "Admin",
  [Role.teacher]: "Teacher",
};
const roleRow = (roleid: string) => ({ roleid, rolename: ROLE_NAMES[roleid] ?? roleid });

type Account = {
  lmsuserid: string;
  lmsusername: string;
  organisationid: string | null;
  isdisabled: boolean;
  held: string[];
  passwordhash: string;
};

let accounts: Account[] = [];
let writes: { saves: Array<{ id: string; fields: string[] }>; setRoles: string[]; creates: Array<Record<string, unknown>> } = {
  saves: [],
  setRoles: [],
  creates: [],
};
let destroyed: string[] = [];
let lockCalls: Array<{ organisationid: string; lock: unknown; hasTransaction: boolean }> = [];
const transaction = { commit: jest.fn(), rollback: jest.fn() };

const plain = (a: Account) => ({ lmsuserid: a.lmsuserid, lmsusername: a.lmsusername, organisationid: a.organisationid, isdisabled: a.isdisabled });

const rowOf = (a: Account) => {
  const row: Record<string, unknown> = {
    lmsuserid: a.lmsuserid,
    lmsusername: a.lmsusername,
    organisationid: a.organisationid,
    isdisabled: a.isdisabled,
    lmsuserpasswordhash: a.passwordhash,
    get roles() {
      return a.held.map(roleRow);
    },
    get organisation() {
      return a.organisationid ? { organisationid: a.organisationid, organisationname: ORG_NAMES[a.organisationid] } : null;
    },
    get: () => plain(a),
    getRoles: async () => a.held.map(roleRow),
    setRoles: async (rows: Array<{ roleid: string }>) => {
      writes.setRoles.push(a.lmsuserid);
      a.held = rows.map((r) => r.roleid);
      return [];
    },
    save: async (o: { fields: string[] }) => {
      writes.saves.push({ id: a.lmsuserid, fields: o.fields });
      a.lmsusername = row.lmsusername as string;
      a.organisationid = row.organisationid as string | null;
      a.isdisabled = row.isdisabled as boolean;
      a.passwordhash = row.lmsuserpasswordhash as string;
    },
    setDataValue: (key: string, value: unknown) => {
      row[key] = value;
    },
    toJSON: () => ({ ...plain(a), roles: a.held.map(roleRow), organisation: row.organisation }),
  };
  return row;
};

const account = (id: string, email: string, organisationid: string | null, held: string[] = [Role.admin]): Account => ({
  lmsuserid: id,
  lmsusername: email,
  organisationid,
  isdisabled: false,
  held,
  passwordhash: `hash-of-${email}`,
});

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;
const PERMS = ["view_user", "create_user", "update_user", "delete_user"];
const callers = {
  platform: bearer({ lmsuserid: "caller", lmsuserroles: [Role.superadmin], permissions: ["superadmin"], organisationid: null, isplatform: true }),
  platformActingX: bearer({ lmsuserid: "caller", lmsuserroles: [Role.superadmin], permissions: ["superadmin"], organisationid: X, isplatform: true }),
  xSuperAdmin: bearer({ lmsuserid: "caller", lmsuserroles: [Role.superadmin], permissions: ["superadmin"], organisationid: X, isplatform: false }),
  xAdmin: bearer({ lmsuserid: "caller", lmsuserroles: [Role.admin], permissions: PERMS, organisationid: X, isplatform: false }),
  unassigned: bearer({ lmsuserid: "caller", lmsuserroles: [Role.admin], permissions: PERMS, organisationid: null, isplatform: false }),
};
type Who = keyof typeof callers;
const IN_X: Who[] = ["platformActingX", "xSuperAdmin", "xAdmin"];

describe("staff administration is scoped to the caller's organisation", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger, "warn").mockImplementation(() => Logger);
    const moduleRef = await Test.createTestingModule({
      controllers: [UserController, RolePermissionController],
      providers: [JwtAccessStrategy],
    }).compile();
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
    writes = { saves: [], setRoles: [], creates: [] };
    destroyed = [];
    lockCalls = [];
    accounts = [
      account(ID.x1, "x1.staff@example.com", X),
      account(ID.x2, "x2.staff@example.com", X),
      account(ID.y1, "y1.staff@example.com", Y),
      account(ID.y2, "y2.staff@example.com", Y),
      account(ID.p1, "platform.person@example.com", null, [Role.superadmin]),
    ];
    jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);

    jest.spyOn(lmsusers, "findOne").mockImplementation((async (o: { where: Record<string, unknown> }) => {
      if (o.where && "lmsusername" in o.where) {
        const taken = accounts.find((a) => a.lmsusername === o.where.lmsusername);
        return taken ? rowOf(taken) : null;
      }
      const found = accounts.find((a) => rowMatches(plain(a), o.where));
      return found ? rowOf(found) : null;
    }) as never);
    jest.spyOn(lmsusers, "findAndCountAll").mockImplementation((async (o: { where: unknown }) => {
      const found = accounts.filter((a) => rowMatches(plain(a), o.where));
      return { rows: found.map(rowOf), count: found.length };
    }) as never);
    jest.spyOn(lmsusers, "create").mockImplementation((async (attrs: Record<string, unknown>) => {
      writes.creates.push({ ...attrs });
      const created = account(attrs.lmsuserid as string, attrs.lmsusername as string, (attrs.organisationid as string | null) ?? null, []);
      accounts.push(created);
      return rowOf(created);
    }) as never);
    // Like MySQL on roles.roleid: ignoring case and trailing spaces; the row carries the stored id.
    jest.spyOn(roles, "findAll").mockImplementation((async (o?: { where?: { roleid: unknown } }) => {
      const stored = Object.keys(ROLE_NAMES);
      if (!o || !o.where) return stored.map(roleRow);
      const ids = Object.getOwnPropertySymbols(o.where.roleid as object).map((k) => (o.where!.roleid as Record<symbol, string[]>)[k])[0];
      return stored.filter((c) => ids.some((id) => id.replace(/ +$/, "").toLowerCase() === c.toLowerCase())).map(roleRow);
    }) as never);
    jest.spyOn(organisations, "findOne").mockImplementation((async (o: { where: { organisationid: string }; lock?: unknown; transaction?: unknown }) => {
      lockCalls.push({ organisationid: o.where.organisationid, lock: o.lock, hasTransaction: o.transaction !== undefined });
      return [X, Y].includes(o.where.organisationid) ? { organisationid: o.where.organisationid, isdeleted: false } : null;
    }) as never);
    jest.spyOn(tokens, "destroy").mockImplementation((async (o: { where: { lmsuserid: string } }) => {
      destroyed.push(o.where.lmsuserid);
      return 1;
    }) as never);
  });

  const snapshot = () => JSON.stringify(accounts);
  const nothingWritten = (before: string) => {
    expect(writes).toEqual({ saves: [], setRoles: [], creates: [] });
    expect(destroyed).toEqual([]);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
  };
  const byId = (id: string) => accounts.find((a) => a.lmsuserid === id)!;

  const api = {
    list: (token: string, body: object = {}) => request(app.getHttpServer()).post("/user").set("Authorization", token).send(body),
    get: (token: string, id: string) => request(app.getHttpServer()).get(`/user/${id}`).set("Authorization", token),
    create: (token: string, body: object) => request(app.getHttpServer()).post("/user/create").set("Authorization", token).send(body),
    update: (token: string, id: string, body: object) => request(app.getHttpServer()).put(`/user/${id}`).set("Authorization", token).send(body),
    remove: (token: string, id: string) => request(app.getHttpServer()).delete(`/user/${id}`).set("Authorization", token),
    bind: (token: string, id: string, rolesid: unknown) =>
      request(app.getHttpServer()).post("/roles/user-bind-role").set("Authorization", token).send({ lmsuserid: id, rolesid }),
  };
  const newStaff = (over: Record<string, unknown> = {}) => ({
    lmsusername: "new.staff@example.com",
    lmsuserpasswordhash: "SamplePass12",
    lmsuserroles: [Role.admin],
    ...over,
  });
  const edit = (over: Record<string, unknown> = {}) => ({
    lmsusername: "renamed@example.com",
    lmsuserpasswordhash: "ChangedPass12",
    lmsuserroles: [Role.admin],
    ...over,
  });
  const sameError = (a: { status: number; body: Record<string, unknown> }, b: { status: number; body: Record<string, unknown> }) => {
    expect(a.status).toBe(b.status);
    expect({ code: a.body.code, errormessage: a.body.errormessage, hint: a.body.hint }).toEqual({
      code: b.body.code,
      errormessage: b.body.errormessage,
      hint: b.body.hint,
    });
  };

  describe("POST /user (list)", () => {
    const idsOf = (res: { body: { data: { data: Array<{ lmsuserid: string }>; total: number } } }) => res.body.data.data.map((u) => u.lmsuserid).sort();

    it("the platform sees every account, with its organisation and the organisation's name", async () => {
      const res = await api.list(callers.platform).expect(200);
      expect(idsOf(res)).toEqual([ID.x1, ID.x2, ID.y1, ID.y2, ID.p1].sort());
      expect(res.body.data.total).toBe(5);
      const x1 = res.body.data.data.find((u: { lmsuserid: string }) => u.lmsuserid === ID.x1);
      expect(x1.organisationid).toBe(X);
      expect(x1.organisation.organisationname).toBe(ORG_NAMES[X]);
      expect(res.body.data.data.find((u: { lmsuserid: string }) => u.lmsuserid === ID.p1).organisationid).toBeNull();
    });

    it.each(IN_X)("%s sees only X's accounts: Y's accounts and platform accounts are absent, and the count matches", async (who) => {
      const res = await api.list(callers[who]).expect(200);
      expect(idsOf(res)).toEqual([ID.x1, ID.x2].sort());
      expect(res.body.data.total).toBe(2);
      for (const hidden of [ID.y1, ID.y2, ID.p1]) {
        expect(JSON.stringify(res.body)).not.toContain(hidden);
      }
      expect(JSON.stringify(res.body)).not.toContain(ORG_NAMES[Y]);
    });

    it.each(IN_X)("%s cannot widen the list with a filter: it is ANDed with the scope", async (who) => {
      const res = await api.list(callers[who], { filter: [{ key: "lmsusername", value: "y1.staff" }] }).expect(200);
      expect(idsOf(res)).toEqual([]);
      expect(res.body.data.total).toBe(0);
    });

    it("a disabled account is not listed, for any caller", async () => {
      byId(ID.x2).isdisabled = true;
      expect(idsOf(await api.list(callers.xAdmin).expect(200))).toEqual([ID.x1]);
    });

    it("an unassigned caller has no scope: 403, and nothing is listed", async () => {
      const res = await api.list(callers.unassigned).expect(403);
      expect(res.body.code).toBe("NOT_ALLOWED");
    });

    it("never returns a password hash", async () => {
      const res = await api.list(callers.platform).expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/hash-of-/);
    });
  });

  describe("GET /user/:lmsuserid", () => {
    it("the platform reads any account, with its organisation and name, and no password hash", async () => {
      for (const id of [ID.x1, ID.y1, ID.p1]) {
        const res = await api.get(callers.platform, id).expect(200);
        expect(res.body.data.user.lmsuserid).toBe(id);
        expect(JSON.stringify(res.body)).not.toMatch(/hash-of-/);
      }
      const res = await api.get(callers.platform, ID.y1).expect(200);
      expect(res.body.data.user.organisationid).toBe(Y);
      expect(res.body.data.user.organisation.organisationname).toBe(ORG_NAMES[Y]);
    });

    it.each(IN_X)("%s reads an account in X", async (who) => {
      const res = await api.get(callers[who], ID.x1).expect(200);
      expect(res.body.data.user.organisationid).toBe(X);
      expect(res.body.data.user.organisation.organisationname).toBe(ORG_NAMES[X]);
    });

    it.each(IN_X)("%s gets the same 404 for an account in Y, a platform account and an id that does not exist", async (who) => {
      const inY = await api.get(callers[who], ID.y1);
      const platformAccount = await api.get(callers[who], ID.p1);
      const missing = await api.get(callers[who], ID.gone);
      expect(missing.status).toBe(404);
      sameError(inY, missing);
      sameError(platformAccount, missing);
      expect(JSON.stringify([inY.body, platformAccount.body])).not.toMatch(/y1\.staff|platform\.person|សាលាគំរូ/);
    });

    it("an unassigned caller has no scope: 403", async () => {
      await api.get(callers.unassigned, ID.x1).expect(403);
    });
  });

  describe("POST /user/create", () => {
    describe.each(IN_X)("%s creates an account in X", (who) => {
      it("the new account's organisation is X, taken from the caller; the row is locked and read live inside the transaction", async () => {
        const res = await api.create(callers[who], newStaff()).expect(200);
        expect(writes.creates).toHaveLength(1);
        expect(writes.creates[0].organisationid).toBe(X);
        expect(res.body.data.organisationid).toBe(X);
        expect(lockCalls).toEqual([{ organisationid: X, lock: expect.anything(), hasTransaction: true }]);
        expect(transaction.commit).toHaveBeenCalledTimes(1);
      });

      it("a body organisationid equal to X is accepted", async () => {
        await api.create(callers[who], newStaff({ organisationid: X })).expect(200);
        expect(writes.creates[0].organisationid).toBe(X);
      });

      it("a body organisationid that is Y, null or anything else is refused (403) and nothing is written", async () => {
        const before = snapshot();
        for (const other of [Y, null, DELETED]) {
          await api.create(callers[who], newStaff({ organisationid: other })).expect(403);
        }
        nothingWritten(before);
      });

      it("Super Admin cannot be granted: 403, nothing written", async () => {
        const before = snapshot();
        await api.create(callers[who], newStaff({ lmsuserroles: [Role.superadmin] })).expect(403);
        await api.create(callers[who], newStaff({ lmsuserroles: [Role.admin, Role.superadmin] })).expect(403);
        nothingWritten(before);
      });
    });

    describe("the platform creates an account", () => {
      const token = callers.platform;

      it("without Super Admin it must name an organisation: absent or null is 400, nothing written", async () => {
        const before = snapshot();
        for (const body of [newStaff(), newStaff({ organisationid: null })]) {
          const res = await api.create(token, body);
          expect(res.status).toBe(400);
          expect(res.body.fields[0].field).toBe("organisationid");
        }
        nothingWritten(before);
      });

      it("without Super Admin and naming a live organisation: the account is created in it (row locked inside the transaction)", async () => {
        await api.create(token, newStaff({ organisationid: Y })).expect(200);
        expect(writes.creates[0].organisationid).toBe(Y);
        expect(lockCalls).toEqual([{ organisationid: Y, lock: expect.anything(), hasTransaction: true }]);
      });

      it("naming an organisation that is deleted or does not exist is 400, nothing written", async () => {
        const before = snapshot();
        await api.create(token, newStaff({ organisationid: DELETED })).expect(400);
        await api.create(token, newStaff({ organisationid: UNKNOWN_ORG })).expect(400);
        nothingWritten(before);
      });

      it("a malformed organisationid is 400 before anything else", async () => {
        const before = snapshot();
        for (const bad of ["", "not-a-uuid", 7, {}]) {
          await api.create(token, newStaff({ organisationid: bad })).expect(400);
        }
        nothingWritten(before);
      });

      it("with Super Admin it is a platform account: no organisation, or null, is accepted", async () => {
        await api.create(token, newStaff({ lmsuserroles: [Role.superadmin] })).expect(200);
        await api.create(token, newStaff({ lmsusername: "second@example.com", lmsuserroles: [Role.superadmin], organisationid: null })).expect(200);
        expect(writes.creates.map((c) => c.organisationid)).toEqual([null, null]);
        expect(lockCalls).toEqual([]);
      });

      it("with Super Admin and an organisation is 400, nothing written", async () => {
        const before = snapshot();
        const res = await api.create(token, newStaff({ lmsuserroles: [Role.superadmin], organisationid: X }));
        expect(res.status).toBe(400);
        expect(res.body.fields[0].field).toBe("organisationid");
        nothingWritten(before);
      });
    });

    it("an unassigned caller has no scope: 403, nothing written", async () => {
      const before = snapshot();
      await api.create(callers.unassigned, newStaff()).expect(403);
      nothingWritten(before);
    });
  });

  describe("PUT /user/:lmsuserid", () => {
    describe.each(IN_X)("%s", (who) => {
      it("edits an account in X (email, password, roles) and the organisation stays X", async () => {
        await api.update(callers[who], ID.x1, edit()).expect(200);
        expect(byId(ID.x1).lmsusername).toBe("renamed@example.com");
        expect(byId(ID.x1).organisationid).toBe(X);
        expect(writes.saves[0].fields).not.toContain("organisationid");
        expect(destroyed).toEqual([]);
      });

      it("gets the same 404 for an account in Y, a platform account and a missing id; nothing is written", async () => {
        const before = snapshot();
        const inY = await api.update(callers[who], ID.y1, edit());
        const platformAccount = await api.update(callers[who], ID.p1, edit());
        const missing = await api.update(callers[who], ID.gone, edit());
        expect(missing.status).toBe(404);
        sameError(inY, missing);
        sameError(platformAccount, missing);
        nothingWritten(before);
      });

      it("a body organisationid is refused (403) whatever it says, and nothing is written", async () => {
        const before = snapshot();
        for (const value of [X, Y, null]) {
          await api.update(callers[who], ID.x1, edit({ organisationid: value })).expect(403);
        }
        nothingWritten(before);
      });
    });

    describe("the platform", () => {
      const token = callers.platform;

      it("edits an account in any organisation, and a platform account, with the organisation unchanged when the key is absent", async () => {
        await api.update(token, ID.y1, edit()).expect(200);
        expect(byId(ID.y1).organisationid).toBe(Y);
        await api.update(token, ID.p1, edit({ lmsuserroles: [Role.superadmin] })).expect(200);
        expect(byId(ID.p1).organisationid).toBeNull();
        expect(destroyed).toEqual([]);
      });

      it("moves an account to another live organisation: the organisation changes, the row is locked and read inside the transaction, and its sessions end", async () => {
        await api.update(token, ID.x1, edit({ organisationid: Y })).expect(200);
        expect(byId(ID.x1).organisationid).toBe(Y);
        expect(writes.saves[0].fields).toContain("organisationid");
        expect(lockCalls).toEqual([{ organisationid: Y, lock: expect.anything(), hasTransaction: true }]);
        expect(destroyed).toEqual([ID.x1]);
      });

      it("moving to a deleted or unknown organisation is 400, nothing written", async () => {
        const before = snapshot();
        await api.update(token, ID.x1, edit({ organisationid: DELETED })).expect(400);
        await api.update(token, ID.x1, edit({ organisationid: UNKNOWN_ORG })).expect(400);
        nothingWritten(before);
      });

      it("clearing the organisation of an account that will not hold Super Admin is 400, nothing written", async () => {
        const before = snapshot();
        const res = await api.update(token, ID.x1, edit({ organisationid: null }));
        expect(res.status).toBe(400);
        expect(res.body.fields[0].field).toBe("organisationid");
        nothingWritten(before);
      });

      it("clearing the organisation is allowed when the resulting roles include Super Admin: the account becomes a platform account", async () => {
        await api.update(token, ID.x1, edit({ organisationid: null, lmsuserroles: [Role.superadmin] })).expect(200);
        expect(byId(ID.x1).organisationid).toBeNull();
        expect(byId(ID.x1).held).toEqual([Role.superadmin]);
        expect(destroyed).toEqual([ID.x1]);
      });

      it("moving an account into an organisation while it holds Super Admin (kept) is refused (403), nothing written", async () => {
        const before = snapshot();
        await api.update(token, ID.p1, edit({ organisationid: X, lmsuserroles: [Role.superadmin] })).expect(403);
        // an account in X given Super Admin in the same request
        await api.update(token, ID.x1, edit({ organisationid: Y, lmsuserroles: [Role.superadmin] })).expect(403);
        // and Super Admin granted without moving it
        await api.update(token, ID.x1, edit({ lmsuserroles: [Role.superadmin] })).expect(403);
        nothingWritten(before);
      });

      it("a platform account can be demoted into an organisation in one request: Super Admin removed, organisation set, sessions end", async () => {
        await api.update(token, ID.p1, edit({ organisationid: X, lmsuserroles: [Role.admin] })).expect(200);
        expect(byId(ID.p1).organisationid).toBe(X);
        expect(byId(ID.p1).held).toEqual([Role.admin]);
        expect(destroyed).toContain(ID.p1);
      });

      it("removing Super Admin from a platform account without giving it an organisation is 400, nothing written", async () => {
        const before = snapshot();
        await api.update(token, ID.p1, edit({ lmsuserroles: [Role.admin] })).expect(400);
        await api.update(token, ID.p1, edit({ lmsuserroles: [Role.admin], organisationid: null })).expect(400);
        nothingWritten(before);
      });

      it("a malformed organisationid is 400", async () => {
        for (const bad of ["", "not-a-uuid", 7, {}]) {
          await api.update(token, ID.x1, edit({ organisationid: bad })).expect(400);
        }
        expect(writes.saves).toEqual([]);
      });

      it("a missing id is 404", async () => {
        await api.update(token, ID.gone, edit()).expect(404);
      });
    });

    it("an unassigned caller has no scope: 403, nothing written", async () => {
      const before = snapshot();
      await api.update(callers.unassigned, ID.x1, edit()).expect(403);
      nothingWritten(before);
    });
  });

  describe("DELETE /user/:lmsuserid", () => {
    describe.each(IN_X)("%s", (who) => {
      it("disables an account in X and ends its sessions", async () => {
        await api.remove(callers[who], ID.x1).expect(200);
        expect(byId(ID.x1).isdisabled).toBe(true);
        expect(byId(ID.x1).held).toEqual([]);
        expect(destroyed).toEqual([ID.x1]);
      });

      it("gets the same 404 for an account in Y, a platform account and a missing id; nothing is written", async () => {
        const before = snapshot();
        const inY = await api.remove(callers[who], ID.y1);
        const platformAccount = await api.remove(callers[who], ID.p1);
        const missing = await api.remove(callers[who], ID.gone);
        expect(missing.status).toBe(404);
        sameError(inY, missing);
        sameError(platformAccount, missing);
        nothingWritten(before);
      });
    });

    it("the platform disables an account in any organisation, and a platform account", async () => {
      await api.remove(callers.platform, ID.y1).expect(200);
      await api.remove(callers.platform, ID.p1).expect(200);
      expect(byId(ID.y1).isdisabled).toBe(true);
      expect(byId(ID.p1).isdisabled).toBe(true);
    });

    it("an unassigned caller has no scope: 403, nothing written", async () => {
      const before = snapshot();
      await api.remove(callers.unassigned, ID.x1).expect(403);
      nothingWritten(before);
    });
  });

  describe("POST /roles/user-bind-role", () => {
    describe.each(IN_X)("%s", (who) => {
      it("binds roles to an account in X", async () => {
        await api.bind(callers[who], ID.x1, [Role.teacher]).expect(200);
        expect(byId(ID.x1).held).toEqual([Role.teacher]);
      });

      it("gets the same 404 for an account in Y, a platform account and a missing id; nothing is written", async () => {
        const before = snapshot();
        const inY = await api.bind(callers[who], ID.y1, [Role.teacher]);
        const platformAccount = await api.bind(callers[who], ID.p1, [Role.teacher]);
        const missing = await api.bind(callers[who], ID.gone, [Role.teacher]);
        expect(missing.status).toBe(404);
        sameError(inY, missing);
        sameError(platformAccount, missing);
        nothingWritten(before);
      });

      it("Super Admin cannot be bound to an account in X (403), nothing written", async () => {
        const before = snapshot();
        await api.bind(callers[who], ID.x1, [Role.superadmin]).expect(403);
        nothingWritten(before);
      });
    });

    describe("the platform", () => {
      const token = callers.platform;

      it("binds roles to an account in any organisation", async () => {
        await api.bind(token, ID.y1, [Role.teacher]).expect(200);
        expect(byId(ID.y1).held).toEqual([Role.teacher]);
      });

      it("binds Super Admin to a platform account, but never to an account that has an organisation", async () => {
        await api.bind(token, ID.p1, [Role.superadmin, Role.admin]).expect(200);
        writes = { saves: [], setRoles: [], creates: [] };
        destroyed = [];
        transaction.commit.mockClear();
        const before = snapshot();
        await api.bind(token, ID.y1, [Role.superadmin]).expect(403);
        nothingWritten(before);
      });

      it("removing Super Admin from a platform account by role binding alone is 400 (it would leave the account with neither), nothing written", async () => {
        const before = snapshot();
        await api.bind(token, ID.p1, [Role.admin]).expect(400);
        nothingWritten(before);
      });
    });

    it("an unassigned caller has no scope: 403, nothing written", async () => {
      const before = snapshot();
      await api.bind(callers.unassigned, ID.x1, [Role.teacher]).expect(403);
      nothingWritten(before);
    });
  });
});
