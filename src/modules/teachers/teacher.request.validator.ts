import joi, { SchemaMap } from "joi";
import { IPaging } from "src/models/IPaging";
import { RequestValidator } from "../../models/RequestValidator";
import { TeacherImportBody } from "./models/teachersimport";

export const importTeachers: RequestValidator = {
  body: joi.object().keys(<SchemaMap<TeacherImportBody>>{
    schoolname: joi.string().required().label("School Name"),
    teachers: joi
      .array()
      .items(
        joi.object().keys(<SchemaMap<TeacherImportBody>>{
          schoolusername: joi.string().min(2).max(16).alphanum().required().label("User name"),
          schooluserpasswordhash: joi
            .string()
            .min(1)
            .max(16)
            .alphanum()
            .required().label("Password"),
        })
      )
      .required()
      .min(1)
      .max(500),
  }),
};

export const showallteachers: RequestValidator = {
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi
      .array()
      .items({
        key: joi
          .string()
          .valid(
            "schoolname",
            "schoolusername",
          )
          .required(),
        value: joi.string().required(),
      })
      .max(6)
      .message("Invalid filter"),
  }),
};

export const deleteTeacher: RequestValidator = {
  params: joi.object().keys({
    schooluserid: joi.string().required().uuid().label("Teacher User ID"),
  }),
};
