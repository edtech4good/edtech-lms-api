import { HttpException, HttpStatus } from '@nestjs/common';

export interface ValidationFieldError {
  /** Field name as the client knows it (body/query/param key), e.g. "email". */
  field: string;
  /** Plain-language message about what the user typed. */
  message: string;
  /**
   * Set by a business-rule validator (`*.business.validator.ts`) when the
   * failure is "this already exists" rather than "this input is invalid" -
   * GlobalExceptionFilter uses it to map the whole response to
   * ErrorCode.ALREADY_EXISTS (409) instead of INVALID_INPUT (400), per
   * docs/api-errors.md's mapping table.
   */
  exists?: boolean;
}

/**
 * Thrown by SchemaValidationInterceptor (Joi request-shape validation) and
 * BusinessValidationInterceptor (business-rule checks like "already exists"
 * / "invalid id"). Carries structured field errors rather than a single
 * joined string, so GlobalExceptionFilter can build the contract's `fields`
 * array and tell "already exists" apart from "invalid input".
 */
export class ValidationException extends HttpException {
  public readonly fields: ValidationFieldError[];

  constructor(fields: ValidationFieldError[]) {
    super(fields.map((f) => f.message).join(', ') || 'Validation failed', HttpStatus.BAD_REQUEST);
    this.fields = fields;
  }
}
