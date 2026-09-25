import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import joi from 'joi';
import { pick } from 'lodash';
import { Observable } from 'rxjs';
import { RequestValidator } from 'src/models';
import { ValidationException } from '../models/ValidationException';
import { toPlainFieldError } from '../services/joi-message.service';

@Injectable()
export class SchemaValidationInterceptor implements NestInterceptor {
  constructor(private schema: RequestValidator) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request: any = ctx.getRequest();
    const validSchema = pick(this.schema, ['params', 'query', 'body']);
    const object = pick(request, Object.keys(validSchema));
    // abortEarly: false so a single request reports every invalid field at
    // once (docs/api-errors.md's `fields` array), not just the first Joi
    // happens to find - cheap here since SchemaValidationInterceptor already
    // ran the whole schema either way to produce that first error.
    const { error } = joi.compile(this.schema)
      .prefs({ errors: { label: 'key' }, abortEarly: false })
      .validate(object);

    if (error) {
      throw new ValidationException(error.details.map(toPlainFieldError));
    }
    return next.handle();
  }
}
