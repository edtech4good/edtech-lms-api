import AdmZip from "adm-zip";
import zlib from "zlib";
import { ATTRIBUTION_VERSION } from "src/constants/media-library";
import {
  attributionResult,
  checkDocumentFile,
  DOCUMENT_FILE_RULES,
  DOCUMENT_LICENCES,
  documentMetadata,
  extensionOf,
  MAX_CONTENT_TYPES_ENTRY_BYTES,
  storageKey,
  uploadSizeLog,
  utf8FileName,
} from "./document-media";
import {
  csvBytes, gifBytes, jpgBytes, mp3Bytes, mp4Bytes, odfBytes, ooxmlBytes, pdfBytes, pngBytes,
} from "src/test-support/synthetic-media";
import { ApiError } from "src/models/ApiError";
import { ErrorCode } from "src/models/enums/errorcode.enum";

const KHMER_NAME = "ភ្នំពេញ";
const accepted = (name: string, bytes: Buffer) => checkDocumentFile(name, bytes);
const refusal = (name: string, bytes: Buffer): ApiError => {
  try {
    checkDocumentFile(name, bytes);
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("expected a refusal");
};

describe("the document whitelist: extension -> type id, content type, signature", () => {
  const cases: Array<[string, () => Buffer, number, string]> = [
    ["mp4", mp4Bytes, 2, "video/mp4"],
    ["mp3", mp3Bytes, 1, "audio/mpeg"],
    ["jpg", jpgBytes, 6, "image/jpeg"],
    ["jpeg", jpgBytes, 6, "image/jpeg"],
    ["png", pngBytes, 6, "image/png"],
    ["gif", gifBytes, 6, "image/gif"],
    ["pdf", pdfBytes, 5, "application/pdf"],
    ["pptx", () => ooxmlBytes("pptx"), 8, "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    ["odp", () => odfBytes("odp"), 8, "application/vnd.oasis.opendocument.presentation"],
    ["docx", () => ooxmlBytes("docx"), 9, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["odt", () => odfBytes("odt"), 9, "application/vnd.oasis.opendocument.text"],
    ["xlsx", () => ooxmlBytes("xlsx"), 10, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["csv", () => csvBytes(), 10, "text/csv"],
  ];
  it("lists exactly these extensions", () => {
    expect(Object.keys(DOCUMENT_FILE_RULES).sort()).toEqual(cases.map((c) => c[0]).sort());
  });
  it.each(cases)("%s with real bytes is accepted as type %i with content type %s", (ext, make, typeid, contentType) => {
    expect(accepted(`sample.${ext}`, make())).toEqual({ extension: ext, documenttypeid: typeid, contentType });
  });
  it.each(cases)("%s: the extension is read case-insensitively and stored in lower case", (ext, make) => {
    expect(accepted(`SAMPLE.${ext.toUpperCase()}`, make()).extension).toBe(ext);
  });
  it.each(cases.filter((c) => c[0] !== "csv"))("%s: the same name with an empty file is refused", (ext) => {
    expect(refusal(`sample.${ext}`, Buffer.alloc(0)).message).toBe("That file isn't the kind its name says it is.");
  });
  it("a Khmer file name is no obstacle: only the extension is read", () => {
    expect(accepted(`${KHMER_NAME}.pdf`, pdfBytes()).documenttypeid).toBe(5);
  });
  it.each(["log", "doc", "ppt", "xls", "zip", "svg", "html", "htm", "js", "webp", "ods", "docm", "pptm", "xlsm", "key", "exe", "bmp", "txt"])(
    "the extension %s is refused as not supported, whatever the bytes",
    (ext) => {
      const err = refusal(`sample.${ext}`, pdfBytes());
      expect(err.message).toBe("That file type isn't supported.");
      expect(err.code).toBe(ErrorCode.FILE_REJECTED);
    },
  );
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])("the extension %s is no key of the list", (ext) => {
    expect(refusal(`sample.${ext}`, pdfBytes()).message).toBe("That file type isn't supported.");
  });
  it("a name with no extension is refused", () => {
    expect(refusal("sample", pdfBytes()).message).toBe("That file name isn't allowed.");
    expect(refusal("sample.", pdfBytes()).message).toBe("That file name isn't allowed.");
  });
  it("only the last extension counts", () => {
    expect(refusal("sample.pdf.exe", pdfBytes()).message).toBe("That file type isn't supported.");
    expect(accepted("sample.exe.pdf", pdfBytes()).extension).toBe("pdf");
  });
  it("extensionOf", () => {
    expect(extensionOf("a.b.PNG")).toBe("png");
    expect(extensionOf("noext")).toBe("");
  });
});

describe("the first bytes must agree with the extension", () => {
  it.each([
    ["a png named pdf", "sample.pdf", pngBytes()],
    ["a pdf named png", "sample.png", pdfBytes()],
    ["a png named jpg", "sample.jpg", pngBytes()],
    ["a jpeg named gif", "sample.gif", jpgBytes()],
    ["a gif named png", "sample.png", gifBytes()],
    ["a pdf named mp4", "sample.mp4", pdfBytes()],
    ["an mp4 named mp3", "sample.mp3", mp4Bytes()],
    ["an mp3 named mp4", "sample.mp4", mp3Bytes()],
    ["a zip named pdf", "sample.pdf", ooxmlBytes("docx")],
    ["three letters named png (a test fixture of the old kind)", "sample.png", Buffer.from("png")],
    ["a text file named pptx", "sample.pptx", Buffer.from("not a zip at all")],
    ["a Windows executable named pptx", "sample.pptx", Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64)])],
    ["a png named docx", "sample.docx", pngBytes()],
    ["a file shorter than its signature", "sample.png", Buffer.from([0x89, 0x50])],
  ])("%s is refused before anything is stored", (_n, name, bytes) => {
    const err = refusal(name, bytes);
    expect(err.message).toBe("That file isn't the kind its name says it is.");
    expect(err.code).toBe(ErrorCode.FILE_REJECTED);
  });

  it.each([
    ["an ID3 tag", Buffer.concat([Buffer.from("ID3"), Buffer.alloc(8)]), true],
    ["an MPEG frame sync", Buffer.from([0xff, 0xfb, 0x90, 0x00]), true],
    ["0xFF alone is not a frame sync", Buffer.from([0xff, 0x10, 0x00]), false],
    ["a lone 0xFF byte", Buffer.from([0xff]), false],
  ])("mp3: %s", (_n, bytes, ok) => {
    if (ok) expect(accepted("a.mp3", bytes).documenttypeid).toBe(1);
    else expect(refusal("a.mp3", bytes).message).toBe("That file isn't the kind its name says it is.");
  });

  it("mp4: the ftyp box must sit at offset 4", () => {
    expect(refusal("a.mp4", Buffer.concat([Buffer.from("ftyp"), Buffer.alloc(8)])).message).toBe("That file isn't the kind its name says it is.");
  });
  it("gif: both versions are accepted, a bare GIF is not", () => {
    expect(accepted("a.gif", Buffer.from("GIF87a....")).documenttypeid).toBe(6);
    expect(refusal("a.gif", Buffer.from("GIF....")).message).toBe("That file isn't the kind its name says it is.");
  });
});

describe("csv: valid UTF-8 with no NUL byte", () => {
  it("accepts ASCII, Khmer and a byte-order mark", () => {
    expect(accepted("a.csv", csvBytes("a,b\n1,2\n")).documenttypeid).toBe(10);
    expect(accepted("a.csv", csvBytes(`ឈ្មោះ,${KHMER_NAME}\n`)).documenttypeid).toBe(10);
    expect(accepted("a.csv", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), csvBytes()])).documenttypeid).toBe(10);
  });
  it("accepts an empty file? no: nothing to read is still valid UTF-8, and a person may start from an empty sheet", () => {
    expect(accepted("a.csv", Buffer.alloc(0)).documenttypeid).toBe(10);
  });
  it.each([
    ["a NUL byte", Buffer.from("a,b\0\n")],
    ["invalid UTF-8 (a lone continuation byte)", Buffer.from([0x61, 0x80, 0x62])],
    ["invalid UTF-8 (a truncated Khmer letter)", Buffer.from("ក", "utf8").subarray(0, 2)],
    ["UTF-16 text", Buffer.from("a,b\n", "utf16le")],
    ["a binary file", Buffer.from([0xff, 0xfe, 0x00, 0x01])],
  ])("refuses %s", (_n, bytes) => {
    expect(refusal("a.csv", bytes).message).toBe("That file isn't the kind its name says it is.");
  });
  it("checks the whole file, not just its start", () => {
    const bytes = Buffer.concat([Buffer.alloc(3 * 1024 * 1024, 0x61), Buffer.from([0x80])]);
    expect(refusal("a.csv", bytes).message).toBe("That file isn't the kind its name says it is.");
    expect(refusal("a.csv", Buffer.concat([Buffer.alloc(3 * 1024 * 1024, 0x61), Buffer.from([0])])).message).toBe("That file isn't the kind its name says it is.");
  });
  it("a multi-byte letter that straddles a piece boundary is not a refusal", () => {
    const khmer = Buffer.from("ក", "utf8");
    const bytes = Buffer.concat([Buffer.alloc(1024 * 1024 - 1, 0x61), khmer, Buffer.alloc(10, 0x61)]);
    expect(accepted("a.csv", bytes).documenttypeid).toBe(10);
  });
});

describe("inside the container: pptx, docx, xlsx", () => {
  const kinds = ["pptx", "docx", "xlsx"] as const;
  it.each(kinds.flatMap((a) => kinds.filter((b) => b !== a).map((b) => [a, b] as const)))(
    "a %s package named .%s is refused",
    (actual, named) => {
      expect(refusal(`sample.${named}`, ooxmlBytes(actual)).message).toBe("That file isn't the kind its name says it is.");
    },
  );
  it.each([
    ["pptx", "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml"],
    ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml"],
    ["docx", "application/vnd.ms-word.document.macroEnabled.main+xml"],
    ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml"],
    ["xlsx", "application/vnd.ms-excel.sheet.macroEnabled.main+xml"],
  ] as const)("a renamed macro-enabled or template %s (main part %s) is refused", (kind, type) => {
    expect(refusal(`sample.${kind}`, ooxmlBytes(kind, { type })).message).toBe("That file isn't the kind its name says it is.");
  });
  it("the main content type under another folder than the extension's is refused", () => {
    expect(refusal("a.pptx", ooxmlBytes("pptx", { part: "/word/presentation.xml" })).message).toBe("That file isn't the kind its name says it is.");
  });
  it("a manifest that mentions the right type only in a Default (not an Override of a main part) is refused", () => {
    const manifest = `<Types><Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`;
    expect(refusal("a.pptx", ooxmlBytes("pptx", { manifest })).message).toBe("That file isn't the kind its name says it is.");
  });
  it("single quotes and attribute order in the manifest are fine", () => {
    const manifest = `<Types><Override ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml' PartName='/xl/workbook.xml'/></Types>`;
    expect(accepted("a.xlsx", ooxmlBytes("xlsx", { manifest })).documenttypeid).toBe(10);
  });
  it("a package with no [Content_Types].xml is refused", () => {
    expect(refusal("a.docx", ooxmlBytes("docx", { manifest: null })).message).toBe("That file isn't the kind its name says it is.");
  });
  it("a file with a zip header and nothing after it (a damaged archive) is refused", () => {
    const damaged = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(200, 7)]);
    expect(refusal("a.pptx", damaged).message).toBe("That file isn't the kind its name says it is.");
    expect(refusal("a.odp", damaged).message).toBe("That file isn't the kind its name says it is.");
  });
  it("a package cut short is refused", () => {
    const whole = ooxmlBytes("pptx");
    expect(refusal("a.pptx", whole.subarray(0, whole.length - 10)).message).toBe("That file isn't the kind its name says it is.");
  });
  it("a directory entry named [Content_Types].xml is not a manifest", () => {
    const zip = new AdmZip();
    zip.addFile("[Content_Types].xml/", Buffer.alloc(0));
    zip.addFile("ppt/presentation.xml", Buffer.from("<xml/>"));
    expect(refusal("a.pptx", zip.toBuffer()).message).toBe("That file isn't the kind its name says it is.");
  });

  describe("the entry is read once, and only when its declared size is within the bound", () => {
    // the archive is inflated through zlib, one call per entry read
    const inflations = () => jest.spyOn(zlib, "inflateRawSync");
    it("an entry that declares more than the bound is refused without being inflated", () => {
      const big = `<Types>${" ".repeat(MAX_CONTENT_TYPES_ENTRY_BYTES + 1)}<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`;
      const bytes = ooxmlBytes("pptx", { manifest: big });
      expect(bytes.length).toBeLessThan(2000); // it compresses to almost nothing: the declared size is what is checked
      const inflated = inflations();
      expect(refusal("a.pptx", bytes).message).toBe("That file isn't the kind its name says it is.");
      expect(inflated).not.toHaveBeenCalled();
    });
    it("a manifest exactly at the bound is read, once", () => {
      const head = `<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`;
      const manifest = head + " ".repeat(MAX_CONTENT_TYPES_ENTRY_BYTES - head.length - "</Types>".length) + "</Types>";
      expect(Buffer.byteLength(manifest)).toBe(MAX_CONTENT_TYPES_ENTRY_BYTES);
      const bytes = ooxmlBytes("pptx", { manifest, extra: { "ppt/media/a.png": pngBytes(), "ppt/slides/slide1.xml": Buffer.from("<s/>") } });
      const inflated = inflations();
      expect(accepted("a.pptx", bytes).documenttypeid).toBe(8);
      expect(inflated).toHaveBeenCalledTimes(1);
    });
    it("an entry that declares a small size but inflates to more is refused, not read in full", () => {
      const lying = ooxmlBytes("pptx", { manifest: `<Types>${" ".repeat(3 * 1024 * 1024)}</Types>` });
      const central = lying.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      lying.writeUInt32LE(100, central + 24); // the directory's uncompressed size
      lying.writeUInt32LE(100, lying.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04])) + 22); // and the local header's
      expect(refusal("a.pptx", lying).message).toBe("That file isn't the kind its name says it is.");
    });
    it("no other entry is read", () => {
      const bytes = ooxmlBytes("docx", { extra: { "word/media/a.png": pngBytes(), "customXml/item1.xml": Buffer.from("<x/>") } });
      const inflated = inflations();
      accepted("a.docx", bytes);
      expect(inflated).toHaveBeenCalledTimes(1);
    });
  });
});

describe("inside the container: odp, odt", () => {
  it("odt named odp, and odp named odt, are refused", () => {
    expect(refusal("a.odp", odfBytes("odt")).message).toBe("That file isn't the kind its name says it is.");
    expect(refusal("a.odt", odfBytes("odp")).message).toBe("That file isn't the kind its name says it is.");
  });
  it("a spreadsheet package named odt is refused (.ods is not on the list)", () => {
    expect(refusal("a.odt", odfBytes("ods")).message).toBe("That file isn't the kind its name says it is.");
  });
  it("an OOXML package named odp is refused, and an ODF package named pptx", () => {
    expect(refusal("a.odp", ooxmlBytes("pptx")).message).toBe("That file isn't the kind its name says it is.");
    expect(refusal("a.pptx", odfBytes("odp")).message).toBe("That file isn't the kind its name says it is.");
  });
  it("no mimetype entry, or one with text after the media type, is refused", () => {
    expect(refusal("a.odt", odfBytes("odt", { mimetype: null })).message).toBe("That file isn't the kind its name says it is.");
    expect(refusal("a.odt", odfBytes("odt", { mimetype: "application/vnd.oasis.opendocument.text\n" })).message).toBe("That file isn't the kind its name says it is.");
    expect(refusal("a.odt", odfBytes("odt", { mimetype: "application/vnd.oasis.opendocument.text-template" })).message).toBe("That file isn't the kind its name says it is.");
  });
  it("a mimetype entry that declares a large size is refused without being inflated", () => {
    const bytes = odfBytes("odt", { mimetype: "application/vnd.oasis.opendocument.text" + " ".repeat(5000) });
    const inflated = jest.spyOn(zlib, "inflateRawSync");
    expect(refusal("a.odt", bytes).message).toBe("That file isn't the kind its name says it is.");
    expect(inflated).not.toHaveBeenCalled();
  });
});

afterEach(() => jest.restoreAllMocks());

describe("no refusal names the file", () => {
  it("none of the messages carries the name or an extension", () => {
    const messages = [
      refusal(`${KHMER_NAME}.exe`, pdfBytes()).message,
      refusal(`${KHMER_NAME}.pdf`, pngBytes()).message,
      refusal(`${KHMER_NAME}`, pngBytes()).message,
      refusal(`${KHMER_NAME}.pptx`, ooxmlBytes("docx")).message,
    ];
    for (const m of messages) {
      expect(m).not.toContain(KHMER_NAME);
      expect(m).not.toMatch(/\.(exe|pdf|pptx)/);
    }
  });
});

describe("utf8FileName: the multipart parser hands over a UTF-8 name read as Latin-1", () => {
  const asReceived = (name: string) => Buffer.from(name, "utf8").toString("latin1");
  it("puts a Khmer name back", () => {
    expect(utf8FileName(asReceived(`${KHMER_NAME}.png`))).toBe(`${KHMER_NAME}.png`);
    expect(utf8FileName(asReceived("កម្ពុជា៉.pdf"))).toBe("កម្ពុជា៉.pdf");
  });
  it("puts an accented Latin name back", () => {
    expect(utf8FileName(asReceived("café été.pdf"))).toBe("café été.pdf");
  });
  it("leaves an ASCII name alone", () => {
    expect(utf8FileName("sample_file.png")).toBe("sample_file.png");
    expect(utf8FileName("")).toBe("");
  });
  it("leaves a name that is already Unicode alone (a letter above U+00FF cannot be a Latin-1 byte)", () => {
    expect(utf8FileName(`${KHMER_NAME}.png`)).toBe(`${KHMER_NAME}.png`);
  });
  it("leaves a name whose bytes are not valid UTF-8 as it came (a Latin-1 file name)", () => {
    expect(utf8FileName("caf\u00e9.pdf")).toBe("caf\u00e9.pdf");
  });
});

describe("the key and the size line", () => {
  it("the key is the row's id and the lower-case extension, nothing of the name", () => {
    expect(storageKey("0f8e1c5a-aaaa-4bbb-8ccc-123456789012", "pptx")).toBe("0f8e1c5a-aaaa-4bbb-8ccc-123456789012.pptx");
  });
  it("the size line carries the type id and the byte count, and nothing else", () => {
    expect(uploadSizeLog(6, 1234)).toEqual({ message: "Document uploaded", meta: { documenttypeid: 6, bytes: 1234 } });
  });
});

describe("the licence list", () => {
  it("is exactly the design's closed list", () => {
    expect([...DOCUMENT_LICENCES].sort()).toEqual(
      [
        "unspecified", "CC0-1.0", "LicenseRef-all-rights-reserved",
        ...["CC-BY", "CC-BY-SA", "CC-BY-NC", "CC-BY-NC-SA", "CC-BY-ND", "CC-BY-NC-ND"].flatMap((f) => ["4.0", "3.0", "2.0"].map((v) => `${f}-${v}`)),
      ].sort(),
    );
    expect(DOCUMENT_LICENCES).toHaveLength(21);
  });
});

describe("documentMetadata: title", () => {
  const titleOf = (documenttitle: unknown) => documentMetadata({ documenttitle: documenttitle as string });
  it("trims and keeps Khmer exactly as sent (no normalisation)", () => {
    expect(titleOf(`  ${KHMER_NAME}  `)).toEqual({ values: { documenttitle: KHMER_NAME }, errors: [] });
    const decomposed = "កម្ពុជ៉ា";
    expect(titleOf(decomposed).values.documenttitle).toBe(decomposed);
  });
  it("255 UTF-16 code units are fine, 256 are not", () => {
    expect(titleOf("ក".repeat(255)).errors).toEqual([]);
    expect(titleOf("ក".repeat(256)).errors).toEqual([{ field: "documenttitle", message: "The title can be at most 255 characters." }]);
  });
  it.each(["a\u0000b", "a\nb", "a\tb", "a\u007fb", "a\u0085b", "a\u2028b"])("a control character (%j) is refused without echoing the title", (title) => {
    expect(titleOf(title)).toEqual({ values: {}, errors: [{ field: "documenttitle", message: "The title can't contain control characters." }] });
  });
  it("a blank title is no title (as the student API's import normalises it); null clears; absent leaves it alone", () => {
    expect(titleOf("   ")).toEqual({ values: { documenttitle: null }, errors: [] });
    expect(titleOf("")).toEqual({ values: { documenttitle: null }, errors: [] });
    expect(titleOf(null)).toEqual({ values: { documenttitle: null }, errors: [] });
    expect(documentMetadata({})).toEqual({ values: {}, errors: [] });
  });
  it("a title that is not text is refused", () => {
    for (const bad of [1, {}, [], true]) expect(titleOf(bad).errors).toEqual([{ field: "documenttitle", message: "The title must be text." }]);
  });
});

describe("documentMetadata: licence", () => {
  it.each(DOCUMENT_LICENCES)("%s is accepted", (licence) => {
    expect(documentMetadata({ documentlicence: licence })).toEqual({ values: { documentlicence: licence }, errors: [] });
  });
  it.each(["CC-BY", "cc0-1.0", "CC-BY-4.0 ", "CC-BY-1.0", "GPL-3.0", "", "constructor", "CC0-1.0, CC-BY-4.0"])("%j is refused", (licence) => {
    expect(documentMetadata({ documentlicence: licence }).errors).toEqual([{ field: "documentlicence", message: "That licence isn't one of the allowed values." }]);
  });
  it("null is refused for a licence (it is cleared by setting 'unspecified')", () => {
    expect(documentMetadata({ documentlicence: null }).errors).toEqual([{ field: "documentlicence", message: "That licence isn't one of the allowed values." }]);
  });
});

describe("attributionResult", () => {
  const ok = { v: ATTRIBUTION_VERSION, author: "Sok Dara", sourceurl: "https://example.org/a?b=1", adaptedfrom: "Un titre" };
  it("a full object is stored as given", () => {
    expect(attributionResult(ok)).toEqual({ value: ok, errors: [] });
  });
  it("trims; an empty string is an absent key; an object with no key left is null", () => {
    expect(attributionResult({ v: 1, author: "  ក្រុម  ", sourceurl: "", adaptedfrom: "  " }).value).toEqual({ v: 1, author: "ក្រុម" });
    expect(attributionResult({ v: 1 })).toEqual({ value: null, errors: [] });
    expect(attributionResult({ v: 1, author: "", sourceurl: null })).toEqual({ value: null, errors: [] });
  });
  it.each([
    ["an unknown key", { v: 1, licence: "CC0-1.0" }],
    ["an unknown key beside valid ones", { ...ok, extra: "x" }],
    ["no version", { author: "a" }],
    ["version 2", { v: 2, author: "a" }],
    ["version as text", { v: "1", author: "a" }],
    ["an array", [{ v: 1 }]],
    ["text", "author"],
    ["a number as the author", { v: 1, author: 5 }],
    ["an author of 256", { v: 1, author: "a".repeat(256) }],
    ["a source of 2049", { v: 1, sourceurl: `https://e.org/${"a".repeat(2040)}` }],
    ["an adaptedfrom of 1025", { v: 1, adaptedfrom: "a".repeat(1025) }],
    ["a javascript: source", { v: 1, sourceurl: "javascript:alert(1)" }],
    ["a data: source", { v: 1, sourceurl: "data:text/html,x" }],
    ["a file: source", { v: 1, sourceurl: "file:///etc/hosts" }],
    ["a source that is not a URL", { v: 1, sourceurl: "example dot org" }],
    ["a control character", { v: 1, author: "a\u0000b" }],
    ["a prototype key", JSON.parse('{"v":1,"__proto__":{"x":1},"constructor":1}')],
  ])("refuses %s", (_n, input) => {
    const result = attributionResult(input);
    expect(result.value).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe("documentattribution");
    expect(JSON.stringify(result.errors)).not.toContain("javascript");
  });
  it("accepts the limits exactly: 255, 2048, 1024", () => {
    const edge = { v: 1, author: "ក".repeat(255), sourceurl: `https://e.org/${"a".repeat(2048 - 14)}`, adaptedfrom: "b".repeat(1024) };
    expect(attributionResult(edge).errors).toEqual([]);
  });
  it("the whole object is at most 4 KiB serialised: the three maxima together fit, Khmer at three bytes a letter does not", () => {
    const fits = { v: 1, author: "a".repeat(255), sourceurl: `https://e.org/${"a".repeat(2034)}`, adaptedfrom: "a".repeat(1024) };
    expect(attributionResult(fits).errors).toEqual([]);
    const tooBig = { v: 1, author: "ក".repeat(255), sourceurl: `https://e.org/${"a".repeat(2034)}`, adaptedfrom: "ក".repeat(1024) };
    expect(attributionResult(tooBig).errors).toEqual([{ field: "documentattribution", message: "The attribution is too large (4 KiB at most)." }]);
  });
  it("through documentMetadata: null clears; an object is validated; a bad one stores nothing", () => {
    expect(documentMetadata({ documentattribution: null })).toEqual({ values: { documentattribution: null }, errors: [] });
    expect(documentMetadata({ documentattribution: { v: 1, author: "x" } }).values).toEqual({ documentattribution: { v: 1, author: "x" } });
    expect(documentMetadata({ documentattribution: { v: 9 } })).toEqual({ values: {}, errors: expect.any(Array) });
  });
});
