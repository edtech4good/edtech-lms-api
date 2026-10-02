import { Op, Transaction } from "sequelize";
import { ApiError } from "src/models/ApiError";
import { organisations } from "src/models/data-models/organisations";
import { rowMatches } from "src/test-support/fakewhere";
import { andOwned, findOwned, isPlatformScope, lockLiveOrganisation, ownedWhere, scopeOf } from "./org-scope";

/**
 * The caller's scope, and the helpers that limit a table with an
 * `organisationid` column to it. They fail closed: a caller context that is
 * missing, or that is neither platform nor in an organisation, has no scope.
 */
const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const Y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const platform = { organisationid: null, isplatform: true };
const actingAsX = { organisationid: X, isplatform: true };
const staffOfX = { organisationid: X, isplatform: false };
const unassigned = { organisationid: null, isplatform: false };

describe("scopeOf", () => {
  it("platform: a platform user not acting as an organisation", () => {
    expect(scopeOf(platform)).toEqual({ kind: "platform" });
    expect(isPlatformScope(platform)).toBe(true);
  });

  it("organisation X: a user of X, and a platform user acting as X, alike", () => {
    expect(scopeOf(staffOfX)).toEqual({ kind: "organisation", organisationid: X });
    expect(scopeOf(actingAsX)).toEqual({ kind: "organisation", organisationid: X });
    expect(isPlatformScope(actingAsX)).toBe(false);
  });

  it("no scope (403) for a missing context, for an account with no organisation that is not platform, and for malformed values", () => {
    for (const bad of [undefined, null, unassigned, {}, { isplatform: true }, { organisationid: "", isplatform: false }, { organisationid: 7, isplatform: true }, "x"]) {
      const error = (() => {
        try {
          scopeOf(bad as never);
        } catch (e) {
          return e as ApiError;
        }
      })();
      expect(error).toBeInstanceOf(ApiError);
      expect(error!.getStatus()).toBe(403);
    }
  });
});

describe("ownedWhere / andOwned", () => {
  it("adds nothing for the platform and limits to organisationid = X for an organisation", () => {
    expect(ownedWhere(platform)).toEqual({});
    expect(ownedWhere(staffOfX)).toEqual({ organisationid: X });
    expect(ownedWhere(actingAsX)).toEqual({ organisationid: X });
  });

  it("throws for a caller with no scope", () => {
    expect(() => ownedWhere(undefined)).toThrow(ApiError);
    expect(() => ownedWhere(unassigned)).toThrow(ApiError);
    expect(() => andOwned({ isdeleted: false }, null)).toThrow(ApiError);
  });

  it("an organisation's scope excludes other organisations and rows with no organisation", () => {
    const rows = [
      { id: "1", organisationid: X },
      { id: "2", organisationid: Y },
      { id: "3", organisationid: null },
    ];
    expect(rows.filter((r) => rowMatches(r, ownedWhere(staffOfX))).map((r) => r.id)).toEqual(["1"]);
    expect(rows.filter((r) => rowMatches(r, ownedWhere(platform))).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("andOwned keeps the other conditions, including an Op.and and an organisationid of their own, and cannot be widened by them", () => {
    const rows = [
      { id: "1", organisationid: X, isdeleted: false },
      { id: "2", organisationid: Y, isdeleted: false },
      { id: "3", organisationid: X, isdeleted: true },
    ];
    const where = andOwned({ isdeleted: false, [Op.and]: [{ id: { [Op.in]: ["1", "2", "3"] } }] }, staffOfX);
    expect(rows.filter((r) => rowMatches(r, where)).map((r) => r.id)).toEqual(["1"]);
    const hostile = andOwned({ organisationid: Y }, staffOfX);
    expect(rows.filter((r) => rowMatches(r, hostile))).toEqual([]);
  });
});

describe("findOwned", () => {
  const table = [
    { id: "1", organisationid: X },
    { id: "2", organisationid: Y },
    { id: "3", organisationid: null },
  ];
  const fakeModel = () => {
    const findOne = jest.fn(async (o: { where: unknown }) => table.find((r) => rowMatches(r, o.where)) ?? null);
    return { primaryKeyAttribute: "id", findOne };
  };

  it("returns the row inside the scope", async () => {
    const model = fakeModel();
    await expect(findOwned(model as never, "1", staffOfX)).resolves.toEqual({ id: "1", organisationid: X });
    await expect(findOwned(model as never, "2", platform)).resolves.toEqual({ id: "2", organisationid: Y });
    await expect(findOwned(model as never, "3", platform)).resolves.toEqual({ id: "3", organisationid: null });
  });

  it("another organisation's row, a row with no organisation (for an organisation) and a missing id are the same not-found", async () => {
    const model = fakeModel();
    const errors = await Promise.all(
      ["2", "3", "nope"].map((id) => findOwned(model as never, id, staffOfX).catch((e) => e as ApiError) as Promise<ApiError>),
    );
    for (const e of errors) {
      expect(e).toBeInstanceOf(ApiError);
      expect(e.getStatus()).toBe(404);
    }
    expect(new Set(errors.map((e) => JSON.stringify([e.code, e.message, e.getStatus()]))).size).toBe(1);
  });

  it("the route's own not-found is used when given", async () => {
    const model = fakeModel();
    const error = await findOwned(model as never, "2", staffOfX, { notFound: () => new Error("custom") }).catch((e) => e);
    expect(error.message).toBe("custom");
  });

  it("keeps the caller's other find options, and ANDs a where of theirs with the key and the scope", async () => {
    const model = { primaryKeyAttribute: "id", findOne: jest.fn(async (_options: unknown) => ({ id: "1" })) };
    const lock = Transaction.LOCK.UPDATE;
    await findOwned(model as never, "1", staffOfX, { lock, where: { isdeleted: false } });
    const options = model.findOne.mock.calls[0][0] as unknown as { lock: unknown; where: Record<symbol, unknown[]> };
    expect(options.lock).toBe(lock);
    expect(options.where[Op.and]).toEqual([{ isdeleted: false }, { id: "1" }, { organisationid: X }]);
  });

  it("fails closed without a scope: nothing is read", async () => {
    const model = fakeModel();
    for (const bad of [undefined, unassigned]) {
      await expect(findOwned(model as never, "1", bad as never)).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    }
    expect(model.findOne).not.toHaveBeenCalled();
  });

  it("fails closed for a model with no primary key attribute: nothing is read", async () => {
    const findOne = jest.fn();
    await expect(findOwned({ findOne } as never, "1", staffOfX)).rejects.toThrow(/primary key/);
    expect(findOne).not.toHaveBeenCalled();
  });
});

describe("lockLiveOrganisation", () => {
  afterEach(() => jest.restoreAllMocks());

  it("reads the organisation not deleted, under a shared lock, inside the given transaction", async () => {
    const find = jest.spyOn(organisations, "findOne").mockResolvedValue({ organisationid: X } as never);
    const tx = { id: "tx" } as unknown as Transaction;
    await expect(lockLiveOrganisation(X, tx)).resolves.toEqual({ organisationid: X });
    expect(find).toHaveBeenCalledWith({
      where: { organisationid: X, isdeleted: false },
      transaction: tx,
      lock: Transaction.LOCK.SHARE,
    });
  });

  it("is null for a deleted or missing organisation", async () => {
    jest.spyOn(organisations, "findOne").mockResolvedValue(null as never);
    await expect(lockLiveOrganisation(Y, {} as Transaction)).resolves.toBeNull();
  });
});
