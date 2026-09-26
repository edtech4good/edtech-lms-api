import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ValidationError } from 'joi';
import { pick } from 'lodash';
import { forkJoin, from, Observable } from 'rxjs';
import { IBusinessRule } from '../models/Ibusinessrule';
import { RequestValidator } from '../models/RequestValidator';
import { ValidationException, ValidationFieldError } from '../models/ValidationException';
import { IRequest } from 'src/models/IRequest';

@Injectable()
export class BusinessValidationInterceptor implements NestInterceptor {
  constructor(private rules: Array<IBusinessRule>) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const ctx = context.switchToHttp();
    const request: IRequest = ctx.getRequest();
    const value: RequestValidator = pick(request as any, ['params', 'query', 'body']);

    let businessobject: any = {};

    if (value.params) {
      businessobject = {
        ...businessobject,
        ...value.params,
      };
    }
    if (value.query) {
      businessobject = {
        ...businessobject,
        ...value.query,
      };
    }
    if (value.body) {
      businessobject = {
        ...businessobject,
        ...value.body,
      };
    }
    if (Object.keys(businessobject).length > 0) {
      const validationresultarray = await forkJoin(this.rules.map(x => from(x(request, businessobject)))).toPromise();
      const validationresult = (validationresultarray ?? []).flat();
      const validationExceptions: Array<Error | null | undefined> = validationresult.filter(
        x => x instanceof Error && !(x instanceof ValidationError) && (x !== null || x !== undefined)
      );
      const validationErrors: Array<ValidationError | null | undefined> = validationresult.filter(
        x => x instanceof ValidationError && (x !== null || x !== undefined)
      );
      if (validationExceptions && validationExceptions.length > 0) {
        const throwerror = validationExceptions.find(x => x !== null || x !== undefined);
        if (throwerror) {
          throw throwerror;
        }
      }
      if (validationErrors && validationErrors.length > 0) {
        // Each business rule's ValidationErrorItem carries a proper `path`
        // (the field it's about) and, for "this already exists" rules, sets
        // `type: 'any.exists'` so GlobalExceptionFilter can map the whole
        // response to ALREADY_EXISTS (409) instead of INVALID_INPUT (400).
        const seen = new Set<string>();
        const fields: ValidationFieldError[] = [];
        for (const err of validationErrors) {
          if (!err) continue;
          for (const detail of err.details) {
            const field = (detail.path && detail.path.length > 0 ? String(detail.path[0]) : 'input') || 'input';
            const key = `${field}:${detail.message}`;
            if (!detail.message || seen.has(key)) continue;
            seen.add(key);
            fields.push({ field, message: detail.message, exists: detail.type === 'any.exists' });
          }
        }
        if (fields.length > 0) {
          throw new ValidationException(fields);
        }
      }
    }
    return next.handle();
  }
}
