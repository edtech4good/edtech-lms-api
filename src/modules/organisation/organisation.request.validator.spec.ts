import { ExecutionContext } from "@nestjs/common";
import { SchemaValidationInterceptor } from "src/interceptors";
import { RequestValidator } from "src/models/RequestValidator";
import { ValidationException } from "src/models/ValidationException";
import {
  createorganisation,
  deleteorganisation,
  showallorganisation,
  showorganisation,
  updateorganisation,
} from "./organisation.request.validator";

/**
 * Request-shape validation, run through the real SchemaValidationInterceptor so
 * the field names and messages are what a client receives. Rules that need the
 * database are in organisation.business.validator.spec.ts.
 */
const UUID = "11111111-1111-4111-8111-111111111111";
const COUNTRY = "22222222-2222-4222-8222-222222222222";

const run = (schema: RequestValidator, request: { body?: unknown; params?: unknown; query?: unknown }) => {
  const ctx = {
    switchToHttp: () => ({ getRequest: () => ({ body: {}, params: {}, query: {}, ...request }) }),
  } as unknown as ExecutionContext;
  try {
    new SchemaValidationInterceptor(schema).intercept(ctx, { handle: () => "ok" as never });
    return [];
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationException);
    return (e as ValidationException).fields;
  }
};

/** The distinct invalid field names (one field can fail more than one rule). */
const fieldsOf = (schema: RequestValidator, request: object) => [
  ...new Set(run(schema, request).map((f) => f.field)),
];

const create = (over: Record<string, unknown> = {}, drop: string[] = []) => {
  const body: Record<string, unknown> = {
    organisationname: "Sample Network",
    organisationcode: "samplenet1",
    organisationshortname: "SN",
    organisationpreset: "schoolnetwork",
    countryids: [COUNTRY],
    ...over,
  };
  drop.forEach((k) => delete body[k]);
  return { body };
};

const update = (over: Record<string, unknown> = {}, drop: string[] = []) => {
  const body: Record<string, unknown> = {
    organisationname: "Sample Network",
    organisationshortname: "SN",
    countryids: [COUNTRY],
    ...over,
  };
  drop.forEach((k) => delete body[k]);
  return { body, params: { organisationid: UUID } };
};

describe("createorganisation", () => {
  it("accepts a minimal valid body, and one with every optional field", () => {
    expect(run(createorganisation, create())).toEqual([]);
    expect(
      run(
        createorganisation,
        create({
          uitheme: "corporate",
          brandingconfig: { logourl: "https://example.com/l.png", displayname: "Sample", tilecolour: "#a1B2c3" },
        }),
      ),
    ).toEqual([]);
    expect(run(createorganisation, create({ brandingconfig: null }))).toEqual([]);
  });

  it("requires name, code, short name, preset and country ids", () => {
    for (const key of ["organisationname", "organisationcode", "organisationshortname", "organisationpreset", "countryids"]) {
      expect(fieldsOf(createorganisation, create({}, [key]))).toEqual([key]);
    }
  });

  describe("organisationname", () => {
    it("allows 250 characters, refuses 251", () => {
      expect(run(createorganisation, create({ organisationname: "a".repeat(250) }))).toEqual([]);
      expect(fieldsOf(createorganisation, create({ organisationname: "a".repeat(251) }))).toEqual(["organisationname"]);
    });
    it("refuses blank text and control characters", () => {
      expect(fieldsOf(createorganisation, create({ organisationname: "   " }))).toEqual(["organisationname"]);
      expect(fieldsOf(createorganisation, create({ organisationname: "" }))).toEqual(["organisationname"]);
      expect(fieldsOf(createorganisation, create({ organisationname: "a\nb" }))).toEqual(["organisationname"]);
      expect(fieldsOf(createorganisation, create({ organisationname: "a\u0000b" }))).toEqual(["organisationname"]);
    });
    it("accepts Khmer text", () => {
      expect(run(createorganisation, create({ organisationname: "ក្រុមហ៊ុន សាកល្បង" }))).toEqual([]);
    });
    it("refuses a non-string", () => {
      expect(fieldsOf(createorganisation, create({ organisationname: 5 }))).toEqual(["organisationname"]);
    });
  });

  describe("organisationcode: 2-16 lowercase letters and digits", () => {
    it.each(["ab", "a1", "12", "samplenet1", "a".repeat(16)])("accepts %s", (code) => {
      expect(run(createorganisation, create({ organisationcode: code }))).toEqual([]);
    });
    it.each([
      ["one character", "a"],
      ["17 characters", "a".repeat(17)],
      ["uppercase", "ABc"],
      ["hyphen", "my-org"],
      ["underscore", "my_org"],
      ["space", "my org"],
      ["dot", "a.b"],
      ["Khmer letters", "កខ"],
      ["accented letter", "café"],
      ["empty", ""],
    ])("refuses %s", (_name, code) => {
      expect(fieldsOf(createorganisation, create({ organisationcode: code }))).toEqual(["organisationcode"]);
    });
  });

  describe("organisationshortname: 2-3 letters", () => {
    it.each(["SN", "sn", "Sn", "ABC", "ខម", "កខគ"])("accepts %s", (name) => {
      expect(run(createorganisation, create({ organisationshortname: name }))).toEqual([]);
    });
    it.each(["A", "ABCD", "A1", "12", "A B", "A-", ""])("refuses %j", (name) => {
      expect(fieldsOf(createorganisation, create({ organisationshortname: name }))).toEqual(["organisationshortname"]);
    });
  });

  it("organisationpreset is company or schoolnetwork only", () => {
    expect(run(createorganisation, create({ organisationpreset: "company" }))).toEqual([]);
    expect(run(createorganisation, create({ organisationpreset: "schoolnetwork" }))).toEqual([]);
    for (const bad of ["school", "Company", "", 1, null]) {
      expect(fieldsOf(createorganisation, create({ organisationpreset: bad }))).toEqual(["organisationpreset"]);
    }
  });

  it("uitheme is kids or corporate only - the values schools.uitheme accepts", () => {
    expect(run(createorganisation, create({ uitheme: "kids" }))).toEqual([]);
    expect(run(createorganisation, create({ uitheme: "corporate" }))).toEqual([]);
    for (const bad of ["dark", "Kids", "", null]) {
      expect(fieldsOf(createorganisation, create({ uitheme: bad }))).toEqual(["uitheme"]);
    }
  });

  describe("brandingconfig", () => {
    it("refuses a logo that is not an http(s) URL - never javascript: or data:", () => {
      for (const logourl of ["javascript:alert(1)", "data:text/html;base64,AAAA", "ftp://example.com/a.png", "not a url"]) {
        expect(fieldsOf(createorganisation, create({ brandingconfig: { logourl } }))).toEqual(["brandingconfig.logourl"]);
      }
    });
    it("refuses a colour that is not #rrggbb, an over-long display name, and unknown keys", () => {
      expect(fieldsOf(createorganisation, create({ brandingconfig: { tilecolour: "red" } }))).toEqual(["brandingconfig.tilecolour"]);
      expect(fieldsOf(createorganisation, create({ brandingconfig: { tilecolour: "#12345" } }))).toEqual(["brandingconfig.tilecolour"]);
      expect(fieldsOf(createorganisation, create({ brandingconfig: { displayname: "a".repeat(251) } }))).toEqual(["brandingconfig.displayname"]);
      expect(fieldsOf(createorganisation, create({ brandingconfig: { evil: 1 } }))).toEqual(["body"]);
    });
    it("refuses a non-object", () => {
      expect(fieldsOf(createorganisation, create({ brandingconfig: "x" }))).toEqual(["brandingconfig"]);
    });
  });

  describe("countryids", () => {
    it("needs at least one, as a list of uuids", () => {
      expect(fieldsOf(createorganisation, create({ countryids: [] }))).toEqual(["countryids"]);
      expect(fieldsOf(createorganisation, create({ countryids: COUNTRY }))).toEqual(["countryids"]);
      expect(fieldsOf(createorganisation, create({ countryids: ["abc"] }))).toEqual(["countryids.0"]);
      expect(fieldsOf(createorganisation, create({ countryids: [5] }))).toEqual(["countryids.0"]);
    });
    it("is capped, so a request cannot ask the database for thousands of rows", () => {
      const many = Array.from({ length: 251 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
      expect(fieldsOf(createorganisation, create({ countryids: many }))).toEqual(["countryids"]);
    });
  });

  it("refuses settingsconfig: it is not writable through the API", () => {
    expect(fieldsOf(createorganisation, create({ settingsconfig: { a: 1 } }))).toEqual(["settingsconfig"]);
    expect(fieldsOf(createorganisation, create({ settingsconfig: null }))).toEqual(["settingsconfig"]);
  });

  it("refuses any field it does not define, including organisationstatus and organisationid, without echoing the key", () => {
    for (const extra of [{ organisationstatus: false }, { organisationid: UUID }, { isdeleted: true }, { "evil<x>": 1 }]) {
      const fields = run(createorganisation, create(extra));
      expect(fields).toEqual([{ field: "body", message: "This request contains a field that isn't allowed." }]);
    }
  });

  it("reports every invalid field at once", () => {
    expect(fieldsOf(createorganisation, create({ organisationcode: "A", organisationshortname: "X", countryids: [] })).sort()).toEqual([
      "countryids",
      "organisationcode",
      "organisationshortname",
    ]);
  });
});

describe("updateorganisation", () => {
  it("accepts the core fields, and every optional one", () => {
    expect(run(updateorganisation, update())).toEqual([]);
    expect(
      run(
        updateorganisation,
        update({ uitheme: "kids", organisationstatus: false, brandingconfig: null, organisationcode: "samplenet1", organisationpreset: "company" }),
      ),
    ).toEqual([]);
  });

  it("requires name, short name and country ids; the code and preset are NOT required", () => {
    for (const key of ["organisationname", "organisationshortname", "countryids"]) {
      expect(fieldsOf(updateorganisation, update({}, [key]))).toEqual([key]);
    }
  });

  it("organisationstatus must be a real boolean", () => {
    expect(run(updateorganisation, update({ organisationstatus: true }))).toEqual([]);
    expect(fieldsOf(updateorganisation, update({ organisationstatus: "false" }))).toEqual(["organisationstatus"]);
    expect(fieldsOf(updateorganisation, update({ organisationstatus: 0 }))).toEqual(["organisationstatus"]);
  });

  it("applies the same name, short-name, theme, branding and country rules as create", () => {
    expect(fieldsOf(updateorganisation, update({ organisationname: "a".repeat(251) }))).toEqual(["organisationname"]);
    expect(fieldsOf(updateorganisation, update({ organisationshortname: "ABCD" }))).toEqual(["organisationshortname"]);
    expect(fieldsOf(updateorganisation, update({ uitheme: "dark" }))).toEqual(["uitheme"]);
    expect(fieldsOf(updateorganisation, update({ brandingconfig: { logourl: "javascript:1" } }))).toEqual(["brandingconfig.logourl"]);
    expect(fieldsOf(updateorganisation, update({ countryids: [] }))).toEqual(["countryids"]);
  });

  it("refuses settingsconfig and unknown fields", () => {
    expect(fieldsOf(updateorganisation, update({ settingsconfig: {} }))).toEqual(["settingsconfig"]);
    expect(fieldsOf(updateorganisation, update({ organisationid: UUID }))).toEqual(["body"]);
  });

  it("needs a uuid in the path", () => {
    expect(fieldsOf(updateorganisation, { ...update(), params: { organisationid: "nope" } })).toEqual(["organisationid"]);
  });
});

describe("show / delete / list", () => {
  it("show and delete need a uuid", () => {
    expect(run(showorganisation, { params: { organisationid: UUID } })).toEqual([]);
    expect(run(deleteorganisation, { params: { organisationid: UUID } })).toEqual([]);
    expect(fieldsOf(showorganisation, { params: { organisationid: "1' OR '1'='1" } })).toEqual(["organisationid"]);
    expect(fieldsOf(deleteorganisation, { params: { organisationid: "x" } })).toEqual(["organisationid"]);
  });

  it("list takes pageindex (>=0), pagesize (0-200) and an optional name filter, as query strings", () => {
    expect(run(showallorganisation, { query: {} })).toEqual([]);
    expect(run(showallorganisation, { query: { pageindex: "2", pagesize: "200", organisationname: "sam" } })).toEqual([]);
    expect(run(showallorganisation, { query: { organisationname: "" } })).toEqual([]);
    expect(fieldsOf(showallorganisation, { query: { pagesize: "201" } })).toEqual(["pagesize"]);
    expect(fieldsOf(showallorganisation, { query: { pageindex: "-1" } })).toEqual(["pageindex"]);
    expect(fieldsOf(showallorganisation, { query: { pageindex: "abc" } })).toEqual(["pageindex"]);
    expect(fieldsOf(showallorganisation, { query: { pagesize: "1.5" } })).toEqual(["pagesize"]);
    expect(fieldsOf(showallorganisation, { query: { organisationname: "a".repeat(251) } })).toEqual(["organisationname"]);
  });

  it("list refuses query parameters it does not define", () => {
    expect(fieldsOf(showallorganisation, { query: { isdeleted: "true" } })).toEqual(["query"]);
    expect(fieldsOf(showallorganisation, { query: { organisationid: UUID } })).toEqual(["query"]);
  });
});
