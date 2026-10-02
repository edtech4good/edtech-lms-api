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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminTeacherGrant = require("src/db/migrations/20260716160000-grant-admin-teacher-permissions");

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

// Custom roles (not built in): one whose permissions are all ones an Organisation Admin holds, one with a permission it does not.
const CUSTOM_OK = "custom-ok";
const CUSTOM_WIDE = "custom-wide";
const ROLE_NAMES: Record<string, string> = {
  [Role.superadmin]: "Super Admin",
  [Role.admin]: "Admin",
  [Role.user]: "User",
  [Role.apikey]: "API Key",
  [Role.teacher]: "Teacher",
  [Role.organisationadmin]: "Organisation Admin",
  [CUSTOM_OK]: "Custom within reach",
  [CUSTOM_WIDE]: "Custom beyond reach",
};

/** What the 16 July grant migration gives Admin and Teacher, as it computes it. */
const olderGrants = async (): Promise<Record<string, string[]>> => {
  const byRole: Record<string, string[]> = {};
  await adminTeacherGrant.up({
    sequelize: {
      query: jest.fn(async (_sql: string, o?: { replacements?: { roleid: string; names: string[] } }) => {
        if (o?.replacements?.names) byRole[o.replacements.roleid] = o.replacements.names;
        return [[], undefined];
      }),
      transaction: (cb: (t: unknown) => Promise<void>) => cb({}),
    },
  });
  return byRole;
};
let ROLE_PERMS: Record<string, string[]> = {};
const roleRow = (roleid: string) => ({
  roleid,
  rolename: ROLE_NAMES[roleid] ?? roleid,
  permissions: (ROLE_PERMS[roleid] ?? []).map((permissionname) => ({ permissionname })),
});

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
    const older = await olderGrants();
    ROLE_PERMS = {
      [Role.superadmin]: ["superadmin"],
      [Role.admin]: older[Role.admin],
      [Role.teacher]: older[Role.teacher],
      [Role.user]: [],
      [Role.apikey]: [],
      [Role.organisationadmin]: [...ORGANISATION_ADMIN_PERMISSIONS_20261002],
      [CUSTOM_OK]: ["view_user", "view_school"],
      [CUSTOM_WIDE]: ["view_school", "sync_content"],
    };
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
    lmsuserroles: [Role.organisationadmin],
    ...over,
  });
  const edit = (over: Record<string, unknown> = {}) => ({
    lmsusername: "renamed@example.com",
    lmsuserpasswordhash: "ChangedPass12",
    lmsuserroles: [Role.admin],
    ...over,
  });
  /** The form's body for an account when its sign-in details are left alone: same email, no new password (the form sends null). */
  const keep = (id: string, over: Record<string, unknown> = {}) => ({
    lmsusername: byId(id).lmsusername,
    lmsuserpasswordhash: null,
    lmsuserroles: [...byId(id).held],
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
      accounts.push(account(ID.x3, "x3.staff@example.com", X, [Role.organisationadmin])); // within the caller's reach
      await api.update(as, ID.x3, edit({ lmsuserroles: [Role.organisationadmin] })).expect(200);
      expect(byId(ID.x3).lmsusername).toBe("renamed@example.com");
      expect(byId(ID.x3).organisationid).toBe(X);
      expect(writes.saves[0].fields).not.toContain("organisationid");
    });

    it("DELETE /user/:lmsuserid: disables an account in X and ends its sessions", async () => {
      await api.remove(as, ID.x1).expect(200);
      expect(byId(ID.x1).isdisabled).toBe(true);
      expect(destroyed).toEqual([ID.x1]);
    });

    it("POST /roles/user-bind-role: gives roles to an account in X", async () => {
      await api.bind(as, ID.x2, [CUSTOM_OK]).expect(200);
      expect(byId(ID.x2).held).toEqual([CUSTOM_OK]);
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
      await api.update(as, ID.x2, keep(ID.x2, { lmsuserroles: [Role.organisationadmin] })).expect(200);
      expect(byId(ID.x2).held).toEqual([Role.organisationadmin]);
    });
  });

  describe("what it cannot reach: Y's accounts and platform accounts (the same 404 as a missing id; nothing written)", () => {
    const attempts: Array<[string, (id: string) => Promise<{ status: number; body: Record<string, unknown> }>]> = [
      ["read", (id) => api.get(as, id)],
      ["update", (id) => api.update(as, id, edit())],
      ["disable", (id) => api.remove(as, id)],
      ["bind roles", (id) => api.bind(as, id, [CUSTOM_OK])],
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

  describe("the role lists offer only the roles the caller could add (never Super Admin)", () => {
    const ids = (rows: Array<{ id?: string; roleid?: string }>) => rows.map((r) => r.id ?? r.roleid).sort();
    // An Organisation Admin could add: Organisation Admin itself and the custom role within its permissions.
    // Not Admin, User, API Key, Super Admin (built in for other uses), not Teacher (it holds view_sync, which the role does not), not the wide custom role.
    const FOR_ORG_ADMIN = [Role.organisationadmin, CUSTOM_OK].sort();
    // A platform user acting as X holds every permission, so only the built-in rule limits it.
    const FOR_ACTING = [Role.organisationadmin, Role.teacher, CUSTOM_OK, CUSTOM_WIDE].sort();
    const ALL = Object.keys(ROLE_NAMES).sort();

    it("GET /roles (the list the staff forms use)", async () => {
      const res = await api.roleList(as).expect(200);
      expect(ids(res.body.data)).toEqual(FOR_ORG_ADMIN);
    });

    it("POST /roles (the paginated list): rows and total, and a filter cannot bring another role back", async () => {
      const res = await api.rolePage(as).expect(200);
      expect(ids(res.body.data.data)).toEqual(FOR_ORG_ADMIN);
      expect(res.body.data.total).toBe(2);
      const filtered = await api.rolePage(as, { filter: [{ key: "rolename", value: "Super" }] }).expect(200);
      expect(filtered.body.data.data).toEqual([]);
      expect(filtered.body.data.total).toBe(0);
      const admin = await api.rolePage(as, { filter: [{ key: "rolename", value: "Admin" }] }).expect(200);
      expect(ids(admin.body.data.data)).toEqual([Role.organisationadmin]);
    });

    it("GET /user/:lmsuserid (the roles offered on the account's edit form): what the caller could add, plus the roles the account holds (see the next block)", async () => {
      const res = await api.get(as, ID.x1).expect(200); // x1 holds Admin
      expect(ids(res.body.data.roles)).toEqual([...FOR_ORG_ADMIN, Role.admin].sort());
      const bare = await api.get(as, ID.self).expect(200); // holds only Organisation Admin: nothing extra
      expect(ids(bare.body.data.roles)).toEqual(FOR_ORG_ADMIN);
    });

    it("a platform user who is not acting as an organisation still sees every role, on all three", async () => {
      expect(ids((await api.roleList(callers.platform).expect(200)).body.data)).toEqual(ALL);
      const page = await api.rolePage(callers.platform).expect(200);
      expect(ids(page.body.data.data)).toEqual(ALL);
      expect(page.body.data.total).toBe(ALL.length);
      expect(ids((await api.get(callers.platform, ID.x1).expect(200)).body.data.roles)).toEqual(ALL);
    });

    it("a platform user acting as X is scoped like X's own staff: the built-in rule applies, so Admin and Super Admin are left out", async () => {
      expect(ids((await api.roleList(callers.platformActingX).expect(200)).body.data)).toEqual(FOR_ACTING);
      expect(ids((await api.rolePage(callers.platformActingX).expect(200)).body.data.data)).toEqual(FOR_ACTING);
    });

    it("every role a list offers is one the API accepts for that caller, and nothing else is", async () => {
      for (const id of ALL) {
        byId(ID.x2).held = []; // nothing held, so every role asked for is an addition
        writes = { saves: [], setRoles: [], creates: [] };
        destroyed = [];
        transaction.commit.mockClear();
        const before = snapshot();
        const res = await api.bind(as, ID.x2, [id]);
        expect(res.status).toBe(FOR_ORG_ADMIN.includes(id) ? 200 : 403);
        if (res.status === 403) nothingWritten(before);
      }
    });
  });

  describe("the edit form keeps the roles an account holds even when the caller could not add them (GET /user/:lmsuserid)", () => {
    type FormRole = { id: string; text: string; checked: boolean; canadd: boolean };
    const rolesOf = (res: { body: { data: { roles: FormRole[] } } }) => res.body.data.roles;
    const byRoleId = (list: FormRole[], id: string) => list.find((r) => r.id === id);
    /** What the admin UI's edit form submits for the account it just loaded (user-update.component.ts). */
    const formBody = (res: { body: { data: { user: { lmsusername: string }; roles: FormRole[] } } }) => ({
      lmsusername: res.body.data.user.lmsusername,
      lmsuserpasswordhash: null,
      lmsuserroles: rolesOf(res).filter((r) => r.checked === true).map((r) => r.id),
      countryids: [],
      schoolids: [],
    });

    it("an account holding Admin: Admin is in the list, checked and flagged not addable; what the caller could add is offered unchecked and addable", async () => {
      const list = rolesOf(await api.get(as, ID.x1).expect(200));
      expect(byRoleId(list, Role.admin)).toEqual({ id: Role.admin, text: "Admin", checked: true, canadd: false });
      expect(byRoleId(list, Role.organisationadmin)).toEqual({ id: Role.organisationadmin, text: "Organisation Admin", checked: false, canadd: true });
      expect(byRoleId(list, CUSTOM_OK)).toMatchObject({ checked: false, canadd: true });
      expect(list.filter((r) => r.checked).map((r) => r.id)).toEqual([Role.admin]);
      for (const r of list) expect(Object.keys(r).sort()).toEqual(["canadd", "checked", "id", "text"]);
    });

    it("a held role the caller could add is checked and addable", async () => {
      const list = rolesOf(await api.get(as, ID.self).expect(200));
      expect(byRoleId(list, Role.organisationadmin)).toMatchObject({ checked: true, canadd: true });
    });

    it("saving the form's body unchanged keeps Admin: 200, the roles are as they were, no session ended", async () => {
      const res = await api.get(as, ID.x1).expect(200);
      await api.update(as, ID.x1, formBody(res)).expect(200);
      expect(byId(ID.x1).held).toEqual([Role.admin]);
      expect(destroyed).toEqual([]);
      expect(callOrder).not.toContain("revoke");
    });

    it("an account holding only roles that are not offered is not emptied by an unchanged save", async () => {
      byId(ID.x2).held = [Role.admin, Role.user];
      const res = await api.get(as, ID.x2).expect(200);
      expect(rolesOf(res).filter((r) => r.checked && !r.canadd).map((r) => r.id).sort()).toEqual([Role.admin, Role.user].sort());
      await api.update(as, ID.x2, formBody(res)).expect(200);
      expect(byId(ID.x2).held.sort()).toEqual([Role.admin, Role.user].sort());
      expect(destroyed).toEqual([]);
    });

    it("unchecking a held role on the form still removes it (removal is allowed)", async () => {
      const res = await api.get(as, ID.x1).expect(200);
      const body = { ...formBody(res), lmsuserroles: [Role.organisationadmin] };
      await api.update(as, ID.x1, body).expect(200);
      expect(byId(ID.x1).held).toEqual([Role.organisationadmin]);
    });

    it("the role lists themselves are unchanged: Admin stays out of GET /roles and POST /roles", async () => {
      expect((await api.roleList(as).expect(200)).body.data.map((r: { id: string }) => r.id)).not.toContain(Role.admin);
      expect((await api.rolePage(as).expect(200)).body.data.data.map((r: { roleid: string }) => r.roleid)).not.toContain(Role.admin);
    });

    it("a legacy account of X holding Super Admin alongside Admin: Super Admin is not in the list, Admin is checked and not addable; saving it is refused (403)", async () => {
      byId(ID.xs).held = [Role.superadmin, Role.admin];
      const res = await api.get(as, ID.xs).expect(200);
      expect(rolesOf(res).map((r) => r.id)).not.toContain(Role.superadmin);
      expect(byRoleId(rolesOf(res), Role.admin)).toMatchObject({ checked: true, canadd: false });
      const before = snapshot();
      await api.update(as, ID.xs, formBody(res)).expect(403);
      nothingWritten(before);
    });

    it("a platform user acting as X gets the same list as X's staff; one not acting gets every role, addable, with the held ones checked", async () => {
      const acting = rolesOf(await api.get(callers.platformActingX, ID.x1).expect(200));
      expect(byRoleId(acting, Role.admin)).toMatchObject({ checked: true, canadd: false });
      expect(acting.map((r) => r.id)).not.toContain(Role.superadmin);
      const platform = rolesOf(await api.get(callers.platform, ID.x1).expect(200));
      expect(platform).toHaveLength(Object.keys(ROLE_NAMES).length);
      expect(platform.every((r) => r.canadd)).toBe(true);
      expect(platform.filter((r) => r.checked).map((r) => r.id)).toEqual([Role.admin]);
    });
  });

  describe("the sign-in details of an account WIDER than the caller (email, password) cannot be changed", () => {
    // Within reach: every role the account holds is one the caller could add. x1 holds Admin and x2 holds
    // Teacher (it has view_sync, which Organisation Admin lacks): both wider. x3 holds Organisation Admin: within reach.
    const NEWPW = "ChangedPass12";
    const widerTargets: Array<[string, string]> = [
      ["an Admin in X", ID.x1],
      ["a Teacher in X", ID.x2],
    ];
    const hash = (id: string) => byId(id).passwordhash;

    it.each(widerTargets)("%s: a new password is refused (403): nothing written, hash unchanged, no session ended", async (_n, id) => {
      const before = snapshot();
      const res = await api.update(as, id, keep(id, { lmsuserpasswordhash: NEWPW }));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("NOT_ALLOWED");
      nothingWritten(before);
      expect(callOrder).not.toContain("revoke");
    });

    it.each(widerTargets)("%s: a new email is refused (403), unchanged", async (_n, id) => {
      const before = snapshot();
      await api.update(as, id, keep(id, { lmsusername: "takeover@example.com" })).expect(403);
      nothingWritten(before);
    });

    it("an account holding a custom role wider than the caller is wider too", async () => {
      byId(ID.x2).held = [CUSTOM_WIDE];
      const before = snapshot();
      await api.update(as, ID.x2, keep(ID.x2, { lmsuserpasswordhash: NEWPW })).expect(403);
      nothingWritten(before);
    });

    it("one wide role among within-reach ones is enough", async () => {
      byId(ID.x2).held = [Role.organisationadmin, Role.admin];
      const before = snapshot();
      await api.update(as, ID.x2, keep(ID.x2, { lmsuserpasswordhash: NEWPW })).expect(403);
      nothingWritten(before);
    });

    it("changing the roles in the same request does not get round it: the account is judged by the roles it holds now", async () => {
      const before = snapshot();
      await api.update(as, ID.x1, keep(ID.x1, { lmsuserpasswordhash: NEWPW, lmsuserroles: [Role.organisationadmin] })).expect(403);
      nothingWritten(before);
    });

    it("an unchanged save is allowed on a wider account, whatever shape the form sends for 'no new password': null, empty or absent", async () => {
      const h = hash(ID.x1);
      for (const shape of [null, "", undefined]) {
        const body: Record<string, unknown> = keep(ID.x1, { lmsuserpasswordhash: shape });
        if (shape === undefined) delete body.lmsuserpasswordhash;
        await api.update(as, ID.x1, body).expect(200);
      }
      expect(hash(ID.x1)).toBe(h);
      expect(byId(ID.x1).lmsusername).toBe("x1.staff@example.com");
      expect(byId(ID.x1).held).toEqual([Role.admin]);
    });

    it("the other fields it writes (scope lists) can be changed on a wider account when the email and password are left alone", async () => {
      await api.update(as, ID.x1, keep(ID.x1, { countryids: [], schoolids: [] })).expect(200);
      expect(writes.saves[0].fields).toEqual(expect.arrayContaining(["countries", "schools"]));
    });

    it("removing its roles and disabling it stay allowed on a wider account", async () => {
      await api.bind(as, ID.x1, [Role.organisationadmin]).expect(200);
      byId(ID.x2).held = [Role.admin];
      await api.remove(as, ID.x2).expect(200);
      expect(byId(ID.x2).isdisabled).toBe(true);
    });

    it("an account within reach (an Organisation Admin colleague) can have its email and password changed", async () => {
      accounts.push(account(ID.x3, "x3.staff@example.com", X, [Role.organisationadmin]));
      await api.update(as, ID.x3, keep(ID.x3, { lmsuserpasswordhash: NEWPW, lmsusername: "x3.new@example.com" })).expect(200);
      expect(byId(ID.x3).lmsusername).toBe("x3.new@example.com");
      expect(byId(ID.x3).passwordhash).not.toBe("hash-of-x3.staff@example.com");
    });

    it("an account with no role is within reach", async () => {
      accounts.push(account(ID.x3, "x3.staff@example.com", X, []));
      await api.update(as, ID.x3, keep(ID.x3, { lmsuserpasswordhash: NEWPW })).expect(200);
    });

    it("an account is always within its own reach: the caller changes its own password and email even if it also holds a role wider than itself", async () => {
      byId(ID.self).held = [Role.organisationadmin, Role.admin]; // legacy data: it already holds Admin
      await api.update(as, ID.self, keep(ID.self, { lmsuserpasswordhash: NEWPW, lmsusername: "self.new@example.com" })).expect(200);
      expect(byId(ID.self).lmsusername).toBe("self.new@example.com");
    });

    it("a platform user acting as X is bound like X's staff; one not acting is not", async () => {
      const before = snapshot();
      await api.update(callers.platformActingX, ID.x1, keep(ID.x1, { lmsuserpasswordhash: NEWPW })).expect(403);
      nothingWritten(before);
      await api.update(callers.platform, ID.x1, keep(ID.x1, { lmsuserpasswordhash: NEWPW, lmsusername: "platform.set@example.com" })).expect(200);
      expect(byId(ID.x1).lmsusername).toBe("platform.set@example.com");
    });

    it("a platform user acting as X may change the details of an account within reach (it holds every permission, so only built-in roles can be wider)", async () => {
      accounts.push(account(ID.x3, "x3.staff@example.com", X, [Role.teacher, Role.organisationadmin, CUSTOM_WIDE]));
      await api.update(callers.platformActingX, ID.x3, keep(ID.x3, { lmsuserpasswordhash: NEWPW })).expect(200);
    });
  });

  describe("GET /user/:lmsuserid for a caller in an organisation's scope shows no Super Admin and no permission lists in user.roles", () => {
    it("a legacy account of X holding Super Admin and Admin: user.roles has Admin only, as {roleid, rolename}", async () => {
      byId(ID.xs).held = [Role.superadmin, Role.admin];
      const res = await api.get(as, ID.xs).expect(200);
      expect(res.body.data.user.roles).toEqual([{ roleid: Role.admin, rolename: "Admin" }]);
      expect(JSON.stringify(res.body)).not.toContain(Role.superadmin);
      expect(JSON.stringify(res.body)).not.toContain("permissionname");
    });

    it("the permission lists are not even loaded for such a caller (the query's role include has no nested include); they are for a platform caller not acting", async () => {
      const includeOf = () => {
        const calls = (lmsusers.findOne as unknown as jest.Mock).mock.calls;
        return calls[calls.length - 1][0].include[0].include as unknown[];
      };
      await api.get(as, ID.x1).expect(200);
      expect(includeOf()).toEqual([]);
      await api.get(callers.platform, ID.x1).expect(200);
      expect(includeOf()).toHaveLength(1);
    });

    it("an ordinary account: its roles carry no permission lists", async () => {
      const res = await api.get(as, ID.x1).expect(200);
      expect(res.body.data.user.roles).toEqual([{ roleid: Role.admin, rolename: "Admin" }]);
    });

    it("a platform user acting as X gets the same; one not acting still gets the full roles with their permissions", async () => {
      byId(ID.xs).held = [Role.superadmin, Role.admin];
      const acting = await api.get(callers.platformActingX, ID.xs).expect(200);
      expect(JSON.stringify(acting.body.data.user.roles)).not.toContain("permissionname");
      expect(acting.body.data.user.roles.map((r: { roleid: string }) => r.roleid)).toEqual([Role.admin]);
      const full = await api.get(callers.platform, ID.xs).expect(200);
      expect(full.body.data.user.roles.map((r: { roleid: string }) => r.roleid).sort()).toEqual([Role.admin, Role.superadmin].sort());
      expect(JSON.stringify(full.body.data.user.roles)).toContain("permissionname");
    });
  });

  describe("which roles an organisation's staff may add to an account", () => {
    const ADD_ADMIN_TO = {
      "itself": () => api.bind(as, ID.self, [Role.organisationadmin, Role.admin]),
      "a colleague (bind)": () => api.bind(as, ID.x2, [Role.admin]),
      "a colleague (edit)": () => api.update(as, ID.x2, keep(ID.x2, { lmsuserroles: [Role.teacher, Role.admin] })),
      "itself (edit)": () => api.update(as, ID.self, keep(ID.self, { lmsuserroles: [Role.organisationadmin, Role.admin] })),
      "a new account (create)": () => api.create(as, newStaff({ lmsuserroles: [Role.admin] })),
    };

    it.each(Object.keys(ADD_ADMIN_TO) as Array<keyof typeof ADD_ADMIN_TO>)("Admin cannot be added to %s: 403, nothing written, no session ended", async (where) => {
      const before = snapshot();
      const res = await ADD_ADMIN_TO[where]();
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("NOT_ALLOWED");
      nothingWritten(before);
      expect(callOrder).not.toContain("revoke");
      expect(callOrder).not.toContain("commit");
    });

    it.each([
      ["User", Role.user],
      ["API Key", Role.apikey],
      ["Super Admin", Role.superadmin],
    ])("%s cannot be added by bind, edit or create: 403, nothing written", async (_n, roleid) => {
      const before = snapshot();
      await api.bind(as, ID.self, [Role.organisationadmin, roleid]).expect(403);
      await api.bind(as, ID.x2, [roleid]).expect(403);
      await api.update(as, ID.x2, keep(ID.x2, { lmsuserroles: [roleid] })).expect(403);
      await api.create(as, newStaff({ lmsuserroles: [roleid] })).expect(403);
      nothingWritten(before);
    });

    it("a custom role with a permission the caller lacks is refused by bind, edit and create", async () => {
      const before = snapshot();
      await api.bind(as, ID.x2, [CUSTOM_WIDE]).expect(403);
      await api.update(as, ID.x2, keep(ID.x2, { lmsuserroles: [CUSTOM_WIDE] })).expect(403);
      await api.create(as, newStaff({ lmsuserroles: [CUSTOM_WIDE] })).expect(403);
      nothingWritten(before);
    });

    it("a custom role within the caller's permissions is allowed by bind, edit and create", async () => {
      await api.bind(as, ID.x2, [CUSTOM_OK]).expect(200);
      expect(byId(ID.x2).held).toEqual([CUSTOM_OK]);
      await api.update(as, ID.x1, keep(ID.x1, { lmsuserroles: [CUSTOM_OK] })).expect(200);
      await api.create(as, newStaff({ lmsuserroles: [CUSTOM_OK] })).expect(200);
    });

    it("Organisation Admin is allowed by bind, edit and create, to others and to itself (no new reach)", async () => {
      await api.bind(as, ID.x2, [Role.organisationadmin]).expect(200);
      await api.update(as, ID.x1, keep(ID.x1, { lmsuserroles: [Role.organisationadmin] })).expect(200);
      await api.create(as, newStaff({ lmsuserroles: [Role.organisationadmin] })).expect(200);
      await api.bind(as, ID.self, [Role.organisationadmin, CUSTOM_OK]).expect(200);
    });

    it("Teacher holds a permission Organisation Admin does not (view_sync), so an Organisation Admin cannot add Teacher", async () => {
      const teacherOnly = ROLE_PERMS[Role.teacher].filter((p) => !ORGANISATION_ADMIN_PERMISSIONS_20261002.includes(p));
      expect(teacherOnly).toEqual(["view_sync"]);
      const before = snapshot();
      await api.bind(as, ID.x1, [Role.teacher]).expect(403);
      await api.create(as, newStaff({ lmsuserroles: [Role.teacher] })).expect(403);
      nothingWritten(before);
    });

    it("Teacher is allowed for a caller that holds every permission Teacher holds: the built-in rule lets it through, the permission rule decides", async () => {
      const withViewSync = bearer({
        lmsuserid: ID.self,
        lmsuserroles: [Role.organisationadmin],
        permissions: [...ORGANISATION_ADMIN_PERMISSIONS_20261002, "view_sync"],
        organisationid: X,
        isplatform: false,
      });
      await api.bind(withViewSync, ID.x1, [Role.teacher]).expect(200);
      expect(byId(ID.x1).held).toEqual([Role.teacher]);
    });

    it("an account that already holds Admin can be edited keeping it, bound to the same set, and can have it removed", async () => {
      // an edit that leaves the sign-in details alone is allowed and Admin is kept ...
      await api.update(as, ID.x1, keep(ID.x1, { countryids: [], schoolids: [] })).expect(200);
      expect(byId(ID.x1).held).toEqual([Role.admin]);
      // ... but a new email or a new password on that wider account is refused (see the sign-in block)
      await api.update(as, ID.x1, keep(ID.x1, { lmsusername: "kept@example.com" })).expect(403);
      await api.update(as, ID.x1, keep(ID.x1, { lmsuserpasswordhash: "ChangedPass12" })).expect(403);
      expect(byId(ID.x1).lmsusername).toBe("x1.staff@example.com");
      await api.bind(as, ID.x1, [Role.admin]).expect(200);
      // keeping Admin while adding a role it may add is allowed: only the addition is checked
      await api.bind(as, ID.x1, [Role.admin, Role.organisationadmin]).expect(200);
      expect(byId(ID.x1).held).toEqual([Role.admin, Role.organisationadmin]);
      await api.bind(as, ID.x1, [Role.organisationadmin]).expect(200);
      expect(byId(ID.x1).held).toEqual([Role.organisationadmin]);
    });

    it("an account that already holds a role beyond the caller's reach keeps it on edit, and can lose it", async () => {
      byId(ID.x2).held = [CUSTOM_WIDE];
      await api.update(as, ID.x2, keep(ID.x2, { lmsuserroles: [CUSTOM_WIDE] })).expect(200);
      await api.bind(as, ID.x2, [CUSTOM_OK]).expect(200);
    });

    it("a platform user acting as X is bound by the built-in rule: Admin is refused; Organisation Admin, Teacher and any custom role are allowed (it holds every permission)", async () => {
      const token = callers.platformActingX;
      const before = snapshot();
      await api.bind(token, ID.x2, [Role.admin]).expect(403);
      await api.create(token, newStaff({ lmsuserroles: [Role.admin] })).expect(403);
      nothingWritten(before);
      await api.bind(token, ID.x2, [Role.organisationadmin, Role.teacher, CUSTOM_WIDE]).expect(200);
    });

    it("a platform user who is not acting is not bound by it: Admin may be given", async () => {
      await api.bind(callers.platform, ID.x2, [Role.admin]).expect(200);
      await api.update(callers.platform, ID.y1, edit({ lmsuserroles: [Role.admin, Role.user, Role.apikey] })).expect(200);
      await api.create(callers.platform, newStaff({ lmsuserroles: [Role.admin], organisationid: X })).expect(200);
    });
  });

  describe("the last Organisation Admin of an organisation (a known limit, recorded here)", () => {
    const holders = () => accounts.filter((a) => a.organisationid === X && !a.isdisabled && a.held.includes(Role.organisationadmin));

    it("can have the role removed by themselves: nothing prevents it, and X is left with none (the platform restores it)", async () => {
      expect(holders().map((a) => a.lmsuserid)).toEqual([ID.self]);
      await api.bind(as, ID.self, [CUSTOM_OK]).expect(200);
      expect(holders()).toEqual([]);
    });

    it("can have the role removed by another Organisation Admin of X", async () => {
      accounts.push(account(ID.x3, "x3.staff@example.com", X, [Role.organisationadmin]));
      await api.bind(as, ID.x3, [CUSTOM_OK]).expect(200);
      expect(byId(ID.x3).held).toEqual([CUSTOM_OK]);
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
      await api.bind(as, ID.x1, [CUSTOM_OK]).expect(200);
      expect(destroyCalls).toEqual([{ lmsuserid: ID.x1, transaction }]);
      expect(callOrder).toEqual(["revoke", "commit"]);
    });

    it("an Organisation Admin demoted to Teacher by a colleague loses their sessions", async () => {
      accounts.push(account(ID.x3, "x3.staff@example.com", X, [Role.organisationadmin]));
      await api.bind(as, ID.x3, [CUSTOM_OK]).expect(200);
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
      await api.update(as, ID.x2, keep(ID.x2, { lmsuserroles: [Role.teacher] })).expect(200);
      expect(destroyed).toEqual([]);
      await api.update(as, ID.x2, keep(ID.x2, { lmsuserroles: [CUSTOM_OK] })).expect(200);
      expect(destroyed).toEqual([ID.x2]);
      expect(destroyCalls[0].transaction).toBe(transaction);
    });

    it("a person changing their own roles is included", async () => {
      await api.bind(as, ID.self, [CUSTOM_OK]).expect(200);
      expect(destroyed).toEqual([ID.self]);
    });

    it("the revoke rolls back with the transaction: when the commit fails, the roles and the revoke are rolled back", async () => {
      transaction.commit.mockReset().mockImplementation(async () => {
        callOrder.push("commit");
        throw new Error("commit failed");
      });
      const res = await api.bind(as, ID.x1, [CUSTOM_OK]);
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
