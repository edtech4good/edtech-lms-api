import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";
import { Config, Logger } from "src/config";
import { ORGANISATION_ADMIN_PERMISSIONS_20261002 } from "src/db/frozen/organisation-admin-20261002";
import { GlobalExceptionFilter } from "src/filters/global-exception.filter";
import { lmsusers } from "src/models/data-models/lmsusers";
import { organisations } from "src/models/data-models/organisations";
import { permissionstitle } from "src/models/data-models/permissionstitle";
import { roles } from "src/models/data-models/roles";
import { tokens } from "src/models/data-models/tokens";
import { Role } from "src/models/enums";
import { RolePermissionController } from "src/modules/role-permission/role-perm.controller";
import { JwtAccessStrategy } from "src/services/auth.strategy";
import { dbinstance } from "src/services/dbservice";
import { rowMatches, withPrimaryKey } from "src/test-support/fakewhere";
import { UserController } from "./user.controller";

/**
 * The "Organisation Admin" role runs ONE organisation's staff. A user who holds
 * it, in organisation X, can list, read, create, update, disable and give roles
 * to X's accounts - including giving Organisation Admin to a colleague - and
 * nothing outside X: not Y's accounts, not platform accounts, and never Super
 * Admin. It does not decide which organisation an account belongs to, and the
 * role list it is shown leaves out Super Admin.
 *
 * The caller's token carries the permissions the role is really granted (the
 * frozen list the seed migration reads), so a permission dropped from that list
 * turns a test here red. Driven over real HTTP through the real strategy,
 * guards, controllers and business classes; replaced are the models (an
 * in-memory table that applies the `where` it is given) and the transaction.
 * On every refusal nothing is written.
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

const ID = {
  self: "11111111-0000-4000-8000-0000000000aa", // the caller: an Organisation Admin of X
  x1: "11111111-0000-4000-8000-000000000001", // an Admin of X
  x2: "11111111-0000-4000-8000-000000000002", // a Teacher of X
  x3: "11111111-0000-4000-8000-000000000003", // another Organisation Admin of X, where a test adds one
  xs: "11111111-0000-4000-8000-0000000000ff", // an account of X that holds Super Admin (legacy data)
  y1: "22222222-0000-4000-8000-000000000001",
  p1: "33333333-0000-4000-8000-000000000001",
  gone: "99999999-0000-4000-8000-000000000009",
};

const ROLE_NAMES: Record<string, string> = {
  [Role.superadmin]: "Super Admin",
  [Role.admin]: "Admin",
  [Role.teacher]: "Teacher",
  [Role.organisationadmin]: "Organisation Admin",
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
let destroyCalls: Array<{ lmsuserid: string; transaction: unknown }> = [];
const callOrder: string[] = [];
const transaction = { commit: jest.fn(), rollback: jest.fn() };

const plain = (a: Account) => ({ lmsuserid: a.lmsuserid, lmsusername: a.lmsusername, organisationid: a.organisationid, isdisabled: a.isdisabled });

const rowOf = (a: Account) => {
  const row: Record<string, unknown> = {
    ...plain(a),
    lmsuserpasswordhash: a.passwordhash,
    get roles() {
      return a.held.map(roleRow);
    },
    get organisation() {
      return a.organisationid ? { organisationid: a.organisationid, organisationname: "Sample organisation" } : null;
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

const account = (id: string, email: string, organisationid: string | null, held: string[]): Account => ({
  lmsuserid: id,
  lmsusername: email,
  organisationid,
  isdisabled: false,
  held,
  passwordhash: `hash-of-${email}`,
});

const bearer = (claims: Record<string, unknown>) =>
  `Bearer ${sign({ jti: "test-jti", ...claims }, Config.fortyk.api.applicationsecret, { expiresIn: "5m" })}`;

/** What a staff token of an Organisation Admin carries: the role, and exactly the permissions the migration grants it. */
const orgAdminOf = (organisationid: string) =>
  bearer({
    lmsuserid: ID.self,
    lmsuserroles: [Role.organisationadmin],
    permissions: [...ORGANISATION_ADMIN_PERMISSIONS_20261002],
    organisationid,
    isplatform: false,
  });
const callers = {
  orgAdmin: orgAdminOf(X),
  platform: bearer({ lmsuserid: "p0", lmsuserroles: [Role.superadmin], permissions: ["superadmin"], organisationid: null, isplatform: true }),
  platformActingX: bearer({ lmsuserid: "p0", lmsuserroles: [Role.superadmin], permissions: ["superadmin"], organisationid: X, isplatform: true }),
};

describe("an Organisation Admin runs its own organisation's staff", () => {
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
    transaction.commit.mockReset().mockImplementation(async () => void callOrder.push("commit"));
    transaction.rollback.mockReset().mockImplementation(async () => void callOrder.push("rollback"));
    writes = { saves: [], setRoles: [], creates: [] };
    destroyed = [];
    destroyCalls = [];
    callOrder.length = 0;
    accounts = [
      account(ID.self, "self.admin@example.com", X, [Role.organisationadmin]),
      account(ID.x1, "x1.staff@example.com", X, [Role.admin]),
      account(ID.x2, "x2.staff@example.com", X, [Role.teacher]),
      account(ID.xs, "x.super@example.com", X, [Role.superadmin]),
      account(ID.y1, "y1.staff@example.com", Y, [Role.admin]),
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
    // The paginated list applies the `where` it is given, so the filter that hides Super Admin is really applied.
    jest.spyOn(roles, "findAndCountAll").mockImplementation((async (o: { where: unknown; limit?: number }) => {
      const found = Object.keys(ROLE_NAMES).map(roleRow).filter((r) => rowMatches(r, o.where));
      return { rows: found, count: found.length };
    }) as never);
    jest.spyOn(organisations, "findOne").mockImplementation((async (o: { where: { organisationid: string } }) =>
      [X, Y].includes(o.where.organisationid) ? { organisationid: o.where.organisationid, isdeleted: false } : null) as never);
    jest.spyOn(tokens, "destroy").mockImplementation((async (o: { where: { lmsuserid: string }; transaction?: unknown }) => {
      destroyed.push(o.where.lmsuserid);
      destroyCalls.push({ lmsuserid: o.where.lmsuserid, transaction: o.transaction });
      callOrder.push("revoke");
      return 1;
    }) as never);
    // One role by id, like MySQL: ignoring case and trailing spaces; the row carries the stored id.
    jest.spyOn(roles, "findOne").mockImplementation((async (o: { where: { roleid: string } }) => {
      const stored = Object.keys(ROLE_NAMES).find((c) => c.toLowerCase() === String(o.where.roleid).replace(/ +$/, "").toLowerCase());
      return stored ? { ...roleRow(stored), permissions: [{ permissionid: `perm-of-${stored}`, permissionname: "view_user", permissionstitle: { permissiontitleid: "title-1" } }] } : null;
    }) as never);
    jest.spyOn(permissionstitle, "findAll").mockResolvedValue([] as never);
  });

  const snapshot = () => JSON.stringify(accounts);
  const nothingWritten = (before: string) => {
    expect(writes).toEqual({ saves: [], setRoles: [], creates: [] });
    expect(destroyed).toEqual([]);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(snapshot()).toBe(before);
  };
  const byId = (id: string) => accounts.find((a) => a.lmsuserid === id)!;

  const as = callers.orgAdmin;
  const api = {
    list: (token: string, body: object = {}) => request(app.getHttpServer()).post("/user").set("Authorization", token).send(body),
    get: (token: string, id: string) => request(app.getHttpServer()).get(`/user/${id}`).set("Authorization", token),
    create: (token: string, body: object) => request(app.getHttpServer()).post("/user/create").set("Authorization", token).send(body),
    update: (token: string, id: string, body: object) => request(app.getHttpServer()).put(`/user/${id}`).set("Authorization", token).send(body),
    remove: (token: string, id: string) => request(app.getHttpServer()).delete(`/user/${id}`).set("Authorization", token),
    bind: (token: string, id: string, rolesid: unknown) =>
      request(app.getHttpServer()).post("/roles/user-bind-role").set("Authorization", token).send({ lmsuserid: id, rolesid }),
    role: (token: string, id: string) => request(app.getHttpServer()).get(`/roles/${id}`).set("Authorization", token),
    roleList: (token: string) => request(app.getHttpServer()).get("/roles").set("Authorization", token),
    rolePage: (token: string, body: object = {}) => request(app.getHttpServer()).post("/roles").set("Authorization", token).send(body),
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

  describe("what it can do in its own organisation", () => {
    it("POST /user: lists X's accounts and no others (not Y's, not a platform account)", async () => {
      const res = await api.list(as).expect(200);
      const ids = res.body.data.data.map((u: { lmsuserid: string }) => u.lmsuserid).sort();
      expect(ids).toEqual([ID.self, ID.x1, ID.x2, ID.xs].sort());
      expect(res.body.data.total).toBe(4);
      expect(JSON.stringify(res.body)).not.toMatch(/y1\.staff|platform\.person|hash-of-/);
    });

    it("POST /user: a filter cannot widen the list beyond X", async () => {
      const res = await api.list(as, { filter: [{ key: "lmsusername", value: "y1.staff" }] }).expect(200);
      expect(res.body.data.total).toBe(0);
    });

    it("GET /user/:lmsuserid: reads an account in X, without its password hash", async () => {
      const res = await api.get(as, ID.x1).expect(200);
      expect(res.body.data.user.lmsuserid).toBe(ID.x1);
      expect(JSON.stringify(res.body)).not.toMatch(/hash-of-/);
    });

    it("POST /user/create: creates an account in X, whatever the request says about the organisation of the caller: it is X", async () => {
      await api.create(as, newStaff()).expect(200);
      expect(writes.creates).toHaveLength(1);
      expect(writes.creates[0].organisationid).toBe(X);
    });

    it("PUT /user/:lmsuserid: edits an account in X; its organisation stays X", async () => {
      await api.update(as, ID.x1, edit()).expect(200);
      expect(byId(ID.x1).lmsusername).toBe("renamed@example.com");
      expect(byId(ID.x1).organisationid).toBe(X);
      expect(writes.saves[0].fields).not.toContain("organisationid");
    });

    it("DELETE /user/:lmsuserid: disables an account in X and ends its sessions", async () => {
      await api.remove(as, ID.x1).expect(200);
      expect(byId(ID.x1).isdisabled).toBe(true);
      expect(destroyed).toEqual([ID.x1]);
    });

    it("POST /roles/user-bind-role: gives roles to an account in X", async () => {
      await api.bind(as, ID.x2, [Role.admin, Role.teacher]).expect(200);
      expect(byId(ID.x2).held).toEqual([Role.admin, Role.teacher]);
    });
  });

  describe("granting Organisation Admin to a colleague in its own organisation", () => {
    it("by role binding", async () => {
      await api.bind(as, ID.x1, [Role.organisationadmin]).expect(200);
      expect(byId(ID.x1).held).toEqual([Role.organisationadmin]);
    });

    it("when creating the account", async () => {
      await api.create(as, newStaff({ lmsuserroles: [Role.organisationadmin] })).expect(200);
      expect(writes.creates[0].organisationid).toBe(X);
      const created = accounts.find((a) => a.lmsusername === "new.staff@example.com")!;
      expect(created.held).toEqual([Role.organisationadmin]);
    });

    it("when editing the account", async () => {
      await api.update(as, ID.x2, edit({ lmsuserroles: [Role.organisationadmin, Role.teacher] })).expect(200);
      expect(byId(ID.x2).held).toEqual([Role.organisationadmin, Role.teacher]);
    });
  });

  describe("what it cannot reach: Y's accounts and platform accounts (the same 404 as a missing id; nothing written)", () => {
    const attempts: Array<[string, (id: string) => Promise<{ status: number; body: Record<string, unknown> }>]> = [
      ["read", (id) => api.get(as, id)],
      ["update", (id) => api.update(as, id, edit())],
      ["disable", (id) => api.remove(as, id)],
      ["bind roles", (id) => api.bind(as, id, [Role.teacher])],
      ["bind Organisation Admin", (id) => api.bind(as, id, [Role.organisationadmin])],
    ];
    it.each(attempts)("%s", async (_name, act) => {
      const before = snapshot();
      const inY = await act(ID.y1);
      const platformAccount = await act(ID.p1);
      const missing = await act(ID.gone);
      expect(missing.status).toBe(404);
      sameError(inY, missing);
      sameError(platformAccount, missing);
      expect(JSON.stringify([inY.body, platformAccount.body])).not.toMatch(/y1\.staff|platform\.person/);
      nothingWritten(before);
    });
  });

  describe("Super Admin", () => {
    it("cannot be granted: when creating, editing or binding (403), nothing written", async () => {
      const before = snapshot();
      await api.create(as, newStaff({ lmsuserroles: [Role.superadmin] })).expect(403);
      await api.create(as, newStaff({ lmsuserroles: [Role.organisationadmin, Role.superadmin] })).expect(403);
      await api.update(as, ID.x1, edit({ lmsuserroles: [Role.superadmin] })).expect(403);
      await api.bind(as, ID.x1, [Role.superadmin]).expect(403);
      await api.bind(as, ID.self, [Role.organisationadmin, Role.superadmin]).expect(403);
      nothingWritten(before);
    });

    it("cannot be removed from an account of X that holds it, or that account touched at all (403), nothing written", async () => {
      const before = snapshot();
      await api.bind(as, ID.xs, [Role.admin]).expect(403);
      await api.update(as, ID.xs, edit({ lmsuserroles: [Role.admin] })).expect(403);
      await api.update(as, ID.xs, edit({ lmsuserroles: [Role.superadmin] })).expect(403);
      await api.remove(as, ID.xs).expect(403);
      nothingWritten(before);
      expect(byId(ID.xs).held).toEqual([Role.superadmin]);
    });
  });

  describe("the organisation of an account", () => {
    it("cannot be changed when editing: any value in the request is refused (403), nothing written", async () => {
      const before = snapshot();
      for (const value of [Y, null, X]) {
        await api.update(as, ID.x1, edit({ organisationid: value })).expect(403);
      }
      nothingWritten(before);
    });

    it("cannot be chosen when creating: an organisation other than X is refused (403), nothing written", async () => {
      const before = snapshot();
      for (const other of [Y, null]) {
        await api.create(as, newStaff({ organisationid: other })).expect(403);
      }
      nothingWritten(before);
    });
  });

  describe("the role lists it is shown leave out Super Admin", () => {
    const ids = (rows: Array<{ id?: string; roleid?: string }>) => rows.map((r) => r.id ?? r.roleid).sort();
    const WITHOUT_SUPER = [Role.admin, Role.organisationadmin, Role.teacher].sort();
    const ALL = [Role.admin, Role.organisationadmin, Role.superadmin, Role.teacher].sort();

    it("GET /roles (the list the staff forms use)", async () => {
      const res = await api.roleList(as).expect(200);
      expect(ids(res.body.data)).toEqual(WITHOUT_SUPER);
    });

    it("POST /roles (the paginated list): rows and total, and a filter cannot bring it back", async () => {
      const res = await api.rolePage(as).expect(200);
      expect(ids(res.body.data.data)).toEqual(WITHOUT_SUPER);
      expect(res.body.data.total).toBe(3);
      const filtered = await api.rolePage(as, { filter: [{ key: "rolename", value: "Super" }] }).expect(200);
      expect(filtered.body.data.data).toEqual([]);
      expect(filtered.body.data.total).toBe(0);
    });

    it("GET /user/:lmsuserid (the roles offered on the account's edit form)", async () => {
      const res = await api.get(as, ID.x1).expect(200);
      expect(ids(res.body.data.roles)).toEqual(WITHOUT_SUPER);
    });

    it("a platform user who is not acting as an organisation still sees every role, on all three", async () => {
      expect(ids((await api.roleList(callers.platform).expect(200)).body.data)).toEqual(ALL);
      const page = await api.rolePage(callers.platform).expect(200);
      expect(ids(page.body.data.data)).toEqual(ALL);
      expect(page.body.data.total).toBe(4);
      expect(ids((await api.get(callers.platform, ID.x1).expect(200)).body.data.roles)).toEqual(ALL);
    });

    it("a platform user acting as X is scoped like X's own staff: Super Admin is left out", async () => {
      expect(ids((await api.roleList(callers.platformActingX).expect(200)).body.data)).toEqual(WITHOUT_SUPER);
      expect(ids((await api.rolePage(callers.platformActingX).expect(200)).body.data.data)).toEqual(WITHOUT_SUPER);
    });
  });

  describe("the last Organisation Admin of an organisation (a known limit, recorded here)", () => {
    const holders = () => accounts.filter((a) => a.organisationid === X && !a.isdisabled && a.held.includes(Role.organisationadmin));

    it("can have the role removed by themselves: nothing prevents it, and X is left with none (the platform restores it)", async () => {
      expect(holders().map((a) => a.lmsuserid)).toEqual([ID.self]);
      await api.bind(as, ID.self, [Role.teacher]).expect(200);
      expect(holders()).toEqual([]);
    });

    it("can have the role removed by another Organisation Admin of X", async () => {
      accounts.push(account(ID.x3, "x3.staff@example.com", X, [Role.organisationadmin]));
      await api.bind(as, ID.x3, [Role.teacher]).expect(200);
      expect(byId(ID.x3).held).toEqual([Role.teacher]);
    });

    it("can be disabled by another Organisation Admin of X", async () => {
      accounts.push(account(ID.x3, "x3.staff@example.com", X, [Role.organisationadmin]));
      await api.remove(as, ID.x3).expect(200);
      expect(byId(ID.x3).isdisabled).toBe(true);
    });

    it("cannot be disabled by themselves: the rule that nobody disables their own account (400) already covers it", async () => {
      const before = snapshot();
      const res = await api.remove(as, ID.self).expect(400);
      expect(res.body.errormessage).toBe("You can't delete your own account.");
      nothingWritten(before);
    });
  });

  describe("the Super Admin role's definition is not readable in an organisation's scope (GET /roles/:roleid)", () => {
    const NOBODY = "zzzzzzzz";
    const sameAnswer = (a: { status: number; body: unknown }, b: { status: number; body: unknown }) => {
      expect(a.status).toBe(b.status);
      expect(a.body).toEqual(b.body);
    };

    it("an Organisation Admin gets exactly the answer for an id that matches no role", async () => {
      const missing = await api.role(as, NOBODY).expect(200);
      expect(missing.body.data.role).toBeNull();
      expect(missing.body.data.selectedPerms).toEqual([]);
      sameAnswer(await api.role(as, Role.superadmin), missing);
    });

    it("so does a request that spells the id in another case or with trailing spaces (the database matches those)", async () => {
      const missing = await api.role(as, NOBODY);
      sameAnswer(await api.role(as, Role.superadmin.toLowerCase()), missing);
      sameAnswer(await api.role(as, Role.superadmin.toUpperCase()), missing);
      sameAnswer(await api.role(as, `${Role.superadmin}%20%20`), missing);
    });

    it("a platform user acting as X gets the same answer", async () => {
      const missing = await api.role(callers.platformActingX, NOBODY);
      sameAnswer(await api.role(callers.platformActingX, Role.superadmin), missing);
    });

    it("other roles are still readable in that scope", async () => {
      for (const id of [Role.admin, Role.organisationadmin, Role.teacher]) {
        const res = await api.role(as, id).expect(200);
        expect(res.body.data.role.roleid).toBe(id);
        expect(res.body.data.selectedPerms).toEqual([`perm-of-${id}`]);
      }
    });

    it("a platform user who is not acting still reads it", async () => {
      const res = await api.role(callers.platform, Role.superadmin).expect(200);
      expect(res.body.data.role.roleid).toBe(Role.superadmin);
      expect(res.body.data.selectedPerms).toEqual([`perm-of-${Role.superadmin}`]);
    });
  });

  describe("a change to an account's role set ends that account's sessions", () => {
    it("binding a different set (a demotion) revokes the account's tokens: one delete, inside the transaction, before the commit", async () => {
      await api.bind(as, ID.x1, [Role.teacher]).expect(200);
      expect(destroyCalls).toEqual([{ lmsuserid: ID.x1, transaction }]);
      expect(callOrder).toEqual(["revoke", "commit"]);
    });

    it("an Organisation Admin demoted to Teacher by a colleague loses their sessions", async () => {
      accounts.push(account(ID.x3, "x3.staff@example.com", X, [Role.organisationadmin]));
      await api.bind(as, ID.x3, [Role.teacher]).expect(200);
      expect(destroyed).toEqual([ID.x3]);
    });

    it("binding the same set revokes nothing, whatever the order", async () => {
      await api.bind(as, ID.x1, [Role.admin]).expect(200);
      byId(ID.x2).held = [Role.admin, Role.teacher];
      await api.bind(as, ID.x2, [Role.teacher, Role.admin]).expect(200);
      expect(destroyed).toEqual([]);
      expect(callOrder).toEqual(["commit", "commit"]);
    });

    it("editing an account with a different set revokes once; editing it with the same set (other fields only) revokes nothing", async () => {
      await api.update(as, ID.x2, edit({ lmsuserroles: [Role.teacher] })).expect(200);
      expect(destroyed).toEqual([]);
      await api.update(as, ID.x2, edit({ lmsusername: "again@example.com", lmsuserroles: [Role.admin] })).expect(200);
      expect(destroyed).toEqual([ID.x2]);
      expect(destroyCalls[0].transaction).toBe(transaction);
    });

    it("a person changing their own roles is included", async () => {
      await api.bind(as, ID.self, [Role.teacher]).expect(200);
      expect(destroyed).toEqual([ID.self]);
    });

    it("the revoke rolls back with the transaction: when the commit fails, the roles and the revoke are rolled back", async () => {
      transaction.commit.mockReset().mockImplementation(async () => {
        callOrder.push("commit");
        throw new Error("commit failed");
      });
      const res = await api.bind(as, ID.x1, [Role.teacher]);
      expect(res.status).toBe(500);
      expect(destroyCalls[0].transaction).toBe(transaction);
      expect(callOrder).toEqual(["revoke", "commit", "rollback"]);
    });

    it("a refused change revokes nothing", async () => {
      const before = snapshot();
      await api.bind(as, ID.x1, [Role.superadmin]).expect(403);
      nothingWritten(before);
    });
  });

  describe("an Organisation Admin of Y has no reach into X", () => {
    it("every action on an account of X is the same 404 as a missing id", async () => {
      const asY = orgAdminOf(Y);
      const before = snapshot();
      const missing = await api.get(asY, ID.gone);
      for (const res of [
        await api.get(asY, ID.x1),
        await api.update(asY, ID.x1, edit()),
        await api.remove(asY, ID.x1),
        await api.bind(asY, ID.x1, [Role.teacher]),
      ]) {
        sameError(res, missing);
      }
      nothingWritten(before);
    });
  });

  describe("the role is not a way round a missing permission", () => {
    it("a token without delete_user cannot disable an account, even holding the role", async () => {
      const without = bearer({
        lmsuserid: ID.self,
        lmsuserroles: [Role.organisationadmin],
        permissions: ORGANISATION_ADMIN_PERMISSIONS_20261002.filter((p) => p !== "delete_user"),
        organisationid: X,
        isplatform: false,
      });
      const before = snapshot();
      await api.remove(without, ID.x1).expect(403);
      nothingWritten(before);
    });
  });
});
