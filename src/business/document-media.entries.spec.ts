import AdmZip from "adm-zip";
import { checkDocumentFile, declaredZipEntries, MAX_ZIP_ENTRIES } from "./document-media";
import { ooxmlBytes, OOXML_MAIN_TYPES } from "src/test-support/synthetic-media";

/**
 * The number of entries an archive declares is read from its end record BEFORE the archive library is asked to open it: the
 * library builds an object per entry of the central directory, so a flood of empty entries costs memory whatever is read after.
 * `adm-zip` is wrapped to count the times an archive is opened; the wrapper opens the real one.
 */
jest.mock("adm-zip", () => {
  const real = jest.requireActual("adm-zip");
  return jest.fn((...args: unknown[]) => new real(...args));
});
const opened = AdmZip as unknown as jest.Mock;

// Too many entries, an end record that cannot be read, zip64: the archive is told it is damaged or unusually large (not that it is another kind).
const DAMAGED = (ext: string) => `This .${ext} is damaged or unusually large inside. Re-save it and try again.`;
const REFUSED = DAMAGED("pptx");

/** A pptx whose manifest is right and that holds `total` entries in all (the rest empty, stored). */
const withEntries = (total: number): Buffer => {
  const zip = new (jest.requireActual("adm-zip"))();
  const main = OOXML_MAIN_TYPES.pptx;
  zip.addFile("[Content_Types].xml", Buffer.from(`<Types><Override PartName="${main.part}" ContentType="${main.type}"/></Types>`));
  for (let i = 1; i < total; i++) zip.addFile(`ppt/media/e${i}.bin`, Buffer.alloc(0));
  return zip.toBuffer();
};
const endAt = (buffer: Buffer) => buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
const refusalOf = (name: string, bytes: Buffer): string => {
  try {
    checkDocumentFile(name, bytes);
  } catch (e) {
    return (e as Error).message;
  }
  return "accepted";
};

beforeEach(() => opened.mockClear());

describe("declaredZipEntries", () => {
  it("reads the count of a small archive", () => {
    expect(declaredZipEntries(ooxmlBytes("pptx"))).toBe(2);
  });
  it("is null for no end record, for something shorter than one, and for an empty buffer", () => {
    expect(declaredZipEntries(Buffer.alloc(0))).toBeNull();
    expect(declaredZipEntries(Buffer.alloc(21, 0x50))).toBeNull();
    expect(declaredZipEntries(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(300, 7)]))).toBeNull();
  });
  it("finds the record behind a long comment (up to the longest a record can carry)", () => {
    const bytes = ooxmlBytes("pptx");
    const at = endAt(bytes);
    const comment = Buffer.alloc(0xffff, 0x41);
    const withComment = Buffer.concat([bytes, comment]);
    withComment.writeUInt16LE(0xffff, at + 20);
    expect(declaredZipEntries(withComment)).toBe(2);
  });
  it("does not look further back than the longest comment", () => {
    const bytes = ooxmlBytes("pptx");
    expect(declaredZipEntries(Buffer.concat([bytes, Buffer.alloc(0xffff + 1, 0x41)]))).toBeNull();
  });
  it("takes the larger of the two counts the record holds", () => {
    const bytes = Buffer.from(ooxmlBytes("pptx"));
    const at = endAt(bytes);
    bytes.writeUInt16LE(7, at + 8);
    bytes.writeUInt16LE(9, at + 10);
    expect(declaredZipEntries(bytes)).toBe(9);
    bytes.writeUInt16LE(12, at + 8);
    expect(declaredZipEntries(bytes)).toBe(12);
  });
  it("takes the record the library would: a second one within 20 bytes before the last", () => {
    const bytes = ooxmlBytes("pptx");
    const fake = Buffer.alloc(22);
    fake.writeUInt32LE(0x06054b50, 0);
    fake.writeUInt16LE(60000, 8);
    fake.writeUInt16LE(60000, 10);
    // a record whose first 10 bytes overlap the real one's start: the earlier signature is within 20 bytes of the real one
    const real = bytes.subarray(endAt(bytes));
    const overlapped = Buffer.concat([bytes.subarray(0, endAt(bytes)), fake.subarray(0, 12), real]);
    expect(declaredZipEntries(overlapped)).toBe(60000);
  });
  it("is null for a zip64 archive (a locator or a zip64 record)", () => {
    const bytes = ooxmlBytes("pptx");
    const at = endAt(bytes);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    expect(declaredZipEntries(Buffer.concat([bytes.subarray(0, at), locator, bytes.subarray(at)]))).toBeNull();
    // a zip64 archive carries its record and then the locator: the locator is what leads to it
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50, 0);
    expect(declaredZipEntries(Buffer.concat([bytes.subarray(0, at), record, locator, bytes.subarray(at)]))).toBeNull();
  });
});

describe("the bound on the number of entries, applied before the archive is opened", () => {
  it("the bound is 10000", () => {
    expect(MAX_ZIP_ENTRIES).toBe(10000);
  });
  it("10000 entries: the archive is opened and checked as usual", () => {
    const bytes = withEntries(10000);
    expect(declaredZipEntries(bytes)).toBe(10000);
    opened.mockClear();
    expect(refusalOf("a.pptx", bytes)).toBe("accepted");
    expect(opened).toHaveBeenCalledTimes(1);
  });
  it("10001 entries: refused with the same message, and the archive library is never asked to open it", () => {
    const bytes = withEntries(10001);
    expect(declaredZipEntries(bytes)).toBe(10001);
    opened.mockClear();
    expect(refusalOf("a.pptx", bytes)).toBe(REFUSED);
    expect(opened).not.toHaveBeenCalled();
  });
  it.each(["a.docx", "a.xlsx", "a.odp", "a.odt"])("%s: an archive over the bound is refused before it is opened, whatever its manifest", (name) => {
    const bytes = withEntries(10001);
    opened.mockClear();
    expect(refusalOf(name, bytes)).toBe(DAMAGED(name.split(".")[1]));
    expect(opened).not.toHaveBeenCalled();
  });
  it("a count that is a lie: a small archive whose record says 65000 is refused unopened", () => {
    const bytes = Buffer.from(ooxmlBytes("pptx"));
    const at = endAt(bytes);
    bytes.writeUInt16LE(65000, at + 8);
    bytes.writeUInt16LE(65000, at + 10);
    opened.mockClear();
    expect(refusalOf("a.pptx", bytes)).toBe(REFUSED);
    expect(opened).not.toHaveBeenCalled();
  });
  it("a count of none is refused (no manifest can be read), not treated as an empty, harmless archive", () => {
    const bytes = Buffer.from(withEntries(50));
    const at = endAt(bytes);
    bytes.writeUInt16LE(0, at + 8);
    bytes.writeUInt16LE(0, at + 10);
    expect(refusalOf("a.pptx", bytes)).toBe(REFUSED);
  });
  it("no end record: refused unopened (a damaged archive)", () => {
    const bytes = ooxmlBytes("pptx");
    opened.mockClear();
    expect(refusalOf("a.pptx", bytes.subarray(0, bytes.length - 30))).toBe(REFUSED);
    expect(opened).not.toHaveBeenCalled();
  });
  it("a zip64 archive is refused unopened", () => {
    const bytes = ooxmlBytes("pptx");
    const at = endAt(bytes);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    opened.mockClear();
    expect(refusalOf("a.pptx", Buffer.concat([bytes.subarray(0, at), locator, bytes.subarray(at)]))).toBe(REFUSED);
    expect(opened).not.toHaveBeenCalled();
  });
  it("a comment after the end record does not hide the count", () => {
    const bytes = Buffer.from(withEntries(10001));
    const at = endAt(bytes);
    const comment = Buffer.alloc(500, 0x41);
    const withComment = Buffer.concat([bytes, comment]);
    withComment.writeUInt16LE(500, at + 20);
    opened.mockClear();
    expect(refusalOf("a.pptx", withComment)).toBe(REFUSED);
    expect(opened).not.toHaveBeenCalled();
  });
});
