import { Transaction } from "sequelize";
import { lmsusers } from "src/models/data-models/lmsusers";
import { roles } from "src/models/data-models/roles";
import { tokens } from "src/models/data-models/tokens";
import { Role } from "src/models/enums";
import { dbinstance } from "src/services/dbservice";
import { RolePermissionBusiness } from "./role-permission.business";
import { revokeIfSuperAdminRemoved } from "./session-revocation";
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

const roleRow = (roleid: string) => ({ roleid, rolename: roleid });

type FakeUser = {
  lmsuserid: string;
  lmsusername?: string;
  isdisabled?: boolean;
  held: string[];
  setRoles: jest.Mock;
  getRoles: jest.Mock;
  save: jest.Mock;
  setDataValue: jest.Mock;
};
const fakeUser = (held: string[]): FakeUser => ({
  lmsuserid: "u-1",
  held,
  setRoles: jest.fn().mockResolvedValue([]),
  getRoles: jest.fn().mockResolvedValue(held.map(roleRow)),
  save: jest.fn().mockResolvedValue(undefined),
  setDataValue: jest.fn(),
});

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

describe("revokeIfSuperAdminRemoved", () => {
  it("deletes the user's tokens only when Super Admin was held and is not in the new set", async () => {
    await revokeIfSuperAdminRemoved("u-1", true, [Role.admin], tnx);
    expect(destroy).toHaveBeenCalledWith({ where: { lmsuserid: "u-1" }, transaction: tnx });
  });

  it("does nothing when Super Admin is kept, was never held, or both", async () => {
    await revokeIfSuperAdminRemoved("u-1", true, [Role.admin, Role.superadmin], tnx);
    await revokeIfSuperAdminRemoved("u-1", false, [Role.admin], tnx);
    await revokeIfSuperAdminRemoved("u-1", false, [Role.superadmin], tnx);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("an empty new set removes Super Admin", async () => {
    await revokeIfSuperAdminRemoved("u-1", true, [], tnx);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe("POST /roles/user-bind-role (RolePermissionBusiness.bindUserRoles)", () => {
  const bind = (held: string[], newRoleIds: string[]) => {
    const user = fakeUser(held);
    setRolesCalled(user);
    jest.spyOn(lmsusers, "findOne").mockResolvedValue(user as never);
    jest.spyOn(roles, "findAll").mockResolvedValue(newRoleIds.map(roleRow) as never);
    return {
      user,
      run: () => new RolePermissionBusiness().bindUserRoles({ lmsuserid: "u-1", rolesid: newRoleIds }),
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

  it("keeping Super Admin revokes nothing", async () => {
    const { run } = bind([Role.superadmin], [Role.superadmin, Role.admin]);
    await run();
    expect(destroy).not.toHaveBeenCalled();
    expect(order).toEqual(["setRoles", "commit"]);
  });

  it("changing roles for a user who never held Super Admin revokes nothing", async () => {
    const { run } = bind([Role.admin], [Role.teacher]);
    await run();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("granting Super Admin revokes nothing", async () => {
    const { run } = bind([Role.admin], [Role.admin, Role.superadmin]);
    await run();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("rolls back, and does not commit, when the revocation fails (the role change goes with it)", async () => {
    const { run } = bind([Role.superadmin], []);
    destroy.mockRejectedValue(new Error("tokens failed"));
    await expect(run()).rejects.toThrow("tokens failed");
    expect(order).toContain("rollback");
    expect(order).not.toContain("commit");
  });

  it("an unknown user changes and revokes nothing, and still commits cleanly", async () => {
    jest.spyOn(lmsusers, "findOne").mockResolvedValue(null as never);
    jest.spyOn(roles, "findAll").mockResolvedValue([] as never);
    await expect(
      new RolePermissionBusiness().bindUserRoles({ lmsuserid: "nobody", rolesid: [] }),
    ).resolves.toBeUndefined();
    expect(destroy).not.toHaveBeenCalled();
  });
});

describe("user update (UserBusiness.updateUser)", () => {
  const update = (held: string[], newRoleIds: string[]) => {
    const user = fakeUser(held);
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
        ),
    };
  };

  it("removing Super Admin deletes that user's tokens in the same transaction, before the commit", async () => {
    const { run } = update([Role.superadmin], [Role.admin]);
    await run();
    expect(destroy).toHaveBeenCalledWith({ where: { lmsuserid: "u-1" }, transaction: tnx });
    expect(order).toEqual(["setRoles", "revoke", "commit"]);
  });

  it("keeping Super Admin, or never holding it, revokes nothing", async () => {
    await update([Role.superadmin], [Role.superadmin]).run();
    await update([Role.admin], [Role.teacher]).run();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("revokes nothing when the role set is not applied (a role id that does not exist)", async () => {
    const user = fakeUser([Role.superadmin]);
    jest.spyOn(lmsusers, "findOne").mockResolvedValue(user as never);
    // one of the two requested roles is missing, so setRoles is skipped
    jest.spyOn(roles, "findAll").mockResolvedValue([roleRow(Role.admin)] as never);
    await new UserBusiness().updateUser(
      { lmsuserid: "u-1", lmsusername: "someone@example.com" } as never,
      [Role.admin, "no-such-role"],
      { lmsuserid: "admin-1" } as never,
    );
    expect(user.setRoles).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
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
    await new UserBusiness().disableuserbyid("u-1");
    expect(user.setRoles).toHaveBeenCalledWith([], { transaction: tnx });
    expect(destroy).toHaveBeenCalledWith({ where: { lmsuserid: "u-1" }, transaction: tnx });
    expect(order).toEqual(["setRoles", "revoke", "commit"]);
  });

  it("a disabled user who was not Super Admin: no revocation here", async () => {
    const user = fakeUser([Role.admin]);
    jest.spyOn(lmsusers, "findOne").mockResolvedValue(user as never);
    await new UserBusiness().disableuserbyid("u-1");
    expect(destroy).not.toHaveBeenCalled();
  });
});
