import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const time = new Date().toISOString();
  const startedAt = Date.now();

  try {
    await getDb().execute(sql`SELECT 1`);
    return NextResponse.json({
      status: "ok",
      service: "stockpulse-next",
      db: "ok",
      db_latency_ms: Date.now() - startedAt,
      time,
    });
  } catch (error) {
    console.error("[health] database check failed:", error);
    return NextResponse.json(
      {
        status: "degraded",
        service: "stockpulse-next",
        db: "unreachable",
        time,
      },
      { status: 503 },
    );
  }
}