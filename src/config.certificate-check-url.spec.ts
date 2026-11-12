describe("CERTIFICATE_CHECK_URL", () => {
  const saved = process.env.CERTIFICATE_CHECK_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.CERTIFICATE_CHECK_URL;
    else process.env.CERTIFICATE_CHECK_URL = saved;
    jest.resetModules();
  });
  const load = (value: string | undefined) => {
    if (value === undefined) delete process.env.CERTIFICATE_CHECK_URL;
    else process.env.CERTIFICATE_CHECK_URL = value;
    let config: typeof import("src/config") | undefined;
    jest.isolateModules(() => {
      jest.spyOn(console, "warn").mockImplementation(() => undefined);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      config = require("src/config");
    });
    return config!;
  };

  it.each([["admin.example.test/v"], ["https://admin example.test/v"], ["# REQUIRED"], ["ftp://admin.example.test/v"], [`https://a.example.test/${"x".repeat(2040)}`]])(
    "%j refuses to start, naming the variable",
    (value) => {
      expect(() => load(value)).toThrow(/Refusing to start: CERTIFICATE_CHECK_URL/);
    },
  );

  it("a valid address is normalised: trimmed, trailing slashes removed", () => {
    expect(load(" https://admin.example.test/v// ").certificateCheckBase()).toBe("https://admin.example.test/v");
  });

  it.each([[undefined], [""], ["   "]] as Array<[string | undefined]>)("%j is null and starts", (value) => {
    expect(load(value).certificateCheckBase()).toBeNull();
  });
});
