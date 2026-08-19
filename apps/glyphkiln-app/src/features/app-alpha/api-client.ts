"use client";

import { BrandSnapshotSchema, DesignDocumentSchema } from "@glyphkiln/core/schema";
import {
  CAMPAIGN_COMPOSITION_VARIANT_IDS,
  CAROUSEL_DELIVERY_SIDECAR_VERSION,
  CAROUSEL_NARRATIVE_ROLE_IDS,
  CAROUSEL_REVIEW_ISSUE_CODES,
  CAROUSEL_SEQUENCE_LIMITS,
  CAROUSEL_SEQUENCE_VERSION,
  DELIVERY_PROFILE_IDS,
  DELIVERY_PROFILE_METADATA_VERSION,
  DELIVERY_PROFILE_REGISTRY,
  canonicalJson,
  createCarouselDeliverySidecar,
  createCarouselSequenceKey,
  deliverySourcesForProfile,
} from "@glyphkiln/core/browser";
import { z } from "zod";

import type {
  AppCommand,
  AppFailure,
  AppQuery,
  BrandSnapshotDraft,
  CampaignCarouselReviewProjection,
  CampaignHandoffProjection,
  CampaignProposalRunProjection,
  ManualDraft,
} from "@/server/app-workflow";
import type {
  BrandKitSummary,
  CampaignSummary,
  DesignSummary,
  UserSummary,
  WorkspaceMembershipSummary,
} from "@/server/app-workflow/contracts";
import {
  isRenderProofProjection,
  MAXIMUM_BROWSER_RENDER_PROOF_BYTES,
  parsePreviewResponse,
  verifyPreviewIntegrity,
  type RenderProofProjection,
} from "@/features/project-preview/response-parser";
import type {
  PreviewCatalog,
  PreviewFailure,
  PreviewSuccess,
} from "@/features/project-preview/types";

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
const CampaignSummarySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    brief: z.string().min(1),
    campaignSeed: z.string().min(1),
    familyId: z.literal("image-led-campaign"),
    createdAt: z.string().min(1),
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
const MAXIMUM_CAMPAIGN_HANDOFF_BYTES = 64 * 1024 * 1024;
const MAXIMUM_BASE64_HANDOFF_CHARACTERS =
  Math.ceil(MAXIMUM_CAMPAIGN_HANDOFF_BYTES / 3) * 4;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

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
    campaigns: z.array(CampaignSummarySchema),
    features: z.object({ campaignWorkflow: z.boolean() }).strict(),
  })
  .strict();

const AuthoringLockSchema = z.enum([
  "copy",
  "image",
  "crop",
  "typography",
  "palette",
  "composition",
]);
const CarouselSourceNoteSchema = z
  .object({
    label: z.string().min(1).max(CAROUSEL_SEQUENCE_LIMITS.sourceNoteLabelCharacters),
    url: z.url().max(CAROUSEL_SEQUENCE_LIMITS.sourceNoteUrlCharacters).optional(),
  })
  .strict();
const CarouselSequenceKeySchema = z
  .string()
  .min(1)
  .max(CAROUSEL_SEQUENCE_LIMITS.sequenceKeyCharacters)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/)
  .transform(createCarouselSequenceKey);
const CampaignCanvasSchema = z
  .object({
    id: z.string().min(1),
    canvasKey: z.string().min(1),
    designId: z.string().min(1),
    revisionId: z.string().min(1),
    template: z.object({ id: z.string().min(1), version: z.string().min(1) }).strict(),
    format: z.string().min(1),
    compositionVariantId: z.enum(CAMPAIGN_COMPOSITION_VARIANT_IDS),
    narrativeRole: z.enum(CAROUSEL_NARRATIVE_ROLE_IDS),
    deliveryProfileId: z.enum(DELIVERY_PROFILE_IDS).optional(),
    carouselSequenceKey: CarouselSequenceKeySchema.optional(),
    altText: z
      .string()
      .min(1)
      .max(CAROUSEL_SEQUENCE_LIMITS.altTextCharacters)
      .optional(),
    sourceNotes: z
      .array(CarouselSourceNoteSchema)
      .max(CAROUSEL_SEQUENCE_LIMITS.sourceNotesPerSlide)
      .optional(),
    seedDerivationVersion: z.string().min(1),
    directionSeed: z.string().regex(/^[0-9a-f]{64}$/),
    canvasSeed: z.string().regex(/^[0-9a-f]{64}$/),
    ordinal: z.number().int().nonnegative(),
    createdAt: z.string().min(1),
  })
  .strict();
const CampaignCanvasSeedSchema = z
  .object({
    kind: z.literal("campaign-canvas-seed"),
    workspaceId: z.string().min(1),
    campaignId: z.string().min(1),
    directionId: z.string().min(1),
    canvasKey: z.string().min(1),
    template: z.object({ id: z.string().min(1), version: z.string().min(1) }).strict(),
    format: z.string().min(1),
    compositionVariantId: z.enum(CAMPAIGN_COMPOSITION_VARIANT_IDS),
    seedDerivationVersion: z.string().min(1),
    directionSeed: z.string().regex(/^[0-9a-f]{64}$/),
    canvasSeed: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
const CampaignProposalRunSummarySchema = z
  .object({
    id: z.string().min(1),
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    candidateCount: z.number().int().min(0).max(4),
    decidedCount: z.number().int().min(0).max(4),
    acceptedCount: z.number().int().min(0).max(1),
    createdAt: z.string().min(1),
  })
  .strict()
  .superRefine((summary, context) => {
    if (
      summary.acceptedCount > summary.decidedCount ||
      summary.decidedCount > summary.candidateCount
    ) {
      context.addIssue({
        code: "custom",
        message: "Campaign proposal history counts are inconsistent.",
      });
    }
  });
const CampaignDirectionSchema = z
  .object({
    id: z.string().min(1),
    directionKey: z.string().min(1),
    name: z.string().min(1),
    locks: z.array(AuthoringLockSchema).max(6),
    createdAt: z.string().min(1),
    canvases: z.array(CampaignCanvasSchema),
    proposalRuns: z.array(CampaignProposalRunSummarySchema).max(20),
    proposalRunsTruncated: z.boolean(),
  })
  .strict();
const CampaignBoardSchema = z
  .object({
    kind: z.literal("campaign-board"),
    campaign: CampaignSummarySchema,
    directions: z.array(CampaignDirectionSchema),
  })
  .strict();
const CampaignCreatedSchema = z
  .object({ kind: z.literal("campaign-created"), campaign: CampaignSummarySchema })
  .strict();
const CampaignDirectionCreatedSchema = z
  .object({
    kind: z.literal("campaign-direction-created"),
    campaignId: z.string().min(1),
    direction: CampaignDirectionSchema,
  })
  .strict();
const CampaignCanvasAttachedSchema = z
  .object({
    kind: z.literal("campaign-canvas-attached"),
    campaignId: z.string().min(1),
    directionId: z.string().min(1),
    canvas: CampaignCanvasSchema,
  })
  .strict();

const DeliveryEvidenceLevelSchema = z.enum([
  "platform-requirement",
  "platform-capability",
  "platform-recommendation",
  "glyphkiln-advisory",
]);
const DeliverySourceSchema = z
  .object({
    id: z.string().min(1).max(120),
    publisher: z.enum(["Meta", "TikTok", "W3C", "Glyphkiln"]),
    title: z.string().min(1).max(500),
    url: z.url().max(2_048),
    retrievedAt: z.literal("2026-08-18"),
  })
  .strict();
const DeliverySourceIdsSchema = z.array(z.string().min(1).max(120)).max(32);
const DeliveryFactSchema = <ValueSchema extends z.ZodType>(value: ValueSchema) =>
  z
    .object({
      value,
      evidence: DeliveryEvidenceLevelSchema,
      sourceIds: DeliverySourceIdsSchema,
      note: z.string().min(1).max(2_000),
    })
    .strict();
const DeliveryProfileSchema = z
  .object({
    id: z.enum(DELIVERY_PROFILE_IDS),
    label: z.string().min(1).max(200),
    platform: z.enum(["instagram", "tiktok"]),
    publishingPath: z.enum(["native", "api", "organic", "content-api", "paid-ad"]),
    compatibleFormats: z.array(z.string().min(1).max(120)).max(16),
    slideCount: DeliveryFactSchema(
      z
        .object({
          minimum: z.number().int().min(1),
          maximum: z.number().int().min(1),
        })
        .strict(),
    ),
    acceptedImageMediaTypes: DeliveryFactSchema(
      z.array(z.string().min(1).max(120)).max(16),
    ),
    aspectRatio: DeliveryFactSchema(
      z
        .object({
          minimumWidthPerHeight: z.number().positive().optional(),
          maximumWidthPerHeight: z.number().positive().optional(),
          sameAcrossSequence: z.boolean(),
        })
        .strict(),
    ),
    raster: DeliveryFactSchema(
      z
        .object({
          targetWidth: z.number().int().positive().optional(),
          minimumWidth: z.number().int().positive().optional(),
          maximumWidth: z.number().int().positive().optional(),
          maximumBytesPerImage: z.number().int().positive().optional(),
          colorSpace: z.literal("sRGB").optional(),
        })
        .strict(),
    ),
    accessibility: DeliveryFactSchema(
      z
        .object({
          creatorAltText: z.boolean(),
          maximumAltTextCharacters: z.number().int().positive().optional(),
        })
        .strict(),
    ),
    surfaceOverlay: z
      .object({
        version: z.literal("2026-08-18"),
        evidence: z.literal("glyphkiln-advisory"),
        insets: z
          .object({
            top: z.number().min(0).max(1),
            right: z.number().min(0).max(1),
            bottom: z.number().min(0).max(1),
            left: z.number().min(0).max(1),
          })
          .strict(),
        note: z.string().min(1).max(2_000),
      })
      .strict(),
    authoringNotes: z.array(z.string().min(1).max(2_000)).max(32),
  })
  .strict();
const PortableDeliveryProfileSchema = z
  .object({
    id: z.enum(DELIVERY_PROFILE_IDS),
    metadataVersion: z.literal(DELIVERY_PROFILE_METADATA_VERSION),
    profile: DeliveryProfileSchema,
    sources: z.array(DeliverySourceSchema).max(32),
  })
  .strict()
  .superRefine((profile, context) => {
    if (!hasPortableDeliveryProfile(profile)) {
      context.addIssue({
        code: "custom",
        message: "Delivery profile metadata does not match the Core snapshot.",
      });
    }
  });
const DeliverySidecarSlideSchema = z
  .object({
    documentId: z.string().min(1).max(120),
    ordinal: z
      .number()
      .int()
      .min(0)
      .max(CAROUSEL_SEQUENCE_LIMITS.slides - 1),
    narrativeRole: z.enum(CAROUSEL_NARRATIVE_ROLE_IDS),
    altText: z.string().min(1).max(CAROUSEL_SEQUENCE_LIMITS.altTextCharacters),
    readingOrder: z
      .array(
        z
          .object({
            layerId: z.string().min(1).max(120),
            text: z.string().min(1).max(2_000),
          })
          .strict(),
      )
      .max(100),
    visualDescriptions: z
      .array(
        z
          .object({
            layerId: z.string().min(1).max(120),
            alt: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(100),
    sourceNotes: z
      .array(CarouselSourceNoteSchema)
      .max(CAROUSEL_SEQUENCE_LIMITS.sourceNotesPerSlide),
  })
  .strict();

const CampaignCarouselReviewSchema = z
  .object({
    kind: z.literal("campaign-carousel-review"),
    workspaceId: z.string().min(1),
    campaignId: z.string().min(1),
    directionId: z.string().min(1),
    directionKey: z.string().min(1),
    sequenceKey: CarouselSequenceKeySchema,
    review: z
      .object({
        version: z.literal(CAROUSEL_SEQUENCE_VERSION),
        deliveryProfileId: z.enum(DELIVERY_PROFILE_IDS),
        success: z.boolean(),
        issues: z.array(
          z
            .object({
              code: z.enum(CAROUSEL_REVIEW_ISSUE_CODES),
              severity: z.enum(["error", "warning"]),
              message: z.string().min(1),
              slideId: z.string().min(1).optional(),
              layerId: z.string().min(1).optional(),
            })
            .strict(),
        ),
      })
      .strict(),
    deliverySidecar: z
      .object({
        version: z.literal(CAROUSEL_DELIVERY_SIDECAR_VERSION),
        deliveryProfile: PortableDeliveryProfileSchema,
        slides: z
          .array(DeliverySidecarSlideSchema)
          .max(CAROUSEL_SEQUENCE_LIMITS.slides),
      })
      .strict(),
    slides: z
      .array(
        z
          .object({
            canvas: CampaignCanvasSchema,
            documentHash: z.string().regex(/^[0-9a-f]{64}$/),
            proof: z
              .object({
                document: DesignDocumentSchema,
                qualityIssues: z.unknown(),
                evidence: z.unknown(),
                outputs: z.unknown(),
              })
              .strict(),
          })
          .strict(),
      )
      .max(CAROUSEL_SEQUENCE_LIMITS.slides),
  })
  .strict();

const ResourceOriginSchema = z
  .object({
    kind: z.enum(["user-upload", "licensed-library", "generated", "unknown"]),
    sourceName: z.string().optional(),
    sourceReference: z.string().optional(),
    generativeImageModel: z.string().optional(),
  })
  .strict();
const ResourceLicenseSchema = z
  .object({
    status: z.enum(["owned", "licensed", "public-domain", "unknown"]),
    identifier: z.string().optional(),
    name: z.string().optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();
const ResourceBaseShape = {
  id: z.string().min(1),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  byteSize: z.number().int().positive(),
  origin: ResourceOriginSchema,
  license: ResourceLicenseSchema,
  createdAt: z.string().min(1),
};
const SelectableResourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...ResourceBaseShape,
      kind: z.literal("raster-asset"),
      mediaType: z.enum(["image/png", "image/jpeg"]),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...ResourceBaseShape,
      kind: z.literal("font"),
      mediaType: z.enum(["font/ttf", "font/otf"]),
      family: z.string().min(1),
      weight: z.number().int().min(1).max(1_000),
      style: z.enum(["normal", "italic"]),
    })
    .strict(),
]);
const WorkspaceResourcesSchema = z
  .object({
    kind: z.literal("workspace-resources"),
    workspaceId: z.string().min(1),
    resources: z.array(SelectableResourceSchema).max(500),
    truncated: z.boolean(),
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
    evidence: z.unknown(),
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

const CompletedRenderJobsSchema = z
  .object({
    kind: z.literal("completed-render-jobs"),
    jobs: z.array(RenderJobSchema).max(20),
  })
  .strict();

const ProposalIssueSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    candidateIndex: z.number().int().nonnegative().optional(),
    lock: AuthoringLockSchema.optional(),
  })
  .strict();
const ProposalDecisionSchema = z
  .object({
    id: z.string().min(1),
    decision: z.enum(["accepted", "rejected"]),
    reason: z.string().min(1).optional(),
    designId: z.string().min(1).optional(),
    revisionId: z.string().min(1).optional(),
    decidedBy: UserSummarySchema,
    createdAt: z.string().min(1),
  })
  .strict();
const ProposalProofOutputSchema = z
  .object({
    format: z.enum(["svg", "png"]),
    mimeType: z.enum(["image/svg+xml", "image/png"]),
    base64: z
      .string()
      .min(1)
      .max(Math.ceil(MAXIMUM_BROWSER_RENDER_PROOF_BYTES / 3) * 4)
      .regex(BASE64_PATTERN)
      .optional(),
    byteSize: z.number().int().positive().max(MAXIMUM_BROWSER_RENDER_PROOF_BYTES),
    fingerprint: z.string().min(1),
    filename: z.string().min(1),
    manifest: z.unknown(),
  })
  .strict();
const ProposalCandidateSchema = z
  .object({
    id: z.string().min(1),
    index: z.number().int().min(0).max(3),
    status: z.enum(["proved", "rejected"]),
    rationale: z
      .object({ kind: z.literal("model-suggestion"), text: z.string().min(1) })
      .strict()
      .optional(),
    document: DesignDocumentSchema.optional(),
    canonicalHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    issues: z.array(ProposalIssueSchema),
    proof: z
      .object({
        qualityIssues: z.unknown(),
        evidence: z.unknown(),
        outputs: z.array(ProposalProofOutputSchema).max(2),
      })
      .strict()
      .optional(),
    decision: ProposalDecisionSchema.optional(),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (candidate.status === "proved") {
      if (
        candidate.document === undefined ||
        candidate.canonicalHash === undefined ||
        candidate.proof === undefined ||
        !isRenderProofProjection(
          candidate.proof,
          candidate.document,
          candidate.canonicalHash,
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "A proved campaign candidate requires one bounded Core proof.",
        });
      }
    } else if (
      candidate.proof !== undefined &&
      (candidate.document === undefined ||
        candidate.canonicalHash === undefined ||
        !isRenderProofProjection(
          candidate.proof,
          candidate.document,
          candidate.canonicalHash,
        ))
    ) {
      context.addIssue({
        code: "custom",
        message: "Campaign proposal proof metadata is invalid.",
      });
    }
    if (
      (candidate.document === undefined) !==
      (candidate.canonicalHash === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Campaign proposal document authority is incomplete.",
      });
    }
  });
const ProposalRunSchema = z
  .object({
    kind: z.literal("campaign-proposal-run"),
    id: z.string().min(1),
    workspaceId: z.string().min(1),
    campaignId: z.string().min(1),
    directionId: z.string().min(1),
    baseCanvasId: z.string().min(1),
    baseDesignId: z.string().min(1),
    baseRevisionId: z.string().min(1),
    descriptor: z
      .object({
        providerId: z.string().min(1),
        modelId: z.string().min(1),
        retentionDisclosure: z.string().min(1),
      })
      .strict(),
    inputHash: z.string().regex(/^[0-9a-f]{64}$/),
    responseHash: z.string().regex(/^[0-9a-f]{64}$/),
    locks: z.array(AuthoringLockSchema).max(6),
    createdAt: z.string().min(1),
    candidates: z.array(ProposalCandidateSchema).min(3).max(4),
  })
  .strict();
const ProposalCreatedSchema = z
  .object({ kind: z.literal("campaign-proposals-created"), run: ProposalRunSchema })
  .strict();
const ProposalAcceptedSchema = z
  .object({
    kind: z.literal("campaign-proposal-accepted"),
    decision: ProposalDecisionSchema,
    design: DesignSavedSchema,
  })
  .strict();
const ProposalRejectedSchema = z
  .object({
    kind: z.literal("campaign-proposal-rejected"),
    decision: ProposalDecisionSchema,
  })
  .strict();
const CampaignHandoffSchema = z
  .object({
    kind: z.literal("campaign-handoff"),
    campaignId: z.string().min(1),
    directionId: z.string().min(1),
    filename: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/),
    mediaType: z.literal("application/vnd.glyphkiln.campaign-handoff+json"),
    byteSize: z.number().int().positive().max(MAXIMUM_CAMPAIGN_HANDOFF_BYTES),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    base64: z
      .string()
      .min(1)
      .max(MAXIMUM_BASE64_HANDOFF_CHARACTERS)
      .regex(BASE64_PATTERN),
    fileCount: z.number().int().nonnegative().max(512),
    approvedCanvasCount: z.number().int().nonnegative().max(64),
    unapprovedCanvasCount: z.number().int().nonnegative().max(64),
  })
  .strict();

const CampaignHandoffFileSchema = z
  .object({
    path: z.string().min(1).max(512).refine(isSafeArchivePath),
    mediaType: z.string().min(1).max(128),
    byteSize: z.number().int().nonnegative().max(MAXIMUM_CAMPAIGN_HANDOFF_BYTES),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    base64: z.string().max(MAXIMUM_BASE64_HANDOFF_CHARACTERS).regex(BASE64_PATTERN),
    approvalStatus: z.enum(["approved", "unapproved"]),
  })
  .strict();
const CampaignHandoffArchiveSchema = z
  .object({
    version: z.literal("1.0.0"),
    campaign: CampaignSummarySchema,
    directionId: z.string().min(1),
    files: z.array(CampaignHandoffFileSchema).max(512),
    summary: z
      .object({
        approvedCanvasCount: z.number().int().nonnegative().max(64),
        unapprovedCanvasCount: z.number().int().nonnegative().max(64),
      })
      .strict(),
  })
  .strict();

const ReviewCommentSchema = z
  .object({
    id: z.string().min(1),
    body: z.string().min(1),
    anchor: z
      .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
      .strict()
      .optional(),
    createdBy: UserSummarySchema,
    createdAt: z.string().min(1),
  })
  .strict();
const ReviewTransitionSchema = z
  .object({
    id: z.string().min(1),
    fromState: z.enum(["in-review", "changes-requested", "approved"]).optional(),
    toState: z.enum(["in-review", "changes-requested", "approved"]),
    reason: z.string().min(1).optional(),
    createdBy: UserSummarySchema,
    createdAt: z.string().min(1),
  })
  .strict();
const ApprovalSchema = z
  .object({
    id: z.string().min(1),
    renderJobId: z.string().min(1),
    revisionCanonicalHash: z.string().regex(/^[0-9a-f]{64}$/),
    resourcePins: z.array(
      z
        .object({
          resourceId: z.string().min(1),
          resourceKind: z.enum(["raster-asset", "font"]),
          ordinal: z.number().int().nonnegative(),
          contentHash: z.string().regex(/^[0-9a-f]{64}$/),
        })
        .strict(),
    ),
    outputEvidence: z.array(
      z
        .object({
          format: z.enum(["svg", "png"]),
          artifactSha256: z.string().regex(/^[0-9a-f]{64}$/),
          manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
          fingerprint: z.string().min(1),
        })
        .strict(),
    ),
    approvedBy: UserSummarySchema,
    approvedAt: z.string().min(1),
  })
  .strict();
const RevisionReviewSchema = z
  .object({
    kind: z.literal("revision-review"),
    id: z.string().min(1),
    workspaceId: z.string().min(1),
    designId: z.string().min(1),
    revisionId: z.string().min(1),
    state: z.enum(["in-review", "changes-requested", "approved"]),
    startedBy: UserSummarySchema,
    startedAt: z.string().min(1),
    updatedBy: UserSummarySchema,
    updatedAt: z.string().min(1),
    comments: z.array(ReviewCommentSchema),
    transitions: z.array(ReviewTransitionSchema),
    approval: ApprovalSchema.optional(),
  })
  .strict();
const ReviewReceiptSchema = z
  .object({
    kind: z.enum([
      "revision-review-submitted",
      "revision-changes-requested",
      "revision-approved",
    ]),
    review: RevisionReviewSchema,
    approval: ApprovalSchema.optional(),
  })
  .strict();
const ReviewCommentReceiptSchema = z
  .object({
    kind: z.literal("revision-review-commented"),
    reviewId: z.string().min(1),
    comment: ReviewCommentSchema,
  })
  .strict();

const RevisionComparisonSchema = z
  .object({
    kind: z.literal("revision-comparison"),
    left: z
      .object({
        revision: DesignRevisionSchema,
        qualityIssues: z.unknown(),
        evidence: z.unknown(),
        outputs: z.unknown(),
      })
      .strict(),
    right: z
      .object({
        revision: DesignRevisionSchema,
        qualityIssues: z.unknown(),
        evidence: z.unknown(),
        outputs: z.unknown(),
      })
      .strict(),
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
  campaigns: CampaignSummary[];
  features: { campaignWorkflow: boolean };
};

export type SelectableResource = z.infer<typeof SelectableResourceSchema>;
export type WorkspaceResources = {
  resources: SelectableResource[];
  truncated: boolean;
};

export type PublishedBrand = z.infer<typeof PublishedBrandSchema>;
export type BrandSnapshotProjection = z.infer<typeof BrandSnapshotProjectionSchema>;
export type SavedDesign = z.infer<typeof DesignSavedSchema>;
export type DesignRevision = z.infer<typeof DesignRevisionSchema>;
export type CreatedInvitation = z.infer<typeof InvitationCreatedSchema>;
export type QueuedRenderJob = z.infer<typeof RenderJobQueuedSchema>;
export type RenderJob = z.infer<typeof RenderJobSchema>;
export type RenderJobOutput = z.infer<typeof RenderJobOutputSchema>;
export type CampaignBoard = z.infer<typeof CampaignBoardSchema>;
export type CampaignDirection = z.infer<typeof CampaignDirectionSchema>;
export type CampaignCanvas = z.infer<typeof CampaignCanvasSchema>;
export type CampaignCanvasSeed = z.infer<typeof CampaignCanvasSeedSchema>;
export type CampaignCanvasSeedInput = Omit<
  Extract<AppQuery, { type: "campaign.canvas.seed" }>,
  "type"
>;
export type CampaignProposalRun = CampaignProposalRunProjection;
export type CampaignProposalDecision = z.infer<typeof ProposalDecisionSchema>;
export type CampaignHandoff = Omit<CampaignHandoffProjection, "base64"> & {
  bytes: Uint8Array;
};
export type CampaignCarouselReview = Omit<
  CampaignCarouselReviewProjection,
  "slides"
> & {
  slides: readonly {
    canvas: CampaignCanvas;
    documentHash: string;
    proof: PreviewSuccess;
  }[];
};
export type RevisionReview = z.infer<typeof RevisionReviewSchema>;
export type RevisionComparison = {
  left: { revision: DesignRevision; proof: PreviewSuccess };
  right: { revision: DesignRevision; proof: PreviewSuccess };
};

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
  resources: (workspaceId: string) => Promise<ApiResult<WorkspaceResources>>;
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
    baseRevision?: { designId: string; revisionId: string };
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
  completedRenderJobs: (
    workspaceId: string,
    revisionId: string,
  ) => Promise<ApiResult<RenderJob[]>>;
  createCampaign: (input: {
    workspaceId: string;
    name: string;
    brief: string;
    campaignSeed: string;
  }) => Promise<ApiResult<CampaignSummary>>;
  campaignBoard: (
    workspaceId: string,
    campaignId: string,
  ) => Promise<ApiResult<CampaignBoard>>;
  campaignCanvasSeed: (
    input: CampaignCanvasSeedInput,
  ) => Promise<ApiResult<CampaignCanvasSeed>>;
  createCampaignDirection: (input: {
    workspaceId: string;
    campaignId: string;
    directionKey: string;
    name: string;
    locks: z.infer<typeof AuthoringLockSchema>[];
  }) => Promise<ApiResult<CampaignDirection>>;
  branchCampaignDirection: (input: {
    workspaceId: string;
    campaignId: string;
    sourceDirectionId: string;
    directionKey: string;
    name: string;
  }) => Promise<ApiResult<CampaignDirection>>;
  attachCampaignCanvas: (input: {
    workspaceId: string;
    campaignId: string;
    directionId: string;
    canvasKey: string;
    designId: string;
    revisionId: string;
    ordinal: number;
    compositionVariantId: CampaignCanvasSeedInput["compositionVariantId"];
    narrativeRole: z.infer<typeof CampaignCanvasSchema>["narrativeRole"];
    deliveryProfileId?: z.infer<typeof CampaignCanvasSchema>["deliveryProfileId"];
    carouselSequenceKey?: z.input<typeof CarouselSequenceKeySchema>;
    altText?: z.infer<typeof CampaignCanvasSchema>["altText"];
    sourceNotes?: z.infer<typeof CampaignCanvasSchema>["sourceNotes"];
  }) => Promise<ApiResult<CampaignCanvas>>;
  requestCampaignProposals: (input: {
    workspaceId: string;
    campaignId: string;
    directionId: string;
    baseCanvasId: string;
    candidateCount: 3 | 4;
  }) => Promise<ApiResult<CampaignProposalRun>>;
  campaignProposalRun: (input: {
    workspaceId: string;
    campaignId: string;
    runId: string;
  }) => Promise<ApiResult<CampaignProposalRun>>;
  campaignCarouselReview: (input: {
    workspaceId: string;
    campaignId: string;
    directionId: string;
    sequenceKey: string;
  }) => Promise<ApiResult<CampaignCarouselReview>>;
  acceptCampaignProposal: (input: {
    workspaceId: string;
    campaignId: string;
    runId: string;
    candidateId: string;
    designName: string;
  }) => Promise<ApiResult<SavedDesign>>;
  rejectCampaignProposal: (input: {
    workspaceId: string;
    campaignId: string;
    runId: string;
    candidateId: string;
    reason?: string;
  }) => Promise<ApiResult<CampaignProposalDecision>>;
  campaignHandoff: (input: {
    workspaceId: string;
    campaignId: string;
    directionId: string;
  }) => Promise<ApiResult<CampaignHandoff>>;
  compareRevisions: (input: {
    workspaceId: string;
    leftDesignId: string;
    leftRevisionId: string;
    rightDesignId: string;
    rightRevisionId: string;
  }) => Promise<ApiResult<RevisionComparison>>;
  revisionReview: (input: {
    workspaceId: string;
    designId: string;
    revisionId: string;
  }) => Promise<ApiResult<RevisionReview>>;
  submitRevisionReview: (input: {
    workspaceId: string;
    designId: string;
    revisionId: string;
  }) => Promise<ApiResult<RevisionReview>>;
  commentRevisionReview: (input: {
    workspaceId: string;
    reviewId: string;
    body: string;
    anchor?: { x: number; y: number };
  }) => Promise<ApiResult<z.infer<typeof ReviewCommentSchema>>>;
  requestRevisionChanges: (input: {
    workspaceId: string;
    designId: string;
    revisionId: string;
    reason: string;
  }) => Promise<ApiResult<RevisionReview>>;
  approveRevision: (input: {
    workspaceId: string;
    designId: string;
    revisionId: string;
    renderJobId: string;
  }) => Promise<ApiResult<RevisionReview>>;
};

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function createAppAlphaApi(
  fetchImplementation: FetchImplementation = (input, init) => fetch(input, init),
  previewCatalog?: PreviewCatalog,
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
          campaigns: value.campaigns,
          features: value.features,
        }),
      );
    },
    async resources(workspaceId) {
      return parseValue(
        await query({ type: "workspace.resources", workspaceId }),
        WorkspaceResourcesSchema,
        (value) => ({
          resources: value.resources,
          truncated: value.truncated,
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
    async completedRenderJobs(workspaceId, revisionId) {
      return parseValue(
        await query({
          type: "render.jobs.completed",
          workspaceId,
          revisionId,
        }),
        CompletedRenderJobsSchema,
        (value) => value.jobs,
      );
    },
    async createCampaign(input) {
      return parseValue(
        await command({
          type: "campaign.create",
          ...input,
          familyId: "image-led-campaign",
        }),
        CampaignCreatedSchema,
        (value) => value.campaign,
      );
    },
    async campaignBoard(workspaceId, campaignId) {
      return parseValue(
        await query({ type: "campaign.board", workspaceId, campaignId }),
        CampaignBoardSchema,
        (value) => value,
      );
    },
    async campaignCanvasSeed(input) {
      const parsed = parseValue(
        await query({ type: "campaign.canvas.seed", ...input }),
        CampaignCanvasSeedSchema,
        (value) => value,
      );
      if (
        !parsed.ok ||
        (parsed.value.workspaceId === input.workspaceId &&
          parsed.value.campaignId === input.campaignId &&
          parsed.value.directionId === input.directionId &&
          parsed.value.canvasKey === input.canvasKey &&
          parsed.value.template.id === input.templateId &&
          parsed.value.format === input.format)
      ) {
        return parsed;
      }
      return malformedResponse();
    },
    async createCampaignDirection(input) {
      return parseValue(
        await command({ type: "campaign.direction.create", ...input }),
        CampaignDirectionCreatedSchema,
        (value) => value.direction,
      );
    },
    async branchCampaignDirection(input) {
      return parseValue(
        await command({ type: "campaign.direction.branch", ...input }),
        CampaignDirectionCreatedSchema,
        (value) => value.direction,
      );
    },
    async attachCampaignCanvas(input) {
      const { carouselSequenceKey, ...canvasInput } = input;
      return parseValue(
        await command({
          type: "campaign.canvas.attach",
          ...canvasInput,
          ...(carouselSequenceKey === undefined
            ? {}
            : { carouselSequenceKey: createCarouselSequenceKey(carouselSequenceKey) }),
        }),
        CampaignCanvasAttachedSchema,
        (value) => value.canvas,
      );
    },
    async requestCampaignProposals(input) {
      return parseProposalRun(
        await command({ type: "campaign.proposals.request", ...input }),
        ProposalCreatedSchema,
        (value) => value.run,
      );
    },
    async campaignProposalRun(input) {
      return parseProposalRun(
        await query({ type: "campaign.proposal.run", ...input }),
        ProposalRunSchema,
        (value) => value,
      );
    },
    async acceptCampaignProposal(input) {
      return parseValue(
        await command({ type: "campaign.proposal.accept", ...input }),
        ProposalAcceptedSchema,
        (value) => value.design,
      );
    },
    async rejectCampaignProposal(input) {
      return parseValue(
        await command({ type: "campaign.proposal.reject", ...input }),
        ProposalRejectedSchema,
        (value) => value.decision,
      );
    },
    async campaignHandoff(input) {
      return parseCampaignHandoff(
        await query({ type: "campaign.handoff", ...input }),
        input,
      );
    },
    async campaignCarouselReview(input) {
      const sequenceKey = createCarouselSequenceKey(input.sequenceKey);
      return parseCampaignCarouselReview(
        await query({ type: "campaign.carousel.review", ...input, sequenceKey }),
        input,
      );
    },
    async compareRevisions(input) {
      return parseRevisionComparison(
        await query({ type: "revision.compare", ...input }),
        previewCatalog,
      );
    },
    async revisionReview(input) {
      return parseValue(
        await query({ type: "revision.review", ...input }),
        RevisionReviewSchema,
        (value) => value,
      );
    },
    async submitRevisionReview(input) {
      return parseValue(
        await command({ type: "revision.review.submit", ...input }),
        ReviewReceiptSchema,
        (value) => value.review,
      );
    },
    async commentRevisionReview(input) {
      return parseValue(
        await command({ type: "revision.review.comment", ...input }),
        ReviewCommentReceiptSchema,
        (value) => value.comment,
      );
    },
    async requestRevisionChanges(input) {
      return parseValue(
        await command({ type: "revision.review.request-changes", ...input }),
        ReviewReceiptSchema,
        (value) => value.review,
      );
    },
    async approveRevision(input) {
      return parseValue(
        await command({ type: "revision.review.approve", ...input }),
        ReviewReceiptSchema,
        (value) => value.review,
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

async function parseProposalRun<Schema extends z.ZodType>(
  result: RawResult,
  schema: Schema,
  project: (value: z.output<Schema>) => z.infer<typeof ProposalRunSchema>,
): Promise<ApiResult<CampaignProposalRun>> {
  const parsed = parseValue(result, schema, project);
  if (!parsed.ok) return parsed;
  const run = parsed.value;
  for (const candidate of run.candidates) {
    if (candidate.document !== undefined && candidate.canonicalHash !== undefined) {
      const documentHash = await sha256Bytes(
        new TextEncoder().encode(canonicalJson(candidate.document)),
      );
      if (documentHash !== candidate.canonicalHash) return malformedResponse();
    }
    if (candidate.proof === undefined) continue;
    const proof = candidate.proof as RenderProofProjection;
    for (const output of proof.outputs) {
      if (output.base64 === undefined) continue;
      const bytes = decodeBase64(output.base64, output.byteSize);
      if (
        bytes === undefined ||
        (await sha256Bytes(bytes)) !== output.manifest.output.sha256
      ) {
        return malformedResponse();
      }
    }
  }
  return { ok: true, value: run as CampaignProposalRun };
}

async function parseCampaignCarouselReview(
  result: RawResult,
  expected: {
    workspaceId: string;
    campaignId: string;
    directionId: string;
    sequenceKey: string;
  },
): Promise<ApiResult<CampaignCarouselReview>> {
  const parsed = parseValue(result, CampaignCarouselReviewSchema, (value) => value);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  if (
    value.workspaceId !== expected.workspaceId ||
    value.campaignId !== expected.campaignId ||
    value.directionId !== expected.directionId ||
    value.sequenceKey !== expected.sequenceKey ||
    value.review.deliveryProfileId !== value.deliverySidecar.deliveryProfile.id
  ) {
    return malformedResponse();
  }

  const slides: CampaignCarouselReview["slides"][number][] = [];
  for (const slide of value.slides) {
    if (
      slide.canvas.carouselSequenceKey !== value.sequenceKey ||
      slide.canvas.deliveryProfileId !== value.review.deliveryProfileId ||
      slide.canvas.altText === undefined ||
      !isRenderProofProjection(slide.proof, slide.proof.document, slide.documentHash)
    ) {
      return malformedResponse();
    }
    if (
      (await sha256Bytes(
        new TextEncoder().encode(canonicalJson(slide.proof.document)),
      )) !== slide.documentHash
    ) {
      return malformedResponse();
    }
    const proof = slide.proof as RenderProofProjection;
    if (proof.evidence.version !== "1.1.0") return malformedResponse();
    for (const output of proof.outputs) {
      if (output.base64 === undefined) return malformedResponse();
      const bytes = decodeBase64(output.base64, output.byteSize);
      if (
        bytes === undefined ||
        (await sha256Bytes(bytes)) !== output.manifest.output.sha256
      ) {
        return malformedResponse();
      }
    }
    slides.push({
      canvas: slide.canvas,
      documentHash: slide.documentHash,
      proof: {
        ok: true,
        document: slide.proof.document,
        qualityIssues: proof.qualityIssues,
        evidence: proof.evidence,
        outputs: proof.outputs as PreviewSuccess["outputs"],
      },
    });
  }
  let deliverySidecar: CampaignCarouselReview["deliverySidecar"];
  try {
    deliverySidecar = createCarouselDeliverySidecar({
      deliveryProfileId: value.review.deliveryProfileId,
      slides: slides.map(({ canvas, proof }, ordinal) => ({
        document: proof.document,
        ordinal,
        narrativeRole: canvas.narrativeRole,
        compositionVariantId: canvas.compositionVariantId,
        altText: canvas.altText,
        ...(canvas.sourceNotes === undefined
          ? {}
          : { sourceNotes: canvas.sourceNotes }),
      })),
    });
  } catch {
    return malformedResponse();
  }
  if (canonicalJson(value.deliverySidecar) !== canonicalJson(deliverySidecar)) {
    return malformedResponse();
  }
  return {
    ok: true,
    value: {
      ...value,
      review: value.review,
      deliverySidecar,
      slides,
    },
  };
}

function hasPortableDeliveryProfile(input: {
  id: (typeof DELIVERY_PROFILE_IDS)[number];
  metadataVersion: string;
  profile: unknown;
  sources: readonly unknown[];
}): boolean {
  const profile = DELIVERY_PROFILE_REGISTRY[input.id];
  return (
    input.metadataVersion === DELIVERY_PROFILE_METADATA_VERSION &&
    canonicalJson(input.profile) === canonicalJson(profile) &&
    canonicalJson(input.sources) === canonicalJson(deliverySourcesForProfile(profile))
  );
}

async function parseCampaignHandoff(
  result: RawResult,
  expected: { campaignId: string; directionId: string },
): Promise<ApiResult<CampaignHandoff>> {
  const parsed = parseValue(result, CampaignHandoffSchema, (value) => value);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const bytes = decodeBase64(value.base64, value.byteSize);
  if (
    bytes === undefined ||
    value.campaignId !== expected.campaignId ||
    value.directionId !== expected.directionId ||
    value.approvedCanvasCount + value.unapprovedCanvasCount > 64 ||
    (await sha256Bytes(bytes)) !== value.sha256
  ) {
    return malformedResponse();
  }
  let archiveInput: unknown;
  try {
    archiveInput = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return malformedResponse();
  }
  const archive = CampaignHandoffArchiveSchema.safeParse(archiveInput);
  const approvalFiles = archive.success
    ? archive.data.files.filter((file) => file.path.endsWith(".approval.json"))
    : [];
  if (
    !archive.success ||
    archive.data.campaign.id !== expected.campaignId ||
    archive.data.directionId !== expected.directionId ||
    archive.data.files.length !== value.fileCount ||
    archive.data.summary.approvedCanvasCount !== value.approvedCanvasCount ||
    archive.data.summary.unapprovedCanvasCount !== value.unapprovedCanvasCount ||
    new Set(archive.data.files.map((file) => file.path)).size !==
      archive.data.files.length ||
    !hasStrictlyIncreasingPaths(archive.data.files) ||
    approvalFiles.filter((file) => file.approvalStatus === "approved").length !==
      value.approvedCanvasCount ||
    approvalFiles.filter((file) => file.approvalStatus === "unapproved").length !==
      value.unapprovedCanvasCount
  ) {
    return malformedResponse();
  }
  for (const file of archive.data.files) {
    const fileBytes = decodeBase64(file.base64, file.byteSize);
    if (fileBytes === undefined || (await sha256Bytes(fileBytes)) !== file.sha256) {
      return malformedResponse();
    }
  }
  return {
    ok: true,
    value: {
      kind: value.kind,
      campaignId: value.campaignId,
      directionId: value.directionId,
      filename: value.filename,
      mediaType: value.mediaType,
      byteSize: value.byteSize,
      sha256: value.sha256,
      fileCount: value.fileCount,
      approvedCanvasCount: value.approvedCanvasCount,
      unapprovedCanvasCount: value.unapprovedCanvasCount,
      bytes,
    },
  };
}

function decodeBase64(base64: string, expectedBytes: number): Uint8Array | undefined {
  if (
    expectedBytes > MAXIMUM_CAMPAIGN_HANDOFF_BYTES ||
    base64.length > Math.ceil(expectedBytes / 3) * 4 ||
    !BASE64_PATTERN.test(base64)
  ) {
    return undefined;
  }
  try {
    const binary = globalThis.atob(base64);
    if (binary.length !== expectedBytes) return undefined;
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const cryptoValue = Reflect.get(globalThis, "crypto") as Crypto | undefined;
  const subtle = cryptoValue?.subtle;
  if (subtle === undefined) return "";
  const digest = await subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hasStrictlyIncreasingPaths(files: { path: string }[]): boolean {
  for (let index = 1; index < files.length; index += 1) {
    const previous = files.at(index - 1);
    const current = files.at(index);
    if (
      previous === undefined ||
      current === undefined ||
      previous.path >= current.path
    ) {
      return false;
    }
  }
  return true;
}

function isSafeArchivePath(path: string): boolean {
  return (
    !path.startsWith("/") &&
    !path.includes("\\") &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
  );
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
      evidence: receipt.data.evidence,
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

async function parseRevisionComparison(
  result: RawResult,
  previewCatalog?: PreviewCatalog,
): Promise<ApiResult<RevisionComparison>> {
  if (!result.ok) return result;
  if (previewCatalog === undefined) return malformedResponse();
  const parsed = RevisionComparisonSchema.safeParse(result.value);
  if (!parsed.success) return malformedResponse();
  const [left, right] = await Promise.all([
    parseRevisionComparisonSide(parsed.data.left, previewCatalog),
    parseRevisionComparisonSide(parsed.data.right, previewCatalog),
  ]);
  if (!left.ok) return left;
  if (!right.ok) return right;
  return {
    ok: true,
    value: {
      left: left.value,
      right: right.value,
    },
  };
}

async function parseRevisionComparisonSide(
  side: z.infer<typeof RevisionComparisonSchema>["left"],
  previewCatalog: PreviewCatalog,
): Promise<ApiResult<RevisionComparison["left"]>> {
  const proof = parsePreviewResponse(
    {
      ok: true,
      document: side.revision.document,
      qualityIssues: side.qualityIssues,
      evidence: side.evidence,
      outputs: side.outputs,
    },
    200,
  );
  if (!proof.ok || !previewMatchesRevisionHash(proof, side.revision.documentHash)) {
    return malformedResponse();
  }
  const integrityFailure = await verifyPreviewIntegrity(
    proof,
    previewCatalog,
    side.revision.document,
  );
  if (integrityFailure !== null) {
    return previewIntegrityFailure(integrityFailure);
  }
  return { ok: true, value: { revision: side.revision, proof } };
}

function previewMatchesRevisionHash(
  preview: PreviewSuccess,
  revisionDocumentHash: string,
): boolean {
  return preview.outputs.every(
    (output) => output.manifest.designDocumentHash === revisionDocumentHash,
  );
}

function previewIntegrityFailure(failure: PreviewFailure | null): ApiFailure {
  if (failure === null) return malformedResponse();
  return {
    ok: false,
    status: failure.status,
    error: {
      code: failure.code,
      title: failure.title,
      detail: failure.detail,
      ...(failure.problems === undefined ? {} : { problems: failure.problems }),
      ...(failure.qualityIssues === undefined
        ? {}
        : { qualityIssues: failure.qualityIssues }),
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
