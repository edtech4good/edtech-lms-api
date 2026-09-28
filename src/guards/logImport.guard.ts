import { CanActivate, Injectable } from "@nestjs/common";
import { isLogImportEnabled } from "src/config";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";

/**
 * Gates `PUT log/import` behind `LOG_IMPORT_ENABLED` (off unless set to
 * `true`/`1` - see src/config.ts#isLogImportEnabled for why).
 *
 * Must be listed FIRST in the route's `@UseGuards(...)`: Nest runs guards in
 * array order, before any interceptor, so putting this ahead of
 * `AccessGuard`/`CheckPermissionsGuard` means a disabled server rejects the
 * request before it inspects the bearer token (a disabled route shouldn't
 * reveal whether a token is valid) and before `FileInterceptor` ever parses
 * the upload. See log.guard.spec.ts, which proves both orderings.
 *
 * `NOT_FOUND` (404) rather than a "feature off" code: it is the least
 * revealing status the error contract has (docs/api-errors.md) - a token
 * probe against a disabled route gets the same status and the same
 * `NOT_FOUND` code an unmatched route gets, whatever token it carries (see
 * log.guard.spec.ts). The message differs ("Log upload is turned off on
 * this server." here, vs. the generic catalogue text for an unmatched
 * route), but that's not a meaningful leak: the route is public in this
 * open-source repo, so a plain-language message tells a caller nothing they
 * couldn't already read in source. It does make the response useful to
 * whoever operates the deployment, checking why a real teacher upload
 * started failing.
 */
@Injectable()
export class LogImportGuard implements CanActivate {
  canActivate(): boolean {
    if (!isLogImportEnabled()) {
      throw new ApiError(
        ErrorCode.NOT_FOUND,
        "Log upload is turned off on this server."
      );
    }
    return true;
  }
}
