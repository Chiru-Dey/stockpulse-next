export type DigestItem = {
  sku: string;
  name: string;
  category_name: string;
  stock_qty: number;
  low_stock_threshold: number;
  stock_status: "low" | "out";
};

export type LowStockAlertData = {
  sku: string;
  name: string;
  stock_qty: number;
  low_stock_threshold: number;
  movement_quantity: number;
  actor_name: string;
  occurred_at: string;
  app_url: string;
};

export type DigestData = {
  generated_at: string;
  app_url: string;
  items: DigestItem[];
};

export type RenderedEmail = { subject: string; html: string; text: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;">
    <h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <p style="margin:24px 0 0;font-size:12px;color:#64748b;">StockPulse automated notification.</p>
  </div>
</body></html>`;
}

function statusLabel(qty: number): string {
  return qty === 0 ? "OUT OF STOCK" : "LOW STOCK";
}

export function renderLowStockAlert(data: LowStockAlertData): RenderedEmail {
  const label = statusLabel(data.stock_qty);
  const subject =
    data.stock_qty === 0
      ? `[StockPulse] OUT OF STOCK: ${data.sku}`
      : `[StockPulse] Low stock: ${data.sku} (${data.stock_qty} left)`;

  const rows: [string, string][] = [
    ["SKU", data.sku],
    ["Product", data.name],
    ["Remaining", String(data.stock_qty)],
    ["Threshold", String(data.low_stock_threshold)],
    ["Status", label],
    ["Last movement", `OUT ${data.movement_quantity} by ${data.actor_name}`],
    ["At (UTC)", data.occurred_at],
  ];

  const tableRows = rows
    .map(
      ([key, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;">${escapeHtml(key)}</td>` +
        `<td style="padding:6px 0;font-size:13px;font-weight:600;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html = shell(
    `${label}: ${data.sku}`,
    `<table style="border-collapse:collapse;width:100%;">${tableRows}</table>
     <p style="margin:20px 0 0;">
       <a href="${escapeHtml(data.app_url)}/products" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;">Open products</a>
     </p>`,
  );

  const text = [
    `${label}: ${data.sku}`,
    ...rows.map(([key, value]) => `${key}: ${value}`),
    `Open products: ${data.app_url}/products`,
  ].join("\n");

  return { subject, html, text };
}

export function renderDailyDigest(data: DigestData): RenderedEmail {
  const outCount = data.items.filter((item) => item.stock_status === "out").length;
  const subject =
    data.items.length === 0
      ? "[StockPulse] Daily digest: all stock healthy"
      : `[StockPulse] Daily digest: ${data.items.length} product(s) need attention (${outCount} out)`;

  const bodyHtml =
    data.items.length === 0
      ? `<p style="font-size:14px;">All active products are above their low-stock thresholds.</p>`
      : `<table style="border-collapse:collapse;width:100%;font-size:13px;">
          <thead>
            <tr style="text-align:left;color:#64748b;">
              <th style="padding:6px 8px 6px 0;">SKU</th>
              <th style="padding:6px 8px;">Product</th>
              <th style="padding:6px 8px;">Category</th>
              <th style="padding:6px 8px;">Qty</th>
              <th style="padding:6px 8px;">Threshold</th>
              <th style="padding:6px 0;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.items
              .map(
                (item) =>
                  `<tr style="border-top:1px solid #e2e8f0;">` +
                  `<td style="padding:6px 8px 6px 0;">${escapeHtml(item.sku)}</td>` +
                  `<td style="padding:6px 8px;">${escapeHtml(item.name)}</td>` +
                  `<td style="padding:6px 8px;">${escapeHtml(item.category_name)}</td>` +
                  `<td style="padding:6px 8px;font-weight:600;">${item.stock_qty}</td>` +
                  `<td style="padding:6px 8px;">${item.low_stock_threshold}</td>` +
                  `<td style="padding:6px 0;font-weight:600;color:${item.stock_status === "out" ? "#b91c1c" : "#b45309"};">${escapeHtml(statusLabel(item.stock_qty))}</td>` +
                  `</tr>`,
              )
              .join("")}
          </tbody>
        </table>`;

  const html = shell(
    "Daily low-stock digest",
    `${bodyHtml}
     <p style="margin:16px 0 0;font-size:12px;color:#64748b;">Generated ${escapeHtml(data.generated_at)}</p>
     <p style="margin:20px 0 0;">
       <a href="${escapeHtml(data.app_url)}/dashboard" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;">Open dashboard</a>
     </p>`,
  );

  const text =
    data.items.length === 0
      ? `Daily low-stock digest (${data.generated_at})\nAll active products are above their thresholds.\n${data.app_url}/dashboard`
      : [
          `Daily low-stock digest (${data.generated_at})`,
          ...data.items.map(
            (item) =>
              `${item.sku} | ${item.name} | ${item.category_name} | qty ${item.stock_qty} | threshold ${item.low_stock_threshold} | ${statusLabel(item.stock_qty)}`,
          ),
          `${data.app_url}/dashboard`,
        ].join("\n");

  return { subject, html, text };
}