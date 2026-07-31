import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

/**
 * The pre-alpha preview endpoint accepted caller-authored DesignDocuments.
 * App Alpha deliberately closes it: rendering now goes through the authenticated
 * workflow, which constructs trusted document fields from stored resources.
 */
export function POST(request: Request): NextResponse {
  void request;
  return NextResponse.json(
    {
      ok: false,
      status: 410,
      title: "Legacy preview endpoint retired",
      code: "LEGACY_PREVIEW_DISABLED",
      detail:
        "Use the authenticated App Alpha design preview or revision render workflow.",
    },
    { status: 410, headers: RESPONSE_HEADERS },
  );
}
