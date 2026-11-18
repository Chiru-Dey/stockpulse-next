import { ApiError } from "./errors";

export async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}