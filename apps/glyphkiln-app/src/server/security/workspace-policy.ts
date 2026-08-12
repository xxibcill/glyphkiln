export const WORKSPACE_ROLES = ["owner", "admin", "editor", "viewer"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_ACTIONS = [
  "read_workspace",
  "read_brands",
  "read_designs",
  "read_revisions",
  "read_campaigns",
  "read_reviews",
  "read_completed_exports",
  "preview_design",
  "publish_brand_snapshot",
  "create_design",
  "revise_design",
  "coordinate_campaigns",
  "comment_reviews",
  "manage_reviews",
  "approve_revisions",
  "ingest_resources",
  "request_export",
  "invite_admin",
  "invite_editor",
  "invite_viewer",
  "administer_workspace",
] as const;

export type WorkspaceAction = (typeof WORKSPACE_ACTIONS)[number];

type CapabilityRow = Readonly<Record<WorkspaceAction, boolean>>;

export const WORKSPACE_CAPABILITY_MATRIX: Readonly<
  Record<WorkspaceRole, CapabilityRow>
> = Object.freeze({
  owner: Object.freeze({
    read_workspace: true,
    read_brands: true,
    read_designs: true,
    read_revisions: true,
    read_campaigns: true,
    read_reviews: true,
    read_completed_exports: true,
    preview_design: true,
    publish_brand_snapshot: true,
    create_design: true,
    revise_design: true,
    coordinate_campaigns: true,
    comment_reviews: true,
    manage_reviews: true,
    approve_revisions: true,
    ingest_resources: true,
    request_export: true,
    invite_admin: true,
    invite_editor: true,
    invite_viewer: true,
    administer_workspace: true,
  }),
  admin: Object.freeze({
    read_workspace: true,
    read_brands: true,
    read_designs: true,
    read_revisions: true,
    read_campaigns: true,
    read_reviews: true,
    read_completed_exports: true,
    preview_design: true,
    publish_brand_snapshot: true,
    create_design: true,
    revise_design: true,
    coordinate_campaigns: true,
    comment_reviews: true,
    manage_reviews: true,
    approve_revisions: true,
    ingest_resources: true,
    request_export: true,
    invite_admin: true,
    invite_editor: true,
    invite_viewer: true,
    administer_workspace: false,
  }),
  editor: Object.freeze({
    read_workspace: true,
    read_brands: true,
    read_designs: true,
    read_revisions: true,
    read_campaigns: true,
    read_reviews: true,
    read_completed_exports: true,
    preview_design: true,
    publish_brand_snapshot: true,
    create_design: true,
    revise_design: true,
    coordinate_campaigns: true,
    comment_reviews: true,
    manage_reviews: true,
    approve_revisions: false,
    ingest_resources: true,
    request_export: true,
    invite_admin: false,
    invite_editor: false,
    invite_viewer: false,
    administer_workspace: false,
  }),
  viewer: Object.freeze({
    read_workspace: true,
    read_brands: true,
    read_designs: true,
    read_revisions: true,
    read_campaigns: true,
    read_reviews: true,
    read_completed_exports: true,
    preview_design: false,
    publish_brand_snapshot: false,
    create_design: false,
    revise_design: false,
    coordinate_campaigns: false,
    comment_reviews: true,
    manage_reviews: false,
    approve_revisions: false,
    ingest_resources: false,
    request_export: false,
    invite_admin: false,
    invite_editor: false,
    invite_viewer: false,
    administer_workspace: false,
  }),
});

export function hasCapability(
  role: WorkspaceRole | null | undefined,
  action: WorkspaceAction,
): boolean {
  if (!isWorkspaceRole(role) || !isWorkspaceAction(action)) {
    return false;
  }

  return WORKSPACE_CAPABILITY_MATRIX[role][action];
}

export const requireCapability = hasCapability;

export function canInviteRole(
  actorRole: WorkspaceRole | null | undefined,
  targetRole: WorkspaceRole,
): boolean {
  if (targetRole === "owner") {
    return false;
  }

  return hasCapability(actorRole, INVITATION_ACTION_BY_ROLE[targetRole]);
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return (
    typeof value === "string" && (WORKSPACE_ROLES as readonly string[]).includes(value)
  );
}

export function isWorkspaceAction(value: unknown): value is WorkspaceAction {
  return (
    typeof value === "string" &&
    (WORKSPACE_ACTIONS as readonly string[]).includes(value)
  );
}

const INVITATION_ACTION_BY_ROLE = Object.freeze({
  admin: "invite_admin",
  editor: "invite_editor",
  viewer: "invite_viewer",
} as const satisfies Record<Exclude<WorkspaceRole, "owner">, WorkspaceAction>);
