import { NextFunction, Request, Response } from "express";
import flash from "../middlewares/flash";

describe("flash middleware", () => {
  it("stores, reads, and clears messages without deprecated Node APIs", () => {
    const req = { session: {} } as Request;
    const next = jest.fn() as NextFunction;

    flash(req, {} as Response, next);

    expect(req.flash("error", "First")).toBe(1);
    expect(req.flash("error", ["Second", "Third"])).toBe(3);
    expect(req.flash("error")).toEqual(["First", "Second", "Third"]);
    expect(req.flash("error")).toEqual([]);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
