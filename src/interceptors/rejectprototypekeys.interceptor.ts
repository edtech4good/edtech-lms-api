import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { UNKNOWN_FIELD_MESSAGE } from '../services/joi-message.service';
import { ValidationException } from '../models/ValidationException';

/** Keys that mean something special on a JavaScript object. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Deeper than any real request body here; a body this deep is refused rather than walked. */
const MAX_DEPTH = 32;

/**
 * True if `value`, or anything nested in it, has an OWN key named `__proto__`,
 * `constructor` or `prototype`.
 *
 * Why this exists: `JSON.parse('{"__proto__": {...}}')` creates an own property
 * called "__proto__" (an object LITERAL would set the prototype instead). Joi
 * does not see it: it validates a copy it builds without that key, so a closed
 * schema reports nothing wrong, while the raw request body still carries it. A
 * handler that then spreads or copies the raw object stores whatever was
 * hidden under it. Refusing the key up front means no schema, handler or
 * business method downstream ever has to reason about it. Iterative, so a
 * deeply nested body cannot overflow the stack.
 */
export const hasForbiddenKey = (value: unknown): boolean => {
  const stack: Array<{ node: unknown; depth: number }> = [{ node: value, depth: 0 }];
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (typeof node !== 'object' || node === null) {
      continue;
    }
    if (depth > MAX_DEPTH) {
      return true;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        stack.push({ node: item, depth: depth + 1 });
      }
      continue;
    }
    for (const key of Object.keys(node)) {
      if (FORBIDDEN_KEYS.has(key)) {
        return true;
      }
      stack.push({ node: (node as Record<string, unknown>)[key], depth: depth + 1 });
    }
  }
  return false;
};

/**
 * Put BEFORE SchemaValidationInterceptor on any route that takes a JSON body
 * and stores part of it. The response is the generic "field isn't allowed" 400
 * and never echoes the key.
 */
@Injectable()
export class RejectPrototypeKeysInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    if (hasForbiddenKey(request?.body)) {
      throw new ValidationException([{ field: 'body', message: UNKNOWN_FIELD_MESSAGE }]);
    }
    return next.handle();
  }
}
