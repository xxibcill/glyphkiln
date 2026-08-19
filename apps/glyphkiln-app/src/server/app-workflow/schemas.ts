import {
  CAMPAIGN_COMPOSITION_VARIANT_IDS,
  CAMPAIGN_FAMILY_IDS,
  CAROUSEL_NARRATIVE_ROLE_IDS,
  CAROUSEL_SEQUENCE_LIMITS,
  DELIVERY_PROFILE_IDS,
  FORMAT_IDS,
} from "@glyphkiln/core";
import { BrandSnapshotSchema, LayerSchema, TEMPLATE_IDS } from "@glyphkiln/core/schema";
import { z } from "zod";

import { AUTHORING_LOCK_IDS } from "@/server/ai-authoring";

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const displayName = z.string().trim().min(1).max(120);
const workspaceName = z.string().trim().min(1).max(120);
const designName = z.string().trim().min(1).max(160);
const changeNote = z.string().trim().min(1).max(500);
const campaignBrief = z.string().trim().min(1).max(4000);
const reviewComment = z.string().trim().min(1).max(2000);
const reviewReason = z.string().trim().min(1).max(1000);
const email = z.string().trim().min(3).max(320);
const password = z.string().min(12).max(128);
const secretToken = z.string().min(32).max(256);
const idempotencyKey = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const uniqueIdentifiers = (maximum: number) =>
  z
    .array(identifier)
    .max(maximum)
    .refine((values) => new Set(values).size === values.length, {
      message: "Resource identifiers must be unique.",
    });
const carouselSourceNote = z
  .object({
    label: z
      .string()
      .trim()
      .min(1)
      .max(CAROUSEL_SEQUENCE_LIMITS.sourceNoteLabelCharacters),
    url: z.url().max(CAROUSEL_SEQUENCE_LIMITS.sourceNoteUrlCharacters).optional(),
  })
  .strict();

export const ManualDraftSchema = z
  .object({
    templateId: z.enum(TEMPLATE_IDS),
    format: z.enum(FORMAT_IDS),
    seed: z.string().trim().min(1).max(256),
    mode: z.enum(["light", "dark"]),
    layers: z.array(LayerSchema).min(1).max(100),
    resources: z
      .object({
        assetIds: uniqueIdentifiers(100),
        fontIds: uniqueIdentifiers(32),
      })
      .strict()
      .optional(),
  })
  .strict();

export const BrandSnapshotDraftSchema = BrandSnapshotSchema.omit({
  snapshotId: true,
  version: true,
  name: true,
});

const BootstrapRegisterSchema = z
  .object({
    type: z.literal("bootstrap.register"),
    bootstrapToken: secretToken,
    displayName,
    email,
    password,
    workspaceName,
  })
  .strict();

const InvitationRegisterSchema = z
  .object({
    type: z.literal("invitation.register"),
    displayName,
    email,
    password,
    invitationToken: secretToken,
  })
  .strict();

const LoginSchema = z
  .object({
    type: z.literal("session.login"),
    email,
    password,
  })
  .strict();

const LogoutSchema = z.object({ type: z.literal("session.logout") }).strict();

const CreateWorkspaceSchema = z
  .object({
    type: z.literal("workspace.create"),
    name: workspaceName,
  })
  .strict();

const CreateInvitationSchema = z
  .object({
    type: z.literal("invitation.create"),
    workspaceId: identifier,
    email,
    role: z.enum(["admin", "editor", "viewer"]),
  })
  .strict();

const AcceptInvitationSchema = z
  .object({
    type: z.literal("invitation.accept"),
    invitationToken: secretToken,
  })
  .strict();

const ChangeWorkspaceMemberRoleSchema = z
  .object({
    type: z.literal("workspace.member.role.change"),
    workspaceId: identifier,
    userId: identifier,
    role: z.enum(["admin", "editor", "viewer"]),
  })
  .strict();

const RevokeWorkspaceMemberSchema = z
  .object({
    type: z.literal("workspace.member.revoke"),
    workspaceId: identifier,
    userId: identifier,
  })
  .strict();

const PublishBrandSchema = z
  .object({
    type: z.literal("brand.publish"),
    workspaceId: identifier,
    brandKitId: identifier.optional(),
    name: displayName,
    snapshot: BrandSnapshotDraftSchema,
  })
  .strict();

const PreviewDesignSchema = z
  .object({
    type: z.literal("design.preview"),
    workspaceId: identifier,
    brandSnapshotId: identifier,
    draft: ManualDraftSchema,
    baseRevision: z
      .object({ designId: identifier, revisionId: identifier })
      .strict()
      .optional(),
  })
  .strict();

const CreateDesignSchema = z
  .object({
    type: z.literal("design.create"),
    workspaceId: identifier,
    name: designName,
    brandSnapshotId: identifier,
    draft: ManualDraftSchema,
  })
  .strict();

const ReviseDesignSchema = z
  .object({
    type: z.literal("design.revise"),
    workspaceId: identifier,
    designId: identifier,
    baseRevisionId: identifier,
    brandSnapshotId: identifier,
    draft: ManualDraftSchema,
    changeNote: changeNote.optional(),
  })
  .strict();

const CreateCampaignSchema = z
  .object({
    type: z.literal("campaign.create"),
    workspaceId: identifier,
    name: designName,
    brief: campaignBrief,
    campaignSeed: z.string().trim().min(1).max(256),
    familyId: z.enum(CAMPAIGN_FAMILY_IDS),
  })
  .strict();

const CreateCampaignDirectionSchema = z
  .object({
    type: z.literal("campaign.direction.create"),
    workspaceId: identifier,
    campaignId: identifier,
    directionKey: identifier,
    name: designName,
    locks: z
      .array(z.enum(AUTHORING_LOCK_IDS))
      .max(AUTHORING_LOCK_IDS.length)
      .refine((values) => new Set(values).size === values.length, {
        message: "Authoring locks must be unique.",
      }),
  })
  .strict();

const BranchCampaignDirectionSchema = z
  .object({
    type: z.literal("campaign.direction.branch"),
    workspaceId: identifier,
    campaignId: identifier,
    sourceDirectionId: identifier,
    directionKey: identifier,
    name: designName,
  })
  .strict();

const AttachCampaignCanvasSchema = z
  .object({
    type: z.literal("campaign.canvas.attach"),
    workspaceId: identifier,
    campaignId: identifier,
    directionId: identifier,
    canvasKey: identifier,
    designId: identifier,
    revisionId: identifier,
    compositionVariantId: z.enum(CAMPAIGN_COMPOSITION_VARIANT_IDS),
    narrativeRole: z.enum(CAROUSEL_NARRATIVE_ROLE_IDS),
    deliveryProfileId: z.enum(DELIVERY_PROFILE_IDS).optional(),
    carouselSequenceKey: identifier.optional(),
    sourceNotes: z
      .array(carouselSourceNote)
      .max(CAROUSEL_SEQUENCE_LIMITS.sourceNotesPerSlide)
      .optional(),
    ordinal: z.number().int().min(0).max(999),
  })
  .strict();

const RequestCampaignProposalsSchema = z
  .object({
    type: z.literal("campaign.proposals.request"),
    workspaceId: identifier,
    campaignId: identifier,
    directionId: identifier,
    baseCanvasId: identifier,
    candidateCount: z.union([z.literal(3), z.literal(4)]),
  })
  .strict();

const AcceptCampaignProposalSchema = z
  .object({
    type: z.literal("campaign.proposal.accept"),
    workspaceId: identifier,
    campaignId: identifier,
    runId: identifier,
    candidateId: identifier,
    designName,
  })
  .strict();

const RejectCampaignProposalSchema = z
  .object({
    type: z.literal("campaign.proposal.reject"),
    workspaceId: identifier,
    campaignId: identifier,
    runId: identifier,
    candidateId: identifier,
    reason: reviewReason.optional(),
  })
  .strict();

const SubmitRevisionReviewSchema = z
  .object({
    type: z.literal("revision.review.submit"),
    workspaceId: identifier,
    designId: identifier,
    revisionId: identifier,
  })
  .strict();

const CommentRevisionReviewSchema = z
  .object({
    type: z.literal("revision.review.comment"),
    workspaceId: identifier,
    reviewId: identifier,
    body: reviewComment,
    anchor: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
  })
  .strict();

const RequestRevisionChangesSchema = z
  .object({
    type: z.literal("revision.review.request-changes"),
    workspaceId: identifier,
    designId: identifier,
    revisionId: identifier,
    reason: reviewReason,
  })
  .strict();

const ApproveRevisionSchema = z
  .object({
    type: z.literal("revision.review.approve"),
    workspaceId: identifier,
    designId: identifier,
    revisionId: identifier,
    renderJobId: identifier,
  })
  .strict();

const RenderRevisionSchema = z
  .object({
    type: z.literal("revision.render"),
    workspaceId: identifier,
    designId: identifier,
    revisionId: identifier,
  })
  .strict();

const RequestRevisionExportSchema = z
  .object({
    type: z.literal("revision.export.request"),
    workspaceId: identifier,
    designId: identifier,
    revisionId: identifier,
    idempotencyKey,
  })
  .strict();

export const AppCommandSchema = z.discriminatedUnion("type", [
  BootstrapRegisterSchema,
  InvitationRegisterSchema,
  LoginSchema,
  LogoutSchema,
  CreateWorkspaceSchema,
  CreateInvitationSchema,
  AcceptInvitationSchema,
  ChangeWorkspaceMemberRoleSchema,
  RevokeWorkspaceMemberSchema,
  PublishBrandSchema,
  PreviewDesignSchema,
  CreateDesignSchema,
  ReviseDesignSchema,
  CreateCampaignSchema,
  CreateCampaignDirectionSchema,
  BranchCampaignDirectionSchema,
  AttachCampaignCanvasSchema,
  RequestCampaignProposalsSchema,
  AcceptCampaignProposalSchema,
  RejectCampaignProposalSchema,
  SubmitRevisionReviewSchema,
  CommentRevisionReviewSchema,
  RequestRevisionChangesSchema,
  ApproveRevisionSchema,
  RenderRevisionSchema,
  RequestRevisionExportSchema,
]);

export const AppQuerySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session.current") }).strict(),
  z
    .object({
      type: z.literal("workspace.dashboard"),
      workspaceId: identifier,
    })
    .strict(),
  z
    .object({
      type: z.literal("workspace.members"),
      workspaceId: identifier,
    })
    .strict(),
  z
    .object({
      type: z.literal("workspace.resources"),
      workspaceId: identifier,
    })
    .strict(),
  z
    .object({
      type: z.literal("campaign.board"),
      workspaceId: identifier,
      campaignId: identifier,
    })
    .strict(),
  z
    .object({
      type: z.literal("campaign.canvas.seed"),
      workspaceId: identifier,
      campaignId: identifier,
      directionId: identifier,
      canvasKey: identifier,
      templateId: z.enum(TEMPLATE_IDS),
      format: z.enum(FORMAT_IDS),
      compositionVariantId: z.enum(CAMPAIGN_COMPOSITION_VARIANT_IDS),
    })
    .strict(),
  z
    .object({
      type: z.literal("campaign.proposal.run"),
      workspaceId: identifier,
      campaignId: identifier,
      runId: identifier,
    })
    .strict(),
  z
    .object({
      type: z.literal("campaign.handoff"),
      workspaceId: identifier,
      campaignId: identifier,
      directionId: identifier,
    })
    .strict(),
  z
    .object({
      type: z.literal("revision.compare"),
      workspaceId: identifier,
      leftDesignId: identifier,
      leftRevisionId: identifier,
      rightDesignId: identifier,
      rightRevisionId: identifier,
    })
    .strict(),
  z
    .object({
      type: z.literal("revision.review"),
      workspaceId: identifier,
      designId: identifier,
      revisionId: identifier,
    })
    .strict(),
  z
    .object({
      type: z.literal("brand.snapshot"),
      workspaceId: identifier,
      brandSnapshotId: identifier,
    })
    .strict(),
  z
    .object({
      type: z.literal("design.revision"),
      workspaceId: identifier,
      designId: identifier,
      revision: z.union([
        z.literal("head"),
        z.object({ revisionId: identifier }).strict(),
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("render.job"),
      workspaceId: identifier,
      jobId: identifier,
    })
    .strict(),
  z
    .object({
      type: z.literal("render.jobs.completed"),
      workspaceId: identifier,
      revisionId: identifier,
    })
    .strict(),
]);
