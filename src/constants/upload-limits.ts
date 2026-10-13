/**
 * Multer upload limits, in bytes, per upload endpoint. Kept in one place so
 * they are easy to tune without hunting through controllers.
 *
 * Note: only the `fileSize` limit maps to HTTP 413 (via
 * @nestjs/platform-express's multer.utils.transformException ->
 * PayloadTooLargeException). Exceeding `files` maps to HTTP 400
 * ("Too many files", a BadRequestException from the same transform), not 413.
 *
 * See edtech4good/edtech-lms-api#36.
 */
export const UploadLimits = {
  LOG_IMPORT: {
    fileSize: 50 * 1024 * 1024, // 50 MB - zip of student logs
    files: 1,
  },
  TEACHER_IMPORT: {
    // PUT /import/:schoolname/teachers - a teacher roster CSV, parsed into
    // {teacherusername, teacheruserpassword} rows. A 20,000-teacher CSV at
    // ~80 bytes/row is ~1.6 MB, so 5 MB is already generous headroom.
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,
  },
  DOCUMENT_UPLOAD: {
    // POST /document/upload - the handler only ever accepts exactly one file
    // (see document.controller.ts's `files.length != 1` check), and the
    // `documents` table holds lesson media, mostly mp4 video. 200 MB is a
    // first guess for lesson videos - this is the number to tune once a real
    // DCRS lesson video's size is known.
    fileSize: 200 * 1024 * 1024, // 200 MB
    files: 1,
  },
} as const;

/** The route whose size limit is `UploadLimits.DOCUMENT_UPLOAD` (a spec pins it to the controller's own route). */
export const DOCUMENT_UPLOAD_ROUTE = '/document/upload';

/** Told for a file over the document limit; the number comes from the limit, so the two cannot drift. */
export const documentTooLargeMessage = (): string => `This file is larger than ${UploadLimits.DOCUMENT_UPLOAD.fileSize / (1024 * 1024)} MB.`;

/** Told for a second file; every upload route here takes exactly one. */
export const ONE_FILE_MESSAGE = 'Upload one file at a time.';

/**
 * What a multipart body holds besides the file: the boundary lines, the part headers (with the file name) and the text
 * fields (title, licence, attribution: a few KiB at most). A request that declares more than the limit plus this much
 * cannot hold a file within the limit.
 */
export const MULTIPART_OVERHEAD_ALLOWANCE = 64 * 1024;

/**
 * Does a `Content-Length` header declare a body that cannot hold a file of at most `fileSize` bytes? A header that is
 * absent or is not a plain number says nothing (a chunked body has none): multer's own limit decides those.
 */
export const declaresMoreThanFits = (contentLength: string | undefined, fileSize: number): boolean =>
  typeof contentLength === 'string' && /^\d+$/.test(contentLength.trim()) && Number(contentLength) > fileSize + MULTIPART_OVERHEAD_ALLOWANCE;
