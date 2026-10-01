/**
 * Prints the route policy inventory as Markdown (same enumeration as
 * src/route-policy/route-inventory.spec.ts).
 *
 *   npm run --silent routes:policy                 Markdown table to stdout
 *   npm run --silent routes:policy -- --pending    pending-enforcement list to stdout
 *   npm run routes:policy -- --write               rewrite docs/route-policy-inventory.md
 *                                                  and the pending-enforcement snapshot
 *
 * It builds the application context from AppModule and reads its routes; it
 * starts no HTTP server and runs no query.
 *
 * It runs with NODE_ENV=test, whatever the shell has. Under NODE_ENV=development
 * the application's email service verifies its SMTP transport on import (a
 * network call) and turns on request logging; neither changes which routes are
 * registered, and "test" is still a local environment for the checks in
 * src/config.ts. The jest spec runs under NODE_ENV=test as well, and the result
 * was checked against a live development instance (same method + path set).
 */
import { writeFileSync } from "fs";
import { join } from "path";

const SNAPSHOT_PATH = "src/route-policy/pending-enforcement.snapshot.txt";

async function main() {
  // Before anything from src/ is imported: config.ts reads it once, and dotenv
  // does not override a variable that is already set.
  process.env.NODE_ENV = "test";
  const args = process.argv.slice(2);
  // Importing the application can write log lines to stdout; keep stdout for
  // the document and send everything else to stderr.
  const realWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown, ...rest: unknown[]) =>
    (process.stderr.write as (...a: unknown[]) => boolean)(chunk, ...rest)) as typeof process.stdout.write;
  // Loaded here, not at the top, so the redirect is in place while the
  // application's modules are imported.
  const {
    enumerateRoutes,
    INVENTORY_DOC_PATH,
    renderInventoryMarkdown,
    renderPendingSnapshot,
  } = await import("../src/route-policy/route-inventory");
  const routes = await enumerateRoutes();
  process.stdout.write = realWrite;

  const root = join(__dirname, "..");
  if (args.includes("--write")) {
    writeFileSync(join(root, INVENTORY_DOC_PATH), renderInventoryMarkdown(routes));
    writeFileSync(join(root, SNAPSHOT_PATH), renderPendingSnapshot(routes));
    process.stderr.write(`wrote ${INVENTORY_DOC_PATH} and ${SNAPSHOT_PATH} (${routes.length} routes)\n`);
  } else if (args.includes("--pending")) {
    realWrite(renderPendingSnapshot(routes));
  } else {
    realWrite(renderInventoryMarkdown(routes));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
