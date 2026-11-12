import joi from "joi";
import { RequestValidator } from "../../models/RequestValidator";

/**
 * Request shapes for the certificate routes. Ids are checked against the rows by the business code (a wrong one is a not
 * found, or a 400 naming the field), so here they are only text of a sensible size. What the curriculum allows
 * (`scope` set to certificate, `scopeid` inside the curriculum) is checked there too.
 */
const id = (label: string) => joi.string().trim().min(1).max(36).required().label(label);
const scope = joi.string().valid("level", "grade", "curriculum").required().label("Scope");

export const MAX_STUDENTIDS = 200;
export const MAX_REASON_LENGTH = 500;

export const certificatecandidates: RequestValidator = {
  body: joi.object().keys({
    curriculumid: id("Curriculum"),
    scope,
    scopeid: id("Scope ID"),
    standardid: joi.string().trim().min(1).max(36).label("Class"),
  }),
};

export const issuecertificates: RequestValidator = {
  body: joi.object().keys({
    curriculumid: id("Curriculum"),
    scope,
    scopeid: id("Scope ID"),
    studentids: joi.array().items(joi.string().trim().min(1).max(36)).min(1).max(MAX_STUDENTIDS).required().label("Learners"),
  }),
};

export const revokecertificate: RequestValidator = {
  params: joi.object().keys({ certificateid: id("Certificate ID") }),
  body: joi.object().keys({ reason: joi.string().trim().min(1).max(MAX_REASON_LENGTH).required().label("Reason") }),
};

export const showcertificate: RequestValidator = {
  params: joi.object().keys({ certificateid: id("Certificate ID") }),
};

export const showstudentcertificates: RequestValidator = {
  params: joi.object().keys({ studentid: id("Learner") }),
};
