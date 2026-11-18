import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./errors";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function fail(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    const message = error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message } },
      { status: 400 },
    );
  }

  console.error("[api] unhandled error:", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
    { status: 500 },
  );
}