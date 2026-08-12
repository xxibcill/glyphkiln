import { describe, expect, it } from "vitest";

import {
  WORKSPACE_ACTIONS,
  WORKSPACE_CAPABILITY_MATRIX,
  WORKSPACE_ROLES,
  canInviteRole,
  hasCapability,
  requireCapability,
  type WorkspaceAction,
  type WorkspaceRole,
} from "./workspace-policy";

const VIEWER_ACTIONS = [
  "read_workspace",
  "read_brands",
  "read_designs",
  "read_revisions",
  "read_campaigns",
  "read_reviews",
  "read_completed_exports",
  "comment_reviews",
] as const satisfies readonly WorkspaceAction[];

const EDITOR_ACTIONS = [
  ...VIEWER_ACTIONS,
  "preview_design",
  "publish_brand_snapshot",
  "create_design",
  "revise_design",
  "coordinate_campaigns",
  "manage_reviews",
  "ingest_resources",
  "request_export",
] as const satisfies readonly WorkspaceAction[];

const ADMIN_ACTIONS = [
  ...EDITOR_ACTIONS,
  "approve_revisions",
  "invite_admin",
  "invite_editor",
  "invite_viewer",
] as const satisfies readonly WorkspaceAction[];

const EXPECTED_ACTIONS = {
  viewer: new Set<WorkspaceAction>(VIEWER_ACTIONS),
  editor: new Set<WorkspaceAction>(EDITOR_ACTIONS),
  admin: new Set<WorkspaceAction>(ADMIN_ACTIONS),
  owner: new Set<WorkspaceAction>(WORKSPACE_ACTIONS),
} satisfies Record<WorkspaceRole, ReadonlySet<WorkspaceAction>>;

describe("workspace capability policy", () => {
  it("covers every role and action with the explicit matrix", () => {
    expect(WORKSPACE_ROLES).toEqual(["owner", "admin", "editor", "viewer"]);
    expect(WORKSPACE_ACTIONS).toEqual([
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
    ]);

    for (const role of WORKSPACE_ROLES) {
      for (const action of WORKSPACE_ACTIONS) {
        const expected = EXPECTED_ACTIONS[role].has(action);

        expect(hasCapability(role, action), `${role} performing ${action}`).toBe(
          expected,
        );
        expect(
          WORKSPACE_CAPABILITY_MATRIX[role][action],
          `${role} matrix entry for ${action}`,
        ).toBe(expected);
      }
    }
  });

  it("allows only owners to administer the workspace", () => {
    expect(hasCapability("owner", "administer_workspace")).toBe(true);
    expect(hasCapability("admin", "administer_workspace")).toBe(false);
    expect(hasCapability("editor", "administer_workspace")).toBe(false);
    expect(hasCapability("viewer", "administer_workspace")).toBe(false);
  });

  it("allows owners and admins to invite non-owner roles only", () => {
    const expected = {
      owner: { owner: false, admin: true, editor: true, viewer: true },
      admin: { owner: false, admin: true, editor: true, viewer: true },
      editor: { owner: false, admin: false, editor: false, viewer: false },
      viewer: { owner: false, admin: false, editor: false, viewer: false },
    } satisfies Record<WorkspaceRole, Record<WorkspaceRole, boolean>>;

    for (const actorRole of WORKSPACE_ROLES) {
      for (const targetRole of WORKSPACE_ROLES) {
        expect(
          canInviteRole(actorRole, targetRole),
          `${actorRole} inviting ${targetRole}`,
        ).toBe(expected[actorRole][targetRole]);
      }
    }
  });

  it("fails closed when no workspace membership exists", () => {
    expect(hasCapability(null, "read_workspace")).toBe(false);
    expect(hasCapability(undefined, "read_workspace")).toBe(false);
    expect(hasCapability("superuser" as WorkspaceRole, "read_workspace")).toBe(false);
    expect(hasCapability("owner", "unknown_action" as WorkspaceAction)).toBe(false);
    expect(canInviteRole(null, "viewer")).toBe(false);
  });

  it("retains requireCapability as the fail-closed enforcement name", () => {
    expect(requireCapability("viewer", "read_workspace")).toBe(true);
    expect(requireCapability("viewer", "create_design")).toBe(false);
  });
});
