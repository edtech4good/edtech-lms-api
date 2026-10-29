#!/usr/bin/env node
/**
 * Dev-only helper: reads the programme author's spreadsheet and writes the
 * content.json that `npm run seed:dcrs -- --content <dir>` reads.
 *
 *   node scripts/dcrs-content-from-xlsx.js <file.xlsx> <output-dir> [--module N] [--video-source name.mp4] [--programme <file>]
 *
 * The module number is read from the English module title in A2 ("Module 2: ..."); `--module N` gives it when the title has none,
 * and must agree with the title when it has one. A file with neither is refused. Module 1 keeps the seed's fixed ids; a later
 * module is a new level of the same programme (see scripts/lib/dcrs-content-plan.js).
 * The converter writes every lesson with `order: 1` (one-lesson modules), so a module of several lessons needs a merged content.json
 * until the client's Module 2 format is known.
 *
 * The programme's name is not in the spreadsheet: it is read from `programme.json` next to the spreadsheet when there is
 * one, or from the file `--programme` names (which takes its place), and written into content.json as `programme`.
 * The file is `{ "programme": { "en": "...", "km": "..." } }`; a name is made one line (trailing whitespace trimmed, a line
 * break inside it joined with a space) and the command says so when it did.
 *
 * The text is the client's, so the output directory must be OUTSIDE this repository
 * (the helper refuses one inside it). The spreadsheet is read, never extracted or run.
 * Format and rules: scripts/lib/dcrs-content-parse.js.
 */
const fs = require("fs");
const path = require("path");
const { readCellsFromXlsx, parseCells, readProgramme, ParseRefused } = require("./lib/dcrs-content-parse");

/**
 * Why `outDir` may not hold the content, or null. The text is the client's, so it must not land in any git working
 * tree. Both paths are resolved through symlinks first (a link into the repo is the repo), then the folder and every
 * ancestor are checked for a `.git` entry: a checkout, a worktree (`.git` is a file there) or the workspace repo.
 */
function outputFolderRefusal(outDir, checkout) {
  const real = fs.realpathSync(outDir);
  const realCheckout = fs.realpathSync(checkout);
  const rel = path.relative(realCheckout, real);
  if (rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))) {
    return "the output directory is inside this repository; the content is not ours to commit";
  }
  for (let dir = real; ; dir = path.dirname(dir)) {
    let hasGit = false;
    try {
      fs.lstatSync(path.join(dir, ".git"));
      hasGit = true;
    } catch (err) {
      if (err.code !== "ENOENT" && err.code !== "ENOTDIR") throw err;
    }
    if (hasGit) return `the output directory is inside a git working tree (${dir}); the content is not ours to commit`;
    if (path.dirname(dir) === dir) return null;
  }
}

function main(argv) {
  const args = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--module") options.module = Number(argv[++i]);
    else if (argv[i] === "--video-source") options.videoSource = argv[++i];
    else if (argv[i] === "--programme") {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) fail("--programme needs a file");
      options.programmeFile = argv[++i];
    }
    else if (argv[i].startsWith("--")) fail(`unknown option ${argv[i]}`);
    else args.push(argv[i]);
  }
  if (args.length !== 2) fail("usage: dcrs-content-from-xlsx.js <file.xlsx> <output-dir> [--module N] [--video-source name.mp4] [--programme <file>]");
  if (options.module !== undefined && !(Number.isInteger(options.module) && options.module >= 1)) fail("--module must be a whole number from 1");
  if (options.videoSource !== undefined && !/^[A-Za-z0-9._-]+$/.test(options.videoSource)) fail("--video-source must be a plain file name");

  const [file, outDir] = args.map((a) => path.resolve(a));
  if (!fs.existsSync(outDir) || !fs.statSync(outDir).isDirectory()) fail("the output directory does not exist");
  const refusal = outputFolderRefusal(outDir, path.resolve(__dirname, ".."));
  if (refusal) fail(refusal);

  let content;
  try {
    // the programme file named with --programme, else programme.json next to the spreadsheet when there is one
    const sidecar = options.programmeFile ? path.resolve(options.programmeFile) : path.join(path.dirname(file), "programme.json");
    let programme;
    if (options.programmeFile || fs.existsSync(sidecar)) {
      const read = readProgramme(sidecar);
      programme = read.programme;
      for (const note of read.notes) console.log(`programme: ${note}`);
    }
    content = parseCells(readCellsFromXlsx(file), { ...options, programme });
  } catch (err) {
    if (err instanceof ParseRefused) fail(err.problems.join("\n  "));
    throw err;
  }
  fs.writeFileSync(path.join(outDir, "content.json"), `${JSON.stringify(content, null, 2)}\n`, { flag: "wx" });
  const lesson = content.lessons[0];
  console.log(
    `content.json written: module ${content.module.number}, ${content.lessons.length} lesson, ${lesson.practice.length} practice and ${lesson.quiz.length} quiz questions, ${content.programme ? "with" : "no"} programme name.`,
  );
  if (!content.programme) console.log("note: there is no programme name, and seed:dcrs refuses a content.json without one (add programme.json next to the spreadsheet, or use --programme).");
}

function fail(message) {
  console.error(`dcrs-content-from-xlsx: ${message}`);
  process.exit(1);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { outputFolderRefusal };
