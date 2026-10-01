import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { BusinessValidationInterceptor } from "src/interceptors";
import { ValidationException } from "src/models/ValidationException";
import { ExecutionContext } from "@nestjs/common";
import { CreateOrganisation, UpdateOrganisation } from "./organisation.business.validator";

/**
 * The database-backed rules, with OrganisationBusiness replaced by stubs. Each
 * test says which answer the (stubbed) database gives and what the rule makes
 * of it; the rules are driven through the real BusinessValidationInterceptor
 * so the status class (409 "exists" vs 400 "invalid") is what a client sees.
 */
const business = {
  isexistsorganisationname: jest.fn(),
  isexistsorganisationcode: jest.fn(),
  findunusablecountries: jest.fn(),
  getorganisationbyid: jest.fn(),
};
jest.mock("../../business/organisation.business", () => ({
  OrganisationBusiness: jest.fn().mockImplementation(() => business),
}));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const stored = { organisationid: "org-1", organisationcode: "oldcode", organisationpreset: "company" };

beforeEach(() => {
  Object.values(business).forEach((fn) => fn.mockReset());
  business.isexistsorganisationname.mockResolvedValue(false);
  business.isexistsorganisationcode.mockResolvedValue(false);
  business.findunusablecountries.mockResolvedValue([]);
  business.getorganisationbyid.mockResolvedValue(stored);
});

const create = (over: Record<string, unknown> = {}) => ({
  organisationname: "Sample Network",
  organisationcode: "samplenet",
  countryids: [A],
  ...over,
});
const update = (over: Record<string, unknown> = {}) => ({
  organisationid: "org-1",
  organisationname: "Sample Network",
  countryids: [A],
  ...over,
});

const messages = async (rule: typeof CreateOrganisation, data: object) =>
  (await rule({} as never, data)).map((e) => ({
    field: e!.details[0].path[0],
    message: e!.details[0].message,
    type: e!.details[0].type,
  }));

/** Runs one rule through the real interceptor and returns the exception it throws, if any. */
const throughInterceptor = async (rule: typeof CreateOrganisation, body: object) => {
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ body, params: {}, query: {} }) }),
  } as unknown as ExecutionContext;
  try {
    await (await new BusinessValidationInterceptor([rule]).intercept(ctx, { handle: () => ({}) as never }));
    return undefined;
  } catch (e) {
    return e as Error;
  }
};

describe("CreateOrganisation", () => {
  it("passes when the name and code are free and every country is usable", async () => {
    expect(await messages(CreateOrganisation, create())).toEqual([]);
  });

  it("flags a taken name as 'exists' on organisationname, checking the TRIMMED name", async () => {
    business.isexistsorganisationname.mockResolvedValue(true);
    const result = await messages(CreateOrganisation, create({ organisationname: "  Sample Network  " }));
    expect(result).toEqual([
      { field: "organisationname", message: "That organisation name is already in use.", type: "any.exists" },
    ]);
    expect(business.isexistsorganisationname).toHaveBeenCalledWith("Sample Network");
  });

  it("flags a taken code as 'exists' on organisationcode (the check is across ALL organisations)", async () => {
    business.isexistsorganisationcode.mockResolvedValue(true);
    expect(await messages(CreateOrganisation, create())).toEqual([
      { field: "organisationcode", message: "That organisation code is already in use.", type: "any.exists" },
    ]);
    expect(business.isexistsorganisationcode).toHaveBeenCalledWith("samplenet");
  });

  it("flags a repeated country id without asking the database about the countries", async () => {
    expect(await messages(CreateOrganisation, create({ countryids: [A, A] }))).toEqual([
      { field: "countryids", message: "Each country can only be listed once.", type: "any.invalid" },
    ]);
    expect(business.findunusablecountries).not.toHaveBeenCalled();
  });

  it("flags a country that does not exist or is deleted, as 'invalid' (not 'exists')", async () => {
    business.findunusablecountries.mockResolvedValue([B]);
    expect(await messages(CreateOrganisation, create({ countryids: [A, B] }))).toEqual([
      { field: "countryids", message: "One or more of those countries doesn't exist.", type: "any.invalid" },
    ]);
    expect(business.findunusablecountries).toHaveBeenCalledWith([A, B]);
  });

  it("reports several problems together", async () => {
    business.isexistsorganisationname.mockResolvedValue(true);
    business.isexistsorganisationcode.mockResolvedValue(true);
    business.findunusablecountries.mockResolvedValue([A]);
    expect((await messages(CreateOrganisation, create())).map((m) => m.field)).toEqual([
      "organisationname",
      "organisationcode",
      "countryids",
    ]);
  });

  it("through the interceptor: a taken name is a ValidationException flagged exists (-> 409 ALREADY_EXISTS)", async () => {
    business.isexistsorganisationname.mockResolvedValue(true);
    const error = (await throughInterceptor(CreateOrganisation, create())) as ValidationException;
    expect(error).toBeInstanceOf(ValidationException);
    expect(error.fields).toEqual([
      expect.objectContaining({ field: "organisationname", exists: true }),
    ]);
  });

  it("through the interceptor: a bad country is a ValidationException NOT flagged exists (-> 400)", async () => {
    business.findunusablecountries.mockResolvedValue([A]);
    const error = (await throughInterceptor(CreateOrganisation, create())) as ValidationException;
    expect(error.fields).toEqual([expect.objectContaining({ field: "countryids", exists: false })]);
  });
});

describe("UpdateOrganisation", () => {
  it("passes for the stored code and preset repeated back, and for a body that omits them", async () => {
    expect(await messages(UpdateOrganisation, update())).toEqual([]);
    expect(
      await messages(UpdateOrganisation, update({ organisationcode: "oldcode", organisationpreset: "company" })),
    ).toEqual([]);
  });

  it("refuses a different organisationcode with a clear message on that field", async () => {
    expect(await messages(UpdateOrganisation, update({ organisationcode: "newcode" }))).toEqual([
      { field: "organisationcode", message: "The organisation code can't be changed.", type: "any.invalid" },
    ]);
  });

  it("refuses a different organisationpreset with a clear message on that field", async () => {
    expect(await messages(UpdateOrganisation, update({ organisationpreset: "schoolnetwork" }))).toEqual([
      { field: "organisationpreset", message: "The organisation preset can't be changed.", type: "any.invalid" },
    ]);
  });

  it("refuses a change of case in the code too: only the stored value exactly is a no-op", async () => {
    expect((await messages(UpdateOrganisation, update({ organisationcode: "OLDCODE" }))).map((m) => m.field)).toEqual([
      "organisationcode",
    ]);
  });

  it("reports both when both are changed", async () => {
    const result = await messages(
      UpdateOrganisation,
      update({ organisationcode: "x1", organisationpreset: "schoolnetwork" }),
    );
    expect(result.map((m) => m.field)).toEqual(["organisationcode", "organisationpreset"]);
  });

  it("checks the name against OTHER organisations only (excluding this one), trimmed", async () => {
    business.isexistsorganisationname.mockResolvedValue(true);
    const result = await messages(UpdateOrganisation, update({ organisationname: " Taken " }));
    expect(result).toEqual([
      { field: "organisationname", message: "That organisation name is already in use.", type: "any.exists" },
    ]);
    expect(business.isexistsorganisationname).toHaveBeenCalledWith("Taken", "org-1");
  });

  it("validates the country ids like create does", async () => {
    expect(await messages(UpdateOrganisation, update({ countryids: [A, A] }))).toEqual([
      { field: "countryids", message: "Each country can only be listed once.", type: "any.invalid" },
    ]);
    business.findunusablecountries.mockResolvedValue([B]);
    expect((await messages(UpdateOrganisation, update({ countryids: [B] }))).map((m) => m.field)).toEqual(["countryids"]);
  });

  it("answers NOT_FOUND (thrown, so it reaches the client as 404) before any other rule, even if the name is taken", async () => {
    business.getorganisationbyid.mockRejectedValue(new ApiError(ErrorCode.NOT_FOUND, "That organisation doesn't exist."));
    business.isexistsorganisationname.mockResolvedValue(true);

    await expect(UpdateOrganisation({} as never, update())).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    expect(business.isexistsorganisationname).not.toHaveBeenCalled();

    const error = await throughInterceptor(UpdateOrganisation, update());
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).getStatus()).toBe(404);
  });

  it("through the interceptor: a changed code is a 400-class ValidationException naming the field, not 'exists'", async () => {
    const error = (await throughInterceptor(UpdateOrganisation, update({ organisationcode: "newcode" }))) as ValidationException;
    expect(error).toBeInstanceOf(ValidationException);
    expect(error.fields).toEqual([
      { field: "organisationcode", message: "The organisation code can't be changed.", exists: false },
    ]);
    expect(error.getStatus()).toBe(400);
  });
});
