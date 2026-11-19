import { afterEach, describe, expect, it, vi } from "vitest";
import { isEmailConfigured, sendEmail } from "@/lib/email/mailer";
import {
  escapeHtml,
  renderDailyDigest,
  renderLowStockAlert,
} from "@/lib/email/templates";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const message = {
  to: [{ email: "admin@stockpulse.dev", name: "Asha" }],
  subject: "Test subject",
  html: "<p>hi</p>",
  text: "hi",
};

describe("mailer configuration", () => {
  it("reports unconfigured when key or sender is missing", () => {
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("BREVO_SENDER_EMAIL", "");
    expect(isEmailConfigured()).toBe(false);

    vi.stubEnv("BREVO_API_KEY", "key");
    expect(isEmailConfigured()).toBe(false);

    vi.stubEnv("BREVO_SENDER_EMAIL", "a@b.co");
    expect(isEmailConfigured()).toBe(true);
  });

  it("skips without calling fetch when unconfigured", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("BREVO_SENDER_EMAIL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendEmail(message);
    expect(result).toEqual({ skipped: true, recipients: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips when there are no recipients", async () => {
    vi.stubEnv("BREVO_API_KEY", "key");
    vi.stubEnv("BREVO_SENDER_EMAIL", "alerts@stockpulse.dev");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendEmail({ ...message, to: [] });
    expect(result).toEqual({ skipped: true, recipients: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("mailer send", () => {
  it("posts the documented Brevo payload and returns the message id", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");
    vi.stubEnv("BREVO_SENDER_EMAIL", "alerts@stockpulse.dev");
    vi.stubEnv("BREVO_SENDER_NAME", "StockPulse Alerts");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messageId: "<msg-1@brevo>" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail({ ...message, tags: ["low-stock-alert"] });
    expect(result).toEqual({
      skipped: false,
      recipients: 1,
      messageId: "<msg-1@brevo>",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("test-api-key");

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.sender).toEqual({
      email: "alerts@stockpulse.dev",
      name: "StockPulse Alerts",
    });
    expect(body.to).toEqual(message.to);
    expect(body.subject).toBe("Test subject");
    expect(body.htmlContent).toBe("<p>hi</p>");
    expect(body.textContent).toBe("hi");
    expect(body.tags).toEqual(["low-stock-alert"]);
  });

  it("throws with status and body when Brevo rejects the send", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");
    vi.stubEnv("BREVO_SENDER_EMAIL", "alerts@stockpulse.dev");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("invalid sender", { status: 400 })),
    );

    await expect(sendEmail(message)).rejects.toThrow(/Brevo send failed \(400\)/);
  });
});

describe("templates", () => {
  it("escapes all HTML-sensitive characters", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
    );
  });

  it("renders a low-stock alert with escaped product data", () => {
    const rendered = renderLowStockAlert({
      sku: "SKU-1",
      name: `<script>alert("x")</script>`,
      stock_qty: 3,
      low_stock_threshold: 5,
      movement_quantity: 7,
      actor_name: "Ravi & Co",
      occurred_at: "2026-11-19T10:00:00.000Z",
      app_url: "https://stockpulse-next.vercel.app",
    });
    expect(rendered.subject).toBe("[StockPulse] Low stock: SKU-1 (3 left)");
    expect(rendered.html).toContain("LOW STOCK");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("Ravi &amp; Co");
    expect(rendered.html).toContain("https://stockpulse-next.vercel.app/products");
    expect(rendered.text).toContain("Remaining: 3");
  });

  it("uses an out-of-stock subject at zero", () => {
    const rendered = renderLowStockAlert({
      sku: "SKU-2",
      name: "Cola",
      stock_qty: 0,
      low_stock_threshold: 12,
      movement_quantity: 12,
      actor_name: "Asha",
      occurred_at: "2026-11-19T10:00:00.000Z",
      app_url: "http://localhost:3000",
    });
    expect(rendered.subject).toBe("[StockPulse] OUT OF STOCK: SKU-2");
    expect(rendered.html).toContain("OUT OF STOCK");
  });

  it("renders digest rows and an all-healthy variant", () => {
    const withItems = renderDailyDigest({
      generated_at: "2026-11-19T03:00:00.000Z",
      app_url: "http://localhost:3000",
      items: [
        {
          sku: "SKU-A",
          name: "Water",
          category_name: "Beverages",
          stock_qty: 0,
          low_stock_threshold: 10,
          stock_status: "out",
        },
        {
          sku: "SKU-B",
          name: "Juice",
          category_name: "Beverages",
          stock_qty: 4,
          low_stock_threshold: 8,
          stock_status: "low",
        },
      ],
    });
    expect(withItems.subject).toBe(
      "[StockPulse] Daily digest: 2 product(s) need attention (1 out)",
    );
    expect(withItems.html).toContain("SKU-A");
    expect(withItems.html).toContain("OUT OF STOCK");
    expect(withItems.text).toContain("qty 4 | threshold 8 | LOW STOCK");

    const healthy = renderDailyDigest({
      generated_at: "2026-11-19T03:00:00.000Z",
      app_url: "http://localhost:3000",
      items: [],
    });
    expect(healthy.subject).toBe("[StockPulse] Daily digest: all stock healthy");
    expect(healthy.text).toContain("above their thresholds");
  });
});