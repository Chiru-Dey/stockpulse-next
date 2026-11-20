import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiClientError } from "@/lib/api-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const envelope = (code: string, message: string) => ({ error: { code, message } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client basics", () => {
  it("returns parsed JSON and builds query strings without empty values", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], total: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.get("/api/products", { search: "water", page: 2, category_id: undefined, stock_status: "" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/products?search=water&page=2");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
    expect(init.body).toBeUndefined();
  });

  it("sends JSON bodies with the right content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user: { id: 1 } }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await api.post("/api/users", { name: "A" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ name: "A" }));
  });

  it("returns undefined for 204 responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api.delete("/api/products/1")).resolves.toBeUndefined();
  });

  it("surfaces the API error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(envelope("SKU_EXISTS", "SKU already used"), 409)),
    );
    await expect(api.post("/api/products", {})).rejects.toMatchObject({
      name: "ApiClientError",
      status: 409,
      code: "SKU_EXISTS",
      message: "SKU already used",
    });
  });

  it("falls back to a generic message when the body is not an envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    await expect(api.get("/api/products")).rejects.toBeInstanceOf(ApiClientError);
  });
});

describe("session refresh on 401", () => {
  it("refreshes once and retries the original request", async () => {
    let productCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/auth/refresh") return jsonResponse({ access_token: "new" });
      productCalls += 1;
      return productCalls === 1
        ? jsonResponse(envelope("TOKEN_EXPIRED", "expired"), 401)
        : jsonResponse({ items: [], total: 0, page: 1, per_page: 20, pages: 1 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.get<{ total: number }>("/api/products");
    expect(result.total).toBe(0);
    expect(productCalls).toBe(2);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
  });

  it("refreshes for /api/auth/me so a returning user stays signed in", async () => {
    let meCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/auth/refresh") return jsonResponse({ access_token: "new" });
      meCalls += 1;
      return meCalls === 1
        ? jsonResponse(envelope("TOKEN_EXPIRED", "expired"), 401)
        : jsonResponse({ user: { id: 7 } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.get<{ user: { id: number } }>("/api/auth/me");
    expect(result.user.id).toBe(7);
  });

  it("throws the original 401 when refresh fails", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === "/api/auth/refresh"
        ? jsonResponse(envelope("INVALID_REFRESH_TOKEN", "no session"), 401)
        : jsonResponse(envelope("TOKEN_EXPIRED", "expired"), 401),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.get("/api/products")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
  });

  it("shares a single refresh across concurrent 401s", async () => {
    const seen = new Map<string, number>();
    const fetchMock = vi.fn(async (url: string) => {
      const count = (seen.get(url) ?? 0) + 1;
      seen.set(url, count);
      if (url === "/api/auth/refresh") {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return jsonResponse({ access_token: "new" });
      }
      return count === 1
        ? jsonResponse(envelope("TOKEN_EXPIRED", "expired"), 401)
        : jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([api.get("/api/products"), api.get("/api/categories")]);
    expect(seen.get("/api/auth/refresh")).toBe(1);
  });

  it("never tries to refresh the login endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(envelope("INVALID_CREDENTIALS", "Email or password is incorrect"), 401),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.post("/api/auth/login", { email: "a@b.co", password: "x" })).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});