import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ValidationException } from '../models/ValidationException';
import { Config, Logger } from '../config';
import { IErrorResponse } from 'src/models/IErrorResponse';
import { CustomForbiddenException } from 'src/models/CustomForbiddenException';
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    // const request = ctx.getRequest();
    const errordetails = exception as any;
    const logid = uuidv4();
    const isvalidationError = exception instanceof ValidationException;
    if (!isvalidationError) {
      Logger.debug('Exception', { exception: errordetails, logid });
    }
    if (exception instanceof CustomForbiddenException) {
      response.status((exception as CustomForbiddenException).getStatus()).json('invalid');
      return;
    }
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const isHttpException = exception instanceof HttpException;
    const maskmessage = !Config.fortyk.api.debug && !isHttpException;
    if (maskmessage) {
      // The client only gets "Something went wrong" below, so the real
      // message and stack need a home that survives production's logging
      // setup — Logger.debug (used above) is dropped there. Log at error
      // level, keyed by logid, so an operator can still find this.
      Logger.error("Unhandled exception", {
        logid,
        message: errordetails?.message,
        stack: errordetails?.stack,
      });
    }
    const clientmessage = maskmessage
      ? "Something went wrong"
      : errordetails?.response?.errormessage || errordetails.message;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorresponse: IErrorResponse = {
      error: true,
      errormessage: clientmessage,
      data: false,
    };
    if (Config.fortyk.api.debug && errordetails.stack && !isvalidationError) {
      errorresponse.stack = errordetails.stack;
      errorresponse.logid = logid;
    }
    response.status(status).json(errorresponse);
  }
}
