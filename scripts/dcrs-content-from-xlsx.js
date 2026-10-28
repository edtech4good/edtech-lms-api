#!/usr/bin/env node
/**
 * Dev-only helper: reads the programme author's spreadsheet and writes the
 * content.json that `npm run seed:dcrs -- --content <dir>` reads.
 *
 *   node scripts/dcrs-content-from-xlsx.js <file.xlsx> <output-dir> [--module 1] [--video-source name.mp4]
 *
 * The text is the client's, so the output directory must be OUTSIDE this repository
 * (the helper refuses one inside it). The spreadsheet is read, never extracted or run.
 * Format and rules: scripts/lib/dcrs-content-parse.js.
 */
const fs = require("fs");
const path = require("path");
const { readCellsFromXlsx, parseCells, ParseRefused } = require("./lib/dcrs-content-parse");

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
    else if (argv[i].startsWith("--")) fail(`unknown option ${argv[i]}`);
    else args.push(argv[i]);
  }
  if (args.length !== 2) fail("usage: dcrs-content-from-xlsx.js <file.xlsx> <output-dir> [--module 1] [--video-source name.mp4]");
  if (options.module !== undefined && !(Number.isInteger(options.module) && options.module >= 1)) fail("--module must be a whole number from 1");
  if (options.videoSource !== undefined && !/^[A-Za-z0-9._-]+$/.test(options.videoSource)) fail("--video-source must be a plain file name");

  const [file, outDir] = args.map((a) => path.resolve(a));
  if (!fs.existsSync(outDir) || !fs.statSync(outDir).isDirectory()) fail("the output directory does not exist");
  const refusal = outputFolderRefusal(outDir, path.resolve(__dirname, ".."));
  if (refusal) fail(refusal);

  let content;
  try {
    content = parseCells(readCellsFromXlsx(file), options);
  } catch (err) {
    if (err instanceof ParseRefused) fail(err.problems.join("\n  "));
    throw err;
  }
  fs.writeFileSync(path.join(outDir, "content.json"), `${JSON.stringify(content, null, 2)}\n`, { flag: "wx" });
  const lesson = content.lessons[0];
  console.log(`content.json written: ${content.lessons.length} lesson, ${lesson.practice.length} practice and ${lesson.quiz.length} quiz questions.`);
}

function fail(message) {
  console.error(`dcrs-content-from-xlsx: ${message}`);
  process.exit(1);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { outputFolderRefusal };
