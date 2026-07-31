import { Buffer } from "node:buffer";

import { RENDER_RESOURCE_LIMITS } from "@glyphkiln/core";
import { NextResponse } from "next/server";

import type {
  AppResult,
  WorkspaceAuthorizationGrant,
  WorkspaceAuthorizationRequest,
} from "@/server/app-workflow";
import { CSRF_COOKIE, SESSION_COOKIE } from "@/server/http/app-response";
import { readBoundedBinaryRequest } from "@/server/http/binary-request";
import { readCookie, verifySameOriginRequest } from "@/server/http/json-request";
import {
  ResourceIngestionError,
  ResourceUploadMetadataSchema,
  type AdmittedResourceIngestion,
  type ResourceAdmission,
  type ResourceIngestionService,
  type ResourceUploadMetadata,
} from "@/server/resources";
import { getAppResourceIngestion, getAppWorkflow } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METADATA_HEADER = "x-glyphkiln-resource";
const METADATA_HEADER_LIMIT = 8_192;
const ACCEPTED_MEDIA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "font/ttf",
  "font/otf",
]);
const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

type ResourceRouteDependencies = {
  authorize(
    input: WorkspaceAuthorizationRequest,
  ): Promise<AppResult<WorkspaceAuthorizationGrant>>;
  getIngestion(): Promise<Pick<ResourceIngestionService, "runAdmitted">>;
  environment: NodeJS.ProcessEnv;
};

const DEFAULT_DEPENDENCIES: ResourceRouteDependencies = {
  authorize: async (input) => (await getAppWorkflow()).authorizeWorkspace(input),
  getIngestion: getAppResourceIngestion,
  environment: process.env,
};

export function createResourceRoute(
  dependencies: ResourceRouteDependencies = DEFAULT_DEPENDENCIES,
): (request: Request) => Promise<NextResponse> {
  return async (request) => {
    const originFailure = verifySameOriginRequest(request, dependencies.environment);
    if (originFailure !== undefined) {
      return jsonFailure(
        originFailure.status,
        originFailure.code,
        originFailure.title,
        originFailure.detail,
      );
    }
    const metadataResult = parseMetadata(request.headers.get(METADATA_HEADER));
    if (!metadataResult.ok) return metadataResult.response;

    try {
      const csrfHeader = request.headers.get("x-glyphkiln-csrf") ?? undefined;
      const csrfCookie = readCookie(request, CSRF_COOKIE);
      const authorization = await dependencies.authorize({
        evidence: {
          sessionToken: readCookie(request, SESSION_COOKIE),
          csrfToken:
            csrfHeader !== undefined && csrfHeader === csrfCookie
              ? csrfHeader
              : undefined,
        },
        workspaceId: metadataResult.value.workspaceId,
        action: "ingest_resources",
        requireMutationProof: true,
      });
      if (!authorization.ok) {
        return NextResponse.json(authorization, {
          status: authorization.status,
          headers: RESPONSE_HEADERS,
        });
      }
      const service = await dependencies.getIngestion();
      return await service.runAdmitted(
        metadataResult.value.workspaceId,
        async (ingestion) => {
          const mediaType = request.headers
            .get("content-type")
            ?.split(";", 1)[0]
            ?.trim()
            .toLowerCase();
          const maximumBytes =
            mediaType === "font/ttf" || mediaType === "font/otf"
              ? RENDER_RESOURCE_LIMITS.maxFontBytes
              : RENDER_RESOURCE_LIMITS.maxAssetBytes;
          const body = await readBoundedBinaryRequest(
            request,
            ACCEPTED_MEDIA_TYPES,
            maximumBytes,
          );
          if (!body.ok) {
            return jsonFailure(
              body.failure.status,
              body.failure.code,
              body.failure.title,
              body.failure.detail,
            );
          }
          const admission = await ingest(
            ingestion,
            metadataResult.value,
            authorization.value.user.id,
            body.mediaType,
            body.bytes,
          );
          return NextResponse.json(
            {
              ok: true,
              status: 201,
              value: publicAdmission(admission),
            },
            { status: 201, headers: RESPONSE_HEADERS },
          );
        },
      );
    } catch (error) {
      return resourceFailure(error);
    }
  };
}

export const POST = createResourceRoute();

function parseMetadata(
  input: string | null,
): { ok: true; value: ResourceUploadMetadata } | { ok: false; response: NextResponse } {
  if (
    input === null ||
    input.length < 1 ||
    input.length > METADATA_HEADER_LIMIT ||
    !/^[A-Za-z0-9_-]+$/u.test(input)
  ) {
    return { ok: false, response: invalidMetadata() };
  }
  try {
    const bytes = Buffer.from(input, "base64url");
    if (bytes.toString("base64url") !== input) {
      return { ok: false, response: invalidMetadata() };
    }
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = ResourceUploadMetadataSchema.safeParse(
      JSON.parse(decoded) as unknown,
    );
    return parsed.success
      ? { ok: true, value: parsed.data }
      : { ok: false, response: invalidMetadata() };
  } catch {
    return { ok: false, response: invalidMetadata() };
  }
}

async function ingest(
  service: AdmittedResourceIngestion,
  metadata: ResourceUploadMetadata,
  actorUserId: string,
  mediaType: string,
  bytes: Uint8Array,
): Promise<ResourceAdmission> {
  const common = {
    workspaceId: metadata.workspaceId,
    actorUserId,
    bytes,
    ...(metadata.originalFilename === undefined
      ? {}
      : { originalFilename: metadata.originalFilename }),
    origin: metadata.origin,
    license: metadata.license,
  };
  if (metadata.kind === "raster-asset") {
    if (mediaType !== "image/png" && mediaType !== "image/jpeg") {
      throw new ResourceIngestionError(
        "The resource kind and media type do not match.",
        "UNSUPPORTED_RESOURCE_MEDIA_TYPE",
      );
    }
    return service.ingestRaster({
      ...common,
      declaredMediaType: mediaType,
    });
  }
  if (mediaType !== "font/ttf" && mediaType !== "font/otf") {
    throw new ResourceIngestionError(
      "The resource kind and media type do not match.",
      "UNSUPPORTED_RESOURCE_MEDIA_TYPE",
    );
  }
  return service.ingestFont({
    ...common,
    declaredMediaType: mediaType,
    family: metadata.family,
    weight: metadata.weight,
    style: metadata.style,
  });
}

function publicAdmission(admission: ResourceAdmission): Record<string, unknown> {
  const resource = admission.resource;
  const common = {
    kind: "resource-admitted",
    resourceId: resource.id,
    ingestionId: admission.ingestionId,
    duplicate: admission.duplicate,
    resourceKind: resource.kind,
    contentHash: resource.contentHash,
    mediaType: resource.mediaType,
    byteSize: resource.byteSize,
    origin: resource.origin,
    license: resource.license,
    createdAt: resource.createdAt.toISOString(),
  };
  return resource.kind === "raster-asset"
    ? { ...common, width: resource.width, height: resource.height }
    : {
        ...common,
        family: resource.family,
        weight: resource.weight,
        style: resource.style,
      };
}

function invalidMetadata(): NextResponse {
  return jsonFailure(
    422,
    "INVALID_RESOURCE_METADATA",
    "Resource metadata needs attention",
    `Send closed base64url JSON in the ${METADATA_HEADER} header.`,
  );
}

function resourceFailure(error: unknown): NextResponse {
  if (!(error instanceof ResourceIngestionError)) {
    return jsonFailure(
      503,
      "RESOURCE_INGESTION_UNAVAILABLE",
      "Resource ingestion is unavailable",
      "The configured scanner or immutable storage is not ready.",
    );
  }
  if (error.code === "SCANNER_UNAVAILABLE") {
    return jsonFailure(
      503,
      error.code,
      "Resource scanner is unavailable",
      "The upload was not admitted. Ask the operator to restore malware scanning.",
    );
  }
  if (error.code === "RESOURCE_STORAGE_INTEGRITY_ERROR") {
    return jsonFailure(
      503,
      error.code,
      "Resource storage is unavailable",
      "The upload was not admitted because immutable storage failed an integrity check.",
    );
  }
  if (error.code === "RESOURCE_CAPACITY_REACHED") {
    return jsonFailure(
      429,
      error.code,
      "Resource ingestion is busy",
      "Try the upload again after the current bounded scans finish.",
      { "Retry-After": "1" },
    );
  }
  if (error.code === "RESOURCE_QUOTA_EXCEEDED") {
    return jsonFailure(
      409,
      error.code,
      "Workspace resource quota reached",
      "Remove no-longer-needed workspace data under the operator retention policy or ask the operator to raise the quota.",
    );
  }
  const status = error.code === "UNSUPPORTED_RESOURCE_MEDIA_TYPE" ? 415 : 422;
  return jsonFailure(
    status,
    error.code,
    error.code === "SCANNER_REJECTED"
      ? "Resource was rejected"
      : "Resource could not be admitted",
    error.code === "SCANNER_REJECTED"
      ? "The configured malware scanner rejected the upload."
      : "The upload did not satisfy the inert resource contract.",
  );
}

function jsonFailure(
  status: number,
  code: string,
  title: string,
  detail: string,
  additionalHeaders: Readonly<Record<string, string>> = {},
): NextResponse {
  return NextResponse.json(
    { ok: false, status, error: { code, title, detail } },
    { status, headers: { ...RESPONSE_HEADERS, ...additionalHeaders } },
  );
}
