import { NextResponse } from "next/server";

import type {
  AppResult,
  CommandReceipt,
  QueryProjection,
  SessionGrant,
} from "@/server/app-workflow";
import type { RequestReadFailure } from "./json-request";

export const SESSION_COOKIE = "gk_session";
export const CSRF_COOKIE = "gk_csrf";

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function commandResponse(
  result: AppResult<CommandReceipt>,
  request: Request,
  environment: NodeJS.ProcessEnv = process.env,
): NextResponse {
  if (!result.ok) {
    const retryAfter =
      result.error.code === "AUTH_THROTTLED"
        ? "900"
        : result.error.code === "AUTH_CAPACITY_REACHED" ||
            result.error.code === "RENDER_CAPACITY_REACHED"
          ? "1"
          : undefined;
    const headers =
      retryAfter === undefined
        ? RESPONSE_HEADERS
        : { ...RESPONSE_HEADERS, "Retry-After": retryAfter };
    return NextResponse.json(result, {
      status: result.status,
      headers,
    });
  }

  if (result.value.kind === "session-granted") {
    return sessionGrantResponse(result, result.value, request, environment);
  }
  const response = NextResponse.json(result, {
    status: result.status,
    headers: RESPONSE_HEADERS,
  });
  if (
    result.value.kind === "session-revoked" ||
    (result.value.kind === "workspace-member-revoked" &&
      result.value.currentSessionRevoked)
  ) {
    clearSessionCookies(response, request, environment);
  }
  return response;
}

export function queryResponse(result: AppResult<QueryProjection>): NextResponse {
  return NextResponse.json(result, {
    status: result.status,
    headers: RESPONSE_HEADERS,
  });
}

export function requestFailureResponse(failure: RequestReadFailure): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      status: failure.status,
      error: {
        code: failure.code,
        title: failure.title,
        detail: failure.detail,
      },
    },
    { status: failure.status, headers: RESPONSE_HEADERS },
  );
}

export function serviceUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      status: 503,
      error: {
        code: "APP_RUNTIME_UNAVAILABLE",
        title: "Application runtime unavailable",
        detail: "Glyphkiln could not connect to its authenticated application state.",
      },
    },
    { status: 503, headers: RESPONSE_HEADERS },
  );
}

function sessionGrantResponse(
  result: Extract<AppResult<CommandReceipt>, { ok: true }>,
  grant: SessionGrant,
  request: Request,
  environment: NodeJS.ProcessEnv,
): NextResponse {
  const { sessionToken, csrfToken, ...safeGrant } = grant;
  const response = NextResponse.json(
    { ...result, value: safeGrant },
    { status: result.status, headers: RESPONSE_HEADERS },
  );
  const expires = new Date(grant.expiresAt);
  const secure = isSecureDeployment(request, environment);
  response.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    expires,
  });
  response.cookies.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    sameSite: "strict",
    secure,
    path: "/",
    expires,
  });
  return response;
}

function clearSessionCookies(
  response: NextResponse,
  request: Request,
  environment: NodeJS.ProcessEnv,
): void {
  const secure = isSecureDeployment(request, environment);
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(CSRF_COOKIE, "", {
    httpOnly: false,
    sameSite: "strict",
    secure,
    path: "/",
    maxAge: 0,
  });
}

function isSecureDeployment(request: Request, environment: NodeJS.ProcessEnv): boolean {
  const configuredOrigin = environment.GLYPHKILN_PUBLIC_ORIGIN?.trim();
  return configuredOrigin === undefined || configuredOrigin === ""
    ? new URL(request.url).protocol === "https:"
    : new URL(configuredOrigin).protocol === "https:";
}
