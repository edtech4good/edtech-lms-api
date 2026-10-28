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
const { ParseRefused, readCellsFromXlsx, parseCells, parseQuizCell } = require("../../scripts/lib/dcrs-content-parse");
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
    expect(c.curriculum.name).toEqual({ en: "Module 1 \u00b7 Example title", km: km("module") });
    expect(c.level).toEqual(c.curriculum);
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
    expect(() => validateContent(parseCells(cells()), ID)).not.toThrow();
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
    expect(refusal(cells({ G2: cells().G2.split("\n\n")[0] }))).toEqual(["quiz: 2 English questions but 1 Khmer"]);
    expect(refusal(cells({ G2: cells().G2.replace(`\nD. ${km("d")}`, "") }))).toEqual(["quiz question 1: 4 English options but 3 Khmer"]);
    expect(refusal(cells({ E2: cells().E2.replace(` \u2713`, "").replace(`A. ${km("a")}`, `A. ${km("a")} \u2713`) }))).toEqual(["practice question 1: English and Khmer mark a different option correct"]);
    expect(refusal(cells({ E2: cells().E2.replace(`${km("t1")}\n`, "") }))).toEqual(["practice question 1: only one of English and Khmer has a title line"]);
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
