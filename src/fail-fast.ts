/**
 * Imported FIRST by server.ts. The logger (built when `config.ts` loads) is created with `exitOnError: false`, and winston's
 * uncaught-exception handler then logs the error and does NOT exit; its mere presence also stops Node's own "crash with
 * code 1". So a refusal thrown while the configuration loads (an invalid `CERTIFICATE_CHECK_URL`, a retired
 * `SYNC_FORMAT_DEFAULT`) was logged, the event loop emptied and the process ended with exit code 0, which a supervisor reads as
 * a clean stop. This handler is registered before the configuration loads and only sets the exit code, so any exception
 * that reaches the top before `bootstrap` installs its own handler ends the process with 1. Normal startup is unchanged.
 */
process.on("uncaughtException", () => {
  process.exitCode = 1;
});
