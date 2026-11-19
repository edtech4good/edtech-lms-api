/**
 * The converter's layout v2 (scripts/lib/dcrs-content-parse.js): the six-sheet workbook, one module a sheet, with the correct option
 * marked by a tick, green text or (as a last resort in a cell) bold, a Khmer-only cell copied to English, recursive video and audio
 * folders, and the answer key. Workbooks are built here with adm-zip, rich-text runs included. Fixture text is invented; Khmer is
 * opaque runs of Khmer-block code points.
 */
import AdmZip from "adm-zip";
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/* eslint-disable @typescript-eslint/no-var-requires */
const { ID } = require("../../scripts/seed-dcrs-content");
const { validateContent, planContent } = require("../../scripts/lib/dcrs-content-plan");
const { ParseRefused, readCellsFromXlsx, readSheetFromXlsx, parseCells, answerKeyMarkdown } = require("../../scripts/lib/dcrs-content-parse");
/* eslint-enable @typescript-eslint/no-var-requires */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const repoRoot = path.resolve(__dirname, "..", "..");

const km = (tag: string) => `ក្ខា${tag}គ្ឃេ`;
const KA = ["ក", "ខ", "គ", "ឃ"];

// ---- building workbooks ------------------------------------------------------------------------

type Flag = "g" | "b" | "B" | undefined; // green, bold, both
type Line = { t: string; f?: Flag };
const L = (t: string, f?: Flag): Line => ({ t, f });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const siXml = (cell: string | Line[]): string => {
  if (typeof cell === "string") return `<si><t xml:space="preserve">${esc(cell)}</t></si>`;
  const runs = cell
    .map((l, i) => {
      const rpr = `${l.f === "b" || l.f === "B" ? "<b/>" : ""}<sz val="10"/>${l.f === "g" || l.f === "B" ? '<color rgb="FF00FF00"/>' : '<color theme="1"/>'}`;
      const text = l.t + (i < cell.length - 1 ? "\r\n" : "");
      return `<r><rPr>${rpr}</rPr><t xml:space="preserve">${esc(text)}</t></r>`;
    })
    .join("");
  return `<si>${runs}</si>`;
};
type Sheet = { name: string; cells: Record<string, string | Line[]> };
const book = (sheets: Sheet[]): Buffer => {
  const strings: string[] = [];
  const zip = new AdmZip();
  const rels: string[] = [];
  const sheetTags: string[] = [];
  sheets.forEach((sheet, n) => {
    const byRow = new Map<number, string[]>();
    for (const [ref, cell] of Object.entries(sheet.cells)) {
      const row = Number(/\d+/.exec(ref)![0]);
      byRow.set(row, [...(byRow.get(row) ?? []), `<c r="${ref}" t="s"><v>${strings.length}</v></c>`]);
      strings.push(siXml(cell));
    }
    const rows = [...byRow.entries()].sort(([a], [b]) => a - b).map(([r, cs]) => `<row r="${r}">${cs.join("")}</row>`).join("");
    zip.addFile(`xl/worksheets/sheet${n + 1}.xml`, Buffer.from(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`));
    // the sheets are listed in the workbook in reverse of their file numbers' order of rIds, so a name or place is not the file number
    sheetTags.push(`<sheet name="${sheet.name}" sheetId="${n + 1}" r:id="rId${n + 10}"/>`);
    rels.push(`<Relationship Id="rId${n + 10}" Type="x/worksheet" Target="worksheets/sheet${n + 1}.xml"/>`);
  });
  zip.addFile("xl/workbook.xml", Buffer.from(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags.join("")}</sheets></workbook>`));
  zip.addFile("xl/_rels/workbook.xml.rels", Buffer.from(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`));
  zip.addFile("xl/sharedStrings.xml", Buffer.from(`<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.join("")}</sst>`));
  return zip.toBuffer();
};

const blank = L("");
/** English option lines: "A. text" with the flag on the one at `at`. */
const enOpts = (n: number, at: number, f: Flag, tick = false): Line[] =>
  Array.from({ length: n }, (_, i) => L(`${String.fromCharCode(65 + i)}. option ${i}${tick && i === at ? " ✓" : ""}`, i === at ? f : undefined));
const kmOpts = (n: number, at: number, f: Flag, tick = false): Line[] =>
  Array.from({ length: n }, (_, i) => L(`${KA[i]}. ${km(`o${i}`)}${tick && i === at ? " ✓" : ""}`, i === at ? f : undefined));
/** One question: a stem (bold when `boldStem`) and options. */
const q = (stem: string, opts: Line[], boldStem = false): Line[] => [L(stem, boldStem ? "b" : undefined), ...opts];
const joinQ = (...qs: Line[][]): Line[] => qs.flatMap((x, i) => (i === 0 ? x : [blank, ...x]));

const moduleCells = (n: number, lessons: Record<string, Line[] | string>[]): Record<string, string | Line[]> => {
  const c: Record<string, string | Line[]> = { A2: `Module ${n} · Example\n${km("module")}` };
  lessons.forEach((l, i) => {
    const r = i + 2;
    c[`B${r}`] = `Lesson ${i + 1} title\n${km(`lesson${i}`)}`;
    for (const [col, v] of Object.entries(l)) c[`${col}${r}`] = v;
  });
  return c;
};
/** A simple lesson: one practice question and one quiz question in both languages, the third option green in each. */
const simple = (tag: string): Record<string, Line[] | string> => ({
  C: q(`Practice ${tag}?`, enOpts(3, 1, "g")),
  D: q(`${km(`p${tag}`)}?`, kmOpts(3, 1, "g")),
  E: q(`Quiz ${tag}?`, enOpts(3, 2, "g")),
  F: q(`${km(`q${tag}`)}?`, kmOpts(3, 2, "g")),
});

const dirs: string[] = [];
const tmp = (): string => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dcrs-v2-")));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

/** Reads sheet `sheet` of the workbook and converts it as layout v2; every lesson keeps its video, so no folder is needed unless given. */
const convert = (file: Buffer, over: Json = {}, sheet?: string) => {
  const s = readSheetFromXlsx(file, sheet);
  const notices: string[] = [];
  const copiedEnglish = new Set<string>();
  const lessons = Object.keys(s.cells).filter((k) => /^B\d+$/.test(k)).length;
  const content = parseCells(s.cells, {
    layout: "v2",
    formats: s.formats,
    notices,
    copiedEnglish,
    ...(over.videoFolder === undefined ? { keepVideo: Array.from({ length: lessons }, (_, i) => i + 1) } : {}),
    ...over,
  });
  return { content, notices, copiedEnglish };
};
const refused = (file: Buffer, over: Json = {}, sheet?: string): string[] => {
  try {
    convert(file, over, sheet);
  } catch (e) {
    expect(e).toBeInstanceOf(ParseRefused);
    return (e as { problems: string[] }).problems;
  }
  throw new Error("expected the sheet to be refused");
};
const oneLesson = (l: Record<string, Line[] | string>, n = 2) => book([{ name: `Module ${n}`, cells: moduleCells(n, [l]) }]);
const withProgramme = (c: Json): Json => ({ programme: { en: "Example programme", km: km("programme") }, ...c });
const correctOf = (qn: Json): number => qn.options.findIndex((o: Json) => o.correct);

// ---- the layout and the sheets -----------------------------------------------------------------

describe("layout v2: columns and sheets", () => {
  it("reads C/D as practice and E/F as quiz, one lesson per row, with the file stem as the video reference", () => {
    const { content } = convert(book([{ name: "Module 2", cells: moduleCells(2, [simple("a"), simple("b")]) }]));
    expect(content.module.number).toBe(2);
    expect(content.lessons.map((l: Json) => [l.order, l.practice.length, l.quiz.length, l.video])).toEqual([
      [1, 1, 1, { ref: "M02_L01", keep: true }],
      [2, 1, 1, { ref: "M02_L02", keep: true }],
    ]);
    const l1 = content.lessons[0];
    expect(l1.practice[0]).toMatchObject({ ident: "DCRS-M2-P1", text: { en: "Practice a?", km: `${km("pa")}?` } });
    expect(l1.practice[0].options.map((o: Json) => o.text.en)).toEqual(["option 0", "option 1", "option 2"]);
    expect(l1.practice[0].options.map((o: Json) => o.text.km)).toEqual([0, 1, 2].map((i) => km(`o${i}`)));
    expect(correctOf(l1.practice[0])).toBe(1);
    expect(correctOf(l1.quiz[0])).toBe(2);
    expect(content.lessons[1].practice[0].ident).toBe("DCRS-M2-L2-P1");
    expect(() => validateContent(withProgramme(content), ID)).not.toThrow();
  });

  it("takes the sheet by name and by 1-based place, and the first sheet when none is named", () => {
    const file = book([
      { name: "Module 1", cells: moduleCells(1, [simple("first")]) },
      { name: "Module 2", cells: moduleCells(2, [simple("second"), simple("third")]) },
    ]);
    expect(convert(file, {}, "Module 2").content.lessons).toHaveLength(2);
    expect(convert(file, {}, "2").content.module.number).toBe(2);
    expect(convert(file, {}, "1").content.module.number).toBe(1);
    expect(convert(file).content.module.number).toBe(1);
    expect(convert(file, {}, "Module 2").content.lessons[0].practice[0].text.en).toBe("Practice second?");
    expect(() => readSheetFromXlsx(file, "Module 9")).toThrow(/no such sheet/);
    expect(() => readSheetFromXlsx(file, "3")).toThrow(/no such sheet/);
    // the reader every old caller uses still reads the first sheet
    expect(readCellsFromXlsx(file).A2).toContain("Module 1");
  });

  it("reads \\r\\n line endings as line breaks, and keeps a cell's text as written", () => {
    const { content } = convert(oneLesson(simple("x")));
    expect(content.lessons[0].practice[0].text.en).toBe("Practice x?");
  });
});

// ---- the correct option ------------------------------------------------------------------------

describe("layout v2: which option is correct", () => {
  // English cell `en`; the Khmer cell has one green question per entry of `kmAt` (the Khmer side is not what these specs are about)
  const both = (en: Line[], kmAt: number[] = [1]) => oneLesson({ C: en, D: joinQ(...kmAt.map((at, i) => q(`${km(`s${i}`)}?`, kmOpts(3, at, "g")))) });

  it("takes the option whose text is green", () => {
    expect(correctOf(convert(both(q("S?", enOpts(3, 0, "g")), [0])).content.lessons[0].practice[0])).toBe(0);
    expect(correctOf(convert(both(q("S?", enOpts(3, 2, "B")), [2])).content.lessons[0].practice[0])).toBe(2);
  });

  it("takes the option that ends with a tick, and an option that is both ticked and green", () => {
    expect(correctOf(convert(both(q("S?", enOpts(3, 1, undefined, true)), [1])).content.lessons[0].practice[0])).toBe(1);
    expect(correctOf(convert(both(q("S?", enOpts(3, 1, "g", true)), [1])).content.lessons[0].practice[0])).toBe(1);
    // the tick is not part of the option text
    expect(convert(both(q("S?", enOpts(3, 1, undefined, true)), [1])).content.lessons[0].practice[0].options[1].text.en).toBe("option 1");
  });

  it("refuses a tick on one option and green on another, naming the cell and the question", () => {
    const mixed = q("S?", [L("A. a ✓"), L("B. b", "g"), L("C. c")]);
    expect(refused(both(mixed, [0]))).toContain("C2 question 1: a tick marks option A but green marks option B; they must mark the same option");
  });

  it("falls back to the bold OPTION in a cell with no tick and no green; a bold stem does not count", () => {
    const en = joinQ(q("First?", enOpts(3, 2, "b"), true), q("Second?", enOpts(3, 0, "b"), true));
    const out = convert(both(en, [2, 0])).content.lessons[0].practice;
    expect(out.map(correctOf)).toEqual([2, 0]);
  });

  it("refuses two bold options in one question, and a question with no mark at all", () => {
    const two = q("S?", [L("A. a", "b"), L("B. b", "b"), L("C. c")]);
    expect(refused(both(two, [0]))).toContain("C2 question 1 has 2 options marked correct; it needs exactly 1");
    const none = q("S?", [L("A. a"), L("B. b"), L("C. c")], true);
    expect(refused(both(none, [0]))).toContain("C2 question 1 has 0 options marked correct; it needs exactly 1");
  });

  it("makes the bold fallback per CELL: a green option in question 1 and only bold in question 2 refuses question 2", () => {
    const en = joinQ(q("First?", enOpts(3, 0, "g")), q("Second?", enOpts(3, 1, "b")));
    const problems = refused(both(en, [0, 1]));
    expect(problems).toContain("C2 question 2 has 0 options marked correct; it needs exactly 1");
    expect(problems.filter((p) => p.startsWith("C2 question 1"))).toEqual([]);
  });

  it("refuses an option that is only partly green (a wrong option with one green word, the right one unmarked); a fully green option still works", () => {
    // B has one green word, the right option C carries no mark: B must not silently become the answer
    const sharedXml = `<si><r><rPr><sz val="10"/><color theme="1"/></rPr><t xml:space="preserve">S?\r\nA. a\r\nB. one </t></r><r><rPr><color rgb="FF00FF00"/></rPr><t>green</t></r><r><rPr><color theme="1"/></rPr><t xml:space="preserve"> word\r\nC. c</t></r></si>`;
    const zip = new AdmZip(book([{ name: "Module 2", cells: moduleCells(2, [{ C: "placeholder", D: q(`${km("s")}?`, kmOpts(3, 2, "g")) }]) }]));
    const sst = zip.readAsText("xl/sharedStrings.xml");
    zip.updateFile("xl/sharedStrings.xml", Buffer.from(sst.replace(/<si><t xml:space="preserve">placeholder<\/t><\/si>/, sharedXml)));
    expect(refused(zip.toBuffer(), {})).toContain("C2 question 1: option B is partly green; colour the whole option or none of it");
    // a fully green option is the answer
    expect(correctOf(convert(both(q("S?", enOpts(3, 2, "g")), [2])).content.lessons[0].practice[0])).toBe(2);
  });

  it("refuses an option that is only partly bold in a bold-fallback cell, but ignores partly bold where green or a tick decides", () => {
    const sharedBold = (green: boolean) =>
      `<si><r><rPr><sz val="10"/></rPr><t xml:space="preserve">S?\r\nA. a\r\nB. one </t></r><r><rPr><b/></rPr><t>bold</t></r><r><rPr><sz val="10"/></rPr><t xml:space="preserve"> word\r\n</t></r><r><rPr>${green ? '<color rgb="FF00FF00"/>' : "<b/>"}</rPr><t>C. c</t></r></si>`;
    const make = (green: boolean) => {
      const zip = new AdmZip(book([{ name: "Module 2", cells: moduleCells(2, [{ C: "placeholder", D: q(`${km("s")}?`, kmOpts(3, 2, "g")) }]) }]));
      const sst = zip.readAsText("xl/sharedStrings.xml");
      zip.updateFile("xl/sharedStrings.xml", Buffer.from(sst.replace(/<si><t xml:space="preserve">placeholder<\/t><\/si>/, sharedBold(green))));
      return zip.toBuffer();
    };
    expect(refused(make(false))).toContain("C2 question 1: option B is partly bold; make the whole option bold or none of it");
    // C is green, so the cell is not a fallback cell and B's partial bold means nothing
    expect(correctOf(convert(make(true)).content.lessons[0].practice[0])).toBe(2);
  });

  it("still refuses English and Khmer that mark different options", () => {
    expect(refused(both(q("S?", enOpts(3, 0, "g")), [2]))).toEqual(["lesson 1 practice question 1: English and Khmer mark a different option correct"]);
  });
});

// ---- option and stem forms ---------------------------------------------------------------------

describe("layout v2: option lines", () => {
  it('reads "- A." options (the dash is dropped) and Khmer ក. options; the stem is copied as written', () => {
    const en = q("Question 1: Stem text?", [L("- A. dash a"), L("- B. dash b", "g"), L("- C. dash c")]);
    const kmc = q(`១៖ ${km("stem")}?`, kmOpts(3, 1, "g"));
    const { content } = convert(oneLesson({ C: en, D: kmc }));
    const p = content.lessons[0].practice[0];
    expect(p.options.map((o: Json) => o.text.en)).toEqual(["dash a", "dash b", "dash c"]);
    expect(p.options.map((o: Json) => o.text.km)).toEqual([0, 1, 2].map((i) => km(`o${i}`)));
    expect(p.text).toEqual({ en: "Question 1: Stem text?", km: `១៖ ${km("stem")}?` });
  });
});

// ---- Khmer only --------------------------------------------------------------------------------

describe("layout v2: a lesson whose English cell is empty", () => {
  it("uses the Khmer for English (text, options, correct answer) and says so once for the cell", () => {
    const l = { ...simple("a"), C: "", E: "" };
    const { content, notices, copiedEnglish } = convert(oneLesson(l));
    const p = content.lessons[0].practice[0];
    expect(p.text).toEqual({ en: `${km("pa")}?`, km: `${km("pa")}?` });
    expect(p.options.map((o: Json) => o.text.en)).toEqual(p.options.map((o: Json) => o.text.km));
    expect(correctOf(p)).toBe(1);
    expect(content.lessons[0].quiz[0].text.en).toBe(`${km("qa")}?`);
    expect(notices).toContain("lesson 1 practice: C2 (English) is empty, so the English text is the Khmer copied from D2");
    expect(notices).toContain("lesson 1 quiz: E2 (English) is empty, so the English text is the Khmer copied from F2");
    expect([...copiedEnglish].sort()).toEqual(["1:practice", "1:quiz"]);
  });

  it("reads a cell that says only N/A, NA or a dash as empty", () => {
    for (const t of ["N/A", " n/a ", "NA", "-", "na\r\n"]) {
      // no practice at all: both cells N/A
      const none = convert(oneLesson({ C: t, D: t, E: simple("a").E, F: simple("a").F }));
      expect(none.content.lessons[0].practice).toEqual([]);
      expect(none.content.lessons[0].quiz).toHaveLength(1);
      // English N/A beside Khmer questions follows the Khmer-copied rule
      const copied = convert(oneLesson({ ...simple("a"), C: t }));
      expect(copied.content.lessons[0].practice[0].text.en).toBe(`${km("pa")}?`);
      expect(copied.notices).toContain("lesson 1 practice: C2 (English) is empty, so the English text is the Khmer copied from D2");
      // Khmer N/A beside English questions is still refused
      expect(refused(oneLesson({ ...simple("a"), D: t }))).toEqual(["lesson 1 practice: D2 (Khmer) is empty but C2 (English) has 1 question; the Khmer is required"]);
    }
    // other short text is still a question cell, and still refused
    expect(refused(oneLesson({ ...simple("a"), C: "N/A please" })).join("|")).toContain("C2 question 1 has no options");
  });

  it("refuses an empty Khmer cell beside an English one, and has no practice when both are empty", () => {
    expect(refused(oneLesson({ ...simple("a"), D: "" }))).toEqual(["lesson 1 practice: D2 (Khmer) is empty but C2 (English) has 1 question; the Khmer is required"]);
    const { content, notices } = convert(oneLesson({ E: simple("a").E, F: simple("a").F }));
    expect(content.lessons[0].practice).toEqual([]);
    expect(notices.filter((n) => n.includes("copied"))).toEqual([]);
  });
});

// ---- video and audio folders -------------------------------------------------------------------

const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const touch = (file: string, bytes = "x") => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
};
/** Two lessons: lesson 1 has 2 practice and 2 quiz questions, lesson 2 one of each. */
const audioBook = () =>
  book([
    {
      name: "Module 2",
      cells: moduleCells(2, [
        {
          C: joinQ(q("P one?", enOpts(3, 0, "g")), q("P two?", enOpts(3, 1, "g"))),
          D: joinQ(q(`${km("a")}?`, kmOpts(3, 0, "g")), q(`${km("b")}?`, kmOpts(3, 1, "g"))),
          E: joinQ(q("Q one?", enOpts(3, 2, "g")), q("Q two?", enOpts(3, 0, "g"))),
          F: joinQ(q(`${km("c")}?`, kmOpts(3, 2, "g")), q(`${km("d")}?`, kmOpts(3, 0, "g"))),
        },
        simple("z"),
      ]),
    },
  ]);

describe("layout v2: the video folder", () => {
  it("finds M<mm>_L<ll>.mp4 anywhere under the folder, records its absolute path, and keeps the target name", () => {
    const vids = tmp();
    touch(path.join(vids, "L01", "M02_L01.mp4"));
    touch(path.join(vids, "M02_L02", "deep", "M02_L02.mp4"));
    touch(path.join(vids, "L01", "M03_L01.mp4"));
    const { content, notices } = convert(audioBook(), { videoFolder: vids });
    expect(content.lessons.map((l: Json) => l.video)).toEqual([
      { ref: "M02_L01", filename: "dcrs-m2-l1.mp4", source: path.join(vids, "L01", "M02_L01.mp4") },
      { ref: "M02_L02", filename: "dcrs-m2-l2.mp4", source: path.join(vids, "M02_L02", "deep", "M02_L02.mp4") },
    ]);
    expect(notices).toContain("L01/M03_L01.mp4 matches no lesson of this module; not used");
    expect(() => validateContent(withProgramme(content), ID)).not.toThrow();
  });

  it("refuses a lesson with no video, or with two, and honours --keep-video", () => {
    const vids = tmp();
    touch(path.join(vids, "a", "M02_L01.mp4"));
    touch(path.join(vids, "b", "M02_L01.mp4"));
    expect(refused(audioBook(), { videoFolder: vids }).join("|")).toContain("lesson 1: its video M02_L01.mp4 is in the folder more than once");
    expect(refused(audioBook(), { videoFolder: vids }).join("|")).toContain("lesson 2: its video M02_L02.mp4 is not in the folder");
    const kept = convert(audioBook(), { videoFolder: vids, keepVideo: [1, 2] });
    expect(kept.content.lessons.map((l: Json) => l.video.keep)).toEqual([true, true]);
  });
});

describe("layout v2: the audio folder", () => {
  const audioOf = (c: Json) => c.lessons.map((l: Json) => [...l.practice, ...l.quiz].map((x: Json) => (x.audio ? path.basename(x.audio.source) : null)));

  it("maps P1/P2/Q1 files to the right questions, accepting a suffix and an upper-case extension, and notes the questions with no file", () => {
    const aud = tmp();
    touch(path.join(aud, "L01", "M02_L01_P1.m4a"));
    touch(path.join(aud, "L01", "M02_L01_P2_Voice_Enhanced.m4a"));
    touch(path.join(aud, "L01", "M02_L01_Q1_Stronger_Noise_Reduction.M4A"));
    touch(path.join(aud, "L01", "notes.txt"));
    const { content, notices } = convert(audioBook(), { audioFolder: aud });
    expect(audioOf(content)).toEqual([
      ["M02_L01_P1.m4a", "M02_L01_P2_Voice_Enhanced.m4a", "M02_L01_Q1_Stronger_Noise_Reduction.M4A", null],
      [null, null],
    ]);
    expect(content.lessons[0].practice[0].audio).toEqual({ source: path.join(aud, "L01", "M02_L01_P1.m4a"), sha256: sha("x") });
    expect(notices).toContain("lesson 1 quiz question 2: no audio file");
    expect(notices).toContain("lesson 2 practice question 1: no audio file");
    expect(notices).not.toContain("lesson 1 practice question 1: no audio file");
    expect(() => validateContent(withProgramme(content), ID)).not.toThrow();
    // and the plan writes the heading for the questions that have a file only
    const plan = planContent(withProgramme(content), ID, { organisationid: "o", now: new Date(0), levelSwitch: "draft" });
    const headings = plan.steps.filter((s: Json) => s.kind === "upsert" && s.table === "questions").map((s: Json) => JSON.parse(s.values.questionheading).headingfile?.filename ?? null);
    expect(headings.filter((h: string | null) => h !== null).sort()).toEqual(["dcrs-m2-l1-p1", "dcrs-m2-l1-p2", "dcrs-m2-l1-q1"].map((n) => `${n}-${sha("x").slice(0, 8)}.m4a`));
  });

  it("refuses a question that does not exist, a lesson that does not exist, two files for one question and a file of another module", () => {
    const aud = tmp();
    touch(path.join(aud, "M02_L01_Q3.m4a")); // lesson 1 has two quiz questions
    touch(path.join(aud, "M02_L07_P1.m4a")); // no lesson 7
    touch(path.join(aud, "x", "M02_L01_P1.m4a"));
    touch(path.join(aud, "y", "M02_L01_P1_Voice_Enhanced.m4a")); // a second file for the same question
    touch(path.join(aud, "M03_L01_P1.m4a")); // module 3 in a module 2 sheet
    expect(refused(audioBook(), { audioFolder: aud })).toEqual([
      "M03_L01_P1.m4a: the file is for module 3, but this sheet is module 2",
      "lesson 1 practice question 1 has two recordings (x/M02_L01_P1.m4a and y/M02_L01_P1_Voice_Enhanced.m4a)",
      "M02_L01_Q3.m4a: lesson 1 has 2 quiz questions, not 3",
      "M02_L07_P1.m4a: the sheet has no lesson 7",
    ]);
  });

  it("refuses an empty recording and ignores files that are not named like a recording, with a notice", () => {
    const aud = tmp();
    touch(path.join(aud, "M02_L01_P1.m4a"), "");
    expect(refused(audioBook(), { audioFolder: aud })).toEqual(["M02_L01_P1.m4a: the file is empty"]);
    const other = tmp();
    touch(path.join(other, "voice memo.m4a"));
    touch(path.join(other, "._M02_L01_P1.m4a"));
    expect(convert(audioBook(), { audioFolder: other }).notices).toContain("voice memo.m4a is not named like M02_L01_P1.m4a; not used");
  });
});

describe("layout v2: a recording for each answer", () => {
  const optAudio = (q: Json) => q.options.map((o: Json) => (o.audio ? path.basename(o.audio.source) : null));
  const sheet = () => audioBook(); // lesson 1: P1, P2 (3 options each), Q1, Q2 (3 options each)

  it("maps _Choice_A.._Choice_C beside _Question to the options of the right question", () => {
    const aud = tmp();
    for (const f of ["M02_L01_P1_Question", "M02_L01_P1_Choice_A", "M02_L01_P1_Choice_B", "M02_L01_P1_Choice_C"]) touch(path.join(aud, "L01", "P1", `${f}.m4a`), f);
    const { content, notices } = convert(sheet(), { audioFolder: aud });
    const p1 = content.lessons[0].practice[0];
    expect(path.basename(p1.audio.source)).toBe("M02_L01_P1_Question.m4a");
    expect(optAudio(p1)).toEqual(["M02_L01_P1_Choice_A.m4a", "M02_L01_P1_Choice_B.m4a", "M02_L01_P1_Choice_C.m4a"]);
    expect(p1.options[1].audio).toEqual({ source: path.join(aud, "L01", "P1", "M02_L01_P1_Choice_B.m4a"), sha256: sha("M02_L01_P1_Choice_B") });
    expect(optAudio(content.lessons[0].practice[1])).toEqual([null, null, null]);
    expect(notices.filter((n) => n.includes("answer recordings"))).toEqual([]);
    expect(() => validateContent(withProgramme(content), ID)).not.toThrow();
  });

  it("accepts a bare _A, a lower-case _choice_b and a suffix after the letter, and keeps _Voice_Enhanced and _Question as question files", () => {
    const aud = tmp();
    touch(path.join(aud, "M02_L01_P1_A.m4a"));
    touch(path.join(aud, "M02_L01_P1_choice_b.m4a"));
    touch(path.join(aud, "M02_L01_P1_Choice_C_Voice_Enhanced.m4a"));
    touch(path.join(aud, "M02_L01_P2_Voice_Enhanced.m4a"));
    touch(path.join(aud, "M02_L01_Q1_Question.m4a"));
    touch(path.join(aud, "M02_L01_Q2_Audio.m4a"));
    const { content } = convert(sheet(), { audioFolder: aud });
    expect(optAudio(content.lessons[0].practice[0])).toEqual(["M02_L01_P1_A.m4a", "M02_L01_P1_choice_b.m4a", "M02_L01_P1_Choice_C_Voice_Enhanced.m4a"]);
    expect(content.lessons[0].practice[0].audio).toBeUndefined();
    expect(path.basename(content.lessons[0].practice[1].audio.source)).toBe("M02_L01_P2_Voice_Enhanced.m4a");
    expect(optAudio(content.lessons[0].practice[1])).toEqual([null, null, null]);
    expect(path.basename(content.lessons[0].quiz[0].audio.source)).toBe("M02_L01_Q1_Question.m4a");
    expect(path.basename(content.lessons[0].quiz[1].audio.source)).toBe("M02_L01_Q2_Audio.m4a");
  });

  it("refuses an option beyond the count, two files for one option, an option of a question that is not there and one of another module", () => {
    const aud = tmp();
    touch(path.join(aud, "M02_L01_P1_Choice_D.m4a")); // 3 options
    touch(path.join(aud, "x", "M02_L01_P2_Choice_B.m4a"));
    touch(path.join(aud, "y", "M02_L01_P2_B_Voice_Enhanced.m4a")); // a second file for P2 option B
    touch(path.join(aud, "M02_L01_Q3_Choice_A.m4a")); // lesson 1 has two quiz questions
    touch(path.join(aud, "M03_L01_P1_Choice_A.m4a"));
    expect(refused(sheet(), { audioFolder: aud }).sort()).toEqual([
      "M02_L01_P1_Choice_D.m4a: lesson 1 practice question 1 has 3 options, so there is no option D",
      "M03_L01_P1_Choice_A.m4a: the file is for module 3, but this sheet is module 2",
      "lesson 1 practice question 2 option B has two recordings (x/M02_L01_P2_Choice_B.m4a and y/M02_L01_P2_B_Voice_Enhanced.m4a)",
      "M02_L01_Q3_Choice_A.m4a: lesson 1 has 2 quiz questions, not 3",
    ].sort());
  });

  it("notes a question with some but not all option recordings, naming the letters, and says nothing for one with none", () => {
    const aud = tmp();
    touch(path.join(aud, "M02_L01_P1_Choice_A.m4a"));
    touch(path.join(aud, "M02_L01_P1_Choice_C.m4a"));
    const { notices } = convert(sheet(), { audioFolder: aud });
    expect(notices).toContain("lesson 1 practice question 1: answer recordings for 2 of 3 options (A, C)");
    expect(notices.filter((n) => n.includes("answer recordings"))).toHaveLength(1);
    expect(notices).toContain("lesson 1 practice question 1: no audio file");
  });

  it("writes the answer key with each option's recording file name beside the option", () => {
    const aud = tmp();
    touch(path.join(aud, "M02_L01_P1_Choice_B.m4a"));
    const { content, copiedEnglish } = convert(sheet(), { audioFolder: aud });
    const md: string = answerKeyMarkdown(content, copiedEnglish);
    const lines = md.split("\n");
    expect(lines.filter((l) => l.startsWith("- A. ") && l.includes("M02_L01_P1_Choice_B.m4a"))).toEqual([]);
    expect(lines.filter((l) => l.startsWith("- B. ") && l.endsWith("(M02_L01_P1_Choice_B.m4a)")).length).toBe(1);
    expect(lines.filter((l) => l.includes("(M02_L01_P1_Choice_B.m4a)"))).toHaveLength(1);
  });
});

// ---- the answer key ----------------------------------------------------------------------------

describe("the answer key", () => {
  it("lists every question with exactly one tick box per language block, the audio file or none, and the copied-English line", () => {
    const aud = tmp();
    touch(path.join(aud, "M02_L01_P1.m4a"));
    const file = book([{ name: "Module 2", cells: moduleCells(2, [{ ...simple("a"), E: "" }]) }]);
    const { content, copiedEnglish } = convert(file, { audioFolder: aud });
    const md: string = answerKeyMarkdown(content, copiedEnglish);
    expect(md).toContain("**Practice question 1**");
    expect(md).toContain("**Quiz question 1**");
    expect(md).toContain("Audio: M02_L01_P1.m4a");
    expect(md).toContain("Audio: no audio");
    expect(md).toContain("(English: Khmer copied)");
    // practice: Khmer block (one), English block (one); quiz: Khmer block only
    const blocks: string[] = md.split("\n\n");
    expect(md.match(/✅/g)).toHaveLength(3);
    expect(blocks.filter((b) => b.startsWith("- A.")).map((b) => (b.match(/✅/g) ?? []).length)).toEqual([1, 1]);
    const km1 = md.indexOf(`Khmer: ${km("pa")}?`);
    expect(km1).toBeGreaterThan(-1);
    expect(md).toContain("- B. option 1 ✅");
  });
});

// ---- the command ---------------------------------------------------------------------------------

describe("dcrs-content-from-xlsx with layout v2", () => {
  const run = (...args: string[]) => spawnSync(process.execPath, [path.join(repoRoot, "scripts", "dcrs-content-from-xlsx.js"), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const withFiles = () => {
    const src = tmp();
    const file = path.join(src, "book.xlsx");
    fs.writeFileSync(
      file,
      book([
        { name: "Module 1", cells: moduleCells(1, [simple("one")]) },
        { name: "Module 2", cells: moduleCells(2, [simple("two"), simple("three")]) },
      ]),
    );
    const prog = path.join(src, "programme-name.json");
    fs.writeFileSync(prog, JSON.stringify({ programme: { en: "Example programme", km: km("programme") } }));
    return { file, prog };
  };

  it("converts the named sheet, copies recordings by name, writes the answer key outside any git tree, and prints the copies", () => {
    const { file, prog } = withFiles();
    const vids = tmp();
    const aud = tmp();
    touch(path.join(vids, "M02_L01", "M02_L01.mp4"));
    touch(path.join(vids, "M02_L02.mp4"));
    touch(path.join(aud, "M02_L02_Q1.m4a"));
    const out = tmp();
    const key = path.join(out, "answer-key.md");
    const r = run(file, out, "--layout", "v2", "--sheet", "Module 2", "--video-folder", vids, "--audio-folder", aud, "--answer-key", key, "--programme", prog);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    const content = JSON.parse(fs.readFileSync(path.join(out, "content.json"), "utf8"));
    expect(content.module.number).toBe(2);
    expect(content.lessons[1].quiz[0].audio).toEqual({ source: path.join(aud, "M02_L02_Q1.m4a"), sha256: sha("x") });
    expect(r.stdout).toContain("audio: 1 of 4 questions have a recording");
    expect(r.stdout).toContain("content.json written: module 2, 2 lessons, 2 practice and 2 quiz questions, with programme name.");
    expect(fs.readFileSync(key, "utf8")).toContain("Audio: M02_L02_Q1.m4a");
    // the sheet by place gives the same content
    const out2 = tmp();
    expect(run(file, out2, "--layout", "v2", "--sheet", "2", "--video-folder", vids, "--audio-folder", aud, "--programme", prog).status).toBe(0);
    expect(fs.readFileSync(path.join(out2, "content.json"), "utf8")).toBe(fs.readFileSync(path.join(out, "content.json"), "utf8"));
  });

  it("refuses an answer key inside a git working tree, or one that already exists, writing nothing", () => {
    const { file, prog } = withFiles();
    const tree = tmp();
    fs.mkdirSync(path.join(tree, ".git"));
    const out = tmp();
    const r = run(file, out, "--layout", "v2", "--sheet", "1", "--keep-video", "1", "--answer-key", path.join(tree, "key.md"), "--programme", prog);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("the answer key's folder is inside a git working tree");
    expect(fs.existsSync(path.join(tree, "key.md"))).toBe(false);
    expect(fs.existsSync(path.join(out, "content.json"))).toBe(false);
    const existing = path.join(out, "key.md");
    fs.writeFileSync(existing, "mine");
    expect(run(file, out, "--layout", "v2", "--sheet", "1", "--keep-video", "1", "--answer-key", existing, "--programme", prog).stderr).toContain("already exists");
    expect(fs.readFileSync(existing, "utf8")).toBe("mine");
  });

  it("refuses an unknown layout and an unknown sheet; without --layout the original layout is read", () => {
    const { file, prog } = withFiles();
    expect(run(file, tmp(), "--layout", "v3").stderr).toContain("--layout must be v2");
    expect(run(file, tmp(), "--layout", "v2", "--sheet", "Module 9", "--keep-video", "1", "--programme", prog).stderr).toContain("no such sheet");
    // the original layout reads C as the video reference and D as English practice: the v2 sheet's C cell is not a reference, so it is read as one
    const r = run(file, tmp(), "--sheet", "1", "--keep-video", "1", "--programme", prog);
    expect(r.status).toBe(1);
  });
});
