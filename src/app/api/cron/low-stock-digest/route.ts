import { getDb } from "@/lib/db/client";
import { requireCronSecret } from "@/lib/auth/cron";
import { reconcileDriftedProducts } from "@/lib/services/movements";
import { sendDailyDigest } from "@/lib/services/alerts";
import { ok, fail } from "@/lib/api/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SWEEP_LIMIT = 50;

export async function GET(req: Request) {
  try {
    requireCronSecret(req);
    const db = getDb();

    const reconcile = await reconcileDriftedProducts(db, SWEEP_LIMIT);
    const digest = await sendDailyDigest(db);

    return ok({
      ok: true,
      generated_at: new Date().toISOString(),
      reconcile: {
        drifted: reconcile.drifted,
        corrected: reconcile.corrected,
        details: reconcile.details,
      },
      digest: {
        items: digest.items,
        out_of_stock: digest.out_of_stock,
        recipients: digest.recipients,
        skipped: digest.skipped,
        message_id: digest.messageId ?? null,
      },
    });
  } catch (error) {
    return fail(error);
  }
}