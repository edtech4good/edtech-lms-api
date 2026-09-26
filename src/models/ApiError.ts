import { HttpException } from '@nestjs/common';
import { ErrorCode } from './enums/errorcode.enum';
import { ErrorCatalogue } from './errorcatalogue';

export interface ApiFieldError {
  field: string;
  message: string;
}

/**
 * Throw this directly from a controller or business method when the call
 * site already knows the ErrorCode - it carries the code (and, unless
 * overridden, the catalogue's status/message/hint) straight through
 * GlobalExceptionFilter without the filter having to infer anything.
 *
 * `message`/`hint` overrides must still follow docs/api-errors.md's "never in
 * a response" rules (no SQL, ids, paths, hostnames, other users' data, etc).
 */
export class ApiError extends HttpException {
  public readonly code: ErrorCode;

  public readonly hint?: string;

  public readonly fields?: ApiFieldError[];

  constructor(
    code: ErrorCode,
    message?: string,
    opts?: { status?: number; hint?: string; fields?: ApiFieldError[] },
  ) {
    const catalogue = ErrorCatalogue[code];
    const status = opts?.status ?? catalogue.status;
    super(message ?? catalogue.errormessage, status);
    this.code = code;
    // "Check the highlighted fields." only makes sense when there are fields.
    const defaultHint =
      code === ErrorCode.INVALID_INPUT && !(opts?.fields && opts.fields.length > 0) ? undefined : catalogue.hint;
    this.hint = opts?.hint ?? defaultHint;
    this.fields = opts?.fields;
  }
}
