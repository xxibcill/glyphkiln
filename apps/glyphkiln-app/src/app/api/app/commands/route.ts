import type { NextResponse } from "next/server";
import { isIP } from "node:net";

import { AppCommandSchema } from "@/server/app-workflow";
import type { AppWorkflow } from "@/server/app-workflow";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  commandResponse,
  requestFailureResponse,
  serviceUnavailableResponse,
} from "@/server/http/app-response";
import {
  readBoundedJsonRequest,
  readCookie,
  verifySameOriginRequest,
} from "@/server/http/json-request";
import { getAppWorkflow } from "@/server/runtime";
import {
  appAuthenticationWorkLimiter,
  type AuthenticationWorkAdmission,
} from "@/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommandRouteDependencies = {
  getWorkflow: () => Promise<AppWorkflow>;
  environment: NodeJS.ProcessEnv;
  authenticationAdmission?: AuthenticationWorkAdmission;
};

const DEFAULT_DEPENDENCIES: CommandRouteDependencies = {
  getWorkflow: getAppWorkflow,
  environment: process.env,
  authenticationAdmission: appAuthenticationWorkLimiter,
};

export function createCommandRoute(
  dependencies: CommandRouteDependencies = DEFAULT_DEPENDENCIES,
): (request: Request) => Promise<NextResponse> {
  return async (request) => {
    const originFailure = verifySameOriginRequest(request, dependencies.environment);
    if (originFailure !== undefined) {
      return requestFailureResponse(originFailure);
    }
    const parsedBody = await readBoundedJsonRequest(request);
    if (!parsedBody.ok) return requestFailureResponse(parsedBody.failure);
    const parsedCommand = AppCommandSchema.safeParse(parsedBody.value);
    if (!parsedCommand.success) {
      return commandResponse(
        {
          ok: false,
          status: 422,
          error: {
            code: "INVALID_INPUT",
            title: "Request needs attention",
            detail: "Review the structured command and try again.",
            problems: parsedCommand.error.issues.map((issue) => ({
              path: issue.path.map(String).join("."),
              code: issue.code,
              message: issue.message,
            })),
          },
        },
        request,
        dependencies.environment,
      );
    }

    try {
      const csrfHeader = request.headers.get("x-glyphkiln-csrf") ?? undefined;
      const csrfCookie = readCookie(request, CSRF_COOKIE);
      const csrfToken =
        csrfHeader !== undefined && csrfHeader === csrfCookie ? csrfHeader : undefined;
      const passwordPartition = authenticationPartition(
        request,
        dependencies.environment,
      );
      const execute = async () =>
        (await dependencies.getWorkflow()).execute({
          evidence: {
            sessionToken: readCookie(request, SESSION_COOKIE),
            csrfToken,
            ...(parsedCommand.data.type === "session.login"
              ? {
                  authenticationPartition: passwordPartition,
                }
              : {}),
          },
          command: parsedCommand.data,
        });
      const authenticationAdmission =
        dependencies.authenticationAdmission ?? appAuthenticationWorkLimiter;
      const result = isPasswordCommand(parsedCommand.data.type)
        ? await authenticationAdmission.run(passwordPartition, execute)
        : { accepted: true as const, value: await execute() };
      if (!result.accepted) {
        return commandResponse(
          {
            ok: false,
            status: 429,
            error: {
              code: "AUTH_CAPACITY_REACHED",
              title: "Authentication is busy",
              detail: "Wait briefly before starting another password operation.",
            },
          },
          request,
          dependencies.environment,
        );
      }
      return commandResponse(result.value, request, dependencies.environment);
    } catch {
      return serviceUnavailableResponse();
    }
  };
}

export const POST = createCommandRoute();

function isPasswordCommand(type: string): boolean {
  return (
    type === "bootstrap.register" ||
    type === "invitation.register" ||
    type === "session.login"
  );
}

function authenticationPartition(
  request: Request,
  environment: NodeJS.ProcessEnv,
): string {
  if (environment.GLYPHKILN_TRUST_PROXY !== "true") return "loopback";
  const forwardedFor = request.headers.get("x-forwarded-for")?.trim();
  if (
    forwardedFor === undefined ||
    forwardedFor === "" ||
    forwardedFor.includes(",") ||
    isIP(forwardedFor) === 0
  ) {
    return "trusted-proxy-unknown";
  }
  return `trusted-proxy:${forwardedFor}`;
}
