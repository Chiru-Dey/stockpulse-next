import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api/errors";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function extractCronSecret(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token.length > 0) return token;
  }
  const direct = req.headers.get("x-cron-secret");
  if (direct && direct.trim().length > 0) return direct.trim();
  return null;
}

export function requireCronSecret(req: Request): void {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 16) {
    throw new ApiError(
      503,
      "CRON_NOT_CONFIGURED",
      "CRON_SECRET is not configured on this deployment",
    );
  }
  const presented = extractCronSecret(req);
  if (!presented || !safeEqual(presented, expected)) {
    throw new ApiError(401, "UNAUTHORIZED", "A valid cron secret is required");
  }
}