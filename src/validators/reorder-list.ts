import joi from "joi";
import { RequestValidator } from "../models/RequestValidator";

/** The most children one reorder call may name (the same cap as a lesson's learning items). */
export const MAX_REORDER_IDS = 500;

/**
 * The request shape of "set the order of all the children of one parent in one call": the parent's id in the path and,
 * in the body, the list of the children's ids under one named field. The list may hold no repeated id and no
 * more than `MAX_REORDER_IDS`; that it is exactly the parent's children is a business rule (reorder-children.ts).
 */
export const reorderList = (parentParam: string, parentLabel: string, field: string, fieldLabel: string): RequestValidator => ({
  params: joi.object().keys({
    [parentParam]: joi.string().required().uuid().label(parentLabel),
  }),
  body: joi.object().keys({
    [field]: joi.array().items(joi.string().uuid()).unique().max(MAX_REORDER_IDS).required().label(fieldLabel),
  }),
});
