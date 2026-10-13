import AdmZip from "adm-zip";
import { TextDecoder } from "util";
import { ONE_FILE_MESSAGE } from "src/constants/upload-limits";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";
import { FileType } from "src/models/enums/filetype.enum.";
import { ValidationFieldError } from "src/models/ValidationException";
import {
  ATTRIBUTION_ADAPTEDFROM_MAX,
  ATTRIBUTION_AUTHOR_MAX,
  ATTRIBUTION_MAX_BYTES,
  ATTRIBUTION_SOURCEURL_MAX,
  ATTRIBUTION_VERSION,
  DEFAULT_DOCUMENT_LICENCE,
  DOCUMENT_LICENCES,
  DOCUMENT_TITLE_MAX,
  isDocumentLicence,
  normaliseDocumentAttribution,
} from "src/constants/media-library";

/**
 * What a document upload accepts, and the rules for a document's title, licence and attribution
 * (docs/media-library-phase0-design.md, sections 5 and 6).
 *
 * The extension decides the type; the first bytes must agree with it; for the five zip-based formats one entry inside
 * the container must agree as well. The browser's MIME type is never looked at. Nothing here echoes a file name, a title
 * or any other text the caller sent. The shared extractor in `util.service.ts` (log import, feedback) is not used and not
 * changed: this list is the document upload's own.
 */

// ---- the whitelist ----------------------------------------------------------------------------------------------

type Check = (head: Buffer, whole: Buffer) => boolean;

const startsWith = (head: Buffer, bytes: ReadonlyArray<number>, offset = 0): boolean =>
  head.length >= offset + bytes.length && bytes.every((b, i) => head[offset + i] === b);
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

/** A ZIP local-file header. */
const isZip: Check = (head) => startsWith(head, [0x50, 0x4b, 0x03, 0x04]);

/** Valid UTF-8 (a byte-order mark allowed) with no NUL byte; decoded in pieces so a large file is not copied whole. */
const isText: Check = (_head, whole) => {
  if (whole.indexOf(0) !== -1) {
    return false;
  }
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const piece = 1024 * 1024;
  try {
    for (let at = 0; at < whole.length; at += piece) {
      decoder.decode(whole.subarray(at, Math.min(at + piece, whole.length)), { stream: true });
    }
    decoder.decode();
    return true;
  } catch {
    return false;
  }
};

const OOXML_MAIN = {
  pptx: { dir: "/ppt/", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml" },
  docx: { dir: "/word/", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" },
  xlsx: { dir: "/xl/", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" },
} as const;

export interface DocumentFileRule {
  /** Set on an extension that is another spelling of a listed one (jpeg of jpg): accepted, but not named in the "supported" message. */
  aliasOf?: string;
  documenttypeid: FileType;
  /** Set on the stored object; chosen by the extension, never by the browser. */
  contentType: string;
  signature: Check;
  /** The entry inside the container that must agree with the extension (zip-based formats only). */
  container?: { kind: "ooxml"; dir: string; type: string } | { kind: "odf"; mimetype: string };
}

/** extension (lower case) -> rule. An extension that is not a key here is refused. The order is the order the "supported" message lists them in. */
export const DOCUMENT_FILE_RULES: Readonly<Record<string, DocumentFileRule>> = {
  mp4: { documenttypeid: FileType.VIDEO, contentType: "video/mp4", signature: (h) => startsWith(h, ascii("ftyp"), 4) },
  mp3: {
    documenttypeid: FileType.AUDIO,
    contentType: "audio/mpeg",
    signature: (h) => startsWith(h, ascii("ID3")) || (h.length >= 2 && h[0] === 0xff && (h[1] & 0xe0) === 0xe0),
  },
  jpg: { documenttypeid: FileType.IMAGE, contentType: "image/jpeg", signature: (h) => startsWith(h, [0xff, 0xd8, 0xff]) },
  jpeg: { aliasOf: "jpg", documenttypeid: FileType.IMAGE, contentType: "image/jpeg", signature: (h) => startsWith(h, [0xff, 0xd8, 0xff]) },
  png: { documenttypeid: FileType.IMAGE, contentType: "image/png", signature: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  gif: { documenttypeid: FileType.IMAGE, contentType: "image/gif", signature: (h) => startsWith(h, ascii("GIF87a")) || startsWith(h, ascii("GIF89a")) },
  pdf: { documenttypeid: FileType.PDF, contentType: "application/pdf", signature: (h) => startsWith(h, ascii("%PDF-")) },
  pptx: {
    documenttypeid: FileType.SLIDES,
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    signature: isZip,
    container: { kind: "ooxml", ...OOXML_MAIN.pptx },
  },
  docx: {
    documenttypeid: FileType.DOCUMENT,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    signature: isZip,
    container: { kind: "ooxml", ...OOXML_MAIN.docx },
  },
  xlsx: {
    documenttypeid: FileType.SPREADSHEET,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    signature: isZip,
    container: { kind: "ooxml", ...OOXML_MAIN.xlsx },
  },
  odp: {
    documenttypeid: FileType.SLIDES,
    contentType: "application/vnd.oasis.opendocument.presentation",
    signature: isZip,
    container: { kind: "odf", mimetype: "application/vnd.oasis.opendocument.presentation" },
  },
  odt: {
    documenttypeid: FileType.DOCUMENT,
    contentType: "application/vnd.oasis.opendocument.text",
    signature: isZip,
    container: { kind: "odf", mimetype: "application/vnd.oasis.opendocument.text" },
  },
  csv: { documenttypeid: FileType.SPREADSHEET, contentType: "text/csv", signature: isText },
};

/**
 * The most an entry inside a container may declare (in the archive's directory) before it is inflated. The check reads
 * one entry only, so what it costs is bounded by this number, whatever the archive holds. The OOXML manifest of a deck of
 * a few hundred slides is tens of KiB, hence not "a few KiB"; the ODF `mimetype` entry is a single line.
 */
export const MAX_CONTENT_TYPES_ENTRY_BYTES = 256 * 1024;
export const MAX_MIMETYPE_ENTRY_BYTES = 1024;

const rejected = (message: string): ApiError => new ApiError(ErrorCode.FILE_REJECTED, message);

/**
 * The refusals of a document upload, each told in terms of what to do. The extension in a message is the lower-case
 * extension of the whitelist rule the name matched (never the name itself); a name whose extension is not on the list is
 * given the "not supported" message, which names the whitelist and nothing of the file.
 */
const supportedExtensions = (): string[] => Object.keys(DOCUMENT_FILE_RULES).filter((e) => !DOCUMENT_FILE_RULES[e].aliasOf);

/** The extension is missing or not on the list. The list is built from the rule table. */
export const unsupportedTypeMessage = (): string => {
  const list = supportedExtensions();
  return `This file type isn't supported. You can upload ${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}.`;
};
/** The first bytes, or the entry inside a container, do not agree with the (whitelisted) extension. */
export const notValidMessage = (extension: string): string =>
  `This file isn't a valid .${extension}. Export it again as a real ${extension.toUpperCase()} and try again.`;
/** A container that cannot be read, or is larger inside than a document needs. */
export const damagedArchiveMessage = (extension: string): string => `This .${extension} is damaged or unusually large inside. Re-save it and try again.`;
export const NAME_REQUIRED_MESSAGE = "The file needs a name.";
/** The request carried no file at all (only fields, an empty body, a JSON body, or a part with no file name). */
export const NO_FILE_MESSAGE = "Choose a file to upload.";
export { ONE_FILE_MESSAGE };

/** The one entry of a zip, read only when its declared size is within `bound`; null for anything wrong with it (absent, a directory, over the bound, unreadable). */
const readEntry = (zip: AdmZip, name: string, bound: number): Buffer | null => {
  const entry = zip.getEntry(name);
  if (!entry || entry.isDirectory) {
    return null;
  }
  if (entry.header.size > bound) {
    return null;
  }
  try {
    const data = entry.getData();
    return data.length <= bound ? data : null;
  } catch {
    return null;
  }
};

const attributesOf = (tag: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  const re = /([A-Za-z][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (let m = re.exec(tag); m; m = re.exec(tag)) {
    attributes[m[1]] = m[2] ?? m[3];
  }
  return attributes;
};

/** Does `[Content_Types].xml` name a main part under `dir` with exactly the content type of this extension? */
const ooxmlManifestAgrees = (manifest: string, dir: string, type: string): boolean => {
  const re = /<Override\b([^>]*)>/g;
  for (let m = re.exec(manifest); m; m = re.exec(manifest)) {
    const a = attributesOf(m[1]);
    if (a.ContentType === type && typeof a.PartName === "string" && a.PartName.startsWith(dir)) {
      return true;
    }
  }
  return false;
};

/**
 * The most entries an archive may declare. The archive library builds an object for every entry of the central directory
 * before one is read, so the number of entries is what the check costs (200,000 empty entries took about 2 GB of memory); it
 * is read from the end-of-central-directory record first, without the library. Real decks and documents hold tens to a few
 * thousand entries.
 */
export const MAX_ZIP_ENTRIES = 10000;

const ZIP_END_SIGNATURE = 0x06054b50; // "PK\5\6": the end-of-central-directory record
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50; // "PK\6\7"
const ZIP64_RECORD_SIGNATURE = 0x06064b50; // "PK\6\6"
const ZIP_END_LENGTH = 22;
const ZIP64_LOCATOR_LENGTH = 20;
const ZIP_MAX_COMMENT = 0xffff;

/**
 * The number of entries the archive declares, found the way the archive library finds its end record (backward from the end,
 * within the longest comment a record can have, taking a record that sits up to 20 bytes before another): the larger of the two
 * counts the record holds. null for what cannot be counted: no end record, a record cut short, or a zip64 archive (a count that
 * does not fit 16 bits; nothing within the upload cap needs one).
 */
export const declaredZipEntries = (buffer: Buffer): number | null => {
  let at = buffer.length - ZIP_END_LENGTH;
  const lowest = Math.max(0, at - ZIP_MAX_COMMENT);
  let end = -1;
  let floor = lowest;
  for (; at >= floor; at--) {
    if (buffer[at] !== 0x50 || at + 4 > buffer.length) {
      continue;
    }
    const signature = buffer.readUInt32LE(at);
    if (signature === ZIP_END_SIGNATURE) {
      end = at;
      floor = Math.max(lowest, at - ZIP64_LOCATOR_LENGTH);
    } else if (signature === ZIP64_LOCATOR_SIGNATURE || signature === ZIP64_RECORD_SIGNATURE) {
      return null;
    }
  }
  if (end < 0 || end + ZIP_END_LENGTH > buffer.length) {
    return null;
  }
  return Math.max(buffer.readUInt16LE(end + 8), buffer.readUInt16LE(end + 10));
};

/**
 * How a zip-based file stands against its extension. Never throws.
 * "damaged": the archive cannot be read as a document container (no end record, zip64, too many entries, a central
 * directory the library cannot open, the checked entry absent (and no manifest of the other family either), over its bound
 * or unreadable).
 * "mismatch": the entry was read and says it is another kind of file, or the archive holds the other family's manifest.
 */
export type ContainerState = "agrees" | "mismatch" | "damaged";

/** The media types an ODF package's `mimetype` entry starts with. */
const ODF_MEDIA_PREFIX = "application/vnd.oasis.opendocument.";

/**
 * A readable zip that holds the OTHER family's manifest than the extension's own entry: an ODF package under an Office Open XML name
 * (a `mimetype` entry with an ODF media type), or an Office Open XML package under an ODF name (a `[Content_Types].xml` entry).
 * It is a good file of another kind, not a damaged one.
 */
const isOtherFamily = (zip: AdmZip, container: NonNullable<DocumentFileRule["container"]>): boolean => {
  if (container.kind === "odf") {
    const other = zip.getEntry("[Content_Types].xml");
    return !!other && !other.isDirectory;
  }
  const data = readEntry(zip, "mimetype", MAX_MIMETYPE_ENTRY_BYTES);
  return data !== null && data.toString("utf8").startsWith(ODF_MEDIA_PREFIX);
};

const containerState = (buffer: Buffer, container: NonNullable<DocumentFileRule["container"]>): ContainerState => {
  const declared = declaredZipEntries(buffer);
  if (declared === null || declared > MAX_ZIP_ENTRIES) {
    return "damaged";
  }
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    return "damaged";
  }
  if (container.kind === "odf") {
    const data = readEntry(zip, "mimetype", MAX_MIMETYPE_ENTRY_BYTES);
    if (data === null) {
      return !zip.getEntry("mimetype") && isOtherFamily(zip, container) ? "mismatch" : "damaged";
    }
    return data.toString("utf8") === container.mimetype ? "agrees" : "mismatch";
  }
  const data = readEntry(zip, "[Content_Types].xml", MAX_CONTENT_TYPES_ENTRY_BYTES);
  if (data === null) {
    return !zip.getEntry("[Content_Types].xml") && isOtherFamily(zip, container) ? "mismatch" : "damaged";
  }
  return ooxmlManifestAgrees(data.toString("utf8"), container.dir, container.type) ? "agrees" : "mismatch";
};

export interface AcceptedDocumentFile {
  extension: string;
  documenttypeid: FileType;
  contentType: string;
}

/**
 * The file name as the person's device wrote it. The multipart parser that the server runs on reads the bytes of a file
 * name as Latin-1, so a name written in UTF-8 (every browser's, and curl's) arrives as one letter per byte. Those bytes
 * are put back and read as UTF-8; a name that is not valid UTF-8 that way (or has no byte above 127) is kept as it came.
 */
export const utf8FileName = (received: string): string => {
  if (/^[\u0000-\u007f]*$/.test(received) || /[^\u0000-\u00ff]/.test(received)) {
    return received;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(received, "latin1"));
  } catch {
    return received;
  }
};

/** The lower-case extension after the last dot, or "" when the name has none. */
export const extensionOf = (originalname: string): string => {
  const dot = originalname.lastIndexOf(".");
  return dot < 0 ? "" : originalname.slice(dot + 1).trim().toLowerCase();
};

/**
 * The checks in the order of the design: the extension is on the list; the first bytes agree with it; for a zip-based
 * format the entry inside agrees with it. Refused with FILE_REJECTED (400) and a message that says what to do and names
 * nothing of the file (the extension in it is the whitelist's own, lower case).
 */
export const checkDocumentFile = (originalname: string, buffer: Buffer): AcceptedDocumentFile => {
  if (originalname.trim().length === 0) {
    throw rejected(NAME_REQUIRED_MESSAGE);
  }
  const extension = extensionOf(originalname);
  const rule = Object.prototype.hasOwnProperty.call(DOCUMENT_FILE_RULES, extension) ? DOCUMENT_FILE_RULES[extension] : undefined;
  if (!rule) {
    throw rejected(unsupportedTypeMessage());
  }
  if (!rule.signature(buffer.subarray(0, 16), buffer)) {
    throw rejected(notValidMessage(extension));
  }
  if (rule.container) {
    const state = containerState(buffer, rule.container);
    if (state === "damaged") {
      throw rejected(damagedArchiveMessage(extension));
    }
    if (state === "mismatch") {
      throw rejected(notValidMessage(extension));
    }
  }
  return { extension, documenttypeid: rule.documenttypeid, contentType: rule.contentType };
};

/** The key a stored object gets: the row's own id and the lower-case extension. No user text. */
export const storageKey = (documentid: string, extension: string): string => `${documentid}.${extension}`;

/** The structured size line of one accepted upload: the type id and the byte size, nothing else. */
export const uploadSizeLog = (documenttypeid: number, bytes: number): { message: string; meta: { documenttypeid: number; bytes: number } } => ({
  message: "Document uploaded",
  meta: { documenttypeid, bytes },
});

// ---- title, licence, attribution --------------------------------------------------------------------------------

/** The closed list, the bounds and the student API's own normalisers live in `src/constants/media-library.ts`. */
export const UNSPECIFIED_LICENCE = DEFAULT_DOCUMENT_LICENCE;
export const MAX_TITLE_LENGTH = DOCUMENT_TITLE_MAX;
export const MAX_ATTRIBUTION_BYTES = ATTRIBUTION_MAX_BYTES;
const ATTRIBUTION_LIMITS = { author: ATTRIBUTION_AUTHOR_MAX, sourceurl: ATTRIBUTION_SOURCEURL_MAX, adaptedfrom: ATTRIBUTION_ADAPTEDFROM_MAX } as const;
/** What a refused source address is told. */
export const SOURCEURL_MESSAGE = "The source address must start with http:// or https://.";
/** How a person reads the attribution's three texts (the refusals name them so; the `field` of a refusal stays the request's key). */
const ATTRIBUTION_LABELS = { author: "author", sourceurl: "source address", adaptedfrom: "adapted-from" } as const;
const ATTRIBUTION_KEYS = ["v", "author", "sourceurl", "adaptedfrom"] as const;
// Control characters, and the line and paragraph separators: central refuses these in what a person types (the student API
// refuses the control characters of a title; it checks no text of an attribution for them). Stricter, never looser.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

export interface DocumentAttribution {
  v: number;
  author?: string;
  sourceurl?: string;
  adaptedfrom?: string;
}

const fieldError = (field: string, message: string): ValidationFieldError => ({ field, message });

/** A trimmed title that is kept: at most 255 UTF-16 code units (as Joi counts them), no control characters, stored as sent. */
export const titleError = (value: string): string | null => {
  if (value.length === 0) {
    return "The title can't be empty.";
  }
  if (value.length > MAX_TITLE_LENGTH) {
    return `The title can be at most ${MAX_TITLE_LENGTH} characters.`;
  }
  if (CONTROL_CHARACTERS.test(value)) {
    return "The title can't contain control characters.";
  }
  return null;
};

export { DOCUMENT_LICENCES, isDocumentLicence };

export interface AttributionResult {
  /** The object to store: the keys that have a value, with v; null when no key has one. */
  value: DocumentAttribution | null;
  errors: ValidationFieldError[];
}

/**
 * Rules of section 6: an object; `v` is 1; only the three keys; each a string within its limit; `sourceurl` an http or
 * https URL; an empty string is an absent key; an object with no key is null; at most 4 KiB serialised.
 */
export const attributionResult = (input: unknown): AttributionResult => {
  const field = "documentattribution";
  const bad = (message: string): AttributionResult => ({ value: null, errors: [fieldError(field, message)] });
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return bad("The attribution must be an object.");
  }
  const given = input as Record<string, unknown>;
  const unknown = Object.keys(given).filter((k) => !(ATTRIBUTION_KEYS as readonly string[]).includes(k));
  if (unknown.length > 0) {
    return bad("The attribution has a field that isn't allowed.");
  }
  if (given.v !== ATTRIBUTION_VERSION) {
    return bad(`The attribution version must be ${ATTRIBUTION_VERSION}.`);
  }
  const out: DocumentAttribution = { v: ATTRIBUTION_VERSION };
  for (const key of ["author", "sourceurl", "adaptedfrom"] as const) {
    const raw = given[key];
    if (raw === undefined || raw === null) {
      continue;
    }
    if (typeof raw !== "string") {
      return bad(`The ${ATTRIBUTION_LABELS[key]} must be text.`);
    }
    const text = raw.trim();
    if (text.length === 0) {
      continue;
    }
    if (text.length > ATTRIBUTION_LIMITS[key]) {
      return bad(`The ${ATTRIBUTION_LABELS[key]} is too long.`);
    }
    if (CONTROL_CHARACTERS.test(text)) {
      return bad(`The ${ATTRIBUTION_LABELS[key]} can't contain control characters.`);
    }
    if (key === "sourceurl") {
      // the student API's own rule for an address (an absolute http(s) address with its scheme, `//` and a host), asked of its
      // normaliser so there is one rule; central also refuses white space inside an address
      if (/\s/.test(text) || !normaliseDocumentAttribution({ v: ATTRIBUTION_VERSION, sourceurl: text }).ok) {
        return bad(SOURCEURL_MESSAGE);
      }
    }
    out[key] = text;
  }
  if (Object.keys(out).length === 1) {
    return { value: null, errors: [] };
  }
  if (Buffer.byteLength(JSON.stringify(out), "utf8") > MAX_ATTRIBUTION_BYTES) {
    return bad("The attribution is too large (4 KiB at most).");
  }
  // what is stored is what the student API's import would store from it, and it must accept it
  const normalised = normaliseDocumentAttribution(out);
  if (!normalised.ok) {
    return bad("The attribution isn't allowed.");
  }
  return { value: normalised.value as DocumentAttribution | null, errors: [] };
};

export interface DocumentMetadataInput {
  /** `undefined`: not given. `null`: clear it (title and attribution; a licence cannot be cleared except by 'unspecified'). */
  documenttitle?: string | null;
  documentlicence?: string | null;
  documentattribution?: unknown;
}

export interface DocumentMetadata {
  documenttitle?: string | null;
  documentlicence?: string;
  documentattribution?: DocumentAttribution | null;
}

/**
 * The metadata of a PUT (and of an upload, once its text fields are parsed): only the fields given are returned, valid
 * or refused. Messages never echo what was sent.
 */
export const documentMetadata = (input: DocumentMetadataInput): { values: DocumentMetadata; errors: ValidationFieldError[] } => {
  const values: DocumentMetadata = {};
  const errors: ValidationFieldError[] = [];
  if (input.documenttitle !== undefined) {
    if (input.documenttitle === null) {
      values.documenttitle = null;
    } else if (typeof input.documenttitle !== "string") {
      errors.push(fieldError("documenttitle", "The title must be text."));
    } else {
      const title = input.documenttitle.trim();
      // as the student API's import normalises a title: trimmed, and nothing left is no title (the name is shown)
      const problem = title.length === 0 ? null : titleError(title);
      if (problem) {
        errors.push(fieldError("documenttitle", problem));
      } else {
        values.documenttitle = title.length === 0 ? null : title;
      }
    }
  }
  if (input.documentlicence !== undefined) {
    if (!isDocumentLicence(input.documentlicence)) {
      errors.push(fieldError("documentlicence", "That licence isn't one of the allowed values."));
    } else {
      values.documentlicence = input.documentlicence;
    }
  }
  if (input.documentattribution !== undefined) {
    if (input.documentattribution === null) {
      values.documentattribution = null;
    } else {
      const result = attributionResult(input.documentattribution);
      errors.push(...result.errors);
      if (result.errors.length === 0) {
        values.documentattribution = result.value;
      }
    }
  }
  return { values, errors };
};
