import { ValidationFieldError } from "src/models/ValidationException";

/**
 * The types a learning item can have, and what each one requires of its row. The set is code, not a column
 * constraint: adding a type is adding an entry here (and its rules), never an ALTER.
 *
 * Phase 0 knows one type, `video`: today's learning. It must point at a document, has no body and no extra
 * documents. A type nobody lists is refused by the request validator, never guessed.
 */
export interface LearningItemRule {
  /** `required`: the item's primary document must be given. `none`: the item has no primary document. */
  documentid: "required" | "none";
  /** `null`: the body must be null. `object`: a JSON object carrying its own integer version `v`. */
  body: "null" | "object";
  /** Whether the item may reference documents through link rows (`documents`). */
  documents: "none" | "allowed";
}

export const DEFAULT_LEARNING_ITEM_TYPE = "video";

export const LEARNING_ITEM_TYPES: Readonly<Record<string, LearningItemRule>> = {
  video: { documentid: "required", body: "null", documents: "none" },
};

export const learningItemTypeNames = (): string[] => Object.keys(LEARNING_ITEM_TYPES);

/** A body is at most 64 KiB serialised (bytes). */
export const MAX_LEARNING_ITEM_BODY_BYTES = 64 * 1024;

export interface LearningItemFields {
  type: string;
  documentid: string | null | undefined;
  body: unknown;
  documents: ReadonlyArray<unknown> | null | undefined;
}

const has = (value: unknown): boolean => value !== null && value !== undefined;

/**
 * What is wrong with an item's fields, as the field errors a request is refused with (empty when nothing is). Pure:
 * it knows nothing of owners; the routes make their ownership checks first and call this after them.
 */
export const learningItemErrors = (
  item: LearningItemFields,
  rules: Readonly<Record<string, LearningItemRule>> = LEARNING_ITEM_TYPES,
): ValidationFieldError[] => {
  const rule = Object.prototype.hasOwnProperty.call(rules, item.type) ? rules[item.type] : undefined;
  if (!rule) {
    return [{ field: "lessonlearningtype", message: "That learning item type isn't supported." }];
  }
  const errors: ValidationFieldError[] = [];
  if (rule.documentid === "required" && !has(item.documentid)) {
    errors.push({ field: "documentid", message: `A ${item.type} item needs a document.` });
  }
  if (rule.documentid === "none" && has(item.documentid)) {
    errors.push({ field: "documentid", message: `A ${item.type} item has no document of its own.` });
  }
  if (rule.body === "null" && has(item.body)) {
    errors.push({ field: "lessonlearningbody", message: `A ${item.type} item has no body.` });
  }
  if (rule.body === "object" && has(item.body)) {
    const body = item.body as Record<string, unknown>;
    if (typeof body !== "object" || Array.isArray(body) || !Number.isInteger(body.v) || (body.v as number) < 1) {
      errors.push({ field: "lessonlearningbody", message: `The body of a ${item.type} item must be an object with a version, v.` });
    } else if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_LEARNING_ITEM_BODY_BYTES) {
      errors.push({ field: "lessonlearningbody", message: "That body is too large (64 KiB at most)." });
    }
  }
  if (rule.documents === "none" && Array.isArray(item.documents) && item.documents.length > 0) {
    errors.push({ field: "documents", message: `A ${item.type} item takes no extra documents.` });
  }
  return errors;
};
