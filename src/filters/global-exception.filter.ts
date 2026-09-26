import {
  ArgumentsHost,
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
import {
  BaseError as SequelizeBaseError,
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

/**
 * How much of the ORIGINAL error the server log may carry.
 * - 'full': class, message and stack.
 * - 'classonly': class only. The message/stack can quote user input
 *   (body-parser quotes the request body; Nest's 404 message is "Cannot GET
 *   /path?query"; a URIError quotes the raw path param; multer/busboy quote
 *   field names).
 * - 'db': class plus MySQL errno/code only. A Sequelize message and stack
 *   can carry SQL, parameter values and column names.
 */
type LogDetail = 'full' | 'classonly' | 'db';

interface MappedError {
  code: ErrorCode;
  status: number;
  errormessage: string;
  hint?: string;
  fields?: IErrorFieldResponse[];
  logDetail: LogDetail;
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

/** MySQL errno for a VALUE that can never be saved (not a connection problem). */
const DATA_ERRNOS = [1048, 1264, 1292, 1366, 1406];

/** multer limit messages, as re-thrown by Nest's transformException. */
const MULTER_MESSAGES = new Set([
  'Too many parts',
  'Too many files',
  'Field name too long',
  'Field value too long',
  'Too many fields',
  'Unexpected field',
]);

const JSON_PARSE_MESSAGE = /JSON/;

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
    if (Config.fortyk.api.debug && mapped.logDetail === 'full') {
      body.stack = (exception as any)?.stack;
      body.logid = reference;
    } else if (Config.fortyk.api.debug) {
      body.logid = reference;
    }

    this.logError(exception, mapped, reference, request);

    response.status(mapped.status).json(body);
  }

  /**
   * docs/api-errors.md's mapping table. Only ApiError, ValidationException
   * and the repo's own `{error, errormessage}` HttpException shape may carry
   * a custom message; every other exception is mapped by TYPE or STATUS
   * with the catalogue's generic message, because its message may quote
   * user input.
   */
  private map(exception: unknown): MappedError {
    const e = exception as any;

    if (exception instanceof ApiError) {
      return {
        code: exception.code,
        status: exception.getStatus(),
        errormessage: exception.message,
        hint: exception.hint,
        fields: exception.fields,
        logDetail: 'full',
      };
    }

    if (exception instanceof ValidationException) {
      const existsField = exception.fields.find((f) => f.exists);
      if (existsField) {
        return this.fromCatalogue(ErrorCode.ALREADY_EXISTS, { message: existsField.message });
      }
      return this.fromCatalogue(ErrorCode.INVALID_INPUT, {
        fields: exception.fields.map(({ field, message }) => ({ field, message })),
      });
    }

    if (exception instanceof ThrottlerException) {
      return this.fromCatalogue(ErrorCode.TOO_MANY_ATTEMPTS);
    }

    // Body-parser (JSON/urlencoded). Its messages quote the request body.
    // Nest's RoutesResolver.mapExternalException rewraps body-parser's
    // SyntaxError as `new BadRequestException(err.message)` before this
    // filter sees it, dropping `.type` - so the message shape is checked too.
    if (this.isBodyParserError(exception)) {
      if (e?.type === 'entity.too.large' || e?.status === 413 || e?.statusCode === 413) {
        return this.fromCatalogue(ErrorCode.FILE_REJECTED, { status: HttpStatus.PAYLOAD_TOO_LARGE, logDetail: 'classonly' });
      }
      return this.fromCatalogue(ErrorCode.INVALID_INPUT, { message: "The request body isn't valid.", logDetail: 'classonly' });
    }

    // Multer. Nest bundles its own copy, so match on name, never instanceof.
    // Nest's transformException turns LIMIT_FILE_SIZE into
    // PayloadTooLargeException and the other limits into
    // BadRequestException(message) - those are handled here too.
    if (e?.name === 'MulterError') {
      const status = e.code === 'LIMIT_FILE_SIZE' ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST;
      return this.fromCatalogue(ErrorCode.FILE_REJECTED, { status, logDetail: 'classonly' });
    }
    if (exception instanceof PayloadTooLargeException) {
      return this.fromCatalogue(ErrorCode.FILE_REJECTED, { status: HttpStatus.PAYLOAD_TOO_LARGE, logDetail: 'classonly' });
    }
    if (exception instanceof HttpException && exception.getStatus() === 400 && MULTER_MESSAGES.has(exception.message)) {
      return this.fromCatalogue(ErrorCode.FILE_REJECTED, { status: HttpStatus.BAD_REQUEST, logDetail: 'classonly' });
    }
    // busboy (under multer) on a truncated/malformed multipart body: a plain
    // Error, which would otherwise be a 500.
    if (!(exception instanceof HttpException) && /^(Unexpected end of (form|multipart data)|Malformed part header|Multipart: Boundary not found)/.test(e?.message ?? '')) {
      return this.fromCatalogue(ErrorCode.FILE_REJECTED, { status: HttpStatus.BAD_REQUEST, logDetail: 'classonly' });
    }

    if (exception instanceof UnauthorizedException) {
      return this.fromCatalogue(ErrorCode.SIGN_IN_REQUIRED);
    }
    if (exception instanceof ForbiddenException) {
      return this.fromCatalogue(ErrorCode.NOT_ALLOWED);
    }
    if (exception instanceof NotFoundException) {
      // Nest's unmatched-route message is "Cannot GET /path?query" - never
      // shown, never logged.
      return this.fromCatalogue(ErrorCode.NOT_FOUND, { logDetail: 'classonly' });
    }

    if (exception instanceof UniqueConstraintError) {
      return this.fromCatalogue(ErrorCode.ALREADY_EXISTS, { logDetail: 'db' });
    }
    if (exception instanceof ForeignKeyConstraintError) {
      return this.fromCatalogue(ErrorCode.INVALID_INPUT, {
        message: "That refers to something that doesn't exist.",
        logDetail: 'db',
      });
    }
    if (SEQUELIZE_UNAVAILABLE_CLASSES.some((klass) => exception instanceof klass)) {
      return this.fromCatalogue(ErrorCode.SERVICE_UNAVAILABLE, { logDetail: 'db' });
    }
    if (exception instanceof SequelizeValidationError) {
      return this.fromCatalogue(ErrorCode.INVALID_INPUT, { logDetail: 'db' });
    }
    if (exception instanceof DatabaseError) {
      if (DATA_ERRNOS.includes(e?.original?.errno ?? e?.parent?.errno)) {
        return this.fromCatalogue(ErrorCode.INVALID_INPUT, { logDetail: 'db' });
      }
      return this.fromCatalogue(ErrorCode.INTERNAL, { logDetail: 'db' });
    }
    if (exception instanceof SequelizeBaseError) {
      return this.fromCatalogue(ErrorCode.INTERNAL, { logDetail: 'db' });
    }

    // axios 0.24 has no exported AxiosError class. Upstream pass-through is
    // docs/api-errors.md Delivery step 5; for now: unreachable -> 503, else
    // 500. Only class/message/stack are logged - never `config` (which holds
    // the upstream URL and the Authorization sync key) or `response`.
    if (e?.isAxiosError) {
      return this.fromCatalogue(e.response ? ErrorCode.INTERNAL : ErrorCode.SERVICE_UNAVAILABLE);
    }

    if (exception instanceof HttpException) {
      // The repo's own `{error: true, errormessage: '...'}` shape is the only
      // HttpException whose message is trusted.
      const response = exception.getResponse() as any;
      const ownMessage =
        response && typeof response === 'object' && response.error === true && typeof response.errormessage === 'string'
          ? response.errormessage
          : undefined;
      // Anything else (URIError "Failed to decode param '...'", Nest
      // defaults, library errors) may quote input: message not shown, not
      // logged.
      return this.byStatus(exception.getStatus(), ownMessage, ownMessage ? 'full' : 'classonly');
    }

    // A non-HttpException library error that still carries an HTTP status.
    const statusLike = e?.status ?? e?.statusCode;
    if (typeof statusLike === 'number' && statusLike >= 400 && statusLike < 600) {
      return this.byStatus(statusLike, undefined, 'classonly');
    }

    return this.fromCatalogue(ErrorCode.INTERNAL);
  }

  private isBodyParserError(exception: unknown): boolean {
    const e = exception as any;
    if (typeof e?.type === 'string' && /^(entity|charset|encoding)\./.test(e.type)) {
      return true;
    }
    if (exception instanceof SyntaxError && (e?.status === 400 || e?.statusCode === 400)) {
      return true;
    }
    return exception instanceof HttpException && exception.getStatus() === 400 && JSON_PARSE_MESSAGE.test(exception.message);
  }

  private byStatus(status: number, message: string | undefined, logDetail: LogDetail): MappedError {
    if (status === 401) return this.fromCatalogue(ErrorCode.SIGN_IN_REQUIRED, { message, logDetail });
    if (status === 403) return this.fromCatalogue(ErrorCode.NOT_ALLOWED, { message, logDetail });
    if (status === 404) return this.fromCatalogue(ErrorCode.NOT_FOUND, { message, logDetail });
    if (status === 409) return this.fromCatalogue(ErrorCode.ALREADY_EXISTS, { message, logDetail });
    if (status === 413) {
      return this.fromCatalogue(ErrorCode.FILE_REJECTED, { message, status: HttpStatus.PAYLOAD_TOO_LARGE, logDetail });
    }
    if (status === 429) return this.fromCatalogue(ErrorCode.TOO_MANY_ATTEMPTS, { message, logDetail });
    if (status >= 500) return this.fromCatalogue(ErrorCode.INTERNAL, { message, logDetail });
    return this.fromCatalogue(ErrorCode.INVALID_INPUT, { message, logDetail });
  }

  private fromCatalogue(
    code: ErrorCode,
    opts: { message?: string; fields?: IErrorFieldResponse[]; status?: number; logDetail?: LogDetail } = {},
  ): MappedError {
    const catalogue = ErrorCatalogue[code];
    const hasFields = !!opts.fields && opts.fields.length > 0;
    return {
      code,
      status: opts.status ?? catalogue.status,
      errormessage: opts.message ?? catalogue.errormessage,
      // "Check the highlighted fields." only when there are fields to highlight.
      hint: code === ErrorCode.INVALID_INPUT && !hasFields ? undefined : catalogue.hint,
      fields: opts.fields,
      logDetail: opts.logDetail ?? 'full',
    };
  }

  /**
   * Every error, logged exactly once: reference, code, status, method, route
   * template (`request.route?.path ?? request.path`, never originalUrl or the
   * query string), the authenticated user id, and as much of the original
   * error as `logDetail` allows. Never the body, headers, cookies or tokens.
   * 4xx at warn, 5xx at error.
   */
  /**
   * The matched route's template when there is one; otherwise
   * `request.path` (never originalUrl, so never the query string). A path
   * that failed to %-decode (Nest's URIError case) is not logged at all -
   * the undecodable segment is the raw client input.
   */
  private routeFor(request: any): string | undefined {
    if (request?.route?.path) {
      return request.route.path;
    }
    const path: string | undefined = request?.path;
    if (typeof path !== 'string') {
      return undefined;
    }
    try {
      decodeURIComponent(path);
      return path;
    } catch {
      return '[undecodable path]';
    }
  }

  private logError(exception: unknown, mapped: MappedError, reference: string, request: any) {
    const e = exception as any;
    const meta: Record<string, unknown> = {
      reference,
      code: mapped.code,
      status: mapped.status,
      method: request?.method,
      route: this.routeFor(request),
      userid: request?.user?.lmsuserid ?? request?.user?.schooluserid,
      originalerrorclass: e?.constructor?.name,
    };
    if (mapped.logDetail === 'full') {
      meta.originalerrormessage = e?.message;
      meta.stack = e?.stack;
    } else if (mapped.logDetail === 'db') {
      meta.dberrno = e?.original?.errno ?? e?.parent?.errno;
      meta.dbcode = e?.original?.code ?? e?.parent?.code;
    }
    if (mapped.status >= 500) {
      Logger.error('Request failed', meta);
    } else {
      Logger.warn('Request failed', meta);
    }
  }
}
