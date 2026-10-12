import AdmZip from "adm-zip";

/**
 * Synthetic bytes for the document upload specs: each is the smallest thing that carries the signature (and, for the
 * zip-based formats, the entry) the upload checks. Generated here; no file of anyone's is read or stored.
 */
export const pngBytes = (): Buffer => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("synthetic image")]);
export const jpgBytes = (): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("synthetic image")]);
export const gifBytes = (): Buffer => Buffer.from("GIF89a synthetic image");
export const pdfBytes = (): Buffer => Buffer.from("%PDF-1.4\nsynthetic document\n%%EOF\n");
export const mp3Bytes = (): Buffer => Buffer.concat([Buffer.from("ID3"), Buffer.from([4, 0, 0, 0, 0, 0, 0]), Buffer.from("synthetic audio")]);
export const mp4Bytes = (): Buffer => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.from("synthetic video")]);

export const OOXML_MAIN_TYPES = {
  pptx: { part: "/ppt/presentation.xml", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml" },
  docx: { part: "/word/document.xml", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" },
  xlsx: { part: "/xl/workbook.xml", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" },
} as const;

export const ODF_MIMETYPES = {
  odp: "application/vnd.oasis.opendocument.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
} as const;

/** An OOXML package whose manifest names `part` with `type`; both default to the format's own main part. */
export const ooxmlBytes = (kind: keyof typeof OOXML_MAIN_TYPES, over: { part?: string; type?: string; manifest?: string | null; extra?: Record<string, Buffer> } = {}): Buffer => {
  const main = OOXML_MAIN_TYPES[kind];
  const zip = new AdmZip();
  if (over.manifest !== null) {
    const manifest =
      over.manifest ??
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="${over.part ?? main.part}" ContentType="${over.type ?? main.type}"/></Types>`;
    zip.addFile("[Content_Types].xml", Buffer.from(manifest, "utf8"));
  }
  zip.addFile(main.part.slice(1), Buffer.from("<xml/>", "utf8"));
  for (const [name, data] of Object.entries(over.extra ?? {})) zip.addFile(name, data);
  return zip.toBuffer();
};

/** An OpenDocument package whose `mimetype` entry holds `mimetype` (default: the format's own). */
export const odfBytes = (kind: keyof typeof ODF_MIMETYPES, over: { mimetype?: string | null } = {}): Buffer => {
  const zip = new AdmZip();
  if (over.mimetype !== null) zip.addFile("mimetype", Buffer.from(over.mimetype ?? ODF_MIMETYPES[kind], "utf8"));
  zip.addFile("content.xml", Buffer.from("<xml/>", "utf8"));
  return zip.toBuffer();
};

export const csvBytes = (text = "a,b\n1,2\n"): Buffer => Buffer.from(text, "utf8");
