import { Transaction } from "sequelize";
import { lmsusers } from "src/models/data-models/lmsusers";
import { roles } from "src/models/data-models/roles";
import { tokens } from "src/models/data-models/tokens";
import { Role } from "src/models/enums";
import { dbinstance } from "src/services/dbservice";
import { withPrimaryKey } from "src/test-support/fakewhere";
import { RolePermissionBusiness } from "./role-permission.business";
import { revokeIfRolesChanged, sameRoleSet } from "./session-revocation";
import { UserBusiness } from "./user.business";

/**
 * When the Super Admin role is removed from a user, that user's sessions end in
 * the same transaction: a token minted while they held it carries the superadmin
 * wildcard and the platform claim, and must not outlive the role. Covers every
 * place role bindings change: POST /roles/user-bind-role (bindUserRoles), user
 * update (updateUser) and user delete (disableuserbyid, which clears the roles).
 */
const tnx = { id: "tnx", commit: jest.fn(), rollback: jest.fn() } as unknown as Transaction & {
  commit: jest.Mock;
  rollback: jest.Mock;
};

// The caller context for these tests: a platform user (the Super Admin rule itself is in
// src/modules/user/super-admin-rule.guard.spec.ts).
const PLATFORM = { organisationid: null, isplatform: true };

const roleRow = (roleid: string) => ({ roleid, rolename: roleid });

type FakeUser = {
  lmsuserid: string;
  lmsusername?: string;
  organisationid: string | null;
  isdisabled?: boolean;
  held: string[];
  setRoles: jest.Mock;
  getRoles: jest.Mock;
  save: jest.Mock;
  setDataValue: jest.Mock;
};
// An account's organisation: most scenarios here are about an account in an
// organisation (which cannot hold Super Admin); platform accounts say `null`.
const IN_ORG = "33333333-3333-4333-8333-333333333333";
const fakeUser = (held: string[], organisationid: string | null = IN_ORG): FakeUser => ({
  lmsuserid: "u-1",
  organisationid,
  held,
  setRoles: jest.fn().mockResolvedValue([]),
  getRoles: jest.fn().mockResolvedValue(held.map(roleRow)),
  save: jest.fn().mockResolvedValue(undefined),
  setDataValue: jest.fn(),
});

withPrimaryKey(lmsusers, "lmsuserid");

const order: string[] = [];
let destroy: jest.SpyInstance;

beforeEach(() => {
  order.length = 0;
  tnx.commit.mockReset().mockImplementation(async () => void order.push("commit"));
  tnx.rollback.mockReset().mockImplementation(async () => void order.push("rollback"));
  jest.spyOn(dbinstance.getdbinstance(), "transaction").mockResolvedValue(tnx as never);
  destroy = jest.spyOn(tokens, "destroy").mockImplementation((async () => {
    order.push("revoke");
    return 1;
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

const setRolesCalled = (u: FakeUser) =>
  u.setRoles.mockImplementation(async () => void order.push("setRoles"));

describe("sameRoleSet", () => {
  it("compares sets: order and repeats do not matter", () => {
    expect(sameRoleSet([Role.admin, Role.teacher], [Role.teacher, Role.admin])).toBe(true);
    expect(sameRoleSet([Role.admin, Role.admin], [Role.admin])).toBe(true);
    expect(sameRoleSet([], [])).toBe(true);
  });

  it("is false when a role is added, removed or swapped", () => {
    expect(sameRoleSet([Role.admin], [Role.admin, Role.teacher])).toBe(false);
    expect(sameRoleSet([Role.admin, Role.teacher], [Role.admin])).toBe(false);
    expect(sameRoleSet([Role.admin], [Role.teacher])).toBe(false);
    expect(sameRoleSet([Role.admin], [])).toBe(false);
  });
});

describe("revokeIfRolesChanged", () => {
  it("deletes the user's tokens, in the given transaction, when the role set changed", async () => {
    expect(await revokeIfRolesChanged("u-1", [Role.admin], [Role.teacher], tnx)).toBe(true);
    expect(destroy).toHaveBeenCalledWith({ where: { lmsuserid: "u-1" }, transaction: tnx });
  });

  it("covers Super Admin being removed, and an empty new set", async () => {
    await revokeIfRolesChanged("u-1", [Role.superadmin, Role.admin], [Role.admin], tnx);
    await revokeIfRolesChanged("u-1", [Role.superadmin], [], tnx);
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the set is the same", async () => {
    expect(await revokeIfRolesChanged("u-1", [Role.admin, Role.teacher], [Role.teacher, Role.admin], tnx)).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
  });
});

describe("POST /roles/user-bind-role (RolePermissionBusiness.bindUserRoles)", () => {
  const bind = (held: string[], newRoleIds: string[], organisationid: string | null = IN_ORG) => {
    const user = fakeUser(held, organisationid);
    setRolesCalled(user);
    jest.spyOn(lmsusers, "findOne").mockResolvedValue(user as never);
    jest.spyOn(roles, "findAll").mockResolvedValue(newRoleIds.map(roleRow) as never);
    return {
      user,
      run: () => new RolePermissionBusiness().bindUserRoles({ lmsuserid: "u-1", rolesid: newRoleIds }, PLATFORM),
    };
  };

  it("removing Super Admin deletes that user's tokens in the same transaction, after the role change and before the commit", async () => {
    const { user, run } = bind([Role.superadmin, Role.admin], [Role.admin]);
    await run();
    expect(user.setRoles.mock.calls[0][1]).toEqual({ transaction: tnx });
    expect(destroy).toHaveBeenCalledWith({ where: { lmsuserid: "u-1" }, transaction: tnx });
    expect(order).toEqual(["setRoles", "revoke", "commit"]);
  });

  it("reads whether Super Admin was held inside the transaction, before replacing the roles", async () => {
    const { user, run } = bind([Role.superadmin], []);
    user.getRoles.mockImplementation(async () => {
      order.push("getRoles");
      return [roleRow(Role.superadmin)];
    });
    await run();
    expect(user.getRoles).toHaveBeenCalledWith({ transaction: tnx });
    expect(order.indexOf("getRoles")).toBeLessThan(order.indexOf("setRoles"));
  });

  it("an unchanged role set revokes nothing, even when sent in another order", async () => {
    await bind([Role.superadmin], [Role.superadmin], null).run();
    await bind([Role.admin, Role.teacher], [Role.teacher, Role.admin]).run();
    expect(destroy).not.toHaveBeenCalled();
    expect(order).toEqual(["setRoles", "commit", "setRoles", "commit"]);
  });

  it("any change of the role set (a demotion, an addition, a swap) deletes that user's tokens in the same transaction, before the commit", async () => {
    for (const [held, next] of [
      [[Role.organisationadmin], [Role.teacher]],
      [[Role.admin], [Role.admin, Role.teacher]],
      [[Role.admin], [Role.admin, Role.superadmin]],
    ] as Array<[string[], string[]]>) {
      destroy.mockClear();
      order.length = 0;
      await bind(held, next, held.includes(Role.superadmin) || next.includes(Role.superadmin) ? null : IN_ORG).run();
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(destroy).toHaveBeenCalledWith({ where: { lmsuserid: "u-1" }, transaction: tnx });
      expect(order).toEqual(["setRoles", "revoke", "commit"]);
    }
  });

  it("rolls back, and does not commit, when the revocation fails (the role change goes with it)", async () => {
    const { run } = bind([Role.superadmin], []);
    destroy.mockRejectedValue(new Error("tokens failed"));
    await expect(run()).rejects.toThrow("tokens failed");
    expect(order).toContain("rollback");
    expect(order).not.toContain("commit");
  });

  it("an unknown user is a 404: nothing is changed or revoked, and it rolls back", async () => {
    jest.spyOn(lmsusers, "findOne").mockResolvedValue(null as never);
    jest.spyOn(roles, "findAll").mockResolvedValue([] as never);
    const error = await new RolePermissionBusiness()
      .bindUserRoles({ lmsuserid: "nobody", rolesid: [] }, PLATFORM)
      .catch((e) => e);
    expect(error.code).toBe("NOT_FOUND");
    expect(destroy).not.toHaveBeenCalled();
    expect(order).toEqual(["rollback"]);
  });
});

describe("user update (UserBusiness.updateUser)", () => {
  const update = (held: string[], newRoleIds: string[], organisationid: string | null = IN_ORG) => {
    const user = fakeUser(held, organisationid);
    setRolesCalled(user);
    jest.spyOn(lmsusers, "findOne").mockResolvedValue(user as never);
    jest.spyOn(roles, "findAll").mockResolvedValue(newRoleIds.map(roleRow) as never);
    return {
      user,
      run: () =>
        new UserBusiness().updateUser(
          { lmsuserid: "u-1", lmsusername: "someone@example.com" } as never,
          newRoleIds,
          { lmsuserid: "admin-1" } as never,
          PLATFORM,
        ),
    };
  };

  it("removing Super Admin deletes that user's tokens in the same transaction, before the commit", async () => {
    const { run } = update([Role.superadmin], [Role.admin]);
    await run();
    expect(destroy).toHaveBeenCalledWith({ where: { lmsuserid: "u-1" }, transaction: tnx });
    expect(order).toEqual(["setRoles", "revoke", "commit"]);
  });

  it("an unchanged role set revokes nothing: an edit of the other fields ends no session", async () => {
    await update([Role.superadmin], [Role.superadmin], null).run();
    await update([Role.admin, Role.teacher], [Role.teacher, Role.admin]).run();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("a changed role set deletes that user's tokens once, in the same transaction, before the commit", async () => {
    const { run } = update([Role.organisationadmin], [Role.teacher]);
    await run();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledWith({ where: { lmsuserid: "u-1" }, transaction: tnx });
    expect(order).toEqual(["setRoles", "revoke", "commit"]);
  });

  it("an unknown role id is 400: nothing is saved, no roles are set, nothing is revoked, and it rolls back", async () => {
    const user = fakeUser([Role.superadmin]);
    jest.spyOn(lmsusers, "findOne").mockResolvedValue(user as never);
    // one of the two requested roles does not exist
    jest.spyOn(roles, "findAll").mockResolvedValue([roleRow(Role.admin)] as never);
    const error = await new UserBusiness()
      .updateUser(
        { lmsuserid: "u-1", lmsusername: "someone@example.com" } as never,
        [Role.admin, "no-such-role"],
        { lmsuserid: "admin-1" } as never,
        PLATFORM,
      )
      .catch((e) => e);
    expect(error.code).toBe("INVALID_INPUT");
    expect(user.save).not.toHaveBeenCalled();
    expect(user.setRoles).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    expect(order).toEqual(["rollback"]);
  });

  it("rolls back when the revocation fails", async () => {
    const { run } = update([Role.superadmin], [Role.admin]);
    destroy.mockRejectedValue(new Error("tokens failed"));
    await expect(run()).rejects.toThrow("tokens failed");
    expect(order).toContain("rollback");
    expect(order).not.toContain("commit");
  });
});

describe("user delete (UserBusiness.disableuserbyid, which clears every role)", () => {
  it("a disabled Super Admin loses their sessions in the same transaction", async () => {
    const user = fakeUser([Role.superadmin]);
    setRolesCalled(user);
    jest.spyOn(lmsusers, "findOne").mockResolvedValue(user as never);
    await new UserBusiness().disableuserbyid("u-1", PLATFORM);
    expect(user.setRoles).toHaveBeenCalledWith([], { transaction: tnx });
    expect(destroy).toHaveBeenCalledWith({ where: { lmsuserid: "u-1" }, transaction: tnx });
    expect(order).toEqual(["setRoles", "revoke", "commit"]);
  });

  it("a disabled user who was NOT Super Admin loses their sessions too: disabling any staff user ends their session", async () => {
    const user = fakeUser([Role.admin]);
    setRolesCalled(user);
    jest.spyOn(lmsusers, "findOne").mockResolvedValue(user as never);
    await new UserBusiness().disableuserbyid("u-1", PLATFORM);
    expect(destroy).toHaveBeenCalledWith({ where: { lmsuserid: "u-1" }, transaction: tnx });
    expect(order).toEqual(["setRoles", "revoke", "commit"]);
  });

  it("an unknown user is a 404 and revokes nothing", async () => {
    jest.spyOn(lmsusers, "findOne").mockResolvedValue(null as never);
    const error = await new UserBusiness().disableuserbyid("nobody", PLATFORM).catch((e) => e);
    expect(error.code).toBe("NOT_FOUND");
    expect(destroy).not.toHaveBeenCalled();
  });
});

describe("business methods that change another user's row but have no route today (activate, deactivate, basic update)", () => {
  const NOT_PLATFORM = { organisationid: "33333333-3333-4333-8333-333333333333", isplatform: false };
  const plain = { lmsuserid: "u-1", firstname: "A", lastname: "B", isdisabled: false };
  let update: jest.SpyInstance;

  const arrange = (held: string[]) => {
    const user = fakeUser(held);
    jest.spyOn(lmsusers, "findOne").mockResolvedValue({ ...user, get: () => ({ ...plain }) } as never);
    update = jest.spyOn(lmsusers, "update").mockResolvedValue([1] as never);
  };

  const methods: Array<[string, (org: { organisationid: string | null; isplatform: boolean }) => Promise<unknown>]> = [
    ["activateuser", (org) => new UserBusiness().activateuser("u-1", org)],
    ["deactivateuser", (org) => new UserBusiness().deactivateuser("u-1", org)],
    ["updateuserbasic", (org) => new UserBusiness().updateuserbasic({ lmsuserid: "u-1", firstname: "X", lastname: "Y" } as never, org)],
  ];

  it.each(methods)("%s refuses a caller who is not platform when the target holds Super Admin, and writes nothing", async (_name, run) => {
    arrange([Role.superadmin]);
    const error = await run(NOT_PLATFORM).catch((e: { code?: string }) => e);
    expect((error as { code?: string }).code).toBe("NOT_ALLOWED");
    expect(update).not.toHaveBeenCalled();
  });

  it.each(methods)("%s lets a platform caller change a Super Admin account", async (_name, run) => {
    arrange([Role.superadmin]);
    await run(PLATFORM);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it.each(methods)("%s lets a caller who is not platform change a user who is not Super Admin", async (_name, run) => {
    arrange([Role.admin]);
    await run(NOT_PLATFORM);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
