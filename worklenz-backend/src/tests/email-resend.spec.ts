jest.mock("../config/db", () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import db from "../config/db";
import { sendEmailEnhanced } from "../shared/email";

const queryMock = db.query as jest.Mock;
const fetchMock = jest.fn();

describe("Resend email delivery", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "TaskSheet <noreply@mail.example.com>";
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });
    queryMock.mockImplementation((sql: string) =>
      Promise.resolve({
        rows: sql.includes("RETURNING id") ? [{ id: "log-id" }] : [],
      }),
    );
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  it("sends a transactional email through Resend", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "resend-message-id" }),
    });

    const result = await sendEmailEnhanced({
      to: ["person@example.com"],
      subject: "Welcome",
      html: "<p>Hello <strong>there</strong></p>",
    });

    expect(result).toEqual({ success: true, messageId: "resend-message-id" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer re_test_key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "TaskSheet <noreply@mail.example.com>",
          to: ["person@example.com"],
          subject: "Welcome",
          html: "<p>Hello <strong>there</strong></p>",
          text: "Hello there",
        }),
      }),
    );
  });

  it("keeps the app usable when email is not configured", async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendEmailEnhanced({
      to: ["person@example.com"],
      subject: "Welcome",
      html: "<p>Hello</p>",
    });

    expect(result).toEqual({
      success: false,
      error: {
        code: "EMAIL_NOT_CONFIGURED",
        message: "Set RESEND_API_KEY and EMAIL_FROM to enable email delivery",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns Resend API errors without exposing credentials", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        name: "validation_error",
        message: "The sending domain is not verified",
      }),
    });

    const result = await sendEmailEnhanced({
      to: ["person@example.com"],
      subject: "Welcome",
      html: "<p>Hello</p>",
    });

    expect(result).toEqual({
      success: false,
      error: {
        code: "RESEND_API_ERROR",
        message: "The sending domain is not verified",
        details: { status: 403, type: "validation_error" },
      },
    });
    expect(JSON.stringify(result)).not.toContain("re_test_key");
  });
});
