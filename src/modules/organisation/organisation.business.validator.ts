/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from "joi";
import { OrganisationBusiness } from "src/business/organisation.business";
import { IRequest } from "src/models/IRequest";

/**
 * Business rules for the organisation routes: the ones that need the database.
 * Request shape (lengths, formats, enums) is organisation.request.validator.ts.
 *
 * `any.exists` makes the response a 409 ALREADY_EXISTS; anything else is a 400
 * INVALID_INPUT with the field named (docs/api-errors.md).
 */
const fieldError = (
  field: string,
  message: string,
  type: "any.exists" | "any.invalid",
): ValidationError => {
  const error = new ValidationError("Validation", [], {});
  const item: ValidationErrorItem = { message, path: [field], type };
  error.details = [item];
  return error;
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/** Country ids: each only once, and each a live country. */
const countryErrors = async (
  business: OrganisationBusiness,
  countryids: string[],
): Promise<ValidationError[]> => {
  if (new Set(countryids).size !== countryids.length) {
    return [
      fieldError("countryids", "Each country can only be listed once.", "any.invalid"),
    ];
  }
  const unusable = await business.findunusablecountries(countryids);
  if (unusable.length > 0) {
    return [
      fieldError(
        "countryids",
        "One or more of those countries doesn't exist.",
        "any.invalid",
      ),
    ];
  }
  return [];
};

export const CreateOrganisation = async (
  request: IRequest,
  data: any,
): Promise<Array<ValidationError | null | undefined>> => {
  const business = new OrganisationBusiness();
  const errors: ValidationError[] = [];

  if (await business.isexistsorganisationname(String(data.organisationname).trim())) {
    errors.push(
      fieldError("organisationname", "That organisation name is already in use.", "any.exists"),
    );
  }
  // Codes are never reissued, so a deleted organisation's code counts too.
  if (await business.isexistsorganisationcode(String(data.organisationcode))) {
    errors.push(
      fieldError("organisationcode", "That organisation code is already in use.", "any.exists"),
    );
  }
  errors.push(...(await countryErrors(business, asStringArray(data.countryids))));
  return errors;
};

export const UpdateOrganisation = async (
  request: IRequest,
  data: any,
): Promise<Array<ValidationError | null | undefined>> => {
  const business = new OrganisationBusiness();
  const organisationid = String(data.organisationid);

  // Missing or deleted: a 404 before any other answer, so the response does not
  // depend on whether the submitted name happens to be taken. Thrown, not
  // returned: BusinessValidationInterceptor lets an exception through as-is.
  const current = await business.getorganisationbyid(organisationid);

  const errors: ValidationError[] = [];

  // The code and the preset cannot change in this package. A body that repeats
  // the stored value is a no-op and is accepted; any other value is refused.
  if (
    data.organisationcode !== undefined &&
    data.organisationcode !== current.organisationcode
  ) {
    errors.push(
      fieldError(
        "organisationcode",
        "The organisation code can't be changed.",
        "any.invalid",
      ),
    );
  }
  if (
    data.organisationpreset !== undefined &&
    data.organisationpreset !== current.organisationpreset
  ) {
    errors.push(
      fieldError(
        "organisationpreset",
        "The organisation preset can't be changed.",
        "any.invalid",
      ),
    );
  }

  if (
    await business.isexistsorganisationname(
      String(data.organisationname).trim(),
      organisationid,
    )
  ) {
    errors.push(
      fieldError("organisationname", "That organisation name is already in use.", "any.exists"),
    );
  }
  errors.push(...(await countryErrors(business, asStringArray(data.countryids))));
  return errors;
};
