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
import { attributionResult, documentMetadata, DOCUMENT_LICENCES as CENTRAL_LICENCES } from "src/business/document-media";
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
