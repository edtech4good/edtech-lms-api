import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { MulterError } from 'multer';
import {
  ConnectionError,
  ConnectionRefusedError,
  ConnectionTimedOutError,
  DatabaseError,
  ForeignKeyConstraintError,
  HostNotFoundError,
  HostNotReachableError,
  InvalidConnectionError,
  TimeoutError,
  UniqueConstraintError,
  ValidationError as SequelizeValidationError,
} from 'sequelize';
import { Config, Logger } from '../config';
import { ApiError } from '../models/ApiError';
import { CustomForbiddenException } from '../models/CustomForbiddenException';
import { ErrorCode } from '../models/enums/errorcode.enum';
import { ErrorCatalogue } from '../models/errorcatalogue';
import { IErrorFieldResponse, IErrorResponse } from '../models/IErrorResponse';
import { ValidationException } from '../models/ValidationException';
import { generateReference } from '../services/reference.service';

interface MappedError {
  code: ErrorCode;
  status: number;
  errormessage: string;
  hint?: string;
  fields?: IErrorFieldResponse[];
}

const SEQUELIZE_UNAVAILABLE_CLASSES = [
  ConnectionError,
  ConnectionRefusedError,
  ConnectionTimedOutError,
  TimeoutError,
  HostNotFoundError,
  HostNotReachableError,
  InvalidConnectionError,
];

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // Unrelated to the error contract below: a small number of RPI-facing
    // endpoints return the bare string 'invalid' with the exception's own
    // status, and always have. Left exactly as it was.
    if (exception instanceof CustomForbiddenException) {
      response.status((exception as CustomForbiddenException).getStatus()).json('invalid');
      return;
    }

    const reference = generateReference();
    const mapped = this.map(exception);

    const body: IErrorResponse = {
      error: true,
      data: false,
      code: mapped.code,
      errormessage: mapped.errormessage,
      reference,
    };
    if (mapped.hint) {
      body.hint = mapped.hint;
    }
    if (mapped.fields && mapped.fields.length > 0) {
      body.fields = mapped.fields;
    }
    if (Config.fortyk.api.debug) {
      body.stack = (exception as any)?.stack;
      body.logid = reference;
    }

    this.logError(exception, mapped, reference, request);

    response.status(mapped.status).json(body);
  }

  /**
   * docs/api-errors.md's mapping table, in order: our own explicit codes
   * first, then structured validation, then framework/library exceptions by
   * type (never by message text - message text is not a contract), and only
   * at the very end a catch-all that never trusts an unrecognised
   * exception's message.
   */
  private map(exception: unknown): MappedError {
    const errordetails = exception as any;
    if (exception instanceof ApiError) {
      return {
        code: exception.code,
        status: exception.getStatus(),
        errormessage: exception.message,
        hint: exception.hint,
        fields: exception.fields,
      };
    }

    if (exception instanceof ValidationException) {
      const existsField = exception.fields.find((f) => f.exists);
      if (existsField) {
        return this.fromCatalogue(ErrorCode.ALREADY_EXISTS, existsField.message);
      }
      return this.fromCatalogue(
        ErrorCode.INVALID_INPUT,
        undefined,
        exception.fields.map(({ field, message }) => ({ field, message })),
      );
    }

    if (exception instanceof ThrottlerException) {
      return this.fromCatalogue(ErrorCode.TOO_MANY_ATTEMPTS);
    }

    if (exception instanceof PayloadTooLargeException) {
      return this.fromCatalogue(ErrorCode.FILE_REJECTED);
    }
    // @nestjs/platform-express bundles its own copy of `multer` under
    // node_modules/@nestjs/platform-express/node_modules/multer - a
    // different module instance than the `multer` this file imports, so
    // `instanceof MulterError` can silently miss. Check by name too.
    if (exception instanceof MulterError || errordetails?.name === 'MulterError') {
      const status = errordetails?.code === 'LIMIT_FILE_SIZE' ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST;
      return { ...this.fromCatalogue(ErrorCode.FILE_REJECTED), status };
    }
    if (exception instanceof BadRequestException && exception.message === 'Too many files') {
      return this.fromCatalogue(ErrorCode.FILE_REJECTED);
    }

    // Express's body-parser (JSON/urlencoded) throws directly, before any
    // Nest interceptor or controller runs - never an ApiError/ValidationException,
    // and its message can vary by body-parser version. Detected by `.type`,
    // a stable body-parser convention, and NEVER trusting `.message` (a
    // malformed-JSON parse error is usually just a position, e.g. "Unexpected
    // token h in JSON at position 1", but that isn't a guaranteed contract,
    // so this never shows or logs it).
    if (errordetails?.type === 'entity.parse.failed') {
      return this.fromCatalogue(ErrorCode.INVALID_INPUT, "The request body isn't valid.");
    }
    if (errordetails?.type === 'entity.too.large') {
      return { ...this.fromCatalogue(ErrorCode.FILE_REJECTED), status: HttpStatus.PAYLOAD_TOO_LARGE };
    }
    // Belt-and-braces for the SAME malformed-JSON case: Nest's own
    // RoutesResolver.mapExternalException (routes-resolver.js) intercepts a
    // SyntaxError from body-parser BEFORE it ever reaches this filter and
    // rewraps it as `new BadRequestException(err.message)`, discarding the
    // `.type` this filter checks above - so the branch right above this
    // comment does NOT actually run for the common case; this one does.
    // V8's JSON.parse error message is not just a position: with certain
    // malformed input it quotes a snippet of the actual body back
    // (confirmed empirically, e.g. `"not json at all hunter2 ..."` produces
    // `Unexpected token 'o', "not json at"... is not valid JSON`), so this
    // is a real leak path, not a theoretical one - detected by message shape
    // since the `.type` is gone by the time we see it.
    if (
      exception instanceof BadRequestException &&
      /is not valid JSON|JSON at position|in JSON at/i.test(errordetails?.message ?? '')
    ) {
      return this.fromCatalogue(ErrorCode.INVALID_INPUT, "The request body isn't valid.");
    }

    if (exception instanceof UnauthorizedException) {
      return this.fromCatalogue(ErrorCode.SIGN_IN_REQUIRED);
    }
    if (exception instanceof ForbiddenException) {
      return this.fromCatalogue(ErrorCode.NOT_ALLOWED);
    }
    if (exception instanceof NotFoundException) {
      // Covers both a deliberate NotFoundException and Nest's own "Cannot
      // GET /path" for an unmatched route - never the exception's own
      // message, which is exactly the path/method we must not leak.
      return this.fromCatalogue(ErrorCode.NOT_FOUND);
    }

    if (exception instanceof UniqueConstraintError) {
      return this.fromCatalogue(ErrorCode.ALREADY_EXISTS);
    }
    if (exception instanceof ForeignKeyConstraintError) {
      return this.fromCatalogue(ErrorCode.INVALID_INPUT, "That refers to something that doesn't exist.");
    }
    if (SEQUELIZE_UNAVAILABLE_CLASSES.some((klass) => exception instanceof klass)) {
      return this.fromCatalogue(ErrorCode.SERVICE_UNAVAILABLE);
    }
    if (exception instanceof SequelizeValidationError) {
      // A model-level validation failure (e.g. a not-null/length check
      // Sequelize enforces before ever reaching the DB) - generic message
      // only; never the column name or the value that failed.
      return this.fromCatalogue(ErrorCode.INVALID_INPUT);
    }
    if (exception instanceof DatabaseError) {
      // MySQL errno for a bad VALUE, not a bad connection: not-null (1048),
      // out of range (1264), truncated (1292), incorrect value (1366), data
      // too long (1406). Never the column/value in the message. Anything
      // else here is an unexpected DB failure - INTERNAL, not INVALID_INPUT.
      const DATA_ERRNOS = [1048, 1264, 1292, 1366, 1406];
      const errno = (exception as any)?.original?.errno;
      if (DATA_ERRNOS.includes(errno)) {
        return this.fromCatalogue(ErrorCode.INVALID_INPUT);
      }
      return this.fromCatalogue(ErrorCode.INTERNAL);
    }

    // Axios <1.0 (pinned here) has no exported AxiosError class to check
    // instanceof, so this duck-types the shape every axios error has.
    // Full pass-through of the upstream status/code is a later step
    // (docs/api-errors.md "Delivery" #5); this is only a sane, non-leaking
    // fallback for the meantime - and it never includes the upstream
    // hostname/URL that lives on `errordetails.config`/`errordetails.request`.
    if (errordetails?.isAxiosError) {
      const reachedUpstream = !!errordetails.response;
      return this.fromCatalogue(reachedUpstream ? ErrorCode.INTERNAL : ErrorCode.SERVICE_UNAVAILABLE);
    }

    // Safety net for a library exception that is neither an HttpException nor
    // any of the specific shapes above, but still carries an HTTP-ish
    // `status`/`statusCode` (e.g. `http-errors`-based libraries other than
    // the ones already special-cased). Maps by that NUMBER only - never by
    // the exception's own message.
    const statusLike = errordetails?.status ?? errordetails?.statusCode;
    if (!(exception instanceof HttpException) && typeof statusLike === 'number' && statusLike >= 400 && statusLike < 600) {
      if (statusLike === 413) {
        return { ...this.fromCatalogue(ErrorCode.FILE_REJECTED), status: HttpStatus.PAYLOAD_TOO_LARGE };
      }
      if (statusLike === 404) {
        return this.fromCatalogue(ErrorCode.NOT_FOUND);
      }
      if (statusLike === 429) {
        return this.fromCatalogue(ErrorCode.TOO_MANY_ATTEMPTS);
      }
      if (statusLike >= 500) {
        return this.fromCatalogue(ErrorCode.INTERNAL);
      }
      return this.fromCatalogue(ErrorCode.INVALID_INPUT);
    }

    if (exception instanceof HttpException) {
      // A deliberate, still-unmapped HttpException from this codebase (e.g. a
      // business precondition thrown as a plain BadRequestException). Its
      // message was written by a developer as user-facing text, so unlike
      // the catch-all below it's trusted - but only when it really is a
      // string; an object payload (`new BadRequestException({...})`) is never
      // read out here, so an old-style throw site that still sets one gets a
      // safe generic message rather than "[object Object]".
      const response = exception.getResponse();
      // Nest wraps a string-constructed HttpException's message into
      // `{statusCode, message, error}` - that `message` key is exception.message
      // itself and safe to trust. An OLD-STYLE `new BadRequestException({error,
      // errormessage})` has no such key, and exception.message there is only
      // Nest's own generic "Bad Request Exception" (not the useful part, and
      // not what a throw site meant to say) - fall back to the catalogue.
      const hasStandardShape =
        typeof response === 'string' || (typeof response === 'object' && response !== null && 'message' in response);
      const safeMessage = hasStandardShape ? exception.message : undefined;
      return this.fromCatalogue(ErrorCode.INVALID_INPUT, safeMessage);
    }

    // Anything else - a raw Error, a driver exception, a typo'd throw of a
    // plain object - is never shown to the client. This is the only branch
    // that reaches INTERNAL/500 with the fully generic message.
    return this.fromCatalogue(ErrorCode.INTERNAL);
  }

  private fromCatalogue(code: ErrorCode, message?: string, fields?: IErrorFieldResponse[]): MappedError {
    const catalogue = ErrorCatalogue[code];
    return {
      code,
      status: catalogue.status,
      errormessage: message ?? catalogue.errormessage,
      hint: catalogue.hint,
      fields,
    };
  }

  /**
   * Every error, logged exactly once: reference, code, status, method, route
   * template (not the full URL/query string), the authenticated user id if
   * any, and the ORIGINAL error's class/message/stack - never the request
   * body, and never any header (so a bearer token or cookie can't land in a
   * log line even indirectly). 4xx at warn, 5xx at error - both reach the
   * production console transport (see services/logger.ts's consoleFilter).
   */
  private logError(exception: unknown, mapped: MappedError, reference: string, request: any) {
    const errordetails = exception as any;
    const meta = {
      reference,
      code: mapped.code,
      status: mapped.status,
      method: request?.method,
      // `request.path` (Express) is already query-free; `route.path` (the
      // matched route's template, e.g. "/school/:schoolid") is preferred
      // when available since it doesn't vary per-id. Neither is
      // `originalUrl`, which would carry the query string.
      route: request?.route?.path ?? request?.path,
      userid: request?.user?.lmsuserid ?? request?.user?.schooluserid,
      originalerrorclass: errordetails?.constructor?.name,
      originalerrormessage: errordetails?.message,
      stack: errordetails?.stack,
    };
    if (mapped.status >= 500) {
      Logger.error('Request failed', meta);
    } else {
      Logger.warn('Request failed', meta);
    }
  }
}
