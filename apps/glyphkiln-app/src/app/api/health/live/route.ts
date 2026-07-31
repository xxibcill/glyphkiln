import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
};

export function GET(): NextResponse {
  return NextResponse.json(
    { ok: true, service: "glyphkiln-app", status: "live" },
    { status: 200, headers: HEADERS },
  );
}
