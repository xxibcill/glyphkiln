"use client";

import { BrandSnapshotSchema, DesignDocumentSchema } from "@glyphkiln/core/schema";
import { z } from "zod";

import type {
  AppCommand,
  AppFailure,
  AppQuery,
  BrandSnapshotDraft,
  ManualDraft,
} from "@/server/app-workflow";
import type {
  BrandKitSummary,
  DesignSummary,
  UserSummary,
  WorkspaceMembershipSummary,
} from "@/server/app-workflow/contracts";
import { parsePreviewResponse } from "@/features/project-preview/response-parser";
import type { PreviewFailure, PreviewSuccess } from "@/features/project-preview/types";

const WorkspaceRoleSchema = z.enum(["owner", "admin", "editor", "viewer"]);
const UserSummarySchema = z
  .object({
    id: z.string().min(1),
    email: z.string().min(1),
    displayName: z.string().min(1),
  })
  .strict();
const WorkspaceSummarySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().min(1),
    role: WorkspaceRoleSchema,
  })
  .strict();
const BrandKitSummarySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    latestSnapshotId: z.string().min(1),
    latestVersion: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
const DesignSummarySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    headRevisionId: z.string().min(1),
    revisionNumber: z.number().int().positive(),
    updatedAt: z.string().min(1),
  })
  .strict();
const ValidationProblemSchema = z
  .object({
    path: z.string(),
    code: z.string(),
    message: z.string(),
  })
  .strict();
const QualityIssueSchema = z
  .object({
    code: z.string(),
    severity: z.enum(["warning", "error"]),
    message: z.string(),
    layerId: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const FailureSchema = z
  .object({
    ok: z.literal(false),
    status: z.number().int(),
    error: z
      .object({
        code: z.string().min(1),
        title: z.string().min(1),
        detail: z.string().min(1),
        problems: z.array(ValidationProblemSchema).optional(),
        qualityIssues: z.array(QualityIssueSchema).optional(),
      })
      .strict(),
  })
  .strict();

const RawSuccessSchema = z
  .object({
    ok: z.literal(true),
    status: z.union([z.literal(200), z.literal(201)]),
    value: z.unknown(),
  })
  .strict();

const SessionSchema = z
  .object({
    kind: z.union([z.literal("session-granted"), z.literal("current-session")]),
    user: UserSummarySchema,
    workspaces: z.array(WorkspaceSummarySchema),
    expiresAt: z.string().min(1),
  })
  .strict();

const DashboardSchema = z
  .object({
    kind: z.literal("workspace-dashboard"),
    workspace: WorkspaceSummarySchema,
    brandKits: z.array(BrandKitSummarySchema),
    designs: z.array(DesignSummarySchema),
  })
  .strict();

const PublishedBrandSchema = z
  .object({
    kind: z.literal("brand-snapshot-published"),
    brandKitId: z.string().min(1),
    snapshotId: z.string().min(1),
    version: z.string().min(1),
    canonicalHash: z.string().regex(/^[0-9a-f]{64}$/),
    snapshot: BrandSnapshotSchema,
  })
  .strict();

const BrandSnapshotProjectionSchema = z
  .object({
    kind: z.literal("brand-snapshot"),
    brandKitId: z.string().min(1),
    snapshotId: z.string().min(1),
    version: z.string().min(1),
    canonicalHash: z.string().regex(/^[0-9a-f]{64}$/),
    snapshot: BrandSnapshotSchema,
  })
  .strict();

const DesignSavedSchema = z
  .object({
    kind: z.literal("design-saved"),
    designId: z.string().min(1),
    revisionId: z.string().min(1),
    revisionNumber: z.number().int().positive(),
    documentHash: z.string().regex(/^[0-9a-f]{64}$/),
    document: DesignDocumentSchema,
  })
  .strict();

const DesignRevisionSchema = z
  .object({
    kind: z.literal("design-revision"),
    designId: z.string().min(1),
    designName: z.string().min(1),
    revisionId: z.string().min(1),
    revisionNumber: z.number().int().positive(),
    parentRevisionId: z.string().min(1).optional(),
    brandSnapshotId: z.string().min(1),
    documentHash: z.string().regex(/^[0-9a-f]{64}$/),
    document: DesignDocumentSchema,
    createdAt: z.string().min(1),
    changeNote: z.string().min(1).optional(),
  })
  .strict();

const WorkspaceCreatedSchema = z
  .object({
    kind: z.literal("workspace-created"),
    workspace: WorkspaceSummarySchema,
  })
  .strict();

const SessionRevokedSchema = z.object({ kind: z.literal("session-revoked") }).strict();

const InvitationCreatedSchema = z
  .object({
    kind: z.literal("invitation-created"),
    invitationId: z.string().min(1),
    invitationToken: z.string().min(32),
    expiresAt: z.string().min(1),
    email: z.string().min(1),
    role: z.enum(["admin", "editor", "viewer"]),
  })
  .strict();

const InvitationAcceptedSchema = z
  .object({
    kind: z.literal("invitation-accepted"),
    workspace: WorkspaceSummarySchema,
  })
  .strict();

const RenderReceiptSchema = z
  .object({
    kind: z.union([z.literal("design-previewed"), z.literal("revision-rendered")]),
    document: z.unknown(),
    qualityIssues: z.unknown(),
    outputs: z.unknown(),
    designId: z.string().min(1).optional(),
    revisionId: z.string().min(1).optional(),
  })
  .strict();

const RenderJobStateSchema = z.enum([
  "claimed",
  "completed",
  "exhausted",
  "failed",
  "queued",
  "retry_wait",
]);

const RenderJobOutputSchema = z
  .object({
    format: z.enum(["svg", "png"]),
    mimeType: z.enum(["image/svg+xml", "image/png"]),
    artifactSha256: z.string().regex(/^[0-9a-f]{64}$/),
    artifactByteSize: z.number().int().positive(),
    manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
    manifestByteSize: z.number().int().positive(),
    fingerprint: z.string().min(1),
  })
  .strict();

const RenderJobQueuedSchema = z
  .object({
    kind: z.literal("render-job-queued"),
    jobId: z.string().min(1),
    workspaceId: z.string().min(1),
    state: RenderJobStateSchema,
    created: z.boolean(),
  })
  .strict();

const RenderJobSchema = z
  .object({
    kind: z.literal("render-job"),
    jobId: z.string().min(1),
    workspaceId: z.string().min(1),
    designId: z.string().min(1),
    revisionId: z.string().min(1),
    state: RenderJobStateSchema,
    attemptCount: z.number().int().nonnegative(),
    maxAttempts: z.number().int().positive(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    finishedAt: z.string().min(1).optional(),
    lastError: z
      .object({
        code: z.string().min(1),
        detail: z.string().min(1),
      })
      .strict()
      .optional(),
    outputs: z.array(RenderJobOutputSchema).max(2),
  })
  .strict();

export type ApiFailure = {
  ok: false;
  status: number;
  error: {
    code: string;
    title: string;
    detail: string;
    problems?: AppFailure["error"]["problems"];
    qualityIssues?: AppFailure["error"]["qualityIssues"];
  };
};

export type ApiResult<T> = { ok: true; value: T } | ApiFailure;

export type CurrentSession = {
  user: UserSummary;
  workspaces: WorkspaceMembershipSummary[];
  expiresAt: string;
};

export type WorkspaceDashboard = {
  workspace: WorkspaceMembershipSummary;
  brandKits: BrandKitSummary[];
  designs: DesignSummary[];
};

export type PublishedBrand = z.infer<typeof PublishedBrandSchema>;
export type BrandSnapshotProjection = z.infer<typeof BrandSnapshotProjectionSchema>;
export type SavedDesign = z.infer<typeof DesignSavedSchema>;
export type DesignRevision = z.infer<typeof DesignRevisionSchema>;
export type CreatedInvitation = z.infer<typeof InvitationCreatedSchema>;
export type QueuedRenderJob = z.infer<typeof RenderJobQueuedSchema>;
export type RenderJob = z.infer<typeof RenderJobSchema>;
export type RenderJobOutput = z.infer<typeof RenderJobOutputSchema>;

export type AppAlphaApi = {
  currentSession: () => Promise<ApiResult<CurrentSession>>;
  bootstrap: (input: {
    bootstrapToken: string;
    displayName: string;
    email: string;
    password: string;
    workspaceName: string;
  }) => Promise<ApiResult<CurrentSession>>;
  login: (input: {
    email: string;
    password: string;
  }) => Promise<ApiResult<CurrentSession>>;
  registerWithInvitation: (input: {
    displayName: string;
    email: string;
    password: string;
    invitationToken: string;
  }) => Promise<ApiResult<CurrentSession>>;
  logout: () => Promise<ApiResult<"session-revoked">>;
  createWorkspace: (name: string) => Promise<ApiResult<WorkspaceMembershipSummary>>;
  createInvitation: (input: {
    workspaceId: string;
    email: string;
    role: "admin" | "editor" | "viewer";
  }) => Promise<ApiResult<CreatedInvitation>>;
  acceptInvitation: (
    invitationToken: string,
  ) => Promise<ApiResult<WorkspaceMembershipSummary>>;
  dashboard: (workspaceId: string) => Promise<ApiResult<WorkspaceDashboard>>;
  publishBrand: (input: {
    workspaceId: string;
    brandKitId?: string;
    name: string;
    snapshot: BrandSnapshotDraft;
  }) => Promise<ApiResult<PublishedBrand>>;
  brandSnapshot: (
    workspaceId: string,
    brandSnapshotId: string,
  ) => Promise<ApiResult<BrandSnapshotProjection>>;
  previewDesign: (input: {
    workspaceId: string;
    brandSnapshotId: string;
    draft: ManualDraft;
  }) => Promise<ApiResult<PreviewSuccess>>;
  createDesign: (input: {
    workspaceId: string;
    name: string;
    brandSnapshotId: string;
    draft: ManualDraft;
  }) => Promise<ApiResult<SavedDesign>>;
  reviseDesign: (input: {
    workspaceId: string;
    designId: string;
    baseRevisionId: string;
    brandSnapshotId: string;
    draft: ManualDraft;
    changeNote?: string;
  }) => Promise<ApiResult<SavedDesign>>;
  revision: (input: {
    workspaceId: string;
    designId: string;
    revision: "head" | { revisionId: string };
  }) => Promise<ApiResult<DesignRevision>>;
  renderRevision: (input: {
    workspaceId: string;
    designId: string;
    revisionId: string;
  }) => Promise<ApiResult<PreviewSuccess>>;
  requestRevisionExport: (input: {
    workspaceId: string;
    designId: string;
    revisionId: string;
    idempotencyKey: string;
  }) => Promise<ApiResult<QueuedRenderJob>>;
  renderJob: (workspaceId: string, jobId: string) => Promise<ApiResult<RenderJob>>;
};

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function createAppAlphaApi(
  fetchImplementation: FetchImplementation = (input, init) => fetch(input, init),
): AppAlphaApi {
  async function command(commandInput: AppCommand): Promise<RawResult> {
    return post("/api/app/commands", commandInput, true);
  }

  async function query(queryInput: AppQuery): Promise<RawResult> {
    return post("/api/app/queries", queryInput, false);
  }

  async function post(
    path: string,
    body: AppCommand | AppQuery,
    includeCsrf: boolean,
  ): Promise<RawResult> {
    const headers = new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    if (includeCsrf) {
      const csrfToken = readCookie("gk_csrf");
      if (csrfToken !== undefined) {
        headers.set("X-Glyphkiln-CSRF", csrfToken);
      }
    }

    try {
      const response = await fetchImplementation(path, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers,
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json();
      const failure = FailureSchema.safeParse(payload);
      if (failure.success && response.status === failure.data.status) {
        return {
          ok: false,
          status: failure.data.status,
          error: {
            code: failure.data.error.code,
            title: failure.data.error.title,
            detail: failure.data.error.detail,
            ...(failure.data.error.problems === undefined
              ? {}
              : { problems: failure.data.error.problems }),
            ...(failure.data.error.qualityIssues === undefined
              ? {}
              : { qualityIssues: failure.data.error.qualityIssues }),
          },
        };
      }
      const success = RawSuccessSchema.safeParse(payload);
      if (success.success && response.status === success.data.status) {
        return {
          ok: true,
          status: success.data.status,
          value: success.data.value,
        };
      }
      return malformedResponse();
    } catch {
      return {
        ok: false,
        status: 0,
        error: {
          code: "APP_REQUEST_FAILED",
          title: "Application service unavailable",
          detail:
            "Glyphkiln could not reach the local application service. Check the server and try again.",
        },
      };
    }
  }

  return {
    async currentSession() {
      return parseSession(await query({ type: "session.current" }));
    },
    async bootstrap(input) {
      return parseSession(await command({ type: "bootstrap.register", ...input }));
    },
    async login(input) {
      return parseSession(await command({ type: "session.login", ...input }));
    },
    async registerWithInvitation(input) {
      return parseSession(await command({ type: "invitation.register", ...input }));
    },
    async logout() {
      return parseValue(
        await command({ type: "session.logout" }),
        SessionRevokedSchema,
        () => "session-revoked" as const,
      );
    },
    async createWorkspace(name) {
      return parseValue(
        await command({ type: "workspace.create", name }),
        WorkspaceCreatedSchema,
        (value) => value.workspace,
      );
    },
    async createInvitation(input) {
      return parseValue(
        await command({ type: "invitation.create", ...input }),
        InvitationCreatedSchema,
        (value) => value,
      );
    },
    async acceptInvitation(invitationToken) {
      return parseValue(
        await command({ type: "invitation.accept", invitationToken }),
        InvitationAcceptedSchema,
        (value) => value.workspace,
      );
    },
    async dashboard(workspaceId) {
      return parseValue(
        await query({ type: "workspace.dashboard", workspaceId }),
        DashboardSchema,
        (value) => ({
          workspace: value.workspace,
          brandKits: value.brandKits,
          designs: value.designs,
        }),
      );
    },
    async publishBrand(input) {
      return parseValue(
        await command({ type: "brand.publish", ...input }),
        PublishedBrandSchema,
        (value) => value,
      );
    },
    async brandSnapshot(workspaceId, brandSnapshotId) {
      return parseValue(
        await query({
          type: "brand.snapshot",
          workspaceId,
          brandSnapshotId,
        }),
        BrandSnapshotProjectionSchema,
        (value) => value,
      );
    },
    async previewDesign(input) {
      return parseRenderedReceipt(
        await command({ type: "design.preview", ...input }),
        "design-previewed",
      );
    },
    async createDesign(input) {
      return parseValue(
        await command({ type: "design.create", ...input }),
        DesignSavedSchema,
        (value) => value,
      );
    },
    async reviseDesign(input) {
      return parseValue(
        await command({ type: "design.revise", ...input }),
        DesignSavedSchema,
        (value) => value,
      );
    },
    async revision(input) {
      return parseValue(
        await query({ type: "design.revision", ...input }),
        DesignRevisionSchema,
        (value) => value,
      );
    },
    async renderRevision(input) {
      return parseRenderedReceipt(
        await command({ type: "revision.render", ...input }),
        "revision-rendered",
      );
    },
    async requestRevisionExport(input) {
      return parseValue(
        await command({ type: "revision.export.request", ...input }),
        RenderJobQueuedSchema,
        (value) => value,
      );
    },
    async renderJob(workspaceId, jobId) {
      return parseValue(
        await query({ type: "render.job", workspaceId, jobId }),
        RenderJobSchema,
        (value) => value,
      );
    },
  };
}

type RawResult = { ok: true; status: 200 | 201; value: unknown } | ApiFailure;

function parseSession(result: RawResult): ApiResult<CurrentSession> {
  return parseValue(result, SessionSchema, (value) => ({
    user: value.user,
    workspaces: value.workspaces,
    expiresAt: value.expiresAt,
  }));
}

function parseValue<Schema extends z.ZodType, Output>(
  result: RawResult,
  schema: Schema,
  project: (value: z.output<Schema>) => Output,
): ApiResult<Output> {
  if (!result.ok) return result;
  const parsed = schema.safeParse(result.value);
  return parsed.success
    ? { ok: true, value: project(parsed.data) }
    : malformedResponse();
}

function parseRenderedReceipt(
  result: RawResult,
  expectedKind: "design-previewed" | "revision-rendered",
): ApiResult<PreviewSuccess> {
  if (!result.ok) return result;
  const receipt = RenderReceiptSchema.safeParse(result.value);
  if (!receipt.success || receipt.data.kind !== expectedKind) {
    return malformedResponse();
  }
  const preview = parsePreviewResponse(
    {
      ok: true,
      document: receipt.data.document,
      qualityIssues: receipt.data.qualityIssues,
      outputs: receipt.data.outputs,
    },
    200,
  );
  return preview.ok
    ? { ok: true, value: preview }
    : {
        ok: false,
        status: preview.status,
        error: {
          code: preview.code,
          title: preview.title,
          detail: preview.detail,
          ...(preview.problems === undefined ? {} : { problems: preview.problems }),
          ...(preview.qualityIssues === undefined
            ? {}
            : { qualityIssues: preview.qualityIssues }),
        },
      };
}

function malformedResponse(): ApiFailure {
  return {
    ok: false,
    status: 502,
    error: {
      code: "INVALID_APP_RESPONSE",
      title: "Application response rejected",
      detail:
        "The application service returned data that did not match the expected contract.",
    },
  };
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const matches = document.cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) return undefined;
  const value = matches[0].slice(name.length + 1);
  if (value === "") return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export function toPreviewFailure(failure: ApiFailure): PreviewFailure {
  return {
    ok: false,
    status: failure.status,
    title: failure.error.title,
    code: failure.error.code,
    detail: failure.error.detail,
    ...(failure.error.problems === undefined
      ? {}
      : { problems: failure.error.problems }),
    ...(failure.error.qualityIssues === undefined
      ? {}
      : { qualityIssues: failure.error.qualityIssues }),
  };
}
