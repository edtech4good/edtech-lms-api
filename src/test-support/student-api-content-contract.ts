import joi from "joi";
import {
  ANSWER_BEARING_FIELDS,
  FEEDBACK_KEYS,
  LANGUAGE_CODE,
  NO_SUBKEY,
  SUBKEYED_FIELDS,
  SUBKEY_MAX_LENGTH,
  TRANSLATABLE_FIELDS,
  TRANSLATION_TEXT_MAX_BYTES,
  isAnswerBearing,
} from "src/constants/content-translations";
import {
  DOCUMENT_LICENCES,
  DOCUMENT_TITLE_MAX,
  isDocumentLicence,
  normaliseDocumentAttribution,
  normaliseDocumentTitle,
  VIDEO_DOCUMENT_TYPE_ID,
} from "src/constants/media-library";

/**
 * Test support: what the student API accepts as one organisation's content (format 3).
 *
 * This is a PORT of the student API's own check, kept here so the payload this API builds is run through the same rules
 * without importing across repositories. Source: edtech-lms-rpi-api, `main`,
 * `src/modules/import/organisation-content.validator.ts` (`validateOrganisationContent`, `CONTENT_TABLES`),
 * `src/constants/learning-items.ts` and the `organisation` row schema of `src/modules/import/ownership.request.validator.ts`,
 * as of the learning-items change (LI-2) and the media-library change (ML-1: a video item's document is a VIDEO document;
 * the title, licence and attribution of a document when the row carries them; the rules and their messages are the student API's,
 * through `src/constants/media-library.ts`, which is the same file in both repositories), and the bilingual-content change
 * (B-1, edtech-lms-rpi-api `feat/content-translations` at 63e1da6: the `contenttranslations` table kind, `organisations[0].contentlanguage`,
 * and the rules of `src/constants/content-translations.ts`, which is the same file in both repositories). The same rules, in the same order; the differences are only that problems are returned as a list instead of thrown as a 400,
 * and that the messages are shortened. When the student API's validator changes, change this with it.
 *
 * Two kinds of rule about the lists of ids a row holds (`schools.curriculums`, `curriculumbaselines.schoolid`):
 *  - the student API's validator only checks that each is a list of ids (the import then refuses an entry owned by
 *    another organisation and drops the rest);
 *  - central's own, stricter rule (`LISTS`; organisation-content-export.ts trims to it): the entries name only rows of
 *    the payload. It is not the student API's rule.
 */

const CONTENT_FORMAT = 3;
const CONTENT_SCOPE = "organisation";
const MAX_ROWS_PER_TABLE = 200000;
const ID_MAX_LENGTH = 36;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORGANISATION_CODE = /^[a-z0-9]{2,16}$/;
const UI_THEMES = ["kids", "corporate"];
/** Control characters, and the bidirectional controls that reorder displayed text (U+202A to U+202E, U+2066 to U+2069). Zero-width joiners stay: Khmer text uses them. */
const FORBIDDEN_IN_NAME = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
/**
 * Learning items (the student API's `src/constants/learning-items.ts`). Phase 0 knows one type, `video`: its row must
 * name a primary document and have no body. A type the student API does not know is refused.
 */
const LEARNING_ITEM_TYPES = ["video"] as const;
const LEARNING_ITEM_RULES: Record<(typeof LEARNING_ITEM_TYPES)[number], { documentRequired: boolean; bodyMustBeNull: boolean }> = {
  video: { documentRequired: true, bodyMustBeNull: true },
};
/** What a link row (`lessonlearningdocuments`) may be for. */
const LEARNING_DOCUMENT_ROLES = ["rendition", "asset"] as const;
const isLearningItemType = (value: unknown): value is (typeof LEARNING_ITEM_TYPES)[number] =>
  typeof value === "string" && (LEARNING_ITEM_TYPES as readonly string[]).includes(value);
/** The serialised settings JSON may be at most this many BYTES (not characters: Khmer text is 3 bytes a character). */
const MAX_SETTINGS_BYTES = 64 * 1024;

export type TableKey =
  | "schools"
  | "standards"
  | "countries"
  | "curriculums"
  | "curriculumbaselines"
  | "baselinequestion"
  | "grades"
  | "levels"
  | "lessons"
  | "lessonlearnings"
  | "lessonlearningdocuments"
  | "lessonplans"
  | "lessonpractices"
  | "lessonquizzes"
  | "lessonpracticequestions"
  | "lessonquizquestions"
  | "levelquizquestions"
  | "questions"
  | "documents"
  | "subjects"
  | "contenttranslations";

interface Reference {
  fk: string;
  to: TableKey;
  optional?: boolean;
}
interface TableSpec {
  pk: string;
  kind: "owned" | "inherited" | "global";
  parent?: Reference;
  refs?: Reference[];
  /** An owned row that names its parent row by a table name column and an id column (translations). */
  polymorphic?: { tablefield: string; idfield: string };
}

export const CONTENT_TABLES: Record<TableKey, TableSpec> = {
  countries: { pk: "countryid", kind: "global" },
  schools: { pk: "schoolid", kind: "owned", refs: [{ fk: "countryid", to: "countries", optional: true }] },
  standards: { pk: "standardid", kind: "inherited", parent: { fk: "schoolid", to: "schools" } },
  subjects: { pk: "subjectid", kind: "owned" },
  curriculums: { pk: "curriculumid", kind: "owned", refs: [{ fk: "subjectid", to: "subjects", optional: true }] },
  questions: { pk: "questionid", kind: "owned" },
  documents: { pk: "documentid", kind: "owned" },
  curriculumbaselines: { pk: "curriculumbaselineid", kind: "inherited", parent: { fk: "curriculumid", to: "curriculums" } },
  baselinequestion: {
    pk: "baselinequestionid",
    kind: "inherited",
    parent: { fk: "curriculumbaselineid", to: "curriculumbaselines" },
    refs: [{ fk: "questionid", to: "questions" }],
  },
  grades: { pk: "gradeid", kind: "inherited", parent: { fk: "curriculumid", to: "curriculums" } },
  levels: { pk: "levelid", kind: "inherited", parent: { fk: "gradeid", to: "grades" } },
  lessons: { pk: "lessonid", kind: "inherited", parent: { fk: "levelid", to: "levels" } },
  lessonlearnings: {
    pk: "lessonlearningid",
    kind: "inherited",
    parent: { fk: "lessonid", to: "lessons" },
    refs: [{ fk: "documentid", to: "documents", optional: true }],
  },
  lessonlearningdocuments: {
    pk: "lessonlearningdocumentid",
    kind: "inherited",
    parent: { fk: "lessonlearningid", to: "lessonlearnings" },
    refs: [{ fk: "documentid", to: "documents" }],
  },
  lessonplans: {
    pk: "lessonplanid",
    kind: "inherited",
    parent: { fk: "lessonid", to: "lessons" },
    refs: [{ fk: "documentid", to: "documents", optional: true }],
  },
  lessonpractices: { pk: "lessonpracticeid", kind: "inherited", parent: { fk: "lessonid", to: "lessons" } },
  lessonquizzes: { pk: "lessonquizid", kind: "inherited", parent: { fk: "lessonid", to: "lessons" } },
  lessonpracticequestions: {
    pk: "lessonpracticequestionid",
    kind: "inherited",
    parent: { fk: "lessonpracticeid", to: "lessonpractices" },
    refs: [{ fk: "questionid", to: "questions" }],
  },
  lessonquizquestions: {
    pk: "lessonquizquestionid",
    kind: "inherited",
    parent: { fk: "lessonquizid", to: "lessonquizzes" },
    refs: [{ fk: "questionid", to: "questions" }],
  },
  levelquizquestions: {
    pk: "levelquizquestionid",
    kind: "inherited",
    parent: { fk: "levelid", to: "levels" },
    refs: [
      { fk: "questionid", to: "questions" },
      { fk: "lessonid", to: "lessons", optional: true },
    ],
  },
  // the LAST key
  contenttranslations: { pk: "translationid", kind: "owned", polymorphic: { tablefield: "tablename", idfield: "rowid" } },
};

/** Columns that hold a list of ids of rows of the payload (central's rule: see the top of this file). */
const LISTS: Array<{ table: TableKey; column: string; to: TableKey }> = [
  { table: "schools", column: "curriculums", to: "curriculums" },
  { table: "curriculumbaselines", column: "schoolid", to: "schools" },
];

export const TABLE_KEYS = Object.keys(CONTENT_TABLES) as TableKey[];
export const HEADER_KEYS = ["format", "organisationid", "organisationcode", "scope", "organisations"];
const ROSTER_KEYS = new Set(["students", "studentusers", "schoolusers", "teachers", "logins", "users", "studentprogress", "studentprogresses", "studentpoints", "tokens"]);

const displayText = (value: string, helpers: joi.CustomHelpers) =>
  !FORBIDDEN_IN_NAME.test(value) && HAS_LETTER_OR_DIGIT.test(value) ? value : helpers.error("string.pattern.base");

const id = joi.string().pattern(UUID);
const logourl = joi
  .string()
  .max(2048)
  .uri({ scheme: ["https"] })
  .custom((value, helpers) => ((/^https:\/\/([^/?#]*)/i.exec(value)?.[1] ?? "").includes("@") ? helpers.error("string.uri") : value));
const brandingconfig = joi
  .object({
    logourl,
    displayname: joi.string().min(1).max(250).custom(displayText),
    tilecolour: joi.string().pattern(/^#[0-9a-fA-F]{6}$/),
  })
  .allow(null)
  .required();
const settingsconfig = joi
  .object()
  .unknown(true)
  .custom((value, helpers) => (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_SETTINGS_BYTES ? helpers.message({ custom: "settingsconfig is too large" }) : value))
  .allow(null)
  .required();
const organisationRow = joi.object({
  organisationid: id.required(),
  organisationname: joi.string().min(1).max(250).custom(displayText).required(),
  organisationcode: joi.string().pattern(ORGANISATION_CODE).required(),
  organisationstatus: joi.boolean().strict().required(),
  uitheme: joi
    .string()
    .valid(...UI_THEMES)
    .required(),
  brandingconfig,
  settingsconfig,
  // optional (an older sender has none); null for "no translations yet"
  contentlanguage: joi.string().pattern(LANGUAGE_CODE).allow(null),
  isdeleted: joi.boolean().strict().required(),
});

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= ID_MAX_LENGTH;
const lower = (value: string) => value.toLowerCase();

/** Every problem the student API would find in the body; an empty list means it accepts it. */
export function contentProblems(body: unknown): string[] {
  const problems: string[] = [];
  if (!isRow(body)) {
    return ["body: The content payload must be a JSON object."];
  }
  if (body.format !== CONTENT_FORMAT) problems.push("format must be 3");
  if (body.scope !== CONTENT_SCOPE) problems.push('scope must be "organisation"');
  const headerId = typeof body.organisationid === "string" && UUID.test(body.organisationid) ? body.organisationid : null;
  if (!headerId) problems.push("organisationid must be an organisation's id (a uuid)");
  const headerCode = typeof body.organisationcode === "string" && ORGANISATION_CODE.test(body.organisationcode) ? body.organisationcode : null;
  if (!headerCode) problems.push("organisationcode must be 2 to 16 lower-case letters and digits");

  const allowed = new Set<string>([...HEADER_KEYS, ...TABLE_KEYS]);
  for (const key of Object.keys(body)) {
    if (ROSTER_KEYS.has(key)) problems.push(`${key}: learners and logins are not part of a content payload`);
    else if (!allowed.has(key)) problems.push(`${key} is not part of a content payload`);
  }

  if (!Array.isArray(body.organisations) || body.organisations.length !== 1) {
    problems.push("organisations must hold exactly one row");
  } else {
    const { error } = organisationRow.validate(body.organisations[0], { abortEarly: true, convert: false });
    if (error) {
      problems.push(`organisations.0: ${error.details[0].message}`);
    } else {
      const row = body.organisations[0] as Row;
      if (headerId && lower(String(row.organisationid)) !== lower(headerId)) problems.push("The organisation row is not the organisation named in the header");
      if (headerCode && row.organisationcode !== headerCode) problems.push("The organisation row's code is not the organisationcode in the header");
    }
  }

  const tables = {} as Record<TableKey, Row[]>;
  for (const key of TABLE_KEYS) {
    const value = body[key];
    if (!Array.isArray(value)) problems.push(`${key} must be an array`);
    else if (value.length > MAX_ROWS_PER_TABLE) problems.push(`${key} has too many rows`);
    else tables[key] = value as Row[];
  }

  const idsOf = {} as Record<TableKey, Set<string>>;
  for (const key of TABLE_KEYS) {
    const list = tables[key];
    if (!list) continue;
    const { pk, kind } = CONTENT_TABLES[key];
    const seen = new Set<string>();
    let notRows = 0;
    let noId = 0;
    let duplicates = 0;
    let foreign = 0;
    let ownerless = 0;
    for (const row of list) {
      if (!isRow(row)) {
        notRows += 1;
        continue;
      }
      const rowId = row[pk];
      if (!isId(rowId)) noId += 1;
      else if (seen.has(lower(rowId))) duplicates += 1;
      else seen.add(lower(rowId));
      const owner = row.organisationid;
      if (kind === "owned") {
        if (owner === undefined || owner === null || owner === "") ownerless += 1;
        else if (typeof owner !== "string" || !headerId || lower(owner) !== lower(headerId)) foreign += 1;
      } else if (owner !== undefined && owner !== null && owner !== "" && (typeof owner !== "string" || !headerId || lower(owner) !== lower(headerId))) {
        foreign += 1;
      }
    }
    idsOf[key] = seen;
    if (notRows) problems.push(`${key}: ${notRows} not an object`);
    if (noId) problems.push(`${key}: ${noId} with no valid ${pk}`);
    if (duplicates) problems.push(`${key}: ${duplicates} repeat an id`);
    if (foreign) problems.push(`${key}: ${foreign} belong to another organisation than the header's`);
    if (ownerless) problems.push(`${key}: ${ownerless} carry no organisationid`);
  }

  for (const key of TABLE_KEYS) {
    const list = tables[key];
    if (!list) continue;
    const spec = CONTENT_TABLES[key];
    const references: Array<Reference & { parent: boolean }> = [
      ...(spec.parent ? [{ ...spec.parent, parent: true }] : []),
      ...(spec.refs ?? []).map((r) => ({ ...r, parent: false })),
    ];
    for (const ref of references) {
      const targets = idsOf[ref.to];
      if (!targets) continue;
      let missing = 0;
      for (const row of list) {
        if (!isRow(row)) continue;
        const value = row[ref.fk];
        if (value === undefined || value === null || value === "") {
          if (!ref.optional) missing += 1;
        } else if (typeof value !== "string" || !targets.has(lower(value))) {
          missing += 1;
        }
      }
      if (missing) problems.push(`${key}: ${missing} ${ref.parent ? "hang from" : "point at"} a ${ref.to} row (${ref.fk}) that is not in the payload`);
    }
  }

  // Learning items: the type, the body and the primary document follow the type's rule; a link row has a known role,
  // a whole-number order, and is the only one of its (learning, document) pair. The student API checks nothing else of
  // an item or a link row: in particular it ACCEPTS link rows on a `video` item (its rule for a video is about the
  // body and the primary document only). Central's own write routes refuse them (a video item takes no extra
  // documents), so the export of a database written through those routes never holds one; the asymmetry is deliberate
  // (the payload contract is the student API's, the authoring rule is central's), and sync-scope.leak.spec.ts pins it.
  let noType = 0;
  let unknownType = 0;
  let bodyNotNull = 0;
  let noDocument = 0;
  let videoNotVideo = 0;
  // the documents of the payload by id: a video item's file must be a VIDEO document
  const documentTypes = new Map<string, unknown>();
  for (const doc of tables.documents ?? []) {
    if (isRow(doc) && isId(doc.documentid)) documentTypes.set(lower(doc.documentid), doc.documenttypeid);
  }
  for (const row of tables.lessonlearnings ?? []) {
    if (!isRow(row)) continue;
    const type = row.lessonlearningtype;
    if (typeof type !== "string" || type.length === 0) {
      noType += 1;
      continue;
    }
    if (!isLearningItemType(type)) {
      unknownType += 1;
      continue;
    }
    const rule = LEARNING_ITEM_RULES[type];
    if (rule.bodyMustBeNull && row.lessonlearningbody !== undefined && row.lessonlearningbody !== null) bodyNotNull += 1;
    if (rule.documentRequired && (row.documentid === undefined || row.documentid === null || row.documentid === "")) noDocument += 1;
    // a document that is not in the payload is reported as a missing reference above, not here
    if (type === "video" && typeof row.documentid === "string" && documentTypes.has(lower(row.documentid))) {
      const documenttypeid = documentTypes.get(lower(row.documentid));
      if (typeof documenttypeid !== "number" || documenttypeid !== VIDEO_DOCUMENT_TYPE_ID) videoNotVideo += 1;
    }
  }
  if (noType) problems.push(`lessonlearnings: ${noType} with no lessonlearningtype (a string)`);
  if (unknownType) problems.push(`lessonlearnings: ${unknownType} with a lessonlearningtype this server does not know (it knows: ${LEARNING_ITEM_TYPES.join(", ")})`);
  if (bodyNotNull) problems.push(`lessonlearnings: ${bodyNotNull} of type video with a lessonlearningbody, which must be null for a video`);
  if (noDocument) problems.push(`lessonlearnings: ${noDocument} with no documentid, and the type of the item needs one`);
  const rows = (n: number) => (n === 1 ? "1 row" : `${n} rows`);
  if (videoNotVideo) {
    problems.push(`lessonlearnings: ${rows(videoNotVideo)} of type video ${videoNotVideo === 1 ? "points" : "point"} at a document that is not a video (its documenttypeid must be ${VIDEO_DOCUMENT_TYPE_ID}).`);
  }

  // Documents: the media-library columns, checked only on a row that carries the column (an export from before the media
  // library has none of them, and still imports; the licence then takes its default).
  let badTitle = 0;
  let nullLicence = 0;
  let unknownLicence = 0;
  let badAttribution = 0;
  for (const doc of tables.documents ?? []) {
    if (!isRow(doc)) continue;
    if (doc.documenttitle !== undefined && !normaliseDocumentTitle(doc.documenttitle).ok) badTitle += 1;
    if (doc.documentlicence !== undefined) {
      if (doc.documentlicence === null) nullLicence += 1;
      else if (!isDocumentLicence(doc.documentlicence)) unknownLicence += 1;
    }
    if (doc.documentattribution !== undefined && !normaliseDocumentAttribution(doc.documentattribution).ok) badAttribution += 1;
  }
  if (badTitle) {
    problems.push(`documents: ${rows(badTitle)} ${badTitle === 1 ? "has" : "have"} a documenttitle that is not a string of at most ${DOCUMENT_TITLE_MAX} characters without control characters.`);
  }
  if (nullLicence) {
    problems.push(`documents: ${rows(nullLicence)} ${nullLicence === 1 ? "has" : "have"} a null documentlicence, which is never empty (leave the key out for the default).`);
  }
  if (unknownLicence) {
    problems.push(`documents: ${rows(unknownLicence)} ${unknownLicence === 1 ? "has" : "have"} a documentlicence this server does not know (it knows: ${DOCUMENT_LICENCES.join(", ")}).`);
  }
  if (badAttribution) {
    problems.push(
      `documents: ${rows(badAttribution)} ${badAttribution === 1 ? "has" : "have"} a documentattribution that is not null or an object of version 1 with only author, sourceurl and adaptedfrom, each within its length (the sourceurl an http or https address, the whole at most 4096 bytes).`,
    );
  }

  let badRole = 0;
  let badOrder = 0;
  let repeatedPairs = 0;
  const pairs = new Set<string>();
  for (const row of tables.lessonlearningdocuments ?? []) {
    if (!isRow(row)) continue;
    if (typeof row.lessonlearningdocumentrole !== "string" || !(LEARNING_DOCUMENT_ROLES as readonly string[]).includes(row.lessonlearningdocumentrole)) badRole += 1;
    const order = row.lessonlearningdocumentorder;
    // a missing order defaults to 0 in the database; an explicit null does not (the column is NOT NULL)
    if (order !== undefined && !(typeof order === "number" && Number.isInteger(order))) badOrder += 1;
    if (typeof row.lessonlearningid === "string" && typeof row.documentid === "string") {
      const pair = `${lower(row.lessonlearningid)}/${lower(row.documentid)}`;
      if (pairs.has(pair)) repeatedPairs += 1;
      else pairs.add(pair);
    }
  }
  if (badRole) problems.push(`lessonlearningdocuments: ${badRole} with a lessonlearningdocumentrole that is not one of ${LEARNING_DOCUMENT_ROLES.join(", ")}`);
  if (badOrder) problems.push(`lessonlearningdocuments: ${badOrder} with a lessonlearningdocumentorder that is not a whole number`);
  if (repeatedPairs) problems.push(`lessonlearningdocuments: ${repeatedPairs} repeat a lessonlearningid and documentid pair`);

  // Translations: each row names its parent by (tablename, rowid), a table and a field that may be translated (and, for a
  // question, a field its template does not grade by), the subkey its field needs, a language other than the
  // organisation's own, a text, the hash of the base text, and when it was written. A row whose parent is not a row of
  // THIS payload is refused (central drops it; this side refuses). The organisation row must carry a contentlanguage.
  const translationRows = tables.contenttranslations ?? [];
  if (translationRows.length > 0) {
    const organisationRowGiven = Array.isArray(body.organisations) && body.organisations.length === 1 && isRow(body.organisations[0]) ? body.organisations[0] : null;
    const baseLanguage = organisationRowGiven && typeof organisationRowGiven.contentlanguage === "string" ? organisationRowGiven.contentlanguage.toLowerCase() : null;
    const templates = new Map<string, unknown>();
    for (const q of tables.questions ?? []) {
      if (isRow(q) && isId(q.questionid)) templates.set(lower(q.questionid), q.templatetypeid);
    }
    let badTable = 0;
    let badField = 0;
    let answerBearing = 0;
    let badSubkey = 0;
    let badLanguage = 0;
    let baseLanguageRows = 0;
    let badText = 0;
    let badHash = 0;
    let badDate = 0;
    let repeated = 0;
    const missingParent = new Map<string, number>();
    const seenTranslations = new Set<string>();
    for (const row of translationRows) {
      if (!isRow(row)) continue;
      const { tablename, rowid, field, subkey, language, text, sourcehash, lastupdated } = row;
      const knownTable = typeof tablename === "string" && Object.prototype.hasOwnProperty.call(TRANSLATABLE_FIELDS, tablename);
      if (!knownTable) badTable += 1;
      const knownField = knownTable && typeof field === "string" && TRANSLATABLE_FIELDS[tablename as string].includes(field);
      if (knownTable && !knownField) badField += 1;
      if (knownField && tablename === "questions" && typeof rowid === "string" && isAnswerBearing(templates.get(lower(rowid)), field as string)) answerBearing += 1;
      if (knownField) {
        const needsSubkey = SUBKEYED_FIELDS.includes(field as string);
        const rule = typeof subkey === "string" && (needsSubkey ? subkey !== NO_SUBKEY && subkey.length <= SUBKEY_MAX_LENGTH : subkey === NO_SUBKEY);
        const feedbackOk = field !== "feedback" || (typeof subkey === "string" && FEEDBACK_KEYS.includes(subkey));
        if (!rule || !feedbackOk) badSubkey += 1;
      }
      if (typeof language !== "string" || !LANGUAGE_CODE.test(language)) badLanguage += 1;
      else if (baseLanguage !== null && language.toLowerCase() === baseLanguage) baseLanguageRows += 1;
      if (typeof text !== "string" || text.length === 0 || Buffer.byteLength(text, "utf8") > TRANSLATION_TEXT_MAX_BYTES) badText += 1;
      if (typeof sourcehash !== "string" || !/^[0-9a-f]{64}$/i.test(sourcehash)) badHash += 1;
      if (typeof lastupdated !== "string" || Number.isNaN(Date.parse(lastupdated))) badDate += 1;
      if (knownTable) {
        if (typeof rowid !== "string" || !idsOf[tablename as TableKey]?.has(lower(rowid))) {
          missingParent.set(tablename as string, (missingParent.get(tablename as string) ?? 0) + 1);
        }
      }
      if (knownField && typeof rowid === "string" && typeof subkey === "string" && typeof language === "string") {
        const key = [tablename, rowid, field, subkey, language].map((v) => String(v).toLowerCase()).join("\u0000");
        if (seenTranslations.has(key)) repeated += 1;
        else seenTranslations.add(key);
      }
    }
    if (baseLanguage === null) problems.push("contenttranslations: the organisation has no contentlanguage; set it before sending translations.");
    if (badTable) problems.push(`contenttranslations: ${rows(badTable)} ${badTable === 1 ? "names" : "name"} a tablename that is not translatable`);
    if (badField) problems.push(`contenttranslations: ${rows(badField)} ${badField === 1 ? "names" : "name"} a field that its table does not have as translatable text`);
    if (answerBearing) {
      const graded = Object.entries(ANSWER_BEARING_FIELDS)
        .map(([template, fields]) => `template ${template}: ${fields.join(", ")}`)
        .join("; ");
      problems.push(`contenttranslations: ${rows(answerBearing)} translate${answerBearing === 1 ? "s" : ""} a field that an answer is graded by (${graded})`);
    }
    if (badSubkey) problems.push(`contenttranslations: ${rows(badSubkey)} ${badSubkey === 1 ? "has" : "have"} a subkey that does not follow its field's rule`);
    if (badLanguage) problems.push(`contenttranslations: ${rows(badLanguage)} ${badLanguage === 1 ? "has" : "have"} a language that is not 2 to 8 letters, digits or hyphens`);
    if (baseLanguageRows) problems.push(`contenttranslations: ${rows(baseLanguageRows)} ${baseLanguageRows === 1 ? "is" : "are"} in the organisation's own contentlanguage`);
    if (badText) problems.push(`contenttranslations: ${rows(badText)} ${badText === 1 ? "has" : "have"} a text that is not a string of 1 to ${TRANSLATION_TEXT_MAX_BYTES} bytes`);
    if (badHash) problems.push(`contenttranslations: ${rows(badHash)} ${badHash === 1 ? "has" : "have"} a sourcehash that is not 64 hexadecimal characters`);
    if (badDate) problems.push(`contenttranslations: ${rows(badDate)} ${badDate === 1 ? "has" : "have"} a lastupdated that is not a date`);
    if (repeated) problems.push(`contenttranslations: ${rows(repeated)} repeat${repeated === 1 ? "s" : ""} a table, row, field, subkey and language that is already in the payload`);
    for (const [table, n] of missingParent) problems.push(`contenttranslations: ${rows(n)} ${n === 1 ? "names" : "name"} a ${table} row (rowid) that is not in the payload`);
  }

  for (const { table, column, to } of LISTS) {
    const list = tables[table];
    const targets = idsOf[to];
    if (!list || !targets) continue;
    let notAList = 0;
    let outside = 0;
    for (const row of list) {
      if (!isRow(row) || row[column] === null || row[column] === undefined) continue;
      const entries = Array.isArray(row[column]) ? (row[column] as unknown[]) : null;
      // the student API's check: a list of ids
      if (entries === null || entries.some((e) => !isId(e))) notAList += 1;
      // central's rule: and only rows of the payload
      if (entries !== null) outside += entries.filter((e) => typeof e !== "string" || !targets.has(lower(e))).length;
    }
    if (notAList) problems.push(`${table}: ${notAList} with a ${column} that is not a list of ${to} ids`);
    if (outside) problems.push(`${table}: ${outside} entries of ${column} name a ${to} row that is not in the payload (central's rule)`);
  }
  return problems;
}
