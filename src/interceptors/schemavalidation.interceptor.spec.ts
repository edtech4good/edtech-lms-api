import { ExecutionContext } from '@nestjs/common';
import joi from 'joi';
import { SchemaValidationInterceptor } from './schemavalidation.interceptor';
import { ValidationException } from '../models/ValidationException';

const makeContext = (body: any): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ body, params: {}, query: {} }),
    }),
  } as unknown as ExecutionContext);

const nextHandler = { handle: () => 'ok' as any };

describe('SchemaValidationInterceptor', () => {
  const schema = {
    body: joi.object({
      email: joi.string().email().required(),
      studentfirstname: joi.string().required(),
    }),
  };

  /**
   * abortEarly: false (docs/api-errors.md: "fields from the Joi details") -
   * a request invalid in two fields must report BOTH, not just the first
   * Joi happens to reach.
   */
  it('reports every invalid field in one response, not just the first', () => {
    const interceptor = new SchemaValidationInterceptor(schema as any);
    let caught: ValidationException | undefined;
    try {
      interceptor.intercept(makeContext({ email: 'not-an-email' }), nextHandler);
    } catch (e) {
      caught = e as ValidationException;
    }
    expect(caught).toBeInstanceOf(ValidationException);
    const fieldNames = caught!.fields.map((f) => f.field).sort();
    expect(fieldNames).toEqual(['email', 'studentfirstname']);
  });

  it('never echoes the submitted value back in the field message', () => {
    const interceptor = new SchemaValidationInterceptor(schema as any);
    let caught: ValidationException | undefined;
    try {
      interceptor.intercept(makeContext({ email: 'topsecret@leak.example', studentfirstname: 'Dara' }), nextHandler);
    } catch (e) {
      caught = e as ValidationException;
    }
    expect(caught).toBeInstanceOf(ValidationException);
    const messages = JSON.stringify(caught!.fields);
    expect(messages).not.toContain('topsecret@leak.example');
  });

  it('passes through to the handler when the body is valid', () => {
    const interceptor = new SchemaValidationInterceptor(schema as any);
    const result = interceptor.intercept(makeContext({ email: 'a@b.com', studentfirstname: 'សុខា' }), nextHandler);
    expect(result).toBe('ok');
  });
});
