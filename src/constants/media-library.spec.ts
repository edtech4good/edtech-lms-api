import {
  ATTRIBUTION_ADAPTEDFROM_MAX,
  ATTRIBUTION_AUTHOR_MAX,
  ATTRIBUTION_MAX_BYTES,
  ATTRIBUTION_SOURCEURL_MAX,
  ATTRIBUTION_VERSION,
  DEFAULT_DOCUMENT_LICENCE,
  DOCUMENT_LICENCES,
  DOCUMENT_TITLE_MAX,
  normaliseDocumentAttribution,
  normaliseDocumentTitle,
  VIDEO_DOCUMENT_TYPE_ID,
} from "./media-library";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { attributionResult, documentMetadata, DOCUMENT_LICENCES as CENTRAL_LICENCES, SOURCEURL_MESSAGE } from "src/business/document-media";
import { FileType } from "src/models/enums/filetype.enum.";

/**
 * Central and the student API must agree on these: the student API refuses what it does not know. This file is a copy of the
 * student API's `src/constants/media-library.ts` (edtech-lms-rpi-api), so the literals below are that file's values and a change on
 * one side only is red here. Central's own write rules must accept nothing the student API's import would refuse.
 */
const STUDENT_LICENCES = [
  "CC0-1.0",
  "CC-BY-4.0", "CC-BY-3.0", "CC-BY-2.0",
  "CC-BY-SA-4.0", "CC-BY-SA-3.0", "CC-BY-SA-2.0",
  "CC-BY-NC-4.0", "CC-BY-NC-3.0", "CC-BY-NC-2.0",
  "CC-BY-NC-SA-4.0", "CC-BY-NC-SA-3.0", "CC-BY-NC-SA-2.0",
  "CC-BY-ND-4.0", "CC-BY-ND-3.0", "CC-BY-ND-2.0",
  "CC-BY-NC-ND-4.0", "CC-BY-NC-ND-3.0", "CC-BY-NC-ND-2.0",
  "LicenseRef-all-rights-reserved",
  "unspecified",
];

describe("the media-library constants, shared with the student API", () => {
  // The file is a copy of the student API's. Everything after the header comment is pinned by hash to the student API's file at
  // edtech-lms-rpi-api 900f26c (rpi#126, ML-1 review fixes). When the student's file changes, re-copy it byte for byte and
  // update this hash with it; a hand edit of the rules here, or a stale copy, is red.
  const STUDENT_BODY_SHA256 = "49d3beebf0a875f0a0b55feb1683312103c8ea347bb366dc38104b6a79c29837";
  it("the body of src/constants/media-library.ts is byte for byte the student API's (900f26c)", () => {
    const text = readFileSync(join(__dirname, "media-library.ts"));
    const marker = Buffer.from("/** `documents.documenttypeid` of a VIDEO");
    const body = text.subarray(text.indexOf(marker));
    expect(createHash("sha256").update(body).digest("hex")).toBe(STUDENT_BODY_SHA256);
  });

  it("the licence list is the student API's 21 ids, in its order", () => {
    expect(DOCUMENT_LICENCES).toEqual(STUDENT_LICENCES);
    expect(DOCUMENT_LICENCES).toHaveLength(21);
    expect(DEFAULT_DOCUMENT_LICENCE).toBe("unspecified");
  });
  it("the bounds are the student API's", () => {
    expect([DOCUMENT_TITLE_MAX, ATTRIBUTION_VERSION, ATTRIBUTION_AUTHOR_MAX, ATTRIBUTION_SOURCEURL_MAX, ATTRIBUTION_ADAPTEDFROM_MAX, ATTRIBUTION_MAX_BYTES]).toEqual([255, 1, 255, 2048, 1024, 4096]);
  });
  it("a VIDEO document is type 2, as central's own enum says", () => {
    expect(VIDEO_DOCUMENT_TYPE_ID).toBe(FileType.VIDEO);
    expect(VIDEO_DOCUMENT_TYPE_ID).toBe(2);
  });
  it("central's upload and PUT validators use the same list", () => {
    expect(CENTRAL_LICENCES).toBe(DOCUMENT_LICENCES);
    for (const licence of STUDENT_LICENCES) expect(documentMetadata({ documentlicence: licence }).errors).toEqual([]);
  });
});

describe("the source address: the student API's refusals (its import spec lists the same values)", () => {
  // The parser completes these into addresses (a host is filled in); an address is written with its scheme and `//`.
  const REFUSED = ["http:foo", "https:example.org", "http:/example.org", "http://", "https:///", "javascript:alert(1)", "ftp://example.org/x", "not a url", "mailto:a@b.org", "//example.org", "HTTP:foo"];
  const ACCEPTED = ["http://example.org", "https://example.org/a?b=c#d", "HTTPS://Example.org", "http://127.0.0.1:3000/x", "https://ភ្នំពេញ.example/ក"];
  it.each(REFUSED)("%s is refused by the shared normaliser", (sourceurl) => {
    expect(normaliseDocumentAttribution({ v: 1, sourceurl }).ok).toBe(false);
  });
  it.each(ACCEPTED)("%s is accepted by the shared normaliser", (sourceurl) => {
    expect(normaliseDocumentAttribution({ v: 1, sourceurl }).ok).toBe(true);
  });
  it.each(REFUSED)("%s is refused by central's own upload and PUT rule, with the source-address message", (sourceurl) => {
    expect(attributionResult({ v: 1, sourceurl })).toEqual({ value: null, errors: [{ field: "documentattribution", message: SOURCEURL_MESSAGE }] });
  });
  it.each(ACCEPTED)("%s is accepted by central's own rule", (sourceurl) => {
    expect(attributionResult({ v: 1, sourceurl }).errors).toEqual([]);
  });
});

describe("what central stores, the student API's import accepts and keeps as it is", () => {
  it.each([
    ["a trimmed Khmer title", "  ភ្នំពេញ "],
    ["a title of 255", "ក".repeat(255)],
    ["a blank title (stored as no title)", "   "],
  ])("title: %s", (_n, input) => {
    const stored = documentMetadata({ documenttitle: input }).values.documenttitle;
    expect(documentMetadata({ documenttitle: input }).errors).toEqual([]);
    const student = normaliseDocumentTitle(stored);
    expect(student).toEqual({ ok: true, value: stored });
  });
  it.each([
    [{ v: 1, author: "  ក  ", sourceurl: "", adaptedfrom: "x" }],
    [{ v: 1 }],
    [{ v: 1, sourceurl: "https://example.org/a?b=c" }],
    [{ v: 1, author: "ក".repeat(255), sourceurl: `https://e.org/${"a".repeat(2034)}`, adaptedfrom: "b".repeat(1024) }],
    [{ v: 1, author: null }],
  ])("attribution %j: the stored form is a fixed point of the student API's normaliser", (input) => {
    const result = attributionResult(input);
    expect(result.errors).toEqual([]);
    expect(normaliseDocumentAttribution(result.value)).toEqual({ ok: true, value: result.value });
  });
  it("what the student API would refuse, central refuses too (a sample of each rule)", () => {
    for (const bad of [{ v: 2 }, { v: 1, x: 1 }, { v: 1, sourceurl: "ftp://e.org" }, { v: 1, author: "a".repeat(256) }, { author: "a" }, "x", []]) {
      expect(normaliseDocumentAttribution(bad).ok).toBe(false);
      expect(attributionResult(bad).errors).toHaveLength(1);
    }
    for (const bad of ["ក".repeat(256), "a\u0000"]) {
      expect(normaliseDocumentTitle(bad).ok).toBe(false);
      expect(documentMetadata({ documenttitle: bad }).errors).toHaveLength(1);
    }
  });
});
