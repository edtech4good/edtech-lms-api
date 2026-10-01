import { ExecutionContext } from "@nestjs/common";
import { SchemaValidationInterceptor } from "src/interceptors";
import { RequestValidator } from "src/models/RequestValidator";
import { ValidationException } from "src/models/ValidationException";
import {
  isValidShortName,
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
    it("refuses blank text and every control character", () => {
      expect(fieldsOf(createorganisation, create({ organisationname: "   " }))).toEqual(["organisationname"]);
      expect(fieldsOf(createorganisation, create({ organisationname: "" }))).toEqual(["organisationname"]);
      for (const c of ["\n", "\t", "\r", "\u0000", "\u0007", "\u007F", "\u0085"]) {
        expect(fieldsOf(createorganisation, create({ organisationname: `a${c}b` }))).toEqual(["organisationname"]);
      }
    });
    it("refuses the bidirectional controls U+202A-U+202E and U+2066-U+2069 anywhere in the name", () => {
      const bidi = ["\u202A", "\u202B", "\u202C", "\u202D", "\u202E", "\u2066", "\u2067", "\u2068", "\u2069"];
      for (const c of bidi) {
        expect(fieldsOf(createorganisation, create({ organisationname: `Acme${c}Corp` }))).toEqual(["organisationname"]);
        expect(fieldsOf(createorganisation, create({ organisationname: `${c}Acme` }))).toEqual(["organisationname"]);
      }
    });
    it("needs at least one letter or digit: a name of only invisible or punctuation characters is refused", () => {
      for (const name of ["\u200B", "\u200B\u200D\u200C", "---", "..", "!?", "\u200B-\u200B"]) {
        expect(fieldsOf(createorganisation, create({ organisationname: name }))).toEqual(["organisationname"]);
      }
      expect(run(createorganisation, create({ organisationname: "7" }))).toEqual([]);
      expect(run(createorganisation, create({ organisationname: "---a" }))).toEqual([]);
    });
    it("allows zero-width space, joiner and non-joiner INSIDE a name: Khmer text uses them", () => {
      for (const c of ["\u200B", "\u200D", "\u200C"]) {
        expect(run(createorganisation, create({ organisationname: `សាលា${c}កាត់` }))).toEqual([]);
        expect(run(createorganisation, create({ organisationname: `Acme${c}Corp` }))).toEqual([]);
      }
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

  describe("organisationshortname: 1-3 grapheme clusters of letters and combining marks, at most 12 code points", () => {
    it.each(["MIV", "M", "SN", "sn", "ABC", "សក", "កា", "ក្ស", "សុខា", "កខគ"])("accepts %s", (name) => {
      expect(run(createorganisation, create({ organisationshortname: name }))).toEqual([]);
    });
    it.each([
      ["four letters", "ABCD"],
      ["digits", "12"],
      ["letter then digit", "A1"],
      ["emoji", "🙂"],
      ["letter then emoji", "A🙂"],
      ["empty", ""],
      ["four Khmer clusters", "កខគឃ"],
      ["four Khmer clusters with vowel signs", "សុខាសុខា"],
      ["a space", "A B"],
      ["a hyphen", "A-"],
      ["a leading combining mark", "ុក"],
      ["a zero-width joiner", "ក\u200Dខ"],
      ["a Khmer digit", "១២"],
    ])("refuses %s", (_name, value) => {
      expect(fieldsOf(createorganisation, create({ organisationshortname: value }))).toEqual(["organisationshortname"]);
    });
    it("refuses more than 12 code points even when it is only three clusters", () => {
      // Three clusters, each a consonant plus four subscript/vowel marks: 15 code points.
      const cluster = "ក" + "\u17D2\u1781\u17B6\u17C6";
      expect(isValidShortName(cluster.repeat(2))).toBe(true);
      expect([...cluster.repeat(3)].length).toBeGreaterThan(12);
      expect(isValidShortName(cluster.repeat(3))).toBe(false);
    });
    it("refuses a non-string", () => {
      expect(fieldsOf(createorganisation, create({ organisationshortname: 5 }))).toEqual(["organisationshortname"]);
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
    it("requires an https logo URL: never http:, javascript:, data: or ftp:", () => {
      for (const logourl of [
        "http://example.com/logo.png",
        "javascript:alert(1)",
        "data:text/html;base64,AAAA",
        "ftp://example.com/a.png",
        "not a url",
        "//example.com/logo.png",
      ]) {
        expect(fieldsOf(createorganisation, create({ brandingconfig: { logourl } }))).toEqual(["brandingconfig.logourl"]);
      }
      expect(run(createorganisation, create({ brandingconfig: { logourl: "https://example.com/a/logo.png?v=2" } }))).toEqual([]);
    });
    it("refuses a logo URL with user info, however it is written", () => {
      for (const logourl of [
        "https://user:pass@example.com/logo.png",
        "https://user@example.com/logo.png",
        "https://@example.com/logo.png",
        "https://example.com@evil.example/logo.png",
        "https://:pass@example.com/logo.png",
      ]) {
        expect(fieldsOf(createorganisation, create({ brandingconfig: { logourl } }))).toEqual(["brandingconfig.logourl"]);
      }
      // An @ after the host (path, query) is not user info.
      expect(run(createorganisation, create({ brandingconfig: { logourl: "https://example.com/a@b.png?x=y@z" } }))).toEqual([]);
    });
    it("caps the logo URL at 2048 characters", () => {
      const base = "https://example.com/";
      expect(run(createorganisation, create({ brandingconfig: { logourl: base + "a".repeat(2048 - base.length) } }))).toEqual([]);
      expect(fieldsOf(createorganisation, create({ brandingconfig: { logourl: base + "a".repeat(2049 - base.length) } }))).toEqual(["brandingconfig.logourl"]);
    });
    it("applies the name rules to the display name: no control or bidi characters, a letter or digit, 250 at most", () => {
      expect(run(createorganisation, create({ brandingconfig: { displayname: "ក្រុមហ៊ុន\u200Bសាកល្បង" } }))).toEqual([]);
      for (const displayname of ["a\nb", "a\u202Eb", "a\u2066b", "\u200B", "---", "a".repeat(251), "   "]) {
        expect(fieldsOf(createorganisation, create({ brandingconfig: { displayname } }))).toEqual(["brandingconfig.displayname"]);
      }
    });
    it("refuses a colour that is not #rrggbb, and unknown keys", () => {
      expect(fieldsOf(createorganisation, create({ brandingconfig: { tilecolour: "red" } }))).toEqual(["brandingconfig.tilecolour"]);
      expect(fieldsOf(createorganisation, create({ brandingconfig: { tilecolour: "#12345" } }))).toEqual(["brandingconfig.tilecolour"]);
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
    expect(fieldsOf(createorganisation, create({ organisationcode: "A", organisationshortname: "12", countryids: [] })).sort()).toEqual([
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
    expect(run(updateorganisation, update({ organisationshortname: "ក្ស" }))).toEqual([]);
    expect(fieldsOf(updateorganisation, update({ organisationname: "a\u202Eb" }))).toEqual(["organisationname"]);
    expect(fieldsOf(updateorganisation, update({ uitheme: "dark" }))).toEqual(["uitheme"]);
    expect(fieldsOf(updateorganisation, update({ brandingconfig: { logourl: "http://example.com/l.png" } }))).toEqual(["brandingconfig.logourl"]);
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
