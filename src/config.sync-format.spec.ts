/**
 * `SYNC_FORMAT_DEFAULT` is checked when the configuration loads: unset or 2 or 3 starts the server (unset means 2),
 * anything else refuses to start, so a mistake in it cannot show up as a failed request after learners were saved.
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

  it.each([[undefined, 2], ["", 2], ["2", 2], [" 2 ", 2], ["3", 3]] as Array<[string | undefined, 2 | 3]>)("%j starts, and the default is %d", (value, format) => {
    expect(load(value).defaultSyncFormat()).toBe(format);
  });

  it.each(["1", "4", "two", "3.0", "true", "0"])("%j refuses to start", (value) => {
    expect(() => load(value)).toThrow(/SYNC_FORMAT_DEFAULT must be 2 or 3/);
  });
});
