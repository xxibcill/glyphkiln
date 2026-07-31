import { Buffer } from "node:buffer";

import { NextResponse } from "next/server";

import type {
  AppResult,
  WorkspaceAuthorizationGrant,
  WorkspaceAuthorizationRequest,
} from "@/server/app-workflow";
import { SESSION_COOKIE } from "@/server/http/app-response";
import { readCookie } from "@/server/http/json-request";
import type { RenderQueue } from "@/server/render-queue";
import type { RenderBlobStorage } from "@/server/storage";
import {
  getAppRenderQueue,
  getAppRenderStorage,
  getAppWorkflow,
} from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,127})$/u;
const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

type ExportRouteContext = {
  params: Promise<{
    workspaceId: string;
    jobId: string;
    format: string;
    part: string;
  }>;
};

type ExportRouteDependencies = {
  authorize(
    input: WorkspaceAuthorizationRequest,
  ): Promise<AppResult<WorkspaceAuthorizationGrant>>;
  getQueue(): Promise<RenderQueue>;
  getStorage(): Promise<RenderBlobStorage>;
};

const DEFAULT_DEPENDENCIES: ExportRouteDependencies = {
  authorize: async (input) => (await getAppWorkflow()).authorizeWorkspace(input),
  getQueue: getAppRenderQueue,
  getStorage: getAppRenderStorage,
};

export function createExportDownloadRoute(
  dependencies: ExportRouteDependencies = DEFAULT_DEPENDENCIES,
): (request: Request, context: ExportRouteContext) => Promise<Response> {
  return async (request, context) => {
    const parameters = await context.params;
    if (
      !IDENTIFIER.test(parameters.workspaceId) ||
      !IDENTIFIER.test(parameters.jobId) ||
      (parameters.format !== "svg" && parameters.format !== "png") ||
      (parameters.part !== "artifact" && parameters.part !== "manifest")
    ) {
      return failure(404, "RESOURCE_NOT_FOUND", "Export unavailable");
    }
    try {
      const authorization = await dependencies.authorize({
        evidence: { sessionToken: readCookie(request, SESSION_COOKIE) },
        workspaceId: parameters.workspaceId,
        action: "read_completed_exports",
        requireMutationProof: false,
      });
      if (!authorization.ok) {
        return NextResponse.json(authorization, {
          status: authorization.status,
          headers: RESPONSE_HEADERS,
        });
      }
      const job = await (
        await dependencies.getQueue()
      ).inspect(parameters.workspaceId, parameters.jobId);
      if (job === undefined) {
        return failure(404, "RESOURCE_NOT_FOUND", "Export unavailable");
      }
      if (job.state !== "completed") {
        return failure(409, "EXPORT_NOT_READY", "Export is not ready");
      }
      const output = job.outputs.find(
        (candidate) => candidate.format === parameters.format,
      );
      if (output === undefined) {
        return failure(503, "EXPORT_INTEGRITY_FAILED", "Export unavailable");
      }
      const manifest = parameters.part === "manifest";
      const expectedByteSize = manifest
        ? output.manifestByteSize
        : output.artifactByteSize;
      const sha256 = manifest ? output.manifestSha256 : output.artifactSha256;
      const bytes = await (
        await dependencies.getStorage()
      ).read({
        workspaceId: parameters.workspaceId,
        purpose: manifest ? "render-manifest" : "render-output",
        sha256,
      });
      if (bytes.byteLength !== expectedByteSize) {
        return failure(503, "EXPORT_INTEGRITY_FAILED", "Export unavailable");
      }
      const filename = manifest
        ? `glyphkiln-${parameters.jobId}.${parameters.format}.manifest.json`
        : `glyphkiln-${parameters.jobId}.${parameters.format}`;
      return new Response(Buffer.from(bytes), {
        status: 200,
        headers: {
          ...RESPONSE_HEADERS,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": bytes.byteLength.toString(),
          "Content-Type": manifest
            ? "application/vnd.glyphkiln.manifest+json"
            : output.mimeType,
          Digest: `sha-256=${Buffer.from(sha256, "hex").toString("base64")}`,
        },
      });
    } catch {
      return failure(503, "EXPORT_UNAVAILABLE", "Export unavailable");
    }
  };
}

export const GET = createExportDownloadRoute();

function failure(status: number, code: string, title: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      status,
      error: {
        code,
        title,
        detail:
          status === 409
            ? "The worker has not completed this immutable export."
            : "The requested export is unavailable in this workspace.",
      },
    },
    { status, headers: RESPONSE_HEADERS },
  );
}
