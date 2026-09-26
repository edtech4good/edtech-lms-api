/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationError, ValidationErrorItem } from "joi";
import { CountryBusiness } from "src/business/country.business";
import { StandardBusiness } from "src/business/standard.business";
import { IRequest } from "src/models/IRequest";

export const CreateStandard = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new StandardBusiness().isexistsstandardName({
    standardname: data.standardname,
    standardid: "",
    schoolid: "",
    schoolname: '',
    isdeleted: false,
  });
  if (tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['standardname'],
      type: 'any.exists',
    };
    erroritem.message = "That standard already exists.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const EditCountry = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new CountryBusiness().isexistscountryID(
    data.countryid
  );
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['countryid'],
      type: 'any.invalid',
    };
    erroritem.message = "That country doesn't exist.";
    error.details.push(erroritem);
    return [error];
  } else {
    const tagexistsnew = await new CountryBusiness().isexistscountryName({
      countryname: data.countryname,
      countryid: data.countryid,
      isdeleted: false,
    });
    if (tagexistsnew) {
      const error = new ValidationError("Validation", {}, {});
      error.details = [];
      const erroritem: ValidationErrorItem = {
        message: "",
        path: ['countryname'],
        type: 'any.exists',
      };
      erroritem.message = "That country already exists.";
      error.details.push(erroritem);
      return [error];
    }
  }
  return [];
};
export const DeleteCountry = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new CountryBusiness().isexistscountryID(
    data.countryid
  );
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['countryid'],
      type: 'any.invalid',
    };
    erroritem.message = "That country doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  if (await new CountryBusiness().countryIsBinded(data.countryid)) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ["countryid"],
      type: "any.invalid",
    };
    erroritem.message =
      "That country is in use and can't be deleted.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};

export const ShowCountry = async (
  request: IRequest,
  data: any
): Promise<Array<ValidationError | null | undefined>> => {
  const tagexists = await new CountryBusiness().isexistscountryID(
    data.countryid
  );
  if (!tagexists) {
    const error = new ValidationError("Validation", {}, {});
    error.details = [];
    const erroritem: ValidationErrorItem = {
      message: "",
      path: ['countryid'],
      type: 'any.invalid',
    };
    erroritem.message = "That country doesn't exist.";
    error.details.push(erroritem);
    return [error];
  }
  return [];
};
