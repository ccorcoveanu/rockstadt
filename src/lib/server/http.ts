import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "./auth";

type AppwriteError = { code?: number; type?: string; message?: string };

export function jsonError(e: unknown): NextResponse {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request", issues: e.issues },
      { status: 400 }
    );
  }
  const ae = e as AppwriteError;
  if (typeof ae?.code === "number" && ae.code >= 400 && ae.code < 500) {
    return NextResponse.json(
      { error: ae.message ?? "Request failed", type: ae.type },
      { status: ae.code }
    );
  }
  console.error(e);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

const buckets = new Map<string, { count: number; resetAt: number }>();

// In-memory throttle for credential endpoints; per-instance is acceptable
// because a single Next server fronts the local Appwrite.
export function rateLimit(key: string, max = 10, windowMs = 60_000): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count++;
  if (bucket.count > max) throw new AuthError(429, "Too many attempts, retry later");
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
