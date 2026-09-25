import { ArgumentsHost, ForbiddenException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { Config } from '../config';

describe('GlobalExceptionFilter', () => {
  it('should be defined', () => {
    expect(new GlobalExceptionFilter()).toBeDefined();
  });

  /**
   * Guards edtech-lms-api#56: outside debug mode, a raw (non-HttpException)
   * error must reach the client only as "Something went wrong" — never its
   * real message or stack, which can carry internal details (SQL, file
   * paths, third-party error text).
   */
  describe('message masking outside debug mode', () => {
    let jsonMock: jest.Mock;
    let statusMock: jest.Mock;
    let host: ArgumentsHost;
    let originalDebug: boolean;

    beforeEach(() => {
      jsonMock = jest.fn();
      statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      host = {
        switchToHttp: () => ({
          getResponse: () => ({ status: statusMock }),
          getRequest: () => ({}),
        }),
      } as unknown as ArgumentsHost;
      originalDebug = Config.fortyk.api.debug;
      Config.fortyk.api.debug = false;
    });

    afterEach(() => {
      Config.fortyk.api.debug = originalDebug;
    });

    it('masks a raw internal error message behind "Something went wrong"', () => {
      const filter = new GlobalExceptionFilter();
      const internal = new Error('ECONNREFUSED 127.0.0.1:3306 password=hunter2');

      filter.catch(internal, host);

      const [body] = jsonMock.mock.calls[0];
      expect(body.errormessage).toBe('Something went wrong');
      expect(body.errormessage).not.toContain('3306');
      expect(body.errormessage).not.toContain('hunter2');
      expect(body.stack).toBeUndefined();
    });

    it('does NOT mask a deliberate HttpException message (e.g. a 403 from a guard)', () => {
      const filter = new GlobalExceptionFilter();
      const forbidden = new ForbiddenException();

      filter.catch(forbidden, host);

      const [body, ] = jsonMock.mock.calls[0];
      expect(statusMock).toHaveBeenCalledWith(403);
      // ForbiddenException's default message, not "Something went wrong" —
      // deliberate HttpExceptions are the client-facing contract, not a leak.
      expect(body.errormessage).toBe('Forbidden');
    });
  });
});
