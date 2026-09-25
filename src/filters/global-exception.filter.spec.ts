import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  ConnectionRefusedError,
  ForeignKeyConstraintError,
  UniqueConstraintError,
} from 'sequelize';
import { GlobalExceptionFilter } from './global-exception.filter';
import { Config, Logger } from '../config';
import { ApiError } from '../models/ApiError';
import { ErrorCode } from '../models/enums/errorcode.enum';
import { ValidationException } from '../models/ValidationException';

describe('GlobalExceptionFilter', () => {
  it('should be defined', () => {
    expect(new GlobalExceptionFilter()).toBeDefined();
  });

  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let originalDebug: boolean;

  const makeHost = (request: any = {}): ArgumentsHost => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    return {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock }),
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
  };

  const catchAndGetBody = (exception: unknown, request: any = {}) => {
    new GlobalExceptionFilter().catch(exception, makeHost(request));
    return jsonMock.mock.calls[0][0];
  };

  beforeEach(() => {
    originalDebug = Config.fortyk.api.debug;
    Config.fortyk.api.debug = false;
  });

  afterEach(() => {
    Config.fortyk.api.debug = originalDebug;
  });

  /**
   * Guards edtech-lms-api#56: outside debug mode, a raw (non-HttpException)
   * error must reach the client only as the generic INTERNAL message — never
   * its real message or stack, which can carry internal details (SQL, file
   * paths, third-party error text).
   */
  describe('message masking outside debug mode', () => {
    it('masks a raw internal error message behind the generic INTERNAL message', () => {
      const internal = new Error('ECONNREFUSED 127.0.0.1:3306 password=hunter2');

      const body = catchAndGetBody(internal);

      expect(body.code).toBe(ErrorCode.INTERNAL);
      expect(body.errormessage).toBe('Something went wrong on our side.');
      expect(body.errormessage).not.toContain('3306');
      expect(body.errormessage).not.toContain('hunter2');
      expect(JSON.stringify(body)).not.toContain('hunter2');
      expect(body.stack).toBeUndefined();
    });

    it('does NOT mask a deliberate HttpException - it maps to its contract code/message instead of "Something went wrong"', () => {
      const forbidden = new ForbiddenException();

      const body = catchAndGetBody(forbidden);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(body.code).toBe(ErrorCode.NOT_ALLOWED);
      expect(body.errormessage).toBe("You don't have permission to do that.");
    });
  });

  describe('reference and stack', () => {
    it('always includes a reference, even outside debug mode', () => {
      const body = catchAndGetBody(new Error('boom'));
      expect(body.reference).toMatch(/^E-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
    });

    it('gives a fresh reference per call, and never predictable characters (crypto, not Math.random)', () => {
      const refs = new Set<string>();
      for (let i = 0; i < 20; i++) {
        refs.add(catchAndGetBody(new Error('boom')).reference);
      }
      expect(refs.size).toBe(20);
    });

    it('includes stack only when debug mode is on', () => {
      Config.fortyk.api.debug = true;
      const body = catchAndGetBody(new Error('boom'));
      expect(body.stack).toBeDefined();
      expect(body.logid).toBeDefined();
    });

    it('omits stack and logid when debug mode is off', () => {
      const body = catchAndGetBody(new Error('boom'));
      expect(body.stack).toBeUndefined();
      expect(body.logid).toBeUndefined();
    });
  });

  describe('mapping table (docs/api-errors.md)', () => {
    it('ApiError is trusted as-is: code, status, message, hint, fields', () => {
      const err = new ApiError(ErrorCode.NOT_FOUND, 'That lesson doesn\'t exist.');
      const body = catchAndGetBody(err);
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(body.code).toBe(ErrorCode.NOT_FOUND);
      expect(body.errormessage).toBe("That lesson doesn't exist.");
      expect(body.hint).toBe('It may have been removed or moved.');
    });

    it('ValidationException with no "exists" field maps to INVALID_INPUT 400 with fields', () => {
      const err = new ValidationException([{ field: 'email', message: 'Enter a valid email address.' }]);
      const body = catchAndGetBody(err);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(body.code).toBe(ErrorCode.INVALID_INPUT);
      expect(body.fields).toEqual([{ field: 'email', message: 'Enter a valid email address.' }]);
    });

    it('ValidationException with an "exists" field maps to ALREADY_EXISTS 409 and drops fields', () => {
      const err = new ValidationException([
        { field: 'curriculumname', message: 'That curriculum already exists.', exists: true },
      ]);
      const body = catchAndGetBody(err);
      expect(statusMock).toHaveBeenCalledWith(409);
      expect(body.code).toBe(ErrorCode.ALREADY_EXISTS);
      expect(body.errormessage).toBe('That curriculum already exists.');
      expect(body.fields).toBeUndefined();
    });

    it('UnauthorizedException maps to SIGN_IN_REQUIRED 401', () => {
      const body = catchAndGetBody(new UnauthorizedException());
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(body.code).toBe(ErrorCode.SIGN_IN_REQUIRED);
      expect(body.errormessage).toBe('Please sign in to continue.');
    });

    it('ForbiddenException (also what CheckPermissionsGuard returning false becomes) maps to NOT_ALLOWED 403', () => {
      const body = catchAndGetBody(new ForbiddenException());
      expect(statusMock).toHaveBeenCalledWith(403);
      expect(body.code).toBe(ErrorCode.NOT_ALLOWED);
    });

    it('NotFoundException (also Nest\'s unmatched-route 404) maps to NOT_FOUND with no path in the message', () => {
      const body = catchAndGetBody(new NotFoundException('Cannot GET /schools/secret-id-123/export'));
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(body.code).toBe(ErrorCode.NOT_FOUND);
      expect(body.errormessage).not.toContain('/schools');
      expect(body.errormessage).not.toContain('secret-id-123');
    });

    it('ThrottlerException maps to TOO_MANY_ATTEMPTS 429', () => {
      const body = catchAndGetBody(new ThrottlerException());
      expect(statusMock).toHaveBeenCalledWith(429);
      expect(body.code).toBe(ErrorCode.TOO_MANY_ATTEMPTS);
    });

    it('Sequelize UniqueConstraintError maps to ALREADY_EXISTS 409', () => {
      const body = catchAndGetBody(new UniqueConstraintError({}));
      expect(statusMock).toHaveBeenCalledWith(409);
      expect(body.code).toBe(ErrorCode.ALREADY_EXISTS);
    });

    it('Sequelize ForeignKeyConstraintError maps to INVALID_INPUT 400', () => {
      const body = catchAndGetBody(new ForeignKeyConstraintError({}));
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(body.code).toBe(ErrorCode.INVALID_INPUT);
    });

    it('Sequelize ConnectionRefusedError maps to SERVICE_UNAVAILABLE 503, never the raw DB message', () => {
      const dbError = new ConnectionRefusedError(new Error('connect ECONNREFUSED 10.0.0.5:3306'));
      const body = catchAndGetBody(dbError);
      expect(statusMock).toHaveBeenCalledWith(503);
      expect(body.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
      expect(JSON.stringify(body)).not.toContain('3306');
      expect(JSON.stringify(body)).not.toContain('10.0.0.5');
    });

    it('an axios error with no response (upstream unreachable) maps to SERVICE_UNAVAILABLE 503, never the upstream URL', () => {
      const axiosLikeError: any = new Error('connect ECONNREFUSED');
      axiosLikeError.isAxiosError = true;
      axiosLikeError.config = { url: 'http://rpi-internal.local:4000/import/teachers' };
      const body = catchAndGetBody(axiosLikeError);
      expect(statusMock).toHaveBeenCalledWith(503);
      expect(body.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
      expect(JSON.stringify(body)).not.toContain('rpi-internal');
    });

    it('an axios error WITH a response (upstream ran and replied 4xx/5xx) maps to INTERNAL 500 for now (pass-through is a later step)', () => {
      const axiosLikeError: any = new Error('Request failed with status code 400');
      axiosLikeError.isAxiosError = true;
      axiosLikeError.response = { status: 400, data: { error: true } };
      const body = catchAndGetBody(axiosLikeError);
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(body.code).toBe(ErrorCode.INTERNAL);
    });

    it('a plain BadRequestException with a string message is trusted as INVALID_INPUT (developer-written, user-facing text)', () => {
      const body = catchAndGetBody(new BadRequestException('That school doesn\'t exist.'));
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(body.code).toBe(ErrorCode.INVALID_INPUT);
      expect(body.errormessage).toBe("That school doesn't exist.");
    });

    it('a BadRequestException with an OBJECT payload never leaks it as errormessage (old-style throw site)', () => {
      const body = catchAndGetBody(new BadRequestException({ error: true, errormessage: 'raw internal detail' } as any));
      expect(body.errormessage).not.toBe('[object Object]');
      expect(body.errormessage).toBe("Some of the information isn't valid.");
    });

    it('anything unrecognised (e.g. a plain thrown object) falls back to INTERNAL 500 and never echoes it', () => {
      const body = catchAndGetBody({ some: 'object', not: 'an Error' });
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(body.code).toBe(ErrorCode.INTERNAL);
      expect(JSON.stringify(body)).not.toContain('not an Error');
    });
  });

  describe('logging', () => {
    it('logs a 4xx at warn', () => {
      const spy = jest.spyOn(Logger, 'warn').mockImplementation(() => Logger as any);
      const errorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => Logger as any);
      catchAndGetBody(new ForbiddenException());
      expect(spy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
      spy.mockRestore();
      errorSpy.mockRestore();
    });

    it('logs a 5xx at error', () => {
      const warnSpy = jest.spyOn(Logger, 'warn').mockImplementation(() => Logger as any);
      const errorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => Logger as any);
      catchAndGetBody(new Error('boom'));
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('logs the reference, code, status, method and route template - never the request body, headers or Authorization token', () => {
      const errorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => Logger as any);
      catchAndGetBody(new Error('boom'), {
        method: 'POST',
        route: { path: '/auth/login' },
        originalUrl: '/auth/login',
        headers: { authorization: 'Bearer super-secret-token' },
        body: { lmsusername: 'a@b.com', lmsuserpassword: 'hunter2' },
        user: { lmsuserid: 'user-123' },
      });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const meta: any = (errorSpy.mock.calls[0] as any[])[1];
      expect(meta).toMatchObject({ method: 'POST', route: '/auth/login', userid: 'user-123' });
      const serialized = JSON.stringify(meta);
      expect(serialized).not.toContain('super-secret-token');
      expect(serialized).not.toContain('hunter2');
      expect(serialized).not.toContain('a@b.com');
      errorSpy.mockRestore();
    });
  });
});
