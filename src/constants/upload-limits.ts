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
