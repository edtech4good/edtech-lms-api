import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * A refusal thrown while the configuration loads must end the process with a non-zero code even though the logger installs an
 * uncaught-exception handler that does not exit (exitOnError false). Run in a child process: the handler under test is Node's.
 */
const run = (withFailFast: boolean) => {
  const script = `
    require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "commonjs" } });
    process.on("uncaughtException", () => {}); // what the logger's handler amounts to: it logs and does not exit
    ${withFailFast ? `require(${JSON.stringify(join(__dirname, "fail-fast.ts"))});` : ""}
    throw new Error("Refusing to start: test");
  `;
  return spawnSync(process.execPath, ["-e", script], { cwd: join(__dirname, ".."), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).status;
};

describe("fail-fast", () => {
  it("without it, a handler that does not exit lets the process end with 0 (the fault)", () => {
    expect(run(false)).toBe(0);
  });
  it("with it, the same refusal ends the process with 1", () => {
    expect(run(true)).toBe(1);
  });
  it("server.ts imports it before anything else", () => {
    expect(readFileSync(join(__dirname, "server.ts"), "utf8").split("\n")[0]).toBe("import './fail-fast';");
  });
});
