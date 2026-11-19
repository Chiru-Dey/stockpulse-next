import { describe, expect, it } from "vitest";
import { parsePagination, paginated } from "@/lib/api/pagination";
import { escapeLike, containsPattern } from "@/lib/db/utils";
import { idParamSchema } from "@/lib/validation/common";
import {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
} from "@/lib/validation/users";

describe("parsePagination", () => {
  it("applies defaults", () => {
    expect(parsePagination(new URL("http://x/api/users"))).toEqual({
      page: 1,
      perPage: 20,
      offset: 0,
      limit: 20,
    });
  });

  it("parses custom values and computes offset", () => {
    expect(parsePagination(new URL("http://x/api/users?page=3&per_page=10"))).toEqual({
      page: 3,
      perPage: 10,
      offset: 20,
      limit: 10,
    });
  });

  it("treats empty params as absent", () => {
    expect(parsePagination(new URL("http://x/api/users?page=&per_page=")).page).toBe(1);
  });

  it("rejects out-of-range and non-numeric values", () => {
    expect(() => parsePagination(new URL("http://x/?per_page=101"))).toThrow();
    expect(() => parsePagination(new URL("http://x/?page=0"))).toThrow();
    expect(() => parsePagination(new URL("http://x/?page=abc"))).toThrow();
  });
});

describe("paginated envelope", () => {
  it("matches the documented list shape", () => {
    const pagination = { page: 2, perPage: 10, offset: 10, limit: 10 };
    expect(paginated([{ id: 1 }], 25, pagination)).toEqual({
      items: [{ id: 1 }],
      total: 25,
      page: 2,
      per_page: 10,
      pages: 3,
    });
  });

  it("never reports zero pages", () => {
    const pagination = { page: 1, perPage: 20, offset: 0, limit: 20 };
    expect(paginated([], 0, pagination)).toEqual({
      items: [],
      total: 0,
      page: 1,
      per_page: 20,
      pages: 1,
    });
  });
});

describe("LIKE escaping", () => {
  it("escapes wildcards and backslashes", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  it("builds a lowercase contains pattern", () => {
    expect(containsPattern("ABC%")).toBe("%abc\\%%");
  });
});

describe("idParamSchema", () => {
  it("coerces positive integers", () => {
    expect(idParamSchema.parse("42")).toBe(42);
  });

  it("rejects junk", () => {
    expect(() => idParamSchema.parse("abc")).toThrow();
    expect(() => idParamSchema.parse("-1")).toThrow();
    expect(() => idParamSchema.parse("1.5")).toThrow();
  });
});

describe("user schemas", () => {
  it("defaults created users to staff", () => {
    const parsed = createUserSchema.parse({
      name: "A",
      email: "a@b.co",
      password: "password-123",
    });
    expect(parsed.role).toBe("staff");
  });

  it("requires at least one update field", () => {
    expect(() => updateUserSchema.parse({})).toThrow();
    expect(updateUserSchema.parse({ name: "New" })).toEqual({ name: "New" });
  });

  it("requires a real boolean for is_active", () => {
    expect(() => updateUserSchema.parse({ is_active: "false" })).toThrow();
    expect(updateUserSchema.parse({ is_active: false })).toEqual({ is_active: false });
  });

  it("validates list filters", () => {
    expect(listUsersQuerySchema.parse({ is_active: "true" }).is_active).toBe("true");
    expect(() => listUsersQuerySchema.parse({ is_active: "yes" })).toThrow();
    expect(() => listUsersQuerySchema.parse({ role: "owner" })).toThrow();
  });
});