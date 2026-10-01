import { ValidationError } from "joi";
import { lmsusers } from "src/models/data-models/lmsusers";
import { rowMatches, withPrimaryKey } from "src/test-support/fakewhere";
import { DeleteUser, EditUser } from "./user.business.validator";

/**
 * The EditUser and DeleteUser validators run before the route's handler and
 * look the target up within the caller's scope: an account in another
 * organisation, or a platform account (for an organisation's caller), is the
 * same 404 as an id that does not exist, and the platform account is not
 * described to a caller who may not see it. The business methods behind the
 * routes check the scope again (user.organisation-scope.business.spec.ts); each
 * layer is pinned on its own.
 */
withPrimaryKey(lmsusers, "lmsuserid");

const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const IN_X = "11111111-0000-4000-8000-000000000001";
const IN_Y = "22222222-0000-4000-8000-000000000001";
const PLATFORM_ACCOUNT = "33333333-0000-4000-8000-000000000001";
const MISSING = "99999999-0000-4000-8000-000000000009";

const accounts = [
  { lmsuserid: IN_X, lmsusername: "x.staff@example.com", organisationid: X },
  { lmsuserid: IN_Y, lmsusername: "y.staff@example.com", organisationid: Y },
  // The seeded platform account: the delete rule names it.
  { lmsuserid: PLATFORM_ACCOUNT, lmsusername: "superadmin@superadmin.com", organisationid: null },
];

const requestFor = (user: Record<string, unknown>) => ({ user: { lmsuserid: "caller", ...user } }) as never;
const staffOfX = requestFor({ organisationid: X, isplatform: false });
const actingAsX = requestFor({ organisationid: X, isplatform: true });
const platform = requestFor({ organisationid: null, isplatform: true });

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(lmsusers, "findOne").mockImplementation((async (o: { where: unknown }) => {
    const found = accounts.find((a) => rowMatches(a, o.where));
    return found ? { ...found, get: () => ({ ...found }) } : null;
  }) as never);
});

describe.each([
  ["EditUser", EditUser],
  ["DeleteUser", DeleteUser],
])("%s validator", (_name, validator) => {
  it.each([
    ["an account in another organisation", IN_Y],
    ["a platform account", PLATFORM_ACCOUNT],
    ["an id that does not exist", MISSING],
  ])("is a 404 for %s when an organisation's user asks", async (_what, id) => {
    for (const request of [staffOfX, actingAsX]) {
      const error = await validator(request, { lmsuserid: id }).catch((e: unknown) => e);
      expect(error).not.toBeInstanceOf(ValidationError);
      expect((error as { code?: string }).code).toBe("NOT_FOUND");
      expect((error as { getStatus: () => number }).getStatus()).toBe(404);
    }
  });

  it("the not-found is the same for another organisation's account, a platform account and a missing id", async () => {
    const errors = await Promise.all(
      [IN_Y, PLATFORM_ACCOUNT, MISSING].map((id) => validator(staffOfX, { lmsuserid: id }).catch((e: unknown) => e)),
    );
    expect(new Set(errors.map((e) => JSON.stringify([(e as { code?: string }).code, (e as { message?: string }).message]))).size).toBe(1);
  });

  it("passes an account in the caller's own organisation", async () => {
    await expect(validator(staffOfX, { lmsuserid: IN_X })).resolves.toEqual([]);
  });

  it("looks the account up within the caller's scope, not by id alone", async () => {
    await validator(staffOfX, { lmsuserid: IN_X });
    const where = (lmsusers.findOne as jest.Mock).mock.calls[0][0].where;
    expect(JSON.stringify(Object.getOwnPropertySymbols(where).map((s) => where[s]))).toContain(X);
  });

  it("fails closed with no caller: nothing is read", async () => {
    await expect(validator({} as never, { lmsuserid: IN_X })).rejects.toBeDefined();
    await expect(validator(requestFor({ organisationid: null, isplatform: false }), { lmsuserid: IN_X })).rejects.toBeDefined();
    expect(lmsusers.findOne).not.toHaveBeenCalled();
  });
});

describe("the platform sees every account in the validators", () => {
  it("EditUser passes accounts in any organisation and a platform account", async () => {
    for (const id of [IN_X, IN_Y, PLATFORM_ACCOUNT]) {
      await expect(EditUser(platform, { lmsuserid: id })).resolves.toEqual([]);
    }
  });

  it("DeleteUser refuses the seeded superadmin account to the platform with a validation error, and passes others", async () => {
    const result = await DeleteUser(platform, { lmsuserid: PLATFORM_ACCOUNT });
    expect(result[0]).toBeInstanceOf(ValidationError);
    await expect(DeleteUser(platform, { lmsuserid: IN_Y })).resolves.toEqual([]);
  });

  it("an organisation's caller is never told about the seeded superadmin account", async () => {
    const result = await DeleteUser(staffOfX, { lmsuserid: PLATFORM_ACCOUNT }).catch((e: unknown) => e);
    expect(result).not.toBeInstanceOf(ValidationError);
    expect((result as { code?: string }).code).toBe("NOT_FOUND");
  });
});
