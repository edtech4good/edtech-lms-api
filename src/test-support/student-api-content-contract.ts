import joi from "joi";

/**
 * Test support: what the student API accepts as one organisation's content (format 3).
 *
 * This is a PORT of the student API's own check, kept here so the payload this API builds is run through the same rules
 * without importing across repositories. Source: edtech-lms-rpi-api, branch `feat/organisations-s3-format3`,
 * `src/modules/import/organisation-content.validator.ts` (`validateOrganisationContent`, `CONTENT_TABLES`) and the
 * `organisation` row schema of `src/modules/import/ownership.request.validator.ts`, as of commit f7f1bf9. The same
 * rules, in the same order; the differences are only that problems are returned as a list instead of thrown as a 400,
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
  | "lessonplans"
  | "lessonpractices"
  | "lessonquizzes"
  | "lessonpracticequestions"
  | "lessonquizquestions"
  | "levelquizquestions"
  | "questions"
  | "documents"
  | "subjects";

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
