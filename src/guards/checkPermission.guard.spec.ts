import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RequireAllPermissions, RequirePermissions } from "src/decorators/requirePermissions.decorator";
import { Permission, SUPERADMIN } from "src/models/enums/permissions.enum";
import { CheckPermissionsGuard } from "./checkPermission.guard";

class Plain { handler() { return 1; } }
class AnyOf { @RequirePermissions(Permission.VIEW_ONLINE_REPORT, Permission.VIEW_STUDENT) handler() { return 1; } }
class AllOf { @RequireAllPermissions(Permission.VIEW_ONLINE_REPORT, Permission.VIEW_STUDENT) handler() { return 1; } }
class NoneListed { @RequireAllPermissions() handler() { return 1; } }

const guard = new CheckPermissionsGuard(new Reflector());
const admits = (route: new () => { handler(): number }, permissions: string[]) => {
  const context = {
    getHandler: () => route.prototype.handler,
    getClass: () => route,
    switchToHttp: () => ({ getRequest: () => ({ user: { permissions } }) }),
  } as unknown as ExecutionContext;
  return guard.canActivate(context);
};

describe("CheckPermissionsGuard", () => {
  it("a route with no permission metadata admits anyone", () => {
    expect(admits(Plain, [])).toBe(true);
  });
  it("a route listing permissions admits an account holding any one of them", () => {
    expect(admits(AnyOf, ["view_student"])).toBe(true);
    expect(admits(AnyOf, ["something_else"])).toBe(false);
  });
  it("a route requiring all of its permissions refuses an account missing one", () => {
    expect(admits(AllOf, ["view_online_report"])).toBe(false);
    expect(admits(AllOf, ["view_student"])).toBe(false);
    expect(admits(AllOf, [])).toBe(false);
  });
  it("a route requiring all of its permissions admits an account holding both", () => {
    expect(admits(AllOf, ["view_online_report", "view_student"])).toBe(true);
  });
  it("the superadmin wildcard admits on any listing", () => {
    expect(admits(AllOf, [SUPERADMIN])).toBe(true);
    expect(admits(AnyOf, [SUPERADMIN])).toBe(true);
  });
  it("a route requiring all of an empty list admits no one, the wildcard included", () => {
    expect(admits(NoneListed, [])).toBe(false);
    expect(admits(NoneListed, ["view_student"])).toBe(false);
    expect(admits(NoneListed, [SUPERADMIN])).toBe(false);
  });
});
