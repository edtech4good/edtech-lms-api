import { CanActivate, ExecutionContext, Injectable, PayloadTooLargeException, Type } from "@nestjs/common";
import { Request } from "express";
import { declaresMoreThanFits } from "src/constants/upload-limits";

/**
 * Refuses an upload (413) from its `Content-Length` header, before the body is read. `fileSize` is the route's own
 * multer limit, in bytes.
 *
 * Multer's memory storage buffers the file up to the limit before it can refuse one that is over it (a file just over
 * 200 MB peaked at about 555 MB resident). Guards run before interceptors, so listed after the access and permission
 * guards this answers a signed-in caller who may upload, and no one else, before multer reads a byte.
 *
 * The rest of the body is drained, not buffered and not cut off: `resume()` makes Node read and throw away what still
 * arrives, as multer itself does after it refuses a file. The answer goes out at once, and a browser that is still
 * sending reads it when it has finished, where closing the connection would show it a network error and not the
 * message. The cost is the bandwidth of the declared body, paid only by a caller who is signed in and may upload.
 *
 * A request with no `Content-Length` (a chunked body) is not refused here; multer's own limit is the backstop for it.
 * The global exception filter words the 413 for the route.
 */
export const DeclaredSizeGuard = (fileSize: number): Type<CanActivate> => {
  @Injectable()
  class DeclaredSizeGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest<Request>();
      if (declaresMoreThanFits(request.headers["content-length"], fileSize)) {
        request.resume();
        throw new PayloadTooLargeException("File too large");
      }
      return true;
    }
  }
  return DeclaredSizeGuard;
};
