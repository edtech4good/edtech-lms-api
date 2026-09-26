import { ExecutionContext } from '@nestjs/common';
import { ValidationError, ValidationErrorItem } from 'joi';
import { of } from 'rxjs';
import { BusinessValidationInterceptor } from './businessvalidation.interceptor';
import { ValidationException } from '../models/ValidationException';

const makeValidationError = (path: string[], message: string, type = ''): ValidationError => {
  const error = new ValidationError('Validation', {}, {});
  const item: ValidationErrorItem = { message, path, type };
  error.details = [item];
  return error;
};

const makeContext = (body: any = { curriculumname: 'Math' }): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ body, params: {}, query: {} }),
    }),
  } as unknown as ExecutionContext);

const nextHandler = { handle: () => of('ok') };

describe('BusinessValidationInterceptor', () => {
  /**
   * Proves the "already exists" business rule (curriculum.business.validator.ts
   * etc - `type: 'any.exists'`) survives through to ValidationException so
   * GlobalExceptionFilter can route it to ALREADY_EXISTS 409, not INVALID_INPUT.
   */
  it('carries the `exists` flag through from a rule whose ValidationErrorItem sets type "any.exists"', async () => {
    const rule = async () => [makeValidationError(['curriculumname'], 'That curriculum already exists.', 'any.exists')];
    const interceptor = new BusinessValidationInterceptor([rule]);

    let caught: ValidationException | undefined;
    try {
      await (await interceptor.intercept(makeContext(), nextHandler)).toPromise();
    } catch (e) {
      caught = e as ValidationException;
    }

    expect(caught).toBeInstanceOf(ValidationException);
    expect(caught!.fields).toEqual([{ field: 'curriculumname', message: 'That curriculum already exists.', exists: true }]);
  });

  it('does NOT set `exists` for an ordinary invalid-id rule', async () => {
    const rule = async () => [makeValidationError(['curriculumid'], "That curriculum doesn't exist.", 'any.invalid')];
    const interceptor = new BusinessValidationInterceptor([rule]);

    let caught: ValidationException | undefined;
    try {
      await (await interceptor.intercept(makeContext(), nextHandler)).toPromise();
    } catch (e) {
      caught = e as ValidationException;
    }

    expect(caught!.fields[0].exists).toBeFalsy();
  });

  it('passes the request through to the handler when every rule passes', async () => {
    const rule = async () => [];
    const interceptor = new BusinessValidationInterceptor([rule]);
    const result = await (await interceptor.intercept(makeContext(), nextHandler)).toPromise();
    expect(result).toBe('ok');
  });

  it('de-duplicates identical field+message pairs reported by more than one rule', async () => {
    const ruleA = async () => [makeValidationError(['schoolid'], "That school doesn't exist.")];
    const ruleB = async () => [makeValidationError(['schoolid'], "That school doesn't exist.")];
    const interceptor = new BusinessValidationInterceptor([ruleA, ruleB]);

    let caught: ValidationException | undefined;
    try {
      await (await interceptor.intercept(makeContext(), nextHandler)).toPromise();
    } catch (e) {
      caught = e as ValidationException;
    }
    expect(caught!.fields).toHaveLength(1);
  });
});
