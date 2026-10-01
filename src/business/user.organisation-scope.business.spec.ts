import { lmsusers } from "src/models/data-models/lmsusers";
import { roles } from "src/models/data-models/roles";
import { tokens } from "src/models/data-models/tokens";
import { Role } from "src/models/enums";
import { dbinstance } from "src/services/dbservice";
import { rowMatches, withPrimaryKey } from "src/test-support/fakewhere";
import { RolePermissionBusiness } from "./role-permission.business";
import { UserBusiness } from "./user.business";

/**
 * The business methods that change a staff account look the account up within
 * the caller's scope, whatever the route in front of them does: an account in
 * another organisation, and a platform account (for an organisation's caller),
 * are a 404 and nothing is written. The route's validators check the same thing
 * once more (user.business.validator.spec.ts); each layer is pinned on its own.
 */
withPrimaryKey(lmsusers, "lmsuserid");

const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const IN_X = "11111111-0000-4000-8000-000000000001";
const IN_Y = "22222222-0000-4000-8000-000000000001";
const PLATFORM_ACCOUNT = "33333333-0000-4000-8000-000000000001";
const MISSING = "99999999-0000-4000-8000-000000000009";

const staffOfX = { organisationid: X, isplatform: false };
const actingAsX = { organisationid: X, isplatform: true };
const caller = { lmsuserid: "caller" } as never;

type Account = { lmsuserid: string; organisationid: string | null; held: string[] };
let accounts: Account[];
let writes: string[];
const transaction = { commit: jest.fn(), rollback: jest.fn() };

const rowOf = (a: Account) => ({
  lmsuserid: a.lmsuserid,
  organisationid: a.organisationid,
  lmsusername: "someone@example.com",
  get: () => ({ lmsuserid: a.lmsuserid }),
  getRoles: async () => a.held.map((roleid) => ({ roleid, rolename: roleid })),
  setRoles: async () => void writes.push(`setRoles:${a.lmsuserid}`),
  save: async () => void writes.push(`save:${a.lmsuserid}`),
  setDataValue: () => undefined,
});

beforeEach(() => {
  jest.restoreAllMocks();
  accounts = [
    { lmsuserid: IN_X, organisationid: X, held: [Role.admin] },
    { lmsuserid: IN_Y, organisationid: Y, held: [Role.admin] },
    { lmsuserid: PLATFORM_ACCOUNT, organisationid: null, held: [Role.superadmin] },
  ];
  writes = [];
  transaction.commit.mockReset();
  transaction.rollback.mockReset();
  jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(transaction as never);
  jest.spyOn(lmsusers, "findOne").mockImplementation((async (o: { where: unknown }) => {
    const found = accounts.find((a) => rowMatches({ lmsuserid: a.lmsuserid, organisationid: a.organisationid }, o.where));
    return found ? rowOf(found) : null;
  }) as never);
  jest.spyOn(roles, "findAll").mockImplementation((async () => [{ roleid: Role.teacher, rolename: "Teacher" }]) as never);
  jest.spyOn(tokens, "destroy").mockImplementation((async (o: { where: { lmsuserid: string } }) => {
    writes.push(`tokens:${o.where.lmsuserid}`);
    return 1;
  }) as never);
});

const run = {
  update: (id: string, org: { organisationid: string | null; isplatform: boolean }) =>
    new UserBusiness().updateUser({ lmsuserid: id, lmsusername: "renamed@example.com" } as never, [Role.teacher], caller, org),
  disable: (id: string, org: { organisationid: string | null; isplatform: boolean }) => new UserBusiness().disableuserbyid(id, org),
  bind: (id: string, org: { organisationid: string | null; isplatform: boolean }) =>
    new RolePermissionBusiness().bindUserRoles({ lmsuserid: id, rolesid: [Role.teacher] }, org),
};

const OPERATIONS = [
  ["UserBusiness.updateUser", run.update],
  ["UserBusiness.disableuserbyid", run.disable],
  ["RolePermissionBusiness.bindUserRoles", run.bind],
] as const;

describe.each(OPERATIONS)("%s", (_name, operation) => {
  it.each([
    ["an account in another organisation", IN_Y],
    ["a platform account", PLATFORM_ACCOUNT],
    ["an id that does not exist", MISSING],
  ])("is a 404 for %s, called by an organisation's user, and writes nothing", async (_what, id) => {
    const error = await operation(id, staffOfX).catch((e) => e);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.getStatus()).toBe(404);
    expect(writes).toEqual([]);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  it.each([
    ["an account in another organisation", IN_Y],
    ["a platform account", PLATFORM_ACCOUNT],
  ])("is a 404 for %s, called by a platform user acting as the organisation, and writes nothing", async (_what, id) => {
    const error = await operation(id, actingAsX).catch((e) => e);
    expect(error.code).toBe("NOT_FOUND");
    expect(writes).toEqual([]);
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  it("the not-found is the same for another organisation's account, a platform account and a missing id", async () => {
    const errors = await Promise.all([IN_Y, PLATFORM_ACCOUNT, MISSING].map((id) => operation(id, staffOfX).catch((e) => e)));
    expect(new Set(errors.map((e) => JSON.stringify([e.code, e.message, e.getStatus()]))).size).toBe(1);
  });

  it("changes an account in the caller's own organisation", async () => {
    await operation(IN_X, staffOfX);
    expect(writes.some((w) => w.endsWith(IN_X))).toBe(true);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it("reaches any account when the caller is the platform", async () => {
    await operation(IN_Y, { organisationid: null, isplatform: true });
    expect(writes.some((w) => w.endsWith(IN_Y))).toBe(true);
  });

  it("fails closed with no caller scope: 403, nothing read or written", async () => {
    const error = await operation(IN_X, { organisationid: null, isplatform: false }).catch((e) => e);
    expect(error.code).toBe("NOT_ALLOWED");
    expect(writes).toEqual([]);
    expect(lmsusers.findOne).not.toHaveBeenCalled();
  });
});
