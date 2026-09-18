// Bound on untrusted zip-entry expansion for PUT /log/import. A malicious
// upload can be a small zip that decompresses to gigabytes; this cap is
// checked before any entry is buffered into memory. See workspace#53.
//
// Kept separate from src/constants/upload-limits.ts (added by PR #50, which
// caps the *compressed* upload size) to avoid an add/add conflict; fold this
// into #50's UploadLimits object (e.g. LOG_IMPORT.decompressedMaxBytes) once
// that PR lands.

// PUT /log/import: max decompressed size of a single zip entry (log.ini).
// log.ini is one school's last six months of progress (tens of MB in
// practice); 64 MB leaves headroom without authorizing hundreds of MB of
// RSS per request (JSON.parse of the buffered string roughly doubles it).
export const LOG_ZIP_DECOMPRESSED_MAX_BYTES = 64 * 1024 * 1024; // 64 MB
