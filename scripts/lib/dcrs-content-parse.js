/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Dev-only: turns a programme author's spreadsheet into the content.json that
 * `seed:dcrs -- --content <dir>` reads (schema: scripts/lib/dcrs-content-plan.js).
 *
 * Two layers, so the text logic can be tested without a spreadsheet:
 *  - `readCellsFromXlsx(file)`: the cells of the first sheet as `{ A1: "text", ... }`, read
 *    with adm-zip (already a dependency) and a small XML reader. Nothing is extracted to
 *    disk; only two named entries are read, with a size ceiling.
 *  - `parseCells(cells)`: the rows of the sheet to content.json. Columns: A module title (row 2 only),
 *    B lesson title (each "EN\nKM"), C video reference, D/E practice questions (EN/KM),
 *    F/G quiz questions (EN/KM). Row 2 is lesson 1, row 3 lesson 2, and so on, to the first row with no
 *    lesson title; the row order is the lesson number. A quiz cell is blocks separated by a blank line;
 *    a question is one block, or a stem block followed by a block that starts with an option (a blank line
 *    between the stem and the options is allowed). Its lines are an optional title line, a stem line (a stem
 *    may start with a number) and one line per option, "A. text", the correct one ending " \u2713". The marker
 *    is a Latin letter or one of the first four Khmer letters, taken by position. English and Khmer blocks are
 *    matched by position and must agree on how many questions, how many options and which option is correct;
 *    anything else is refused with the reason. A title line present on one side only is dropped, with a notice.
 *
 * The spreadsheet's text is copied exactly (no trimming inside a line, no normalising), with one
 * exception: a lesson number in front of the English lesson title alone is dropped (see parseCells).
 *
 * The programme's name is not in the spreadsheet. It comes from a small sidecar, `programme.json`
 * (`{ "programme": { "en": "...", "km": "..." } }`), read by `readProgramme` and made one line by
 * `normaliseProgramme`, which says what it changed; `parseCells` writes it into content.json.
 */
const fs = require("fs");
const AdmZip = require("adm-zip");
const path = require("path");
const { LESSON_IDS, MAX_LESSONS_LATER_MODULE } = require("./dcrs-content-plan");

const KHMER = /[\u1780-\u17ff]/;
const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const TICK = /\s+[\u2713\u2714]\s*$/; // the tick is separated from the option text by whitespace
// The Khmer letters ka, kha, ko, kho stand for A, B, C, D. Only these four are markers: a Khmer digit followed by a full stop
// ("1.") is a number in front of a stem, never an option.
const KHMER_MARKERS = "\u1780\u1781\u1782\u1783";
const OPTION = new RegExp(`^([A-Za-z${KHMER_MARKERS}])\\.\\s+(.+)$`);
const KHMER_ORDINAL = ["first", "second", "third", "fourth"];
const NUMBER_PREFIX = /^[0-9\u17e0-\u17e9]+[.)]\s+/;
const MODULE_TITLE = /^Module\s+(\d+)\b/i;

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
 * One quiz cell to a list of questions `{ title, stem, options: [{ text, correct }] }`.
 * `title` is null when the question has no title line. A question is one block of lines, or a stem block followed by a block
 * that starts with an option (the author may leave a blank line between the stem and the options); questions are separated by
 * blank lines. Anything wrong is pushed to `problems`; what is taken by position and not by the letter written goes to `notices`.
 */
function parseQuizCell(text, where, problems, notices = []) {
  const blocks = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((b) => b.split("\n").map((l) => l.trim()).filter((l) => l.length > 0))
    .filter((lines) => lines.length > 0);
  const questions = [];
  for (const lines of blocks) {
    const previous = questions[questions.length - 1];
    if (previous && !previous.some((l) => OPTION.test(l)) && OPTION.test(lines[0])) previous.push(...lines);
    else questions.push([...lines]);
  }
  return questions.map((lines, i) => {
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
      const khmerAt = KHMER_MARKERS.indexOf(m[1]);
      if (khmerAt >= 0) {
        // A Khmer letter marks an option by its place: ka, kha, ko, kho are A to D. A letter that is not the place's own is taken by position, with a notice.
        if (j >= KHMER_MARKERS.length) problems.push(`${at}: Khmer option letters run to the fourth option only (found one at position ${j + 1})`);
        else if (khmerAt !== j) notices.push(`${at}: option ${j + 1} is marked with the ${KHMER_ORDINAL[khmerAt]} Khmer letter; taken by position as option ${String.fromCharCode(65 + j)}`);
      } else if (m[1].toUpperCase() !== String.fromCharCode(65 + j)) {
        problems.push(`${at}: option letters must run A, B, C in order (found ${m[1]} at position ${j + 1})`);
      }
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

/**
 * English and Khmer questions to questions, matched by position. A title line that only one side has is dropped (the database holds
 * no title), and a notice says so; it is not a reason to refuse.
 */
function matchQuestions(en, km, kind, where, ident, problems, notices) {
  if (en.length !== km.length) {
    problems.push(`${where}: ${en.length} English questions but ${km.length} Khmer`);
    return [];
  }
  return en.map((e, i) => {
    const k = km[i];
    const at = `${where} question ${i + 1}`;
    if ((e.title === null) !== (k.title === null)) notices.push(`${at}: the title line is in ${e.title === null ? "Khmer" : "English"} only; dropped (the database holds no title)`);
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

const MAX_SIDECAR_BYTES = 64 * 1024;

/**
 * The programme's name from the sidecar's parsed JSON, as one line each in English and Khmer, plus what was changed to get there:
 * `{ programme: { en, km }, notes: [text, ...] }`. Trailing whitespace is trimmed; a line break inside a name (with the spaces
 * around it) becomes one space; each of the two is noted, with the count, so the caller can say it. Nothing else is touched.
 * Anything else in the sidecar, a name that is missing, not text, empty or beginning with whitespace is refused.
 */
function normaliseProgramme(raw, where = "programme.json") {
  const problems = [];
  const notes = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ParseRefused([`${where} must be an object with a "programme"`]);
  for (const key of Object.keys(raw)) if (key !== "programme") problems.push(`${where} has an unknown key "${key}"`);
  const src = raw.programme;
  if (!src || typeof src !== "object" || Array.isArray(src)) throw new ParseRefused([...problems, `${where} needs "programme": { "en": ..., "km": ... }`]);
  for (const key of Object.keys(src)) if (key !== "en" && key !== "km") problems.push(`${where} programme has an unknown key "${key}"`);
  const programme = {};
  for (const lang of ["en", "km"]) {
    const text = src[lang];
    if (typeof text !== "string") {
      problems.push(`${where} programme.${lang} must be text`);
      continue;
    }
    let out = text.replace(/\s+$/u, "");
    if (out.length !== text.length) notes.push(`programme.${lang}: trailing whitespace trimmed (${text.length - out.length} character${text.length - out.length === 1 ? "" : "s"})`);
    const breaks = (out.match(/(?:\r\n|[\r\n\u2028\u2029])+/g) ?? []).length;
    if (breaks > 0) {
      out = out.replace(/[^\S\r\n\u2028\u2029]*(?:\r\n|[\r\n\u2028\u2029])+[^\S\r\n\u2028\u2029]*/g, " ");
      notes.push(`programme.${lang}: ${breaks} line break${breaks === 1 ? "" : "s"} joined with a space`);
    }
    if (out.length === 0) problems.push(`${where} programme.${lang} is empty`);
    else if (/^\s/u.test(out)) problems.push(`${where} programme.${lang} begins with whitespace`);
    programme[lang] = out;
  }
  if (problems.length > 0) throw new ParseRefused(problems);
  return { programme, notes };
}

/** Reads and normalises a sidecar file (see normaliseProgramme). A file that is large, missing or not JSON is refused. */
function readProgramme(file) {
  let text;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new ParseRefused([`${file} is not a file`]);
    if (stat.size > MAX_SIDECAR_BYTES) throw new ParseRefused([`${file} is larger than ${MAX_SIDECAR_BYTES} bytes`]);
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err instanceof ParseRefused) throw err;
    throw new ParseRefused([`cannot read the programme file (${err.code ?? "error"})`]);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ParseRefused(["the programme file is not valid JSON"]);
  }
  return normaliseProgramme(raw, "the programme file");
}

/**
 * The module number: from the English module title (`Module 2: ...`, any case) and/or `options.module` (`--module N`).
 * One of them is enough; both must agree; neither is refused. Pushes the reason to `problems` and returns null when there is none.
 */
function moduleNumberOf(titleEn, fromOption, problems) {
  const m = MODULE_TITLE.exec(titleEn);
  const fromTitle = m ? Number(m[1]) : null;
  if (fromTitle !== null && !(Number.isSafeInteger(fromTitle) && fromTitle >= 1)) {
    problems.push("A2 (module title): the module number must be a whole number from 1");
    return null;
  }
  if (fromOption !== undefined && !(Number.isSafeInteger(fromOption) && fromOption >= 1)) {
    problems.push("--module must be a whole number from 1");
    return null;
  }
  if (fromTitle !== null && fromOption !== undefined && fromTitle !== fromOption) {
    problems.push(`the module number is ${fromTitle} in the title (A2) but --module says ${fromOption}`);
    return null;
  }
  const number = fromTitle ?? fromOption ?? null;
  if (number === null) problems.push('the module number is unknown: the title in A2 does not begin "Module N", and --module was not given');
  return number;
}

const pad2 = (n) => String(n).padStart(2, "0");
/** The name a lesson's video has in the author's folder: M<module>-L<lesson>-MP4.mp4, both numbers two digits. */
const videoFileName = (moduleNumber, order) => `M${pad2(moduleNumber)}-L${pad2(order)}-MP4.mp4`;
const VIDEO_FILE = /^M\d{2,}-L\d{2,}-MP4\.mp4$/;

/**
 * The video file of each lesson in `folder`, matched by order: `{ [order]: name }`. A lesson in `keep` needs none (its existing video stays),
 * and a file of a kept lesson, or one that no lesson uses, is only noted. A lesson that is not kept and has no file (or a file that is not a
 * regular file with something in it) is a reason to refuse, naming the lesson. The files are not read.
 */
function videoSourcesOf(folder, moduleNumber, orders, keep, problems, notices) {
  let names;
  try {
    names = fs.readdirSync(folder);
  } catch {
    problems.push("--video-folder is not a readable folder");
    return {};
  }
  const sources = {};
  for (const order of orders) {
    const name = videoFileName(moduleNumber, order);
    if (keep.has(order)) {
      if (names.includes(name)) notices.push(`lesson ${order}: its video is kept, so ${name} in the folder is not used`);
      continue;
    }
    let ok = false;
    if (names.includes(name)) {
      const stat = fs.lstatSync(path.join(folder, name));
      ok = stat.isFile() && stat.size > 0;
    }
    if (ok) sources[order] = name;
    else problems.push(`lesson ${order}: its video ${name} is not in the folder (or is not a file with something in it)`);
  }
  const wanted = new Set(orders.map((o) => videoFileName(moduleNumber, o)));
  for (const name of names.filter((n) => VIDEO_FILE.test(n) && !wanted.has(n)).sort()) notices.push(`${name} in the folder matches no lesson of this module; not used`);
  return sources;
}

const COLUMNS = ["A", "B", "C", "D", "E", "F", "G"];

/**
 * The sheet's cells (`cells`: { A2, B2, ... }) to content.json: one lesson per row from row 2, to the first row with no lesson title.
 * The module number comes from the English title in A2 (`Module N ...`) or `options.module`; they must agree and one must exist.
 * Row order is the lesson number (`order`). Anything in the sheet below the last lesson, or a module title below row 2, is refused.
 *   `options.videoSource`: the local name of the video of a spreadsheet with ONE lesson (printed by the seed; optional);
 *   `options.videoFolder`: the folder holding M<module>-L<lesson>-MP4.mp4 for each lesson (each lesson's `video.source`);
 *   `options.keepVideo`: lesson numbers whose existing video stays: `video: { ref, keep: true }` and no file is looked for;
 *   `options.programme`: `{ en, km }`, the programme's name (optional here; from normaliseProgramme; the seed refuses a file without it);
 *   `options.notices`: an array that receives what was changed or taken by position, in words (no refusal).
 * The video reference in column C is kept as written and nothing is derived from it.
 * Module 1's first lesson names the seed's fixed lesson id; every other lesson has no id (its order is its slot). Question idents of
 * lesson 1 are DCRS-M<m>-P1, -Q1 (as before); a later lesson's carry its number: DCRS-M<m>-L2-P1.
 */
function parseCells(cells, options = {}) {
  const problems = [];
  const notices = options.notices ?? [];
  const moduleTitle = splitBilingual(cells.A2, "A2 (module title)", problems);
  // A title that is itself refused has no English line to read a number from; that is the one reason given, not a second one about the number.
  const module = problems.length === 0 ? moduleNumberOf(moduleTitle.en, options.module, problems) : null;

  const isBlank = (v) => v === undefined || String(v).trim().length === 0;
  const rows = [];
  for (let r = 2; !isBlank(cells[`B${r}`]); r++) rows.push(r);
  const stopRow = rows.length + 2;
  if (rows.length === 0) problems.push("B2 (lesson title) is empty; the first lesson is row 2");
  if (rows.length > MAX_LESSONS_LATER_MODULE) problems.push(`the sheet has ${rows.length} lessons; a module has room for ${MAX_LESSONS_LATER_MODULE}`);
  for (const key of Object.keys(cells)) {
    const m = /^([A-Z]+)([0-9]+)$/.exec(key);
    if (m && key !== "A2" && COLUMNS.includes(m[1]) && Number(m[2]) >= stopRow && !isBlank(cells[key])) {
      problems.push(`${key} has text, but row ${stopRow} has no lesson title: the lessons are the rows from 2 to the first row with no title in column B`);
    }
  }
  for (const r of rows.slice(1)) if (!isBlank(cells[`A${r}`])) problems.push(`A${r}: the module title is in A2 only`);

  const keep = new Set(options.keepVideo ?? []);
  for (const order of keep) if (!Number.isInteger(order) || order < 1 || order > rows.length) problems.push(`--keep-video ${order}: the sheet has no lesson ${order}`);
  if (options.videoSource !== undefined && rows.length > 1) problems.push("--video-source is for a spreadsheet with one lesson; use --video-folder for a module of several");
  if (options.videoSource !== undefined && options.videoFolder !== undefined) problems.push("--video-source and --video-folder cannot be used together");
  const sources =
    options.videoFolder !== undefined && module !== null
      ? videoSourcesOf(options.videoFolder, module, rows.map((_, i) => i + 1), keep, problems, notices)
      : {};

  const lessons = rows.map((r, i) => {
    const order = i + 1;
    const lessonTitle = splitBilingual(cells[`B${r}`], `B${r} (lesson title)`, problems);
    // A lesson number the spreadsheet puts in front of the English title only ("1 Title", "2. Title") duplicates `order`; it goes when the
    // Khmer title carries no number. If the Khmer has one too, both stay exactly as written. The row gives the number; a different one is noted.
    const numbered = /^([0-9]+)\.?\s+\S/.exec(lessonTitle.en);
    if (numbered && !/^[0-9\u17e0-\u17e9]/.test(lessonTitle.km)) {
      lessonTitle.en = lessonTitle.en.replace(/^[0-9]+\.?\s+/, "");
      if (Number(numbered[1]) !== order && numbered[1].length < 3) notices.push(`B${r}: the English title began with ${numbered[1]}, and this is lesson ${order} by its row; the row decides`);
    }
    const ref = String(cells[`C${r}`] ?? "").trim();
    if (ref.length === 0) problems.push(`C${r} (video reference) is empty`);
    const ident = order === 1 ? `DCRS-M${module}-` : `DCRS-M${module}-L${order}-`;
    const label = `lesson ${order}`;
    const practice = matchQuestions(parseQuizCell(cells[`D${r}`], `D${r}`, problems, notices), parseQuizCell(cells[`E${r}`], `E${r}`, problems, notices), "P", `${label} practice`, ident, problems, notices);
    const quiz = matchQuestions(parseQuizCell(cells[`F${r}`], `F${r}`, problems, notices), parseQuizCell(cells[`G${r}`], `G${r}`, problems, notices), "Q", `${label} quiz`, ident, problems, notices);
    const source = keep.has(order) ? undefined : sources[order] ?? (order === 1 && rows.length === 1 ? options.videoSource : undefined);
    return {
      ...(module === 1 && order === 1 ? { id: LESSON_IDS[0] } : {}),
      order,
      name: lessonTitle,
      video: keep.has(order) ? { ref, keep: true } : { ref, filename: `dcrs-m${module}-l${order}.mp4`, ...(source ? { source } : {}) },
      practice,
      quiz,
    };
  });
  if (problems.length > 0) throw new ParseRefused(problems);
  return {
    ...(options.programme ? { programme: { en: options.programme.en, km: options.programme.km } } : {}),
    module: { number: module, name: moduleTitle },
    lessons,
  };
}

module.exports = { ParseRefused, readCellsFromXlsx, parseCells, parseQuizCell, splitBilingual, normaliseProgramme, readProgramme, videoFileName, videoSourcesOf };
