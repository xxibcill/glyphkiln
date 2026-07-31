import { FORMAT_IDS } from "@glyphkiln/core";
import { BrandSnapshotSchema, LayerSchema, TEMPLATE_IDS } from "@glyphkiln/core/schema";
import { z } from "zod";

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
]);
