import { after } from "next/server";

/**
 * Schedules non-blocking work for after the response. `after` needs a request
 * scope on serverless platforms; outside one (e.g. tests) we fall back to
 * running inline. Errors are always contained so a failed side effect can
 * never surface as an API failure.
 */
export function runAfterResponse(task: () => Promise<unknown>): void {
  const safe = async (): Promise<void> => {
    try {
      await task();
    } catch (error) {
      console.error("[background] task failed:", error);
    }
  };

  try {
    after(safe);
  } catch {
    void safe();
  }
}