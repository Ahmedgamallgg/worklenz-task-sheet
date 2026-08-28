describe("business edition resolution", () => {
  const originalEdition = process.env.EDITION;

  afterEach(() => {
    jest.resetModules();
    if (originalEdition === undefined) delete process.env.EDITION;
    else process.env.EDITION = originalEdition;
  });

  it("uses CE directly when configured", () => {
    process.env.EDITION = "ce";
    const warn = jest.spyOn(console, "warn").mockImplementation();

    expect(require("../business").default).toBeDefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back only for a missing EE module without logging its stack", () => {
    delete process.env.EDITION;
    const warn = jest.spyOn(console, "warn").mockImplementation();

    expect(require("../business").default).toBeDefined();
    expect(warn).toHaveBeenCalledWith(
      "[edition] EE implementation unavailable; running open-core (CE).",
    );
  });
});
