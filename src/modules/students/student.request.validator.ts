import joi, { SchemaMap } from "joi";
import { IPaging } from "src/models/IPaging";
import { RequestValidator } from "../../models/RequestValidator";
import { dateString } from "./../../validators/custom.validator";
import {
  StudentEditedImportBody,
  StudentImportBody,
} from "./models/studentimport";

/**
 * Washington Group Short Set domains. Optional on every path: an unanswered
 * question must never block an enrolment, so blank is always valid and means
 * "not collected".
 */
const wgDomain = () =>
  joi.string().valid("1", "2", "3", "4").optional().allow("", null).default("");

const washingtonGroupKeys = {
  wg_seeing: wgDomain(),
  wg_hearing: wgDomain(),
  wg_walking: wgDomain(),
  wg_remembering: wgDomain(),
  wg_selfcare: wgDomain(),
  wg_communicating: wgDomain(),
};

export const showallstudents: RequestValidator = {
  body: joi.object().keys(<SchemaMap<IPaging>>{
    pageindex: joi.number().min(0).message("Invalid page index"),
    pagesize: joi.number().max(200).min(0).message("Invalid page size"),
    filter: joi
      .array()
      .items({
        key: joi
          .string()
          .valid(
            "studentfirstname",
            "schoolname",
            "mothername",
            "fathername",
            "city",
            "country",
            "state",
            "standard",
            "schooluser.schoolusername",
            "schooltype",
            "curriculum.curriculumname"
          )
          .required(),
        value: joi.string().required(),
      })
      .max(6)
      .message("Invalid filter"),
  }),
};

export const importStudents: RequestValidator = {
  body: joi.object().keys(<SchemaMap<StudentImportBody>>{
    curriculumid: joi.array().items(joi.string()).required().label("Curriculum Id"),
    schoolid: joi.string().required().label("School Name"),
    standard: joi.string().allow("", null).label("Standard"),
    students: joi
      .array()
      .items(
        joi.object().keys({
          city: joi.string().min(2).max(100).required(),
          contact: joi
            .string()
            .optional()
            .min(1)
            .max(100)
            .allow("", null)
            .default(""),
          country: joi.string().min(2).max(100).required(),
          dateofbirth: joi
            .string()
            .optional()
            .custom(dateString(true, "body,students,"))
            .min(10)
            .max(10)
            .allow("", null),
          dateofjoin: joi
            .string()
            .min(10)
            .custom(dateString(false, "body,students,"))
            .max(10)
            .required(),
          studentfirstname: joi.string().min(2).alphanum().max(100).required(),
          studentlastname: joi
            .string()
            .optional()
            .min(1)
            .max(100)
            .allow("", null)
            .default(""),
          familyname: joi
            .string()
            .optional()
            .min(1)
            .max(100)
            .allow("", null)
            .default(""),
          mothername: joi
            .string()
            .optional()
            .min(1)
            .max(100)
            .allow("", null)
            .default(""),
          fathername: joi
            .string()
            .optional()
            .min(1)
            .max(100)
            .allow("", null)
            .default(""),
          genderid: joi.string().valid("1", "2").required(),
          ...washingtonGroupKeys,
          state: joi.string().max(100).required(),
          schoolusername: joi
            .string()
            .min(2)
            .max(16)
            .alphanum()
            .required()
            .label("User name"),
          schooltype: joi.string().max(100),
          type: joi.string().valid("offline", "online").optional(),
          is_teacher_acc: joi.string().valid("1", "0").allow("").optional(),
          schooluserpasswordhash: joi
            .string()
            .min(1)
            .max(16)
            .alphanum()
            .required()
            .label("Password"),
        })
      )
      .required()
      .min(1)
      .max(500),
  }),
};

export const deleteStudents: RequestValidator = {
  params: joi.object().keys(<SchemaMap<StudentImportBody>>{
    schooluserid: joi.string().required().uuid().label("School User ID"),
  }),
};

export const studentstats: RequestValidator = {
  params: joi.object().keys({
    studentid: joi.string().required().uuid().label("Student ID"),
  }),
};

export const importUpdatedStudents: RequestValidator = {
  body: joi.object().keys(<SchemaMap<StudentEditedImportBody>>{
    students: joi
      .array()
      .items(
        joi.object().keys({
          studentid: joi.string().required().uuid().label("Student ID"),
          schooluserid: joi.string().required().uuid().label("School User ID"),
          studentfirstname: joi.string().min(2).max(100).required(),
          studentlastname: joi
            .string()
            .optional()
            .min(1)
            .max(100)
            .allow("", null)
            .default(""),
          familyname: joi
            .string()
            .optional()
            .min(1)
            .max(100)
            .allow("", null)
            .default(""),
          mothername: joi
            .string()
            .optional()
            .min(1)
            .max(100)
            .allow("", null)
            .default(""),
          fathername: joi
            .string()
            .optional()
            .min(1)
            .max(100)
            .allow("", null)
            .default(""),
          genderid: joi.string().valid("1", "2").required(),
          ...washingtonGroupKeys,
          contact: joi
            .string()
            .optional()
            .min(1)
            .max(100)
            .allow("", null)
            .default(""),
          city: joi.string().min(2).max(100).required(),
          country: joi.string().min(2).max(100).required(),
          state: joi.string().max(100).required(),
          schoolusername: joi.string().min(2).max(16).required(),
          schoolname: joi.string().min(2).max(255),
          schooltype: joi.string().min(2).max(255).allow("", null),
          standard: joi.string().min(2).max(255).allow("", null),
          schooluserpasswordhash: joi.string().min(1).max(16).alphanum().allow('', null),
          dateofbirth: joi
            .string()
            .optional()
            .custom(dateString(true))
            .min(10)
            .max(10)
            .allow("", null),
          dateofjoin: joi
            .string()
            .min(8)
            .custom(dateString(false))
            .max(10)
            .required(),
          type: joi.string().valid("offline", "online").allow("", null),
          isactive: joi.number().valid(1, 0).required(),
          is_teacher_acc: joi.string().valid("1", "0").allow("").optional(),
          curriculums: joi.string().required().label("Curriculums ID"),
        })
      )
      .required()
      .min(1)
      .max(500),
  }),
};
