import { describe, expect, it } from "vitest";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
} from "@/lib/validation/auth";

describe("registerSchema", () => {
  it("accepts a valid payload and normalizes the email", () => {
    const parsed = registerSchema.parse({
      name: "  New Staff  ",
      email: "  New.Staff@Example.COM ",
      password: "long-enough-1",
    });
    expect(parsed).toEqual({
      name: "New Staff",
      email: "new.staff@example.com",
      password: "long-enough-1",
    });
  });

  it("rejects short passwords", () => {
    expect(() =>
      registerSchema.parse({ name: "A", email: "a@b.co", password: "short" }),
    ).toThrow();
  });

  it("rejects passwords over the bcrypt 72-byte cap", () => {
    expect(() =>
      registerSchema.parse({ name: "A", email: "a@b.co", password: "x".repeat(73) }),
    ).toThrow();
  });

  it("rejects malformed emails", () => {
    expect(() =>
      registerSchema.parse({ name: "A", email: "not-an-email", password: "long-enough-1" }),
    ).toThrow();
  });

  it("rejects empty names", () => {
    expect(() =>
      registerSchema.parse({ name: "   ", email: "a@b.co", password: "long-enough-1" }),
    ).toThrow();
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    const parsed = loginSchema.parse({ email: "A@B.CO", password: "x" });
    expect(parsed.email).toBe("a@b.co");
  });

  it("rejects an empty password", () => {
    expect(() => loginSchema.parse({ email: "a@b.co", password: "" })).toThrow();
  });
});

describe("refreshSchema", () => {
  it("allows an omitted body token (cookie flow)", () => {
    expect(refreshSchema.parse({})).toEqual({});
  });

  it("accepts a 64-char hex token", () => {
    const token = "a".repeat(64);
    expect(refreshSchema.parse({ refresh_token: token })).toEqual({
      refresh_token: token,
    });
  });

  it("rejects malformed tokens", () => {
    expect(() => refreshSchema.parse({ refresh_token: "xyz" })).toThrow();
    expect(() => refreshSchema.parse({ refresh_token: "Z".repeat(64) })).toThrow();
  });
});