import { bindUserRoles } from "../role-permission/role-perm.request.validator";
import { createuser, updateuser } from "./user.request.validator";

/**
 * The request shapes of the three routes that set a user's roles. The role
 * lists are arrays of short strings, bounded; the update body always carries the
 * roles (the admin form sends the array, empty when none is ticked).
 */
const ID = "bbbb2a2a-0000-4000-8000-000000000003";
const okCreate = { lmsusername: "new.person@example.com", lmsuserpasswordhash: "SamplePass12", lmsuserroles: ["zr5ER4QD"] };
const okUpdate = { lmsusername: "target@example.com", lmsuserroles: ["zr5ER4QD"] };

const badLists: Array<[string, unknown]> = [
  ["an object item", [{ $ne: "x" }]],
  ["a number item", [7]],
  ["a null item", [null]],
  ["a nested array", [["zr5ER4QD"]]],
  ["an oversized id", ["x".repeat(500)]],
  ["more than 50 ids", Array.from({ length: 51 }, (_v, i) => `r${i}`)],
  ["a string instead of an array", "zr5ER4QD"],
];

const bodyError = (validator: { body?: { validate: (v: unknown) => { error?: unknown } } }, value: unknown) =>
  validator.body!.validate(value).error;

describe("role lists are typed and bounded on create, update and bind", () => {
  it.each(badLists)("create refuses %s", (_name, list) => {
    expect(bodyError(createuser as never, { ...okCreate, lmsuserroles: list })).toBeDefined();
  });

  it.each(badLists)("update refuses %s", (_name, list) => {
    expect(bodyError(updateuser as never, { ...okUpdate, lmsuserroles: list })).toBeDefined();
  });

  it.each(badLists)("bind refuses %s", (_name, list) => {
    expect(bodyError(bindUserRoles as never, { lmsuserid: ID, rolesid: list })).toBeDefined();
  });

  it("accepts a normal request on each", () => {
    expect(bodyError(createuser as never, okCreate)).toBeUndefined();
    expect(bodyError(updateuser as never, okUpdate)).toBeUndefined();
    expect(bodyError(bindUserRoles as never, { lmsuserid: ID, rolesid: ["zr5ER4QD", "Q3Qs7PuD"] })).toBeUndefined();
  });
});

describe("PUT /user/:id body", () => {
  it("requires the roles array", () => {
    expect(bodyError(updateuser as never, { lmsusername: "target@example.com" })).toBeDefined();
    expect(bodyError(updateuser as never, { lmsusername: "target@example.com", lmsuserpasswordhash: "x" })).toBeDefined();
  });

  it("accepts an empty roles array (untick-all)", () => {
    expect(bodyError(updateuser as never, { ...okUpdate, lmsuserroles: [] })).toBeUndefined();
  });

  it("accepts everything the admin form sends: the id repeated, a null or empty password, scope arrays", () => {
    expect(
      bodyError(updateuser as never, {
        lmsuserid: ID,
        lmsusername: "target@example.com",
        lmsuserpasswordhash: null,
        lmsuserroles: ["zr5ER4QD"],
        countryids: [],
        schoolids: [],
      }),
    ).toBeUndefined();
    expect(bodyError(updateuser as never, { ...okUpdate, lmsuserpasswordhash: "" })).toBeUndefined();
  });

  it("refuses an unknown key and a missing username", () => {
    expect(bodyError(updateuser as never, { ...okUpdate, organisationid: ID })).toBeDefined();
    expect(bodyError(updateuser as never, { lmsuserroles: [] })).toBeDefined();
  });
});

export {};
