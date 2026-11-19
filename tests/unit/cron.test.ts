import { afterEach, describe, expect, it, vi } from "vitest";
import { extractCronSecret, requireCronSecret } from "@/lib/auth/cron";

const SECRET = "unit-cron-secret-0123456789abcdef";

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/cron/low-stock-digest", {
    headers,
  });
}

describe("extractCronSecret", () => {
  it("reads the Bearer token first", () => {
    expect(
      extractCronSecret(request({ authorization: `Bearer ${SECRET}`, "x-cron-secret": "other" })),
    ).toBe(SECRET);
  });

  it("falls back to x-cron-secret", () => {
    expect(extractCronSecret(request({ "x-cron-secret": SECRET }))).toBe(SECRET);
  });

  it("returns null when absent or blank", () => {
    expect(extractCronSecret(request())).toBeNull();
    expect(extractCronSecret(request({ authorization: "Bearer   " }))).toBeNull();
  });
});

describe("requireCronSecret", () => {
  it("503s when the deployment has no usable secret", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(() => requireCronSecret(request({ "x-cron-secret": SECRET }))).toThrow(
      expect.objectContaining({ status: 503, code: "CRON_NOT_CONFIGURED" }),
    );

    vi.stubEnv("CRON_SECRET", "too-short");
    expect(() => requireCronSecret(request({ "x-cron-secret": SECRET }))).toThrow(
      expect.objectContaining({ status: 503 }),
    );
  });

  it("401s on missing or wrong secrets", () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect(() => requireCronSecret(request())).toThrow(
      expect.objectContaining({ status: 401, code: "UNAUTHORIZED" }),
    );
    expect(() =>
      requireCronSecret(request({ authorization: "Bearer wrong-secret-same-length-abc" })),
    ).toThrow(expect.objectContaining({ status: 401 }));
  });

  it("accepts a matching secret via either header", () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect(() =>
      requireCronSecret(request({ authorization: `Bearer ${SECRET}` })),
    ).not.toThrow();
    expect(() =>
      requireCronSecret(request({ "x-cron-secret": SECRET })),
    ).not.toThrow();
  });
});