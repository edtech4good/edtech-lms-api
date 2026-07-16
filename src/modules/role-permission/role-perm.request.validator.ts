import joi, { SchemaMap } from "joi";
import { emptyString } from "src/validators/custom.validator";
import { RequestValidator } from "../../models/RequestValidator";
import { IMultiPaging } from '../../models/IPaging';

export const getschoolstudents: RequestValidator = {
  params: joi.object().keys({
    schoolname: joi.string().required().label("School Name"),
  }),
};

export const createsRole: RequestValidator = {
  body: joi.object().keys({
    rolename: joi
      .string()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("Role Name"))
      .label("Role Name"),
    permissionsid: joi
      .array()
      .items(joi.string())
      .required(),
  }),
};

export const bindRolesPerms: RequestValidator = {
  body: joi.object().keys({
    roleid: joi
      .string()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("Permission Name"))
      .label("Permission Name"),
    permissionsid: joi
      .array()
      .required(),
  }),
};

export const bindUserRoles: RequestValidator = {
  body: joi.object().keys({
    lmsuserid: joi
      .string()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("Permission Name"))
      .label("Permission Name"),
    rolesid: joi
      .array()
      .required(),
  }),
};

export const updaterole: RequestValidator = {
  body: joi.object().keys({
    rolename: joi
      .string()
      .required()
      .max(300)
      .min(1)
      .custom(emptyString("Role Name"))
      .label("Role Name"),
    permissionsid: joi
      .array()
      .items(joi.string())
      .required(),
  }),
  params: joi.object().keys({
    roleid: joi.string().required().uuid().label("Role ID"),
  }),
};

export const showallroles: RequestValidator = {
  body: joi.object().keys(<SchemaMap<IMultiPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi
      .array()
      .items({
        key: joi.string().valid("rolename").required(),
        value: joi.alternatives().try(joi.string().allow(''), joi.array().min(0)).required(),
      })
      .max(5)
      .message("Invalid filter"),
  }),
};

export const deleterole: RequestValidator = {
  params: joi.object().keys({
    roleid: joi.string().required().uuid().label("Role ID"),
  }),
};
