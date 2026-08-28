import { NextFunction, Request, Response } from "express";

export default function flash(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const session = req.session as typeof req.session & {
    flash?: Record<string, any[]>;
  };

  req.flash = ((type?: string, message?: any) => {
    const messages = session.flash ?? {};
    session.flash = messages;

    if (!type) {
      session.flash = {};
      return messages;
    }

    if (message === undefined) {
      const values = messages[type] ?? [];
      delete messages[type];
      return values;
    }

    const values = messages[type] ??= [];
    values.push(...(Array.isArray(message) ? message : [message]));
    return values.length;
  }) as Request["flash"];

  next();
}
