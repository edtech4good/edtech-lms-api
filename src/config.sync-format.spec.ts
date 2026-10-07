/**
 * `SYNC_FORMAT_DEFAULT` is a retired setting, checked when the configuration loads: unset or 3 starts the server; 2 (the
 * retired whole-platform format) refuses to start and says to remove the variable; anything else refuses to start. A
 * mistake in it cannot show up as a failed request after learners were saved.
 */
describe("SYNC_FORMAT_DEFAULT", () => {
  const saved = process.env.SYNC_FORMAT_DEFAULT;
  afterEach(() => {
    if (saved === undefined) delete process.env.SYNC_FORMAT_DEFAULT;
    else process.env.SYNC_FORMAT_DEFAULT = saved;
    jest.resetModules();
  });

  const load = (value: string | undefined) => {
    if (value === undefined) delete process.env.SYNC_FORMAT_DEFAULT;
    else process.env.SYNC_FORMAT_DEFAULT = value;
    let config: typeof import("src/config") | undefined;
    jest.isolateModules(() => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      config = require("src/config");
    });
    return config!;
  };

  it.each([[undefined], [""], ["3"], [" 3 "]] as Array<[string | undefined]>)("%j starts", (value) => {
    expect(() => load(value)).not.toThrow();
  });

  it("the default-format function is gone: there is no format to default to", () => {
    expect((load(undefined) as Record<string, unknown>).defaultSyncFormat).toBeUndefined();
  });

  it.each(["2", " 2 "])("%j refuses to start, names the retirement and says to remove the variable", (value) => {
    expect(() => load(value)).toThrow(
      "Refusing to start: SYNC_FORMAT_DEFAULT=2 is retired. Content format 2 (the whole platform's content, rosters without a school id) is no longer produced; content is one organisation's (format 3). Remove SYNC_FORMAT_DEFAULT, or set it to 3.",
    );
  });

  it.each(["1", "4", "two", "3.0", "true", "0"])("%j refuses to start", (value) => {
    expect(() => load(value)).toThrow(`Refusing to start: SYNC_FORMAT_DEFAULT must be 3 or unset (got ${JSON.stringify(value)}).`);
  });
});
