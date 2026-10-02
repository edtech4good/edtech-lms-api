import { roles } from "src/models/data-models/roles";
import { Role } from "src/models/enums";
import { assertMayAddRoles, assertMayChangeSignIn, isWithinReach, rolesCallerMayAdd } from "./session-revocation";

/**
 * The rule for which roles a caller in an organisation's scope may ADD to an
 * account, on resolved role rows (the grants are read from the roles table).
 * The HTTP behaviour, for every route and caller, is in
 * src/modules/user/organisation-admin.spec.ts; this pins the function.
 */
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GRANTS: Record<string, string[]> = {
  [Role.superadmin]: ["a", "b", "c"],
  [Role.admin]: ["a"],
  [Role.user]: [],
  [Role.apikey]: [],
  [Role.teacher]: ["a", "t"],
  [Role.organisationadmin]: ["a", "b"],
  custom1: ["a"],
  custom2: ["a", "z"],
  customNone: [],
};
const row = (roleid: string) => ({ roleid, rolename: roleid }) as unknown as roles;
const staff = (permissions?: string[]) => ({ organisationid: X, isplatform: false, permissions });
const acting = (permissions?: string[]) => ({ organisationid: X, isplatform: true, permissions });
const platform = { organisationid: null, isplatform: true, permissions: [] };

let queries: Array<{ ids: string[]; transaction: unknown }>;
beforeEach(() => {
  queries = [];
  jest.spyOn(roles, "findAll").mockImplementation((async (o: { where: { roleid: unknown }; transaction?: unknown }) => {
    const sym = Object.getOwnPropertySymbols(o.where.roleid as object)[0];
    const ids = (o.where.roleid as Record<symbol, string[]>)[sym];
    queries.push({ ids, transaction: o.transaction });
    return ids.map((roleid) => ({ roleid, permissions: GRANTS[roleid].map((permissionname) => ({ permissionname })) }));
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

const may = async (caller: Parameters<typeof rolesCallerMayAdd>[0], ids: string[], tx?: never) =>
  [...(await rolesCallerMayAdd(caller, ids.map(row), tx))].sort();

describe("rolesCallerMayAdd", () => {
  it("a platform caller not acting may add any role, and reads nothing", async () => {
    expect(await may(platform, [Role.admin, Role.superadmin, "custom2"])).toEqual([Role.admin, Role.superadmin, "custom2"].sort());
    expect(queries).toEqual([]);
  });

  it("built-in roles other than Organisation Admin and Teacher are never addable, whatever the caller holds", async () => {
    const everything = staff(["a", "b", "c", "t", "z", "superadmin"]);
    expect(await may(everything, [Role.admin, Role.user, Role.apikey, Role.superadmin])).toEqual([]);
    // they are not even looked up
    expect(queries).toEqual([]);
  });

  it("Organisation Admin and Teacher still need every permission they hold to be the caller's", async () => {
    expect(await may(staff(["a", "b"]), [Role.organisationadmin, Role.teacher])).toEqual([Role.organisationadmin]);
    expect(await may(staff(["a", "b", "t"]), [Role.organisationadmin, Role.teacher])).toEqual([Role.organisationadmin, Role.teacher].sort());
  });

  it("a custom role needs a subset: within is allowed, one extra permission is refused, none held is allowed", async () => {
    expect(await may(staff(["a"]), ["custom1", "custom2", "customNone"])).toEqual(["custom1", "customNone"]);
  });

  it("a caller with no permissions (absent claim) may add only roles that hold none: it fails closed", async () => {
    expect(await may(staff(undefined), ["custom1", "customNone"])).toEqual(["customNone"]);
    expect(await may(undefined, ["custom1", "customNone"])).toEqual(["customNone"]);
  });

  it("the superadmin wildcard holds every permission, but not every built-in role", async () => {
    expect(await may(acting(["superadmin"]), ["custom2", Role.teacher, Role.admin])).toEqual(["custom2", Role.teacher].sort());
  });

  it("reads the grants with the transaction it is given", async () => {
    const tx = { id: "tx" } as never;
    await may(staff(["a"]), ["custom1"], tx);
    expect(queries[0].transaction).toBe(tx);
  });
});

describe("assertMayAddRoles", () => {
  const run = (caller: Parameters<typeof rolesCallerMayAdd>[0], current: string[], next: string[]) =>
    assertMayAddRoles({ caller, currentRoleIds: current, newRoles: next.map(row) });

  it("refuses with 403 when a role is added that the caller may not add", async () => {
    const error = await run(staff(["a"]), [], ["custom2"]).catch((e) => e);
    expect(error.code).toBe("NOT_ALLOWED");
  });

  it("only additions are checked: a role the account holds and keeps is not re-checked, and removal is free", async () => {
    await run(staff(["a"]), [Role.admin, "custom2"], [Role.admin, "custom2", "custom1"]);
    await run(staff(["a"]), [Role.admin, "custom2"], ["custom1"]);
    await run(staff(["a"]), [Role.admin], []);
    expect(queries.map((q) => q.ids)).toEqual([["custom1"], ["custom1"]]);
  });

  it("on create every role is an addition", async () => {
    await expect(run(staff(["a"]), [], [Role.admin])).rejects.toMatchObject({ code: "NOT_ALLOWED" });
  });

  it("a platform caller not acting is unchanged; one acting as an organisation is bound", async () => {
    await run(platform, [], [Role.admin, Role.superadmin]);
    await expect(run(acting(["superadmin"]), [], [Role.admin])).rejects.toMatchObject({ code: "NOT_ALLOWED" });
  });

  it("a missing caller context is bound (fails closed)", async () => {
    await expect(run(undefined, [], [Role.admin])).rejects.toMatchObject({ code: "NOT_ALLOWED" });
  });
});

describe("isWithinReach", () => {
  const within = (caller: Parameters<typeof isWithinReach>[0]["caller"], held: string[], isSelf = false) =>
    isWithinReach({ caller, heldRoles: held.map(row), isSelf });

  it("is true when every role held is one the caller could add, and for an account holding none", async () => {
    expect(await within(staff(["a", "b"]), [Role.organisationadmin, "custom1"])).toBe(true);
    expect(await within(staff(["a"]), [])).toBe(true);
  });

  it("is false when any one role held is not addable: built in for another use, or beyond the caller's permissions", async () => {
    expect(await within(staff(["a", "b"]), [Role.organisationadmin, Role.admin])).toBe(false);
    expect(await within(staff(["a", "b"]), [Role.organisationadmin, "custom2"])).toBe(false);
    expect(await within(staff(["a", "b"]), [Role.teacher])).toBe(false);
  });

  it("an account editing itself is always within reach; a platform caller not acting reaches everyone; one acting is bound", async () => {
    expect(await within(staff(["a"]), [Role.admin], true)).toBe(true);
    expect(await within(platform, [Role.admin, Role.superadmin])).toBe(true);
    expect(await within(acting(["superadmin"]), [Role.admin])).toBe(false);
  });

  it("a missing caller context is bound (fails closed)", async () => {
    expect(await within(undefined, [Role.admin])).toBe(false);
  });
});

describe("assertMayChangeSignIn", () => {
  const run = (changesEmail: boolean, changesPassword: boolean, held: string[], isSelf = false) =>
    assertMayChangeSignIn({ caller: staff(["a", "b"]), heldRoles: held.map(row), isSelf, changesEmail, changesPassword });

  it("refuses (403) an email or password change on a wider account, and each alone is enough", async () => {
    await expect(run(true, false, [Role.admin])).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    await expect(run(false, true, [Role.admin])).rejects.toMatchObject({ code: "NOT_ALLOWED" });
  });

  it("allows a change of neither on a wider account, and either on one within reach", async () => {
    await run(false, false, [Role.admin]);
    await run(true, true, [Role.organisationadmin]);
    await run(true, true, [Role.admin], true);
  });
});
