import { describe, expect, it } from "vitest";
import { openApiDocument } from "@/lib/openapi";

const doc = openApiDocument as Record<string, unknown>;

function collectRefs(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectRefs(child, out);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") out.push(value);
      else collectRefs(value, out);
    }
  }
}

function resolveRef(ref: string): unknown {
  const segments = ref.replace(/^#\//, "").split("/");
  let current: unknown = doc;
  for (const raw of segments) {
    const seg = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

function operations(): Array<[string, string, Record<string, unknown>]> {
  const paths = doc.paths as Record<string, Record<string, Record<string, unknown>>>;
  const out: Array<[string, string, Record<string, unknown>]> = [];
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      out.push([path, method, op]);
    }
  }
  return out;
}

describe("OpenAPI document", () => {
  it("declares version 3.1 and info", () => {
    expect(doc.openapi).toBe("3.1.0");
    const info = doc.info as Record<string, unknown>;
    expect(info.title).toBe("StockPulse API");
    expect(typeof info.version).toBe("string");
  });

  it("covers every implemented path", () => {
    const paths = Object.keys(doc.paths as Record<string, unknown>);
    for (const expected of [
      "/api/auth/register", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout",
      "/api/auth/me", "/api/users", "/api/users/{id}", "/api/categories", "/api/categories/{id}",
      "/api/products", "/api/products/{id}", "/api/stock-movements", "/api/stock-movements/{id}",
      "/api/dashboard/summary", "/api/health", "/api/openapi", "/api/cron/low-stock-digest",
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it("documents at least 27 operations, each with an id and a response", () => {
    const ops = operations();
    expect(ops.length).toBeGreaterThanOrEqual(27);
    for (const [path, method, op] of ops) {
      expect(typeof op.operationId, `${method} ${path}`).toBe("string");
      const responses = op.responses as Record<string, unknown>;
      expect(Object.keys(responses).length, `${method} ${path}`).toBeGreaterThan(0);
    }
  });

  it("has unique operation ids", () => {
    const ids = operations().map(([, , op]) => op.operationId as string);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves every internal $ref", () => {
    const refs: string[] = [];
    collectRefs(doc, refs);
    expect(refs.length).toBeGreaterThan(20);
    for (const ref of refs) {
      expect(ref.startsWith("#/"), ref).toBe(true);
      expect(resolveRef(ref), ref).not.toBeUndefined();
    }
  });

  it("defines both security schemes", () => {
    const schemes = (doc.components as Record<string, unknown>).securitySchemes as Record<string, unknown>;
    expect(Object.keys(schemes)).toEqual(expect.arrayContaining(["bearerAuth", "cookieAuth"]));
  });
});