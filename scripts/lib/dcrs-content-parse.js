/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Dev-only: turns a programme author's spreadsheet into the content.json that
 * `seed:dcrs -- --content <dir>` reads (schema: scripts/lib/dcrs-content-plan.js).
 *
 * Two layers, so the text logic can be tested without a spreadsheet:
 *  - `readCellsFromXlsx(file)`: the cells of the first sheet as `{ A1: "text", ... }`, read
 *    with adm-zip (already a dependency) and a small XML reader. Nothing is extracted to
 *    disk; only two named entries are read, with a size ceiling.
 *  - `parseCells(cells)`: row 2 of the sheet to content.json. Columns: A module title,
 *    B lesson title (each "EN\nKM"), C video reference, D/E practice questions (EN/KM),
 *    F/G quiz questions (EN/KM). A quiz cell is blocks separated by a blank line; a block
 *    is an optional title line, a stem line (a quiz stem may start with a number) and one
 *    line per option, "A. text", the correct one ending " \u2713". English and Khmer blocks are
 *    matched by position and must agree on how many questions, how many options and which
 *    option is correct; anything else is refused with the reason.
 *
 * The spreadsheet's text is copied exactly (no trimming inside a line, no normalising), with one
 * exception: a lesson number in front of the English lesson title alone is dropped (see parseCells).
 */
const AdmZip = require("adm-zip");
const { LESSON_IDS } = require("./dcrs-content-plan");

const KHMER = /[\u1780-\u17ff]/;
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const TICK = /\s+[\u2713\u2714]\s*$/; // the tick is separated from the option text by whitespace
const OPTION = /^([A-Za-z])\.\s+(.+)$/;
const NUMBER_PREFIX = /^[0-9\u17e0-\u17e9]+[.)]\s+/;

class ParseRefused extends Error {
  constructor(problems) {
    super(`spreadsheet refused: ${problems.join("; ")}`);
    this.name = "ParseRefused";
    this.problems = problems;
  }
}

// ---- the spreadsheet ------------------------------------------------------------------------

const ENTITY = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unescapeXml(s) {
  return s
    .replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (m, e) => {
      if (e[0] !== "#") return ENTITY[e];
      const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Text of every <t> in an <si> or <is> element, phonetic runs left out. */
function textOf(xml) {
  const without = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of without.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += m[1] ?? "";
  return unescapeXml(out);
}

function entryText(zip, name) {
  const entry = zip.getEntry(name);
  if (!entry) return null;
  if (entry.header.size > MAX_ENTRY_BYTES) throw new ParseRefused([`${name} is larger than ${MAX_ENTRY_BYTES} bytes`]);
  return entry.getData().toString("utf8");
}

/** The cells of the first sheet. `file` is a path or a Buffer. */
function readCellsFromXlsx(file) {
  let zip;
  try {
    zip = new AdmZip(file);
  } catch {
    throw new ParseRefused(["not a readable .xlsx file"]);
  }
  const sheet = entryText(zip, "xl/worksheets/sheet1.xml");
  if (sheet === null) throw new ParseRefused(["xl/worksheets/sheet1.xml is missing"]);
  const sharedXml = entryText(zip, "xl/sharedStrings.xml");
  const shared = [];
  if (sharedXml !== null) for (const m of sharedXml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) shared.push(textOf(m[1] ?? ""));

  const cells = {};
  for (const m of sheet.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = /\br="([A-Z]+[0-9]+)"/.exec(m[1]);
    if (!ref || m[2] === undefined) continue;
    const type = /\bt="(\w+)"/.exec(m[1])?.[1];
    let text;
    if (type === "s") {
      const v = /<v>([0-9]+)<\/v>/.exec(m[2]);
      text = v ? shared[Number(v[1])] : undefined;
    } else if (type === "inlineStr") {
      text = textOf(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(m[2])?.[1] ?? "");
    } else if (type === "str") {
      const v = /<v>([\s\S]*?)<\/v>/.exec(m[2]);
      text = v ? unescapeXml(v[1]) : undefined;
    }
    if (text !== undefined) cells[ref[1]] = text.replace(/\r\n?/g, "\n");
  }
  return cells;
}

// ---- the text -------------------------------------------------------------------------------

/** "EN\nKM" to { en, km }; the English line has no Khmer, the Khmer line has some. */
function splitBilingual(text, where, problems) {
  const lines = String(text ?? "").split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length !== 2) {
    problems.push(`${where} must be two lines (English, then Khmer); it has ${lines.length}`);
    return { en: "", km: "" };
  }
  if (KHMER.test(lines[0]) || !KHMER.test(lines[1])) problems.push(`${where}: the first line must be English and the second Khmer`);
  return { en: lines[0], km: lines[1] };
}

/**
 * One quiz cell to a list of blocks `{ title, stem, options: [{ text, correct }] }`.
 * `title` is null when the block has no title line.
 */
function parseQuizCell(text, where, problems) {
  const blocks = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((b) => b.split("\n").map((l) => l.trim()).filter((l) => l.length > 0))
    .filter((lines) => lines.length > 0);
  return blocks.map((lines, i) => {
    const at = `${where} question ${i + 1}`;
    const optionAt = lines.findIndex((l) => OPTION.test(l));
    const head = optionAt === -1 ? lines : lines.slice(0, optionAt);
    const rest = optionAt === -1 ? [] : lines.slice(optionAt);
    let title = null;
    let stem = "";
    if (head.length === 1) stem = head[0].replace(NUMBER_PREFIX, "");
    else if (head.length === 2) [title, stem] = head;
    else problems.push(`${at} must have a stem line, with at most one title line before it; it has ${head.length} lines before the options`);
    const options = [];
    rest.forEach((line, j) => {
      const m = OPTION.exec(line);
      if (!m) {
        problems.push(`${at}: line ${optionAt + j + 1} is not an option ("A. text")`);
        return;
      }
      if (m[1].toUpperCase() !== String.fromCharCode(65 + j)) problems.push(`${at}: option letters must run A, B, C in order (found ${m[1]} at position ${j + 1})`);
      const correct = TICK.test(m[2]);
      const body = m[2].replace(TICK, "");
      if (/[\u2713\u2714]/.test(body)) {
        problems.push(/[\u2713\u2714]\s*$/.test(body)
          ? `${at}: the tick at the end of option ${m[1]} must be separated from the option text by a space`
          : `${at}: a tick that is not at the end of option ${m[1]}`);
      }
      options.push({ text: body, correct });
    });
    if (options.length === 0) problems.push(`${at} has no options`);
    const correct = options.filter((o) => o.correct).length;
    if (options.length > 0 && correct !== 1) problems.push(`${at} has ${correct} options marked correct; it needs exactly 1`);
    if (stem.length === 0) problems.push(`${at} has an empty stem`);
    return { title, stem, options };
  });
}

/** English and Khmer blocks to questions, matched by position. */
function matchQuestions(en, km, kind, where, ident, problems) {
  if (en.length !== km.length) {
    problems.push(`${where}: ${en.length} English questions but ${km.length} Khmer`);
    return [];
  }
  return en.map((e, i) => {
    const k = km[i];
    const at = `${where} question ${i + 1}`;
    if ((e.title === null) !== (k.title === null)) problems.push(`${at}: only one of English and Khmer has a title line`);
    if (e.options.length !== k.options.length) problems.push(`${at}: ${e.options.length} English options but ${k.options.length} Khmer`);
    else if (e.options.findIndex((o) => o.correct) !== k.options.findIndex((o) => o.correct)) {
      problems.push(`${at}: English and Khmer mark a different option correct`);
    }
    return {
      ident: `${ident}${kind}${i + 1}`,
      ...(e.title !== null && k.title !== null ? { title: { en: e.title, km: k.title } } : {}),
      text: { en: e.stem, km: k.stem },
      options: e.options.map((o, j) => ({ text: { en: o.text, km: k.options[j] ? k.options[j].text : "" }, correct: o.correct })),
    };
  });
}

/**
 * Row 2 of the sheet (`cells`: { A2, B2, ... }) to content.json.
 * `options.module` is the module number used in identifiers and file names (default 1);
 * `options.videoSource` is the local name of the video, printed by the seed (optional).
 */
function parseCells(cells, options = {}) {
  const module = options.module ?? 1;
  const problems = [];
  const moduleTitle = splitBilingual(cells.A2, "A2 (module title)", problems);
  const lessonTitle = splitBilingual(cells.B2, "B2 (lesson title)", problems);
  // A lesson number the spreadsheet puts in front of the English title only ("1 Title") duplicates `order`; it goes when the
  // Khmer title carries no number. If the Khmer has one too, both stay exactly as written.
  if (/^[0-9]+\s+\S/.test(lessonTitle.en) && !/^[0-9\u17e0-\u17e9]/.test(lessonTitle.km)) lessonTitle.en = lessonTitle.en.replace(/^[0-9]+\s+/, "");
  const ref = String(cells.C2 ?? "").trim();
  if (ref.length === 0) problems.push("C2 (video reference) is empty");
  const ident = `DCRS-M${module}-`;
  const practice = matchQuestions(parseQuizCell(cells.D2, "D2", problems), parseQuizCell(cells.E2, "E2", problems), "P", "practice", ident, problems);
  const quiz = matchQuestions(parseQuizCell(cells.F2, "F2", problems), parseQuizCell(cells.G2, "G2", problems), "Q", "quiz", ident, problems);
  if (problems.length > 0) throw new ParseRefused(problems);
  return {
    curriculum: { name: moduleTitle },
    level: { name: moduleTitle },
    lessons: [
      {
        id: LESSON_IDS[0],
        order: 1,
        name: lessonTitle,
        video: { ref, filename: `dcrs-m${module}-l1.mp4`, ...(options.videoSource ? { source: options.videoSource } : {}) },
        practice,
        quiz,
      },
    ],
  };
}

module.exports = { ParseRefused, readCellsFromXlsx, parseCells, parseQuizCell, splitBilingual };
