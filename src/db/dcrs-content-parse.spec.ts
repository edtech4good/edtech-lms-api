/**
 * The dev-only converter from the author's spreadsheet to content.json
 * (scripts/lib/dcrs-content-parse.js): the text rules (\u2713 marks the correct option, English and
 * Khmer matched by position) and the xlsx reader. Fixture Khmer is opaque runs of Khmer-block
 * code points, not words (see dcrs-content-plan.spec.ts).
 */
import AdmZip from "adm-zip";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/* eslint-disable @typescript-eslint/no-var-requires */
const { ID } = require("../../scripts/seed-dcrs-content");
const { validateContent } = require("../../scripts/lib/dcrs-content-plan");
const { ParseRefused, readCellsFromXlsx, parseCells, parseQuizCell, normaliseProgramme, readProgramme, videoFileName } = require("../../scripts/lib/dcrs-content-parse");
const { outputFolderRefusal } = require("../../scripts/dcrs-content-from-xlsx");
/* eslint-enable @typescript-eslint/no-var-requires */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const km = (tag: string) => `\u1780\u17d2\u1781\u17b6${tag}\u1782\u17d2\u1783\u17c1`;
const KD = ["\u17e1", "\u17e2"]; // Khmer digits one and two

const cells = (over: Json = {}): Json => ({
  A2: `Module 1 \u00b7 Example title\n${km("module")}`,
  B2: `1 Example lesson\n${km("lesson")}\u200b${km("two")}`,
  C2: "REF-1",
  D2: [
    "Practice 1 \u2014 first\nStem one?\nA. wrong one\nB. right one \u2713\nC. wrong two",
    "Practice 2 \u2014 second\nStem two?\nA. right \u2713\nB. wrong",
  ].join("\n\n"),
  E2: [
    `${km("t1")}\n${km("s1")}?\nA. ${km("a")}\nB. ${km("b")} \u2713\nC. ${km("c")}`,
    `${km("t2")}\n${km("s2")}?\nA. ${km("d")} \u2713\nB. ${km("e")}`,
  ].join("\n\n"),
  F2: "\n1. Quiz stem one?\nA. no\nB. no\nC. yes \u2713\nD. no\n\n2. Quiz stem two?\nA. yes \u2713\nB. no",
  G2: `${KD[0]}. ${km("q1")}?\nA. ${km("a")}\nB. ${km("b")}\nC. ${km("c")} \u2713\nD. ${km("d")}\n\n${KD[1]}. ${km("q2")}?\nA. ${km("e")} \u2713\nB. ${km("f")}`,
  ...over,
});

const refusal = (c: Json): string[] => {
  try {
    parseCells(c);
  } catch (e) {
    expect(e).toBeInstanceOf(ParseRefused);
    return (e as { problems: string[] }).problems;
  }
  throw new Error("expected the cells to be refused");
};

describe("parsing the cells of row 2", () => {
  it("produces the content.json the seed reads, text copied exactly", () => {
    const c = parseCells(cells(), { videoSource: "lesson_final.mp4" });
    expect(c.module).toEqual({ number: 1, name: { en: "Module 1 \u00b7 Example title", km: km("module") } });
    expect("curriculum" in c || "level" in c).toBe(false); // the old shape's keys are gone
    expect("programme" in c).toBe(false); // none was given
    const [lesson] = c.lessons;
    expect(lesson).toMatchObject({
      id: ID.lesson1,
      order: 1,
      name: { en: "Example lesson", km: `${km("lesson")}\u200b${km("two")}` }, // the English-only lesson number goes; the zero-width space stays
      video: { ref: "REF-1", filename: "dcrs-m1-l1.mp4", source: "lesson_final.mp4" },
    });
    expect(lesson.practice).toEqual([
      {
        ident: "DCRS-M1-P1",
        title: { en: "Practice 1 \u2014 first", km: km("t1") },
        text: { en: "Stem one?", km: `${km("s1")}?` },
        options: [
          { text: { en: "wrong one", km: km("a") }, correct: false },
          { text: { en: "right one", km: km("b") }, correct: true },
          { text: { en: "wrong two", km: km("c") }, correct: false },
        ],
      },
      {
        ident: "DCRS-M1-P2",
        title: { en: "Practice 2 \u2014 second", km: km("t2") },
        text: { en: "Stem two?", km: `${km("s2")}?` },
        options: [
          { text: { en: "right", km: km("d") }, correct: true },
          { text: { en: "wrong", km: km("e") }, correct: false },
        ],
      },
    ]);
    // a quiz stem loses its leading number (ASCII in English, Khmer digit in Khmer); a quiz has no title line
    expect(lesson.quiz.map((q: Json) => [q.ident, q.text.en, q.text.km, q.title])).toEqual([
      ["DCRS-M1-Q1", "Quiz stem one?", `${km("q1")}?`, undefined],
      ["DCRS-M1-Q2", "Quiz stem two?", `${km("q2")}?`, undefined],
    ]);
    expect(lesson.quiz[0].options.map((o: Json) => o.correct)).toEqual([false, false, true, false]);
    expect(lesson.quiz[1].options.map((o: Json) => o.correct)).toEqual([true, false]);
  });

  it("what it produces is accepted by the seed's validator", () => {
    expect(() => validateContent(parseCells(cells(), { programme: { en: "Example programme", km: km("programme") } }), ID)).not.toThrow();
  });

  it("finds the correct option by the tick at the end of the line, wherever it is", () => {
    for (const at of [0, 1, 2, 3]) {
      const lines = ["Stem?", ...["A", "B", "C", "D"].map((l, i) => `${l}. opt${i}${i === at ? " \u2713" : ""}`)];
      const [q] = parseQuizCell(lines.join("\n"), "X", []);
      expect(q.options.map((o: Json) => o.correct)).toEqual([0, 1, 2, 3].map((i) => i === at));
      expect(q.options[at].text).toBe(`opt${at}`);
    }
  });

  it("refuses a question with no tick, two ticks, or a tick that is not at the end", () => {
    expect(refusal(cells({ F2: "1. S?\nA. a\nB. b", G2: cells().G2 })).join("|")).toContain("F2 question 1 has 0 options marked correct; it needs exactly 1");
    expect(refusal(cells({ F2: "1. S?\nA. a \u2713\nB. b \u2713", G2: cells().G2 })).join("|")).toContain("F2 question 1 has 2 options marked correct");
    expect(refusal(cells({ F2: "1. S?\nA. a \u2713 more\nB. b \u2713", G2: cells().G2 })).join("|")).toContain("a tick that is not at the end of option A");
  });

  it("refuses a tick glued to the option text, naming the row, and accepts it once a space separates them", () => {
    expect(refusal(cells({ F2: "1. S?\nA. a\nB. b\u2713", G2: cells().G2 })).join("|")).toContain(
      "F2 question 1: the tick at the end of option B must be separated from the option text by a space",
    );
    expect(refusal(cells({ F2: "1. S?\nA. a\u2714\nB. b", G2: cells().G2 })).join("|")).toContain("F2 question 1: the tick at the end of option A must be separated");
    const [q] = parseQuizCell("S?\nA. a\nB. b \u2713", "X", []);
    expect(q.options.map((o: Json) => [o.text, o.correct])).toEqual([["a", false], ["b", true]]);
  });

  it("refuses English and Khmer that do not line up, by question count, option count and correct option", () => {
    expect(refusal(cells({ G2: cells().G2.split("\n\n")[0] }))).toEqual(["lesson 1 quiz: 2 English questions but 1 Khmer"]);
    expect(refusal(cells({ G2: cells().G2.replace(`\nD. ${km("d")}`, "") }))).toEqual(["lesson 1 quiz question 1: 4 English options but 3 Khmer"]);
    expect(refusal(cells({ E2: cells().E2.replace(` \u2713`, "").replace(`A. ${km("a")}`, `A. ${km("a")} \u2713`) }))).toEqual(["lesson 1 practice question 1: English and Khmer mark a different option correct"]);
  });

  it("drops a lesson number from the English title only when the Khmer title has none; otherwise both stay as written", () => {
    expect(parseCells(cells()).lessons[0].name.en).toBe("Example lesson");
    expect(parseCells(cells({ B2: `2 Example lesson\n${KD[1]} ${km("lesson")}` })).lessons[0].name).toEqual({ en: "2 Example lesson", km: `${KD[1]} ${km("lesson")}` });
    expect(parseCells(cells({ B2: `2 Example lesson\n2 ${km("lesson")}` })).lessons[0].name.en).toBe("2 Example lesson");
    expect(parseCells(cells({ B2: `2024 results\n${km("lesson")}` })).lessons[0].name.en).toBe("results");
    expect(parseCells(cells({ B2: `Example 3\n${km("lesson")}` })).lessons[0].name.en).toBe("Example 3");
  });

  it("refuses a title that is not two lines, English and Khmer the wrong way round, and an empty video reference", () => {
    expect(refusal(cells({ A2: "Only English" }))).toEqual(["A2 (module title) must be two lines (English, then Khmer); it has 1"]);
    expect(refusal(cells({ B2: `${km("lesson")}\nEnglish` }))).toEqual(["B2 (lesson title): the first line must be English and the second Khmer"]);
    expect(refusal(cells({ C2: "  " }))).toEqual(["C2 (video reference) is empty"]);
  });

  it("refuses option letters out of order, and a line in the options that is not an option", () => {
    expect(refusal(cells({ F2: "1. S?\nA. a \u2713\nC. b", G2: cells().G2 })).join("|")).toContain("option letters must run A, B, C in order (found C at position 2)");
    expect(refusal(cells({ F2: "1. S?\nA. a \u2713\nnot an option", G2: cells().G2 })).join("|")).toContain("line 3 is not an option");
  });
});

// ---- the xlsx reader -----------------------------------------------------------------------------

const sheetXml = (cellsXml: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="2">${cellsXml}</row></sheetData></worksheet>`;
const sstXml = (items: string[]) => `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${items.join("")}</sst>`;
const xlsx = (files: Record<string, string>): Buffer => {
  const zip = new AdmZip();
  for (const [name, text] of Object.entries(files)) zip.addFile(name, Buffer.from(text, "utf8"));
  return zip.toBuffer();
};

describe("reading the cells of an .xlsx", () => {
  it("reads shared strings, rich text, inline strings and entities exactly, keeping line breaks and Khmer marks", () => {
    const khmer = `${km("one")}\n${km("two")}\u200b`;
    const file = xlsx({
      "xl/worksheets/sheet1.xml": sheetXml(
        [
          '<c r="A2" t="s"><v>0</v></c>',
          '<c r="B2" t="s"><v>1</v></c>',
          '<c r="C2" t="inlineStr"><is><t>REF &amp; 1</t></is></c>',
          '<c r="D2" t="s"><v>2</v></c>',
          '<c r="E2" s="3"/>',
          '<c r="F2"><v>42</v></c>',
        ].join(""),
      ),
      "xl/sharedStrings.xml": sstXml([
        `<si><t xml:space="preserve">${khmer}</t></si>`,
        '<si><r><t>Rich </t></r><r><rPr/><t>text</t></r><rPh sb="0" eb="1"><t>ignored</t></rPh></si>',
        '<si><t>a &lt;b&gt; &quot;c&quot; &#10003; &#x2713; line_x000D_\nnext</t></si>',
      ]),
    });
    const out = readCellsFromXlsx(file);
    expect(out).toEqual({
      A2: khmer,
      B2: "Rich text",
      C2: "REF & 1",
      D2: 'a <b> "c" \u2713 \u2713 line\nnext', // the escaped carriage return and the line feed read as one line break
    });
    expect(out.A2).toBe(khmer);
  });

  it("refuses a file that is not a spreadsheet, or has no first sheet", () => {
    expect(() => readCellsFromXlsx(Buffer.from("not a zip"))).toThrow(/not a readable \.xlsx file/);
    expect(() => readCellsFromXlsx(xlsx({ "other.xml": "<x/>" }))).toThrow(/sheet1\.xml is missing/);
  });

  it("round-trips: cells written to a sheet come back as the cells the parser reads", () => {
    const c = cells();
    const keys = ["A2", "B2", "C2", "D2", "E2", "F2", "G2"];
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const file = xlsx({
      "xl/worksheets/sheet1.xml": sheetXml(keys.map((k, i) => `<c r="${k}" t="s"><v>${i}</v></c>`).join("")),
      "xl/sharedStrings.xml": sstXml(keys.map((k) => `<si><t xml:space="preserve">${esc(c[k])}</t></si>`)),
    });
    expect(readCellsFromXlsx(file)).toEqual(Object.fromEntries(keys.map((k) => [k, c[k]])));
    expect(parseCells(readCellsFromXlsx(file))).toEqual(parseCells(c));
  });
});

describe("the folder the converter writes content.json into", () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const made: string[] = [];
  const tmp = (): string => {
    const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dcrs-out-")));
    made.push(d);
    return d;
  };
  afterAll(() => {
    for (const d of made) fs.rmSync(d, { recursive: true, force: true });
  });

  it("accepts a folder under the temp directory, which no git working tree contains", () => {
    expect(outputFolderRefusal(tmp(), repoRoot)).toBeNull();
  });

  it("refuses the checkout itself, a folder inside it, and a symlink that leads into it", () => {
    expect(outputFolderRefusal(repoRoot, repoRoot)).toMatch(/inside this repository/);
    expect(outputFolderRefusal(path.join(repoRoot, "scripts"), repoRoot)).toMatch(/inside this repository/);
    const link = path.join(tmp(), "link");
    fs.symlinkSync(path.join(repoRoot, "scripts"), link);
    expect(outputFolderRefusal(link, repoRoot)).toMatch(/inside this repository/);
  });

  it("refuses a folder under any git working tree, a worktree's .git file as well as a .git directory", () => {
    const tree = tmp();
    fs.mkdirSync(path.join(tree, "deep", "er"), { recursive: true });
    fs.writeFileSync(path.join(tree, ".git"), "gitdir: /elsewhere/.git/worktrees/x\n");
    expect(outputFolderRefusal(path.join(tree, "deep", "er"), repoRoot)).toMatch(/inside a git working tree/);
    const other = tmp();
    fs.mkdirSync(path.join(other, ".git"));
    fs.mkdirSync(path.join(other, "out"));
    expect(outputFolderRefusal(path.join(other, "out"), repoRoot)).toMatch(/inside a git working tree/);
    const link = path.join(tmp(), "link");
    fs.symlinkSync(path.join(other, "out"), link);
    expect(outputFolderRefusal(link, repoRoot)).toMatch(/inside a git working tree/);
  });

  it("is what the command applies: content.json is written to a clean folder and refused for a linked or worktree one", () => {
    const keys = ["A2", "B2", "C2", "D2", "E2", "F2", "G2"];
    const c = cells();
    const book = path.join(tmp(), "book.xlsx");
    fs.writeFileSync(
      book,
      xlsx({
        "xl/worksheets/sheet1.xml": sheetXml(keys.map((k, i) => `<c r="${k}" t="s"><v>${i}</v></c>`).join("")),
        "xl/sharedStrings.xml": sstXml(keys.map((k) => `<si><t xml:space="preserve">${c[k].replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></si>`)),
      }),
    );
    const run = (outDir: string) =>
      spawnSync(process.execPath, [path.join(repoRoot, "scripts", "dcrs-content-from-xlsx.js"), book, outDir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

    const clean = tmp();
    expect(run(clean).status).toBe(0);
    expect(fs.existsSync(path.join(clean, "content.json"))).toBe(true);

    const tree = tmp();
    fs.writeFileSync(path.join(tree, ".git"), "gitdir: /elsewhere\n");
    fs.mkdirSync(path.join(tree, "out"));
    const refused = run(path.join(tree, "out"));
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/inside a git working tree/);
    expect(fs.existsSync(path.join(tree, "out", "content.json"))).toBe(false);

    const link = path.join(tmp(), "link");
    fs.symlinkSync(path.join(repoRoot, "scripts"), link);
    const linked = run(link);
    expect(linked.status).toBe(1);
    expect(fs.existsSync(path.join(repoRoot, "scripts", "content.json"))).toBe(false);
  });
});

describe("the module number", () => {
  const titled = (title: string) => cells({ A2: `${title}\n${km("module")}` });
  const numberOf = (c: Json, options: Json = {}) => parseCells(c, options).module.number;

  it("is read from the English title in A2: Module N, any case, any number of digits", () => {
    expect(numberOf(titled("Module 1: Business Vision"))).toBe(1);
    expect(numberOf(titled("Module 2 \u00b7 Example"))).toBe(2);
    expect(numberOf(titled("MODULE 12 - Example"))).toBe(12);
    expect(numberOf(titled("module  3"))).toBe(3);
    expect(parseCells(titled("Module 2: Money")).module).toEqual({ number: 2, name: { en: "Module 2: Money", km: km("module") } });
  });

  it("is read from --module when the title has no number", () => {
    for (const title of ["Business Vision", "Modules 2", "Module two", "Module", "Module 2a", "My Module 2"]) {
      expect(numberOf(titled(title), { module: 3 })).toBe(3);
    }
  });

  it("may be given by both when they agree", () => {
    expect(numberOf(titled("Module 2: Money"), { module: 2 })).toBe(2);
  });

  it("is refused when the title and --module disagree, saying both numbers", () => {
    expect(refusal2(titled("Module 2: Money"), { module: 3 })).toEqual(["the module number is 2 in the title (A2) but --module says 3"]);
    expect(refusal2(titled("Module 1: Vision"), { module: 2 })).toEqual(["the module number is 1 in the title (A2) but --module says 2"]);
  });

  it("is refused when there is neither", () => {
    expect(refusal2(titled("Business Vision"), {})).toEqual(['the module number is unknown: the title in A2 does not begin "Module N", and --module was not given']);
    expect(refusal2(titled("Module"), {})).toEqual(['the module number is unknown: the title in A2 does not begin "Module N", and --module was not given']);
    // and the old default of 1 is gone: no number is not Module 1
    expect(refusal2(cells({ A2: `Example title\n${km("module")}` }), {})).toHaveLength(1);
  });

  it("is refused when --module is not a whole number from 1, or the title's number is zero", () => {
    for (const bad of [0, -1, 1.5, NaN]) expect(refusal2(titled("Business Vision"), { module: bad })).toEqual(["--module must be a whole number from 1"]);
    expect(refusal2(titled("Module 0: Zero"), {})).toEqual(["A2 (module title): the module number must be a whole number from 1"]);
  });

  const refusal2 = (c: Json, options: Json): string[] => {
    try {
      parseCells(c, options);
    } catch (e) {
      expect(e).toBeInstanceOf(ParseRefused);
      return (e as { problems: string[] }).problems;
    }
    throw new Error("expected the cells to be refused");
  };

  it("makes Module 1 what the seed has always read: its fixed lesson id, dcrs-m1 file and DCRS-M1 identifiers", () => {
    const c = parseCells(titled("Module 1: Vision"), { programme: { en: "P", km: km("p") } });
    expect(c.lessons[0].id).toBe(ID.lesson1);
    expect(c.lessons[0].video.filename).toBe("dcrs-m1-l1.mp4");
    expect(c.lessons[0].practice[0].ident).toBe("DCRS-M1-P1");
  });

  it("makes a later module's lesson without an id, its video file and identifiers by the module's number, and what the seed's validator accepts", () => {
    const c = parseCells(titled("Module 2: Money"), { programme: { en: "P", km: km("p") }, videoSource: "synthetic.mp4" });
    expect(c.module.number).toBe(2);
    expect("id" in c.lessons[0]).toBe(false);
    expect(c.lessons[0]).toMatchObject({ order: 1, video: { ref: "REF-1", filename: "dcrs-m2-l1.mp4", source: "synthetic.mp4" } });
    expect(c.lessons[0].practice.map((q: Json) => q.ident)).toEqual(["DCRS-M2-P1", "DCRS-M2-P2"]);
    expect(c.lessons[0].quiz.map((q: Json) => q.ident)).toEqual(["DCRS-M2-Q1", "DCRS-M2-Q2"]);
    expect(() => validateContent(c, ID)).not.toThrow();
    // --module alone gives the same file
    expect(parseCells(titled("Money"), { module: 2, programme: { en: "P", km: km("p") }, videoSource: "synthetic.mp4" }).lessons).toEqual(c.lessons);
  });

  describe("the command", () => {
    const keys = ["A2", "B2", "C2", "D2", "E2", "F2", "G2"];
    const dirs: string[] = [];
    afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
    const tmp = (): string => {
      const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dcrs-mod-")));
      dirs.push(d);
      return d;
    };
    const book = (c: Json): string => {
      const file = path.join(tmp(), "book.xlsx");
      fs.writeFileSync(
        file,
        xlsx({
          "xl/worksheets/sheet1.xml": sheetXml(keys.map((k, i) => `<c r="${k}" t="s"><v>${i}</v></c>`).join("")),
          "xl/sharedStrings.xml": sstXml(keys.map((k) => `<si><t xml:space="preserve">${c[k].replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></si>`)),
        }),
      );
      return file;
    };
    const run = (file: string, outDir: string, extra: string[] = []) =>
      spawnSync(process.execPath, [path.join(path.resolve(__dirname, "..", ".."), "scripts", "dcrs-content-from-xlsx.js"), file, outDir, ...extra], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

    it("--module N names the module when the title has none, the title wins alone, and a disagreement or no number writes nothing", () => {
      const untitled = book(titled("Money"));
      const out2 = tmp();
      expect(run(untitled, out2, ["--module", "2"]).status).toBe(0);
      expect(JSON.parse(fs.readFileSync(path.join(out2, "content.json"), "utf8")).module.number).toBe(2);

      const out1 = tmp();
      const result = run(book(titled("Module 1: Vision")), out1);
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/content\.json written: module 1, 1 lesson, 2 practice and 2 quiz questions, no programme name\./);
      expect(result.stdout).toMatch(/seed:dcrs refuses a content\.json without one/);

      const clash = tmp();
      const refused = run(book(titled("Module 2: Money")), clash, ["--module", "3"]);
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain("the module number is 2 in the title (A2) but --module says 3");
      expect(fs.existsSync(path.join(clash, "content.json"))).toBe(false);

      const neither = tmp();
      const none = run(untitled, neither);
      expect(none.status).toBe(1);
      expect(none.stderr).toContain("the module number is unknown");
      expect(fs.existsSync(path.join(neither, "content.json"))).toBe(false);

      const bad = run(untitled, tmp(), ["--module", "0"]);
      expect(bad.status).toBe(1);
      expect(bad.stderr).toContain("--module must be a whole number from 1");
    });
  });
});

describe("the programme name", () => {
  const programme = { en: "Example programme", km: km("programme") };
  const refused = (raw: unknown): string[] => {
    try {
      normaliseProgramme(raw);
    } catch (e) {
      expect(e).toBeInstanceOf(ParseRefused);
      return (e as { problems: string[] }).problems;
    }
    throw new Error("expected the programme to be refused");
  };

  it("parseCells writes it into content.json, and leaves it out when there is none", () => {
    const c = parseCells(cells(), { programme });
    expect(c.programme).toEqual(programme);
    expect(c.module.name.en).toBe("Module 1 \u00b7 Example title"); // the module title is untouched
    expect(() => validateContent(c, ID)).not.toThrow();
    expect("programme" in parseCells(cells())).toBe(false);
    expect("programme" in parseCells(cells(), { programme: undefined })).toBe(false);
  });

  it("takes a clean pair as it is, with nothing to report", () => {
    expect(normaliseProgramme({ programme })).toEqual({ programme, notes: [] });
  });

  it("trims trailing whitespace and joins a line break with one space, and says what it did", () => {
    const r = normaliseProgramme({ programme: { en: "First part  \n  second part\r\nthird\n", km: `${km("a")}\n${km("b")} \t` } });
    expect(r.programme).toEqual({ en: "First part second part third", km: `${km("a")} ${km("b")}` });
    expect(r.notes).toEqual([
      "programme.en: trailing whitespace trimmed (1 character)",
      "programme.en: 2 line breaks joined with a space",
      "programme.km: trailing whitespace trimmed (2 characters)",
      "programme.km: 1 line break joined with a space",
    ]);
    // the result is always one line, and what is inside a line is copied exactly (a zero-width space and a double space stay)
    const odd = normaliseProgramme({ programme: { en: "a  b", km: `${km("x")}\u200b${km("y")}` } });
    expect(odd.programme).toEqual({ en: "a  b", km: `${km("x")}\u200b${km("y")}` });
    expect(odd.notes).toEqual([]);
    for (const text of [r.programme.en, r.programme.km]) expect(text).not.toMatch(/[\r\n\u2028\u2029]/);
  });

  it("refuses what is not a programme: a missing or empty name, text that is not text, unknown keys, whitespace in front", () => {
    expect(refused(null)).toEqual(['programme.json must be an object with a "programme"']);
    expect(refused({})).toEqual(['programme.json needs "programme": { "en": ..., "km": ... }']);
    expect(refused({ programme: { en: "x" } })).toEqual(["programme.json programme.km must be text"]);
    expect(refused({ programme: { en: "x", km: 3 } })).toEqual(["programme.json programme.km must be text"]);
    expect(refused({ programme: { en: " \n ", km: "x" } })).toEqual(["programme.json programme.en is empty"]);
    expect(refused({ programme: { en: "x", km: "y" }, other: 1 })).toEqual(['programme.json has an unknown key "other"']);
    expect(refused({ programme: { en: "x", km: "y", fr: "z" } })).toEqual(['programme.json programme has an unknown key "fr"']);
    expect(refused({ programme: { en: "\nx", km: "y" } })).toEqual(["programme.json programme.en begins with whitespace"]);
  });

  describe("the file and the command", () => {
    const repoRoot = path.resolve(__dirname, "..", "..");
    const made: string[] = [];
    const tmp = (): string => {
      const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dcrs-prog-")));
      made.push(d);
      return d;
    };
    afterAll(() => {
      for (const d of made) fs.rmSync(d, { recursive: true, force: true });
    });
    const keys = ["A2", "B2", "C2", "D2", "E2", "F2", "G2"];
    const book = (dir: string): string => {
      const c = cells();
      const file = path.join(dir, "book.xlsx");
      fs.writeFileSync(
        file,
        xlsx({
          "xl/worksheets/sheet1.xml": sheetXml(keys.map((k, i) => `<c r="${k}" t="s"><v>${i}</v></c>`).join("")),
          "xl/sharedStrings.xml": sstXml(keys.map((k) => `<si><t xml:space="preserve">${c[k].replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></si>`)),
        }),
      );
      return file;
    };
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [path.join(repoRoot, "scripts", "dcrs-content-from-xlsx.js"), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const content = (dir: string): Json => JSON.parse(fs.readFileSync(path.join(dir, "content.json"), "utf8"));

    it("readProgramme reads a file, and refuses one that is missing, too large, not JSON or a directory", () => {
      const dir = tmp();
      const good = path.join(dir, "programme.json");
      fs.writeFileSync(good, JSON.stringify({ programme }));
      expect(readProgramme(good)).toEqual({ programme, notes: [] });
      const reason = (file: string): string => {
        try {
          readProgramme(file);
        } catch (e) {
          expect(e).toBeInstanceOf(ParseRefused);
          return (e as { problems: string[] }).problems.join(";");
        }
        throw new Error("expected a refusal");
      };
      expect(reason(path.join(dir, "absent.json"))).toMatch(/cannot read the programme file/);
      fs.writeFileSync(path.join(dir, "bad.json"), "{ not json");
      expect(reason(path.join(dir, "bad.json"))).toBe("the programme file is not valid JSON");
      fs.writeFileSync(path.join(dir, "big.json"), " ".repeat(70 * 1024));
      expect(reason(path.join(dir, "big.json"))).toMatch(/larger than/);
      expect(reason(dir)).toMatch(/not a file/);
    });

    it("picks up programme.json next to the spreadsheet, and reports a name it made one line", () => {
      const src = tmp();
      const file = book(src);
      fs.writeFileSync(path.join(src, "programme.json"), JSON.stringify({ programme: { en: "Example programme\n", km: `${km("a")}\n${km("b")}` } }));
      const out = tmp();
      const r = run(file, out);
      expect(r.status).toBe(0);
      expect(content(out).programme).toEqual({ en: "Example programme", km: `${km("a")} ${km("b")}` });
      expect(r.stdout).toContain("programme.en: trailing whitespace trimmed (1 character)");
      expect(r.stdout).toContain("programme.km: 1 line break joined with a space");
      expect(r.stdout).toContain("with programme name");
      // the report counts, it does not quote the name
      expect(r.stdout).not.toContain("Example programme");
    });

    it("--programme names the file and takes the sidecar's place; without either there is no programme", () => {
      const src = tmp();
      const file = book(src);
      fs.writeFileSync(path.join(src, "programme.json"), JSON.stringify({ programme: { en: "Sidecar", km: km("sidecar") } }));
      const elsewhere = path.join(tmp(), "named.json");
      fs.writeFileSync(elsewhere, JSON.stringify({ programme }));
      const out = tmp();
      expect(run(file, out, "--programme", elsewhere).status).toBe(0);
      expect(content(out).programme).toEqual(programme);

      const bare = tmp();
      const out2 = tmp();
      const r = run(book(bare), out2);
      expect(r.status).toBe(0);
      expect("programme" in content(out2)).toBe(false);
      expect(r.stdout).toContain("no programme name");
    });

    it("refuses a bad programme file, writing nothing", () => {
      const src = tmp();
      const file = book(src);
      const named = path.join(src, "p.json");
      fs.writeFileSync(named, JSON.stringify({ programme: { en: "only english" } }));
      const out = tmp();
      const r = run(file, out, "--programme", named);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("programme.km must be text");
      expect(fs.existsSync(path.join(out, "content.json"))).toBe(false);
      const missing = run(file, tmp(), "--programme", path.join(src, "absent.json"));
      expect(missing.status).toBe(1);
      expect(missing.stderr).toMatch(/cannot read the programme file/);
      const noArg = run(file, tmp(), "--programme");
      expect(noArg.status).toBe(1);
      expect(noArg.stderr).toMatch(/--programme needs a file/);
      // a sidecar that is there but bad refuses too, rather than being skipped
      fs.writeFileSync(path.join(src, "programme.json"), "nope");
      const sidecar = run(file, tmp());
      expect(sidecar.status).toBe(1);
      expect(sidecar.stderr).toMatch(/not valid JSON/);
    });
  });
});

// ---- a sheet with a lesson on every row ------------------------------------------------------------------------

const KA = ["ក", "ខ", "គ", "ឃ"]; // the Khmer letters ka, kha, ko, kho: option markers A to D
const opts = (letters: string[], text: (i: number) => string, correct: number) => letters.map((l, i) => `${l}. ${text(i)}${i === correct ? " ✓" : ""}`).join("\n");

/** The cells of lesson row `r` (r >= 2), English and Khmer, with `tag` making its text its own. */
const lessonCells = (r: number, tag: string, over: Json = {}): Json => ({
  B: `${r - 1}. Lesson ${tag}\n${km(`lesson ${tag}`)}`,
  C: `REF-${r}`,
  D: `Stem p${tag}?\n${opts(["A", "B", "C"], (i) => `en${i}`, 1)}`,
  E: `${km(`sp${tag}`)}?\n${opts(KA.slice(0, 3), (i) => km(`o${i}`), 1)}`,
  F: `1. Stem q${tag}?\n${opts(["A", "B", "C", "D"], (i) => `en${i}`, 2)}`,
  G: `${KD[0]}. ${km(`sq${tag}`)}?\n${opts(KA, (i) => km(`o${i}`), 2)}`,
  ...over,
});
/** A sheet of `n` lessons: the module title in A2 and a lesson on each row from 2. */
const sheet = (n: number, over: Record<number, Json> = {}): Json => {
  const out: Json = { A2: `Module 1 · Example title\n${km("module")}` };
  for (let r = 2; r < 2 + n; r++) for (const [col, v] of Object.entries({ ...lessonCells(r, String(r - 1)), ...(over[r] ?? {}) })) if (v !== undefined) out[`${col}${r}`] = v;
  return out;
};
const reasons = (c: Json, options: Json = {}): string[] => {
  try {
    parseCells(c, options);
  } catch (e) {
    expect(e).toBeInstanceOf(ParseRefused);
    return (e as { problems: string[] }).problems;
  }
  throw new Error("expected the cells to be refused");
};

describe("a sheet with one lesson per row", () => {
  it("reads rows 2 on as lessons 1, 2, 3 in order; lesson 1 names the fixed id and the rest have none", () => {
    const c = parseCells(sheet(3));
    expect(c.lessons.map((l: Json) => l.order)).toEqual([1, 2, 3]);
    expect(c.lessons[0].id).toBe(ID.lesson1);
    expect(c.lessons[1].id).toBeUndefined();
    expect(c.lessons.map((l: Json) => l.name.km)).toEqual([km("lesson 1"), km("lesson 2"), km("lesson 3")]);
    expect(c.lessons.map((l: Json) => l.video.filename)).toEqual(["dcrs-m1-l1.mp4", "dcrs-m1-l2.mp4", "dcrs-m1-l3.mp4"]);
    // lesson 1 keeps the identifiers it has always had; the others carry their lesson number so none repeats
    expect(c.lessons[0].practice[0].ident).toBe("DCRS-M1-P1");
    expect(c.lessons[0].quiz[0].ident).toBe("DCRS-M1-Q1");
    expect(c.lessons[1].practice[0].ident).toBe("DCRS-M1-L2-P1");
    expect(c.lessons[2].quiz[0].ident).toBe("DCRS-M1-L3-Q1");
    expect(() => validateContent(parseCells(sheet(6), { programme: { en: "Programme", km: km("programme") } }), ID)).not.toThrow();
  });

  it("a later module's lessons have no fixed id at all, and its identifiers carry the module", () => {
    const cells2 = sheet(2);
    cells2.A2 = `Module 2 · Example\n${km("module")}`;
    const c = parseCells(cells2);
    expect(c.lessons.every((l: Json) => l.id === undefined)).toBe(true);
    expect(c.lessons.map((l: Json) => l.practice[0].ident)).toEqual(["DCRS-M2-P1", "DCRS-M2-L2-P1"]);
    expect(c.lessons[1].video.filename).toBe("dcrs-m2-l2.mp4");
  });

  it("stops at the first row with no lesson title, even when the sheet's dimension runs on", () => {
    const c = sheet(2);
    c.C4 = " "; // a cell that holds only a blank is no content
    c.D4 = "\n";
    expect(parseCells(c).lessons).toHaveLength(2);
  });

  it("refuses text below the last lesson, a module title below row 2, more than twelve lessons, and a sheet with no lesson", () => {
    expect(reasons({ ...sheet(2), D5: "stray" })).toEqual(["D5 has text, but row 4 has no lesson title: the lessons are the rows from 2 to the first row with no title in column B"]);
    const gap = sheet(3);
    delete gap.B4; // a lesson row with no title ends the lessons; its other cells are then stray
    expect(reasons(gap).join("|")).toContain("C4 has text, but row 4 has no lesson title");
    expect(reasons({ ...sheet(2), A3: "Another module" })).toEqual(["A3: the module title is in A2 only"]);
    expect(reasons(sheet(13))).toEqual(["the sheet has 13 lessons; a module has room for 12"]);
    const bare = sheet(1);
    delete bare.B2;
    expect(reasons(bare).join("|")).toContain("B2 (lesson title) is empty");
  });

  it("strips a lesson number, with or without a dot, from the English title only when the Khmer has none", () => {
    const c = parseCells(sheet(3, { 3: { B: `2. Dotted\n${km("two")}` }, 4: { B: `3 Plain\n${km("three")}` } }));
    expect(c.lessons.map((l: Json) => l.name.en)).toEqual(["Lesson 1", "Dotted", "Plain"]);
    const kept = parseCells(sheet(2, { 3: { B: `2. Dotted\n${KD[1]}. ${km("two")}` } }));
    expect(kept.lessons[1].name).toEqual({ en: "2. Dotted", km: `${KD[1]}. ${km("two")}` });
  });

  it("says when a title's number is not the row's, and lets the row decide", () => {
    const notices: string[] = [];
    const c = parseCells(sheet(2, { 3: { B: `5. Fifth\n${km("two")}` } }), { notices });
    expect(c.lessons[1].order).toBe(2);
    expect(notices).toEqual(["B3: the English title began with 5, and this is lesson 2 by its row; the row decides"]);
    const quiet: string[] = [];
    parseCells(sheet(3), { notices: quiet });
    expect(quiet).toEqual([]);
  });

  it("tolerates a blank line at the end of a title cell", () => {
    const c = parseCells(sheet(3, { 3: { B: `2. Lesson two\n${km("lesson two")}\n` }, 4: { B: `3. Lesson three\n${km("lesson three")}\n\n` } }));
    expect(c.lessons.map((l: Json) => l.name.km)).toEqual([km("lesson 1"), km("lesson two"), km("lesson three")]);
  });

  it("keeps the video reference exactly as written and derives nothing from it, typos and all", () => {
    const c = parseCells(sheet(3, { 2: { C: "M1-LO1 · clip" }, 3: { C: "  M9-L02 wrong module  " } }));
    expect(c.lessons.map((l: Json) => l.video.ref)).toEqual(["M1-LO1 · clip", "M9-L02 wrong module", "REF-4"]);
    expect(c.lessons.map((l: Json) => l.video.filename)).toEqual(["dcrs-m1-l1.mp4", "dcrs-m1-l2.mp4", "dcrs-m1-l3.mp4"]);
    expect(reasons(sheet(2, { 3: { C: " " } }))).toEqual(["C3 (video reference) is empty"]);
  });

  it("allows a lesson with no practice and says nothing; a practice cell on one side only is still a mismatch", () => {
    const c = parseCells(sheet(3, { 4: { D: undefined, E: undefined } }));
    expect(c.lessons[2].practice).toEqual([]);
    expect(c.lessons[2].quiz).toHaveLength(1);
    expect(reasons(sheet(2, { 3: { E: undefined } }))).toEqual(["lesson 2 practice: 1 English questions but 0 Khmer"]);
  });

  it("names the lesson and the cell in what it refuses", () => {
    const bad = reasons(sheet(3, { 4: { F: "Stem?\nA. a\nB. b", G: `${km("s")}?\n${KA[0]}. ${km("a")} ✓\n${KA[1]}. ${km("b")}` } }));
    expect(bad).toEqual(["F4 question 1 has 0 options marked correct; it needs exactly 1", "lesson 3 quiz question 1: English and Khmer mark a different option correct"]);
    expect(reasons(sheet(3, { 3: { G: undefined } }))).toEqual(["lesson 2 quiz: 1 English questions but 0 Khmer"]);
  });
});

describe("the questions of a cell", () => {
  const parse = (text: string, notices: string[] = []) => {
    const problems: string[] = [];
    const out = parseQuizCell(text, "X", problems, notices);
    return { out, problems };
  };

  it("takes a blank line between the stem and the options as the same question; questions are separated by blank lines", () => {
    const { out, problems } = parse(`1. Stem one?\n\nA. a\nB. b ✓\n\n2. Stem two?\n\nA. c ✓\nB. d\n\n\n3. Stem three?\nA. e\nB. f ✓\n\n`);
    expect(problems).toEqual([]);
    expect(out.map((q: Json) => [q.stem, q.options.length])).toEqual([["Stem one?", 2], ["Stem two?", 2], ["Stem three?", 2]]);
    // a title line and a stem line in one block, then the options after a blank line
    const titled = parse(`Title line\nStem?\n\nA. a ✓\nB. b`);
    expect(titled.problems).toEqual([]);
    expect(titled.out[0]).toMatchObject({ title: "Title line", stem: "Stem?" });
  });

  it("still refuses what is malformed: options with no stem, two stems in a row, a stem with no options", () => {
    expect(parse(`A. a ✓\nB. b`).problems.join("|")).toContain("X question 1 must have a stem line");
    expect(parse(`A. a ✓\nB. b`).problems.join("|")).toContain("has an empty stem");
    expect(parse(`Stem one?\n\nStem two?\n\nA. a ✓\nB. b`).problems.join("|")).toContain("X question 1 has no options");
    expect(parse(`Stem?`).problems.join("|")).toContain("X question 1 has no options");
    expect(parse(`Stem?\nA. a ✓\nB. b\n\nA. c\nB. d`).problems.join("|")).toContain("X question 2 must have a stem line");
    expect(parse(`One\nTwo\nThree\n\nA. a ✓\nB. b`).problems.join("|")).toContain("it has 3 lines before the options");
  });

  it("takes the Khmer letters ka, kha, ko, kho as the markers A to D, by position, and a Latin letter as before", () => {
    const { out, problems } = parse(`Stem?\n${opts(KA, (i) => `t${i}`, 1)}`);
    expect(problems).toEqual([]);
    expect(out[0].options.map((o: Json) => [o.text, o.correct])).toEqual([["t0", false], ["t1", true], ["t2", false], ["t3", false]]);
    const mixed = parse(`Stem?\nA. a\n${KA[1]}. b ✓\nC. c`);
    expect(mixed.problems).toEqual([]);
    expect(mixed.out[0].options.map((o: Json) => o.text)).toEqual(["a", "b", "c"]);
  });

  it("a Khmer letter that is not the place's own is taken by position, with a notice; a fifth Khmer marker, or a Latin letter out of place, is refused", () => {
    const notices: string[] = [];
    const { out, problems } = parse(`Stem?\n${KA[0]}. a ✓\n${KA[0]}. b\n${KA[2]}. c`, notices);
    expect(problems).toEqual([]);
    expect(out[0].options.map((o: Json) => o.text)).toEqual(["a", "b", "c"]);
    expect(notices).toEqual(["X question 1: option 2 is marked with the first Khmer letter; taken by position as option B"]);
    expect(parse(`Stem?\n${KA.map((l) => `${l}. t`).join("\n")}\n${KA[0]}. t ✓`).problems.join("|")).toContain("Khmer option letters run to the fourth option only (found one at position 5)");
    expect(parse(`Stem?\nA. a ✓\nC. b`).problems.join("|")).toContain("option letters must run A, B, C in order (found C at position 2)");
  });

  it("does not mistake a stem for an option: a Khmer digit and a full stop is a number, and a stem that starts with a Khmer letter is a stem", () => {
    // three questions, each a stem that begins with a Khmer digit and a full stop, a blank line, then Khmer-letter options
    const text = [1, 2, 3]
      .map((n) => `${String.fromCharCode(0x17e0 + n)}. ${km(`stem ${n}`)}?\n\n${opts(KA, (i) => km(`o${i}`), n % 4)}`)
      .join("\n\n");
    const { out, problems } = parse(text);
    expect(problems).toEqual([]);
    expect(out).toHaveLength(3);
    expect(out.map((q: Json) => q.stem)).toEqual([1, 2, 3].map((n) => `${km(`stem ${n}`)}?`));
    // a stem starting with a Khmer consonant that is one of the four markers, but with no full stop after it
    const bare = parse(`${KA[0]}${km("word")}?\n${opts(["A", "B"], (i) => `t${i}`, 0)}`);
    expect(bare.problems).toEqual([]);
    expect(bare.out[0].stem).toBe(`${KA[0]}${km("word")}?`);
    // and a line that does start with one of the four letters, a full stop and a space is an option, however it looks: with nothing before it there is no stem
    expect(parse(`${KA[0]}. ${km("x")} ✓\nA. b`).problems.join("|")).toContain("has an empty stem");
  });

  it("drops a title line that only one side has, with a notice, and keeps one both sides have", () => {
    const notices: string[] = [];
    const c = parseCells(
      sheet(2, {
        2: { D: `Practice 1 — english only\nStem?\n${opts(["A", "B", "C"], (i) => `en${i}`, 1)}` },
        3: { E: `${km("tt")}\n${km("ss")}?\n${opts(KA.slice(0, 3), (i) => km(`o${i}`), 1)}` },
      }),
      { notices },
    );
    expect(c.lessons[0].practice[0].title).toBeUndefined();
    expect(c.lessons[0].practice[0].text).toEqual({ en: "Stem?", km: `${km("sp1")}?` });
    expect(c.lessons[1].practice[0].title).toBeUndefined();
    expect(notices).toEqual([
      "lesson 1 practice question 1: the title line is in English only; dropped (the database holds no title)",
      "lesson 2 practice question 1: the title line is in Khmer only; dropped (the database holds no title)",
    ]);
    const both = parseCells(sheet(1, { 2: { D: `T\nStem?\n${opts(["A", "B"], (i) => `en${i}`, 0)}`, E: `${km("t")}\n${km("s")}?\n${opts(KA.slice(0, 2), (i) => km(`o${i}`), 0)}` } }));
    expect(both.lessons[0].practice[0].title).toEqual({ en: "T", km: km("t") });
  });
});

describe("the videos of a sheet", () => {
  const made: string[] = [];
  const folder = (files: Record<string, string | null> = {}): string => {
    const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dcrs-vid-")));
    made.push(d);
    for (const [name, text] of Object.entries(files)) if (text !== null) fs.writeFileSync(path.join(d, name), text);
    return d;
  };
  afterAll(() => {
    for (const d of made) fs.rmSync(d, { recursive: true, force: true });
  });
  const all = (n: number): Record<string, string> => Object.fromEntries(Array.from({ length: n }, (_, i) => [videoFileName(1, i + 1), "x"]));

  it("names a lesson's file M<module>-L<lesson>-MP4.mp4, each number to two digits", () => {
    expect(videoFileName(1, 2)).toBe("M01-L02-MP4.mp4");
    expect(videoFileName(12, 10)).toBe("M12-L10-MP4.mp4");
  });

  it("records each lesson's file as its source, matched by order", () => {
    const c = parseCells(sheet(3), { videoFolder: folder(all(3)) });
    expect(c.lessons.map((l: Json) => l.video)).toEqual([
      { ref: "REF-2", filename: "dcrs-m1-l1.mp4", source: "M01-L01-MP4.mp4" },
      { ref: "REF-3", filename: "dcrs-m1-l2.mp4", source: "M01-L02-MP4.mp4" },
      { ref: "REF-4", filename: "dcrs-m1-l3.mp4", source: "M01-L03-MP4.mp4" },
    ]);
  });

  it("with lesson 1 kept needs no file for it, and writes it as a kept video with no filename and no source", () => {
    const files = all(3);
    delete files[videoFileName(1, 1)];
    const c = parseCells(sheet(3), { videoFolder: folder(files), keepVideo: [1] });
    expect(c.lessons[0].video).toEqual({ ref: "REF-2", keep: true });
    expect(c.lessons[1].video.source).toBe("M01-L02-MP4.mp4");
    expect(() => validateContent(parseCells(sheet(3), { videoFolder: folder(files), keepVideo: [1], programme: { en: "P", km: km("p") } }), ID)).not.toThrow();
    // without a folder a kept lesson is still a kept lesson
    expect(parseCells(sheet(2), { keepVideo: [1] }).lessons[0].video).toEqual({ ref: "REF-2", keep: true });
  });

  it("refuses a lesson that is not kept and has no file, naming the lesson and the file", () => {
    const files = all(3);
    delete files[videoFileName(1, 3)];
    expect(reasons(sheet(3), { videoFolder: folder(files) })).toEqual(["lesson 3: its video M01-L03-MP4.mp4 is not in the folder (or is not a file with something in it)"]);
    // lesson 1 absent and not kept is refused the same way
    const noFirst = all(2);
    delete noFirst[videoFileName(1, 1)];
    expect(reasons(sheet(2), { videoFolder: folder(noFirst) })).toEqual(["lesson 1: its video M01-L01-MP4.mp4 is not in the folder (or is not a file with something in it)"]);
    // an empty file, a directory and a link are not videos
    const odd = folder({ ...all(3), [videoFileName(1, 2)]: "" });
    expect(reasons(sheet(3), { videoFolder: odd })[0]).toContain("lesson 2:");
    const dir = folder(all(3));
    fs.rmSync(path.join(dir, videoFileName(1, 3)));
    fs.mkdirSync(path.join(dir, videoFileName(1, 3)));
    expect(reasons(sheet(3), { videoFolder: dir })[0]).toContain("lesson 3:");
    const link = folder(all(3));
    fs.rmSync(path.join(link, videoFileName(1, 3)));
    fs.symlinkSync(path.join(link, videoFileName(1, 1)), path.join(link, videoFileName(1, 3)));
    expect(reasons(sheet(3), { videoFolder: link })[0]).toContain("lesson 3:");
  });

  it("refuses every missing lesson at once, and a folder that is not there", () => {
    expect(reasons(sheet(3), { videoFolder: folder({}) })).toHaveLength(3);
    expect(reasons(sheet(2), { videoFolder: path.join(os.tmpdir(), "dcrs-vid-absent-folder") })).toEqual(["--video-folder is not a readable folder"]);
  });

  it("notes a file that no lesson uses, and the file of a lesson whose video is kept", () => {
    const notices: string[] = [];
    parseCells(sheet(2), { videoFolder: folder({ ...all(2), [videoFileName(1, 5)]: "x", "notes.txt": "x" }), keepVideo: [1], notices });
    expect(notices).toEqual(["lesson 1: its video is kept, so M01-L01-MP4.mp4 in the folder is not used", "M01-L05-MP4.mp4 in the folder matches no lesson of this module; not used"]);
  });

  it("refuses to keep a lesson the sheet does not have, and --video-source on a sheet of several lessons or with a folder", () => {
    expect(reasons(sheet(2), { keepVideo: [3] })).toEqual(["--keep-video 3: the sheet has no lesson 3"]);
    expect(reasons(sheet(2), { videoSource: "a.mp4" })).toEqual(["--video-source is for a spreadsheet with one lesson; use --video-folder for a module of several"]);
    expect(reasons(sheet(1), { videoSource: "a.mp4", videoFolder: folder(all(1)) })).toEqual(["--video-source and --video-folder cannot be used together"]);
    expect(parseCells(sheet(1), { videoSource: "a.mp4" }).lessons[0].video.source).toBe("a.mp4");
  });
});

describe("the converter, end to end", () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const made: string[] = [];
  const tmp = (): string => {
    const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dcrs-e2e-")));
    made.push(d);
    return d;
  };
  afterAll(() => {
    for (const d of made) fs.rmSync(d, { recursive: true, force: true });
  });
  const book = (dir: string, c: Json): string => {
    const byRow = new Map<number, string[]>();
    const strings: string[] = [];
    for (const [ref, text] of Object.entries(c)) {
      const row = Number(/\d+/.exec(ref)![0]);
      byRow.set(row, [...(byRow.get(row) ?? []), `<c r="${ref}" t="s"><v>${strings.length}</v></c>`]);
      strings.push(`<si><t xml:space="preserve">${String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></si>`);
    }
    const rows = [...byRow.entries()].sort(([a], [b]) => a - b).map(([r, cs]) => `<row r="${r}">${cs.join("")}</row>`).join("");
    const file = path.join(dir, "book.xlsx");
    fs.writeFileSync(
      file,
      xlsx({
        "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
        "xl/sharedStrings.xml": sstXml(strings),
      }),
    );
    return file;
  };
  const run = (...args: string[]) => spawnSync(process.execPath, [path.join(repoRoot, "scripts", "dcrs-content-from-xlsx.js"), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const programme = (dir: string): string => {
    const f = path.join(dir, "programme-name.json");
    fs.writeFileSync(f, JSON.stringify({ programme: { en: "Example programme", km: km("programme") } }));
    return f;
  };

  it("converts a sheet of three lessons with a video folder and lesson 1 kept: content.json, the references and the notices printed", () => {
    const src = tmp();
    const vids = tmp();
    for (const n of [2, 3]) fs.writeFileSync(path.join(vids, videoFileName(1, n)), "x");
    const file = book(src, sheet(3, { 2: { C: "M1-LO1 reference" } }));
    const out = tmp();
    const r = run(file, out, "--programme", programme(src), "--video-folder", vids, "--keep-video", "1");
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    const content = JSON.parse(fs.readFileSync(path.join(out, "content.json"), "utf8"));
    expect(content.lessons.map((l: Json) => l.order)).toEqual([1, 2, 3]);
    expect(content.lessons[0].video).toEqual({ ref: "M1-LO1 reference", keep: true });
    expect(content.lessons[1].video).toEqual({ ref: "REF-3", filename: "dcrs-m1-l2.mp4", source: "M01-L02-MP4.mp4" });
    expect(() => validateContent(content, ID)).not.toThrow();
    // the reference is printed as written; nothing else of the sheet's text is
    expect(r.stdout).toContain('lesson 1: reference "M1-LO1 reference"; 1 practice and 1 quiz questions; its existing video is kept');
    expect(r.stdout).toContain('lesson 2: reference "REF-3"; 1 practice and 1 quiz questions; video M01-L02-MP4.mp4 to dcrs-m1-l2.mp4');
    expect(r.stdout).toContain("content.json written: module 1, 3 lessons, 3 practice and 3 quiz questions, with programme name.");
    expect(r.stdout).not.toContain("Stem");
  });

  it("refuses a lesson whose video is missing, naming it, and writes nothing", () => {
    const src = tmp();
    const vids = tmp();
    fs.writeFileSync(path.join(vids, videoFileName(1, 2)), "x");
    const out = tmp();
    const r = run(book(src, sheet(3)), out, "--programme", programme(src), "--video-folder", vids, "--keep-video", "1");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("lesson 3: its video M01-L03-MP4.mp4 is not in the folder");
    expect(fs.existsSync(path.join(out, "content.json"))).toBe(false);
  });

  it("refuses --keep-video and --video-folder with nothing after them, or a lesson that is not a number", () => {
    const src = tmp();
    const file = book(src, sheet(2));
    expect(run(file, tmp(), "--keep-video").stderr).toMatch(/--keep-video needs lesson numbers/);
    expect(run(file, tmp(), "--keep-video", "one").stderr).toMatch(/--keep-video needs lesson numbers/);
    expect(run(file, tmp(), "--video-folder").stderr).toMatch(/--video-folder needs a folder/);
    expect(run(file, tmp(), "--keep-video", "7").stderr).toContain("--keep-video 7: the sheet has no lesson 7");
  });

  it("prints the notices for what it changed or took by position", () => {
    const src = tmp();
    const file = book(src, sheet(2, { 2: { D: `Practice 1 — english only\nStem?\n${opts(["A", "B"], (i) => `en${i}`, 0)}`, E: `${km("s")}?\n${opts(KA.slice(0, 2), (i) => km(`o${i}`), 0)}` } }));
    const r = run(file, tmp(), "--programme", programme(src));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("notice: lesson 1 practice question 1: the title line is in English only; dropped (the database holds no title)");
  });
});
