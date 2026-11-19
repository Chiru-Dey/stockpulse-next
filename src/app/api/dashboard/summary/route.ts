import { getDb } from "@/lib/db/client";
import { requireAuth } from "@/lib/auth/guards";
import { getDashboardSummary } from "@/lib/services/dashboard";
import { ok, fail } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAuth(req);
    const summary = await getDashboardSummary(getDb());
    return ok(summary);
  } catch (error) {
    return fail(error);
  }
}