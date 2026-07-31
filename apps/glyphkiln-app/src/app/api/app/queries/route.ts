import type { NextResponse } from "next/server";

import { AppQuerySchema } from "@/server/app-workflow";
import type { AppWorkflow } from "@/server/app-workflow";
import {
  SESSION_COOKIE,
  queryResponse,
  requestFailureResponse,
  serviceUnavailableResponse,
} from "@/server/http/app-response";
import {
  readBoundedJsonRequest,
  readCookie,
  verifySameOriginRequest,
} from "@/server/http/json-request";
import { getAppWorkflow } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QueryRouteDependencies = {
  getWorkflow: () => Promise<AppWorkflow>;
  environment: NodeJS.ProcessEnv;
};

const DEFAULT_DEPENDENCIES: QueryRouteDependencies = {
  getWorkflow: getAppWorkflow,
  environment: process.env,
};

export function createQueryRoute(
  dependencies: QueryRouteDependencies = DEFAULT_DEPENDENCIES,
): (request: Request) => Promise<NextResponse> {
  return async (request) => {
    const originFailure = verifySameOriginRequest(request, dependencies.environment);
    if (originFailure !== undefined) {
      return requestFailureResponse(originFailure);
    }
    const parsedBody = await readBoundedJsonRequest(request);
    if (!parsedBody.ok) return requestFailureResponse(parsedBody.failure);
    const parsedQuery = AppQuerySchema.safeParse(parsedBody.value);
    if (!parsedQuery.success) {
      return queryResponse({
        ok: false,
        status: 422,
        error: {
          code: "INVALID_INPUT",
          title: "Request needs attention",
          detail: "Review the structured query and try again.",
          problems: parsedQuery.error.issues.map((issue) => ({
            path: issue.path.map(String).join("."),
            code: issue.code,
            message: issue.message,
          })),
        },
      });
    }

    try {
      const workflow = await dependencies.getWorkflow();
      return queryResponse(
        await workflow.read({
          evidence: { sessionToken: readCookie(request, SESSION_COOKIE) },
          query: parsedQuery.data,
        }),
      );
    } catch {
      return serviceUnavailableResponse();
    }
  };
}

export const POST = createQueryRoute();
