import { ValidationErrorItem } from 'joi';
import { ValidationFieldError } from 'src/models/ValidationException';

/**
 * Turns one Joi ValidationErrorItem into the contract's plain-language field
 * error. Joi's own `details[].message` is already one short sentence and
 * (with the default templates this codebase uses) never echoes the
 * submitted value back - "any.only" lists the allowed values, not what was
 * sent - so this only needs to reword the handful of common failure types
 * into friendlier English, not scrub anything out.
 */
const REQUEST_PART_PREFIXES = new Set(['body', 'query', 'params']);

export function toPlainFieldError(detail: ValidationErrorItem): ValidationFieldError {
  // SchemaValidationInterceptor validates the whole {body, query, params}
  // envelope in one go, so Joi's path is prefixed with which part of the
  // request it came from (e.g. ["body", "email"]) - the client only knows
  // the field itself ("email"), so drop that prefix.
  let path = detail.path ?? [];
  if (path.length > 1 && REQUEST_PART_PREFIXES.has(String(path[0]))) {
    path = path.slice(1);
  }
  const field = (path.length > 0 ? path.join('.') : detail.context?.key) || 'input';
  return { field: String(field), message: plainMessage(detail, field) };
}

function plainMessage(detail: ValidationErrorItem, field: string): string {
  const label = String(field);
  switch (detail.type) {
    case 'any.required':
      return `Enter a value for ${label}.`;
    case 'string.empty':
      return `${capitalize(label)} can't be empty.`;
    case 'string.email':
      return `Enter a valid email address for ${label}.`;
    case 'string.min':
      return `${capitalize(label)} must be at least ${detail.context?.limit} characters.`;
    case 'string.max':
      return `${capitalize(label)} must be no more than ${detail.context?.limit} characters.`;
    case 'string.length':
      return `${capitalize(label)} must be exactly ${detail.context?.limit} characters.`;
    case 'string.alphanum':
      return `${capitalize(label)} can only contain letters and numbers.`;
    case 'string.pattern.base':
      return `${capitalize(label)} isn't in a valid format.`;
    case 'string.base':
    case 'string.uri':
    case 'string.guid':
      return `${capitalize(label)} isn't valid.`;
    case 'number.base':
      return `${capitalize(label)} must be a number.`;
    case 'number.min':
      return `${capitalize(label)} must be at least ${detail.context?.limit}.`;
    case 'number.max':
      return `${capitalize(label)} must be no more than ${detail.context?.limit}.`;
    case 'boolean.base':
      return `${capitalize(label)} must be true or false.`;
    case 'date.base':
      return `${capitalize(label)} must be a valid date.`;
    case 'array.min':
      return `Choose at least ${detail.context?.limit} for ${label}.`;
    case 'array.base':
      return `${capitalize(label)} must be a list.`;
    case 'any.only':
      return `${capitalize(label)} must be one of the allowed values.`;
    default:
      // Fall back to Joi's own message, stripped of the quoted key it
      // prefixes by default (e.g. `"email" is required` -> `is required`),
      // which reads oddly once we've already named the field ourselves.
      return capitalize(label) + ' ' + (detail.message || 'is not valid.').replace(/^"[^"]*"\s*/, '');
  }
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
