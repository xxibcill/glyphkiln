import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCampaignCanvasKey,
  createCampaignDirectionKey,
  deriveCampaignSeeds,
  renderGraphic,
  sha256,
} from "@glyphkiln/core";
import type { DesignLayer } from "@glyphkiln/core";

import { createProjectPreview } from "@/lib/project-preview/render-preview";
import {
  createPGliteDatabase,
  type PGliteDatabase,
} from "@/server/persistence/pglite-database";
import { migrateDatabase } from "@/server/persistence/migrations";
import { InMemoryRenderQueue, RenderQueueCapacityError } from "@/server/render-queue";
import { RenderResourceResolutionError } from "@/server/render-worker";
import type {
  ResourceAdmission,
  ResourceStore,
  ResourceVersion,
  ResourceWithBytes,
} from "@/server/resources";
import type {
  Clock,
  PasswordHasher,
  SecretFactory,
  WorkspaceRole,
} from "@/server/security";
import {
  hashSecret,
  INVITATION_DURATION_MS,
  SESSION_DURATION_MS,
} from "@/server/security";

import { createAppWorkflow } from "./workflow";
import type {
  AppCommand,
  AppResult,
  AppWorkflow,
  BrandSnapshotDraft,
  CommandReceipt,
  ManualDraft,
  QueryProjection,
  RequestEvidence,
  SessionGrant,
} from "./contracts";

const NOW = new Date("2026-07-31T01:00:00.000Z");
const BOOTSTRAP_TOKEN = "operator-bootstrap-token-for-workflow-tests";

describe("AppWorkflow", () => {
  let database: PGliteDatabase;
  let workflow: AppWorkflow;
  let secrets: DeterministicSecretFactory;
  let clock: MutableTestClock;
  let renderQueue: InMemoryRenderQueue;
  let resourceStore: TestResourceStore;

  beforeEach(async () => {
    database = await createPGliteDatabase();
    await migrateDatabase(database);
    secrets = new DeterministicSecretFactory();
    clock = new MutableTestClock(NOW);
    renderQueue = new InMemoryRenderQueue();
    resourceStore = new TestResourceStore();
    workflow = createAppWorkflow({
      database,
      bootstrapTokenHash: hashSecret(BOOTSTRAP_TOKEN),
      passwordHasher: new TestPasswordHasher(),
      secretFactory: secrets,
      clock,
      renderQueue,
      resourceStore,
      render: async (document) =>
        (
          await createProjectPreview(document, {
            render: async (input, options) => renderGraphic(input, options),
            now: () => NOW,
          })
        ).body,
    });
  });

  afterEach(async () => {
    await database.close();
  });

  it("does not start password hashing when the workflow is constructed", () => {
    const passwordHasher = new CountingPasswordHasher();

    createAppWorkflow({
      database,
      bootstrapTokenHash: hashSecret(BOOTSTRAP_TOKEN),
      passwordHasher,
      secretFactory: secrets,
      clock,
      renderQueue,
      resourceStore,
    });

    expect(passwordHasher.hashCalls).toBe(0);
  });

  it("bootstraps exactly one owner and stores only hashed session secrets", async () => {
    const owner = await bootstrapOwner();

    const current = expectSuccess(
      await workflow.read({
        evidence: { sessionToken: owner.sessionToken },
        query: { type: "session.current" },
      }),
    );
    expect(current).toMatchObject({
      kind: "current-session",
      user: { email: "owner@example.com", displayName: "Owner" },
      workspaces: [{ role: "owner", name: "Kiln Studio" }],
    });

    const repeated = await workflow.execute({
      evidence: {},
      command: {
        type: "bootstrap.register",
        bootstrapToken: BOOTSTRAP_TOKEN,
        displayName: "Second owner",
        email: "second@example.com",
        password: "correct horse battery staple",
        workspaceName: "Second Studio",
      },
    });
    expectFailure(repeated, 403, "REGISTRATION_CLOSED");

    const stored = await database.query<{
      token_hash: string;
      csrf_token_hash: string;
    }>("SELECT token_hash, csrf_token_hash FROM sessions");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]?.csrf_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]?.token_hash).not.toContain(owner.sessionToken);
    expect(stored[0]?.csrf_token_hash).not.toContain(owner.csrfToken);
  });

  it("fails closed on missing or incorrect operator bootstrap tokens before password work", async () => {
    const passwordHasher = new CountingPasswordHasher();
    const bootstrapCommand: AppCommand = {
      type: "bootstrap.register",
      bootstrapToken: BOOTSTRAP_TOKEN,
      displayName: "Owner",
      email: "owner@example.com",
      password: "correct horse battery staple",
      workspaceName: "Kiln Studio",
    };
    workflow = createAppWorkflow({
      database,
      passwordHasher,
      secretFactory: secrets,
      clock,
      renderQueue,
      resourceStore,
    });
    const missingConfigurationBaseline = passwordHasher.hashCalls;
    expectFailure(
      await workflow.execute({ evidence: {}, command: bootstrapCommand }),
      403,
      "REGISTRATION_CLOSED",
    );
    expect(passwordHasher.hashCalls).toBe(missingConfigurationBaseline);

    workflow = createAppWorkflow({
      database,
      bootstrapTokenHash: hashSecret(BOOTSTRAP_TOKEN),
      passwordHasher,
      secretFactory: secrets,
      clock,
      renderQueue,
      resourceStore,
    });
    const configuredBaseline = passwordHasher.hashCalls;
    expectFailure(
      await workflow.execute({
        evidence: {},
        command: {
          ...bootstrapCommand,
          bootstrapToken: "incorrect-bootstrap-token".padEnd(40, "x"),
        },
      }),
      403,
      "REGISTRATION_CLOSED",
    );
    expect(passwordHasher.hashCalls).toBe(configuredBaseline);

    expectSessionGrant(
      await workflow.execute({ evidence: {}, command: bootstrapCommand }),
    );
    expect(passwordHasher.hashCalls).toBe(configuredBaseline + 1);
  });

  it("rejects closed or invalid registration paths before memory-hard password work", async () => {
    const passwordHasher = new CountingPasswordHasher();
    workflow = createAppWorkflow({
      database,
      bootstrapTokenHash: hashSecret(BOOTSTRAP_TOKEN),
      passwordHasher,
      secretFactory: secrets,
      clock,
      renderQueue,
      resourceStore,
    });
    const baseline = passwordHasher.hashCalls;
    await bootstrapOwner();
    expect(passwordHasher.hashCalls).toBe(baseline + 1);

    expectFailure(
      await workflow.execute({
        evidence: {},
        command: {
          type: "bootstrap.register",
          bootstrapToken: BOOTSTRAP_TOKEN,
          displayName: "Another owner",
          email: "another@example.com",
          password: "correct horse battery staple",
          workspaceName: "Other Studio",
        },
      }),
      403,
      "REGISTRATION_CLOSED",
    );
    expectFailure(
      await workflow.execute({
        evidence: {},
        command: {
          type: "invitation.register",
          displayName: "Uninvited",
          email: "uninvited@example.com",
          password: "correct horse battery staple",
          invitationToken: "invalid-token".padEnd(48, "x"),
        },
      }),
      404,
      "INVITATION_INVALID_OR_EXPIRED",
    );
    expect(passwordHasher.hashCalls).toBe(baseline + 1);
  });

  it("lists workspace-qualified selectable resource metadata without storage authority", async () => {
    const owner = await bootstrapOwner();
    const workspaceId = requireWorkspaceId(owner);
    const common = {
      workspaceId,
      contentHash: "a".repeat(64),
      storageKey: "/internal/workspace/blob",
      byteSize: 4,
      origin: { kind: "user-upload" as const, sourceName: "Owner upload" },
      license: { status: "owned" as const },
      scan: {
        status: "clean" as const,
        scannerName: "private-scanner",
        scannerVersion: "1",
        scannedAt: NOW,
      },
      createdBy: owner.user.id,
      createdAt: NOW,
    };
    resourceStore.add({
      resource: {
        ...common,
        id: "image-selectable",
        kind: "raster-asset",
        mediaType: "image/png",
        width: 1_200,
        height: 800,
      },
      bytes: Uint8Array.of(1, 2, 3, 4),
    });
    resourceStore.add({
      resource: {
        ...common,
        id: "font-selectable",
        kind: "font",
        mediaType: "font/ttf",
        family: "Kiln Sans",
        weight: 700,
        style: "normal",
      },
      bytes: Uint8Array.of(1, 2, 3, 4),
    });

    const catalog = expectProjection(
      await workflow.read({
        evidence: { sessionToken: owner.sessionToken },
        query: { type: "workspace.resources", workspaceId },
      }),
      "workspace-resources",
    );

    expect(catalog).toMatchObject({
      workspaceId,
      truncated: false,
      resources: [
        { id: "image-selectable", width: 1_200, height: 800 },
        { id: "font-selectable", family: "Kiln Sans", weight: 700 },
      ],
    });
    const serialized = JSON.stringify(catalog);
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("internal/workspace");
    expect(serialized).not.toContain("scannerName");
    expect(serialized).not.toContain("private-scanner");
    expect(serialized).not.toContain("createdBy");
  });

  it("coordinates a deterministic campaign board around exact revisions and canonical locks", async () => {
    const owner = await bootstrapOwner();
    const workspaceId = requireWorkspaceId(owner);
    const campaign = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "campaign.create",
          workspaceId,
          name: "First firing",
          brief: "Launch one image-led product story across the campaign family.",
          campaignSeed: "first-firing-2026",
          familyId: "image-led-campaign",
        },
      }),
      "campaign-created",
    ).campaign;
    const direction = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "campaign.direction.create",
          workspaceId,
          campaignId: campaign.id,
          directionKey: "editorial-a",
          name: "Editorial A",
          locks: ["palette", "copy", "image"],
        },
      }),
      "campaign-direction-created",
    ).direction;
    expect(direction.locks).toEqual(["copy", "image", "palette"]);

    const seeds = deriveCampaignSeeds({
      campaignSeed: campaign.campaignSeed,
      familyId: campaign.familyId,
      directionKey: createCampaignDirectionKey(direction.directionKey),
      canvasKey: createCampaignCanvasKey("hero-landscape"),
      template: { id: "image-led-campaign", version: "1.0.0" },
      format: "linkedin-landscape",
      compositionVariantId: "focal-editorial",
    });
    const assetBytes = Uint8Array.from([1, 2, 3, 4]);
    const assetHash = sha256(assetBytes);
    for (const [id, sourceName] of [
      ["campaign-image-one", "Campaign image"],
      ["campaign-logo-one", "Campaign logo"],
    ] as const) {
      resourceStore.add({
        resource: {
          id,
          workspaceId,
          kind: "raster-asset",
          contentHash: assetHash,
          storageKey: `internal-${id}`,
          mediaType: "image/png",
          byteSize: assetBytes.byteLength,
          width: 1200,
          height: 800,
          origin: { kind: "user-upload", sourceName },
          license: { status: "owned" },
          scan: {
            status: "clean",
            scannerName: "test-scanner",
            scannerVersion: "1",
            scannedAt: NOW,
          },
          createdBy: owner.user.id,
          createdAt: NOW,
        },
        bytes: assetBytes,
      });
      await seedResourceVersion({
        id,
        workspaceId,
        actorUserId: owner.user.id,
        kind: "raster-asset",
        contentHash: assetHash,
        storageKey: `internal-${id}`,
        mediaType: "image/png",
        byteSize: assetBytes.byteLength,
        width: 1200,
        height: 800,
        originKind: "user-upload",
        originSourceName: sourceName,
        licenseStatus: "owned",
      });
    }
    const brand = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "brand.publish",
          workspaceId,
          name: "Campaign brand",
          snapshot: brandDraft("#0D3B9C"),
        },
      }),
      "brand-snapshot-published",
    );
    const revision = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "design.create",
          workspaceId,
          name: "Campaign hero",
          brandSnapshotId: brand.snapshotId,
          draft: imageLedCampaignDraft(seeds.canvasSeed),
        },
      }),
      "design-saved",
    );
    const attached = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "campaign.canvas.attach",
          workspaceId,
          campaignId: campaign.id,
          directionId: direction.id,
          canvasKey: "hero-landscape",
          designId: revision.designId,
          revisionId: revision.revisionId,
          compositionVariantId: "focal-editorial",
          ordinal: 0,
        },
      }),
      "campaign-canvas-attached",
    ).canvas;
    expect(attached).toMatchObject({
      revisionId: revision.revisionId,
      seedDerivationVersion: seeds.version,
      directionSeed: seeds.directionSeed,
      canvasSeed: seeds.canvasSeed,
    });

    const board = expectProjection(
      await workflow.read({
        evidence: { sessionToken: owner.sessionToken },
        query: {
          type: "campaign.board",
          workspaceId,
          campaignId: campaign.id,
        },
      }),
      "campaign-board",
    );
    expect(board).toMatchObject({
      campaign: { id: campaign.id, familyId: "image-led-campaign" },
      directions: [
        {
          id: direction.id,
          locks: ["copy", "image", "palette"],
          canvases: [
            {
              id: attached.id,
              designId: revision.designId,
              revisionId: revision.revisionId,
            },
          ],
        },
      ],
    });
    await expect(
      database.query(
        `UPDATE campaign_direction_locks
            SET lock_id = 'crop'
          WHERE workspace_id = $1
            AND direction_id = $2
            AND lock_id = 'copy'`,
        [workspaceId, direction.id],
      ),
    ).rejects.toHaveProperty("code", "55000");
    await expect(
      database.query(
        `UPDATE campaign_canvases
            SET revision_id = $3
          WHERE workspace_id = $1
            AND id = $2`,
        [workspaceId, attached.id, revision.revisionId],
      ),
    ).rejects.toHaveProperty("code", "55000");

    const viewer = await registerMember(
      owner,
      workspaceId,
      "campaign-viewer@example.com",
      "viewer",
    );
    expectProjection(
      await workflow.read({
        evidence: { sessionToken: viewer.sessionToken },
        query: {
          type: "campaign.board",
          workspaceId,
          campaignId: campaign.id,
        },
      }),
      "campaign-board",
    );
    expectFailure(
      await workflow.execute({
        evidence: ownerEvidence(viewer),
        command: {
          type: "campaign.create",
          workspaceId,
          name: "Viewer campaign",
          brief: "This mutation must be denied.",
          campaignSeed: "viewer-seed",
          familyId: "image-led-campaign",
        },
      }),
      403,
      "ROLE_FORBIDDEN",
    );
  });

  it("requires a session-bound mutation proof and revokes logout immediately", async () => {
    const owner = await bootstrapOwner();
    const withoutCsrf = await workflow.execute({
      evidence: { sessionToken: owner.sessionToken },
      command: { type: "workspace.create", name: "No proof" },
    });
    expectFailure(withoutCsrf, 403, "CSRF_REJECTED");

    expectSuccess(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: { type: "session.logout" },
      }),
    );
    const current = await workflow.read({
      evidence: { sessionToken: owner.sessionToken },
      query: { type: "session.current" },
    });
    expectFailure(current, 401, "AUTH_REQUIRED");
  });

  it("bounds workspace creation per account and across concurrent accounts", async () => {
    workflow = createAppWorkflow({
      database,
      bootstrapTokenHash: hashSecret(BOOTSTRAP_TOKEN),
      passwordHasher: new TestPasswordHasher(),
      secretFactory: secrets,
      clock,
      renderQueue,
      resourceStore,
      workspaceCreationLimits: {
        maximumWorkspacesPerInstallation: 2,
        maximumWorkspacesPerUser: 1,
      },
    });
    const owner = await bootstrapOwner();
    const firstWorkspaceId = requireWorkspaceId(owner);
    expectFailure(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: { type: "workspace.create", name: "Owner overflow" },
      }),
      409,
      "WORKSPACE_CAPACITY_REACHED",
    );

    const firstMember = await registerMember(
      owner,
      firstWorkspaceId,
      "workspace-creator-a@example.com",
      "editor",
    );
    const secondMember = await registerMember(
      owner,
      firstWorkspaceId,
      "workspace-creator-b@example.com",
      "viewer",
    );
    const concurrent = await Promise.all([
      workflow.execute({
        evidence: ownerEvidence(firstMember),
        command: { type: "workspace.create", name: "Bounded studio A" },
      }),
      workflow.execute({
        evidence: ownerEvidence(secondMember),
        command: { type: "workspace.create", name: "Bounded studio B" },
      }),
    ]);
    expect(concurrent.filter((result) => result.ok)).toHaveLength(1);
    const rejected = concurrent.find((result) => !result.ok);
    if (rejected === undefined) {
      throw new Error(
        "Expected one workspace creation to reach installation capacity.",
      );
    }
    expectFailure(rejected, 409, "WORKSPACE_CAPACITY_REACHED");
    await expect(
      database.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM workspaces",
      ),
    ).resolves.toEqual([{ count: 2 }]);
  });

  it("fails fast across the full synchronous resolve and render lifetime", async () => {
    const owner = await bootstrapOwner();
    const workspaceId = requireWorkspaceId(owner);
    const brand = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "brand.publish",
          workspaceId,
          name: "Capacity Brand",
          snapshot: brandDraft("#A4462A"),
        },
      }),
      "brand-snapshot-published",
    );
    const dependencies = {
      database,
      bootstrapTokenHash: hashSecret(BOOTSTRAP_TOKEN),
      passwordHasher: new TestPasswordHasher(),
      secretFactory: secrets,
      clock,
      renderQueue,
      resourceStore,
    } as const;
    workflow = createAppWorkflow({
      ...dependencies,
      renderAdmission: {
        run: () => Promise.resolve({ accepted: false as const }),
      },
    });
    expectFailure(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "design.preview",
          workspaceId,
          brandSnapshotId: brand.snapshotId,
          draft: quoteDraft("Do not wait in memory"),
        },
      }),
      429,
      "RENDER_CAPACITY_REACHED",
    );

    workflow = createAppWorkflow({
      ...dependencies,
      resourceResolver: {
        resolve: () =>
          Promise.reject(
            new RenderResourceResolutionError(
              "RESOURCE_LIMIT_EXCEEDED",
              "Aggregate metadata exceeds the renderer profile.",
            ),
          ),
      },
    });
    expectFailure(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "design.preview",
          workspaceId,
          brandSnapshotId: brand.snapshotId,
          draft: quoteDraft("Reject before blob reads"),
        },
      }),
      413,
      "RENDER_REJECTED",
    );
  });

  it("expires sessions from server-side time even when a bearer cookie remains", async () => {
    const owner = await bootstrapOwner();
    clock.advance(SESSION_DURATION_MS + 1);

    expectFailure(
      await workflow.read({
        evidence: { sessionToken: owner.sessionToken },
        query: { type: "session.current" },
      }),
      401,
      "AUTH_REQUIRED",
    );
  });

  it("persistently throttles repeated login failures without storing raw credentials", async () => {
    await bootstrapOwner();
    for (let attempt = 1; attempt < 5; attempt += 1) {
      expectFailure(
        await workflow.execute({
          evidence: {},
          command: {
            type: "session.login",
            email: "owner@example.com",
            password: `incorrect password ${attempt.toString()}`,
          },
        }),
        401,
        "INVALID_CREDENTIALS",
      );
    }
    expectFailure(
      await workflow.execute({
        evidence: {},
        command: {
          type: "session.login",
          email: "owner@example.com",
          password: "incorrect password 5",
        },
      }),
      429,
      "AUTH_THROTTLED",
    );
    expectFailure(
      await workflow.execute({
        evidence: {},
        command: {
          type: "session.login",
          email: "owner@example.com",
          password: "correct horse battery staple",
        },
      }),
      429,
      "AUTH_THROTTLED",
    );

    const throttle = await database.query<{
      credential_key_hash: string;
      failed_attempts: number;
    }>("SELECT credential_key_hash, failed_attempts FROM login_throttles");
    expect(throttle).toHaveLength(1);
    expect(throttle[0]?.credential_key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(throttle[0]?.credential_key_hash).not.toContain("owner@example.com");
    expect(throttle[0]?.failed_attempts).toBe(5);

    clock.advance(15 * 60 * 1000 + 1);
    expectSessionGrant(
      await workflow.execute({
        evidence: {},
        command: {
          type: "session.login",
          email: "owner@example.com",
          password: "correct horse battery staple",
        },
      }),
    );
    await expect(
      database.query("SELECT credential_key_hash FROM login_throttles"),
    ).resolves.toEqual([]);
  });

  it("partitions credential throttling by the trusted request source", async () => {
    await bootstrapOwner();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await workflow.execute({
        evidence: { authenticationPartition: "trusted-proxy:192.0.2.10" },
        command: {
          type: "session.login",
          email: "owner@example.com",
          password: `incorrect password ${attempt.toString()}`,
        },
      });
      expectFailure(
        result,
        attempt === 5 ? 429 : 401,
        attempt === 5 ? "AUTH_THROTTLED" : "INVALID_CREDENTIALS",
      );
    }

    expectSessionGrant(
      await workflow.execute({
        evidence: { authenticationPartition: "trusted-proxy:192.0.2.11" },
        command: {
          type: "session.login",
          email: "owner@example.com",
          password: "correct horse battery staple",
        },
      }),
    );
  });

  it("binds invitations to email, expiry state, one use, and the explicit role matrix", async () => {
    const owner = await bootstrapOwner();
    const workspaceId = owner.workspaces.at(0)?.id;
    if (workspaceId === undefined) throw new Error("Owner workspace missing.");

    const editorInvitation = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "invitation.create",
          workspaceId,
          email: "editor@example.com",
          role: "editor",
        },
      }),
      "invitation-created",
    );
    expectFailure(
      await workflow.execute({
        evidence: {},
        command: {
          type: "invitation.register",
          displayName: "Wrong recipient",
          email: "someone-else@example.com",
          password: "correct horse battery staple",
          invitationToken: editorInvitation.invitationToken,
        },
      }),
      404,
      "INVITATION_INVALID_OR_EXPIRED",
    );
    const editor = expectSessionGrant(
      await workflow.execute({
        evidence: {},
        command: {
          type: "invitation.register",
          displayName: "Editor",
          email: "EDITOR@example.com",
          password: "correct horse battery staple",
          invitationToken: editorInvitation.invitationToken,
        },
      }),
    );
    expect(editor.workspaces).toContainEqual(
      expect.objectContaining({ id: workspaceId, role: "editor" }),
    );

    const replay = await workflow.execute({
      evidence: {},
      command: {
        type: "invitation.register",
        displayName: "Replay",
        email: "editor@example.com",
        password: "correct horse battery staple",
        invitationToken: editorInvitation.invitationToken,
      },
    });
    expectFailure(replay, 404, "INVITATION_INVALID_OR_EXPIRED");

    const editorInviteAttempt = await workflow.execute({
      evidence: ownerEvidence(editor),
      command: {
        type: "invitation.create",
        workspaceId,
        email: "viewer@example.com",
        role: "viewer",
      },
    });
    expectFailure(editorInviteAttempt, 403, "ROLE_FORBIDDEN");

    const expiredInvitation = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "invitation.create",
          workspaceId,
          email: "late@example.com",
          role: "viewer",
        },
      }),
      "invitation-created",
    );
    clock.advance(INVITATION_DURATION_MS + 1);
    expectFailure(
      await workflow.execute({
        evidence: {},
        command: {
          type: "invitation.register",
          displayName: "Late collaborator",
          email: "late@example.com",
          password: "correct horse battery staple",
          invitationToken: expiredInvitation.invitationToken,
        },
      }),
      404,
      "INVITATION_INVALID_OR_EXPIRED",
    );
  });

  it("revokes pending grants and reauthorizes the invitation issuer at acceptance", async () => {
    const owner = await bootstrapOwner();
    const workspaceId = requireWorkspaceId(owner);
    const admin = await registerMember(
      owner,
      workspaceId,
      "inviting-admin@example.com",
      "admin",
    );
    const demotionInvitation = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(admin),
        command: {
          type: "invitation.create",
          workspaceId,
          email: "demotion-alias@example.com",
          role: "admin",
        },
      }),
      "invitation-created",
    );

    expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "workspace.member.role.change",
          workspaceId,
          userId: admin.user.id,
          role: "editor",
        },
      }),
      "workspace-member-role-changed",
    );
    await expect(
      database.query<{ revoked_at: Date | string | null }>(
        `SELECT revoked_at
           FROM workspace_invitations
          WHERE id = $1`,
        [demotionInvitation.invitationId],
      ),
    ).resolves.toEqual([{ revoked_at: NOW }]);
    expectFailure(
      await workflow.execute({
        evidence: {},
        command: {
          type: "invitation.register",
          displayName: "Demotion alias",
          email: "demotion-alias@example.com",
          password: "correct horse battery staple",
          invitationToken: demotionInvitation.invitationToken,
        },
      }),
      404,
      "INVITATION_INVALID_OR_EXPIRED",
    );

    expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "workspace.member.role.change",
          workspaceId,
          userId: admin.user.id,
          role: "admin",
        },
      }),
      "workspace-member-role-changed",
    );
    const staleInvitation = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(admin),
        command: {
          type: "invitation.create",
          workspaceId,
          email: "stale-alias@example.com",
          role: "editor",
        },
      }),
      "invitation-created",
    );
    await database.query(
      `UPDATE workspace_memberships
          SET role = 'editor'
        WHERE workspace_id = $1
          AND user_id = $2`,
      [workspaceId, admin.user.id],
    );
    expectFailure(
      await workflow.execute({
        evidence: {},
        command: {
          type: "invitation.register",
          displayName: "Stale alias",
          email: "stale-alias@example.com",
          password: "correct horse battery staple",
          invitationToken: staleInvitation.invitationToken,
        },
      }),
      404,
      "INVITATION_INVALID_OR_EXPIRED",
    );

    expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "workspace.member.role.change",
          workspaceId,
          userId: admin.user.id,
          role: "admin",
        },
      }),
      "workspace-member-role-changed",
    );
    const revocationInvitation = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(admin),
        command: {
          type: "invitation.create",
          workspaceId,
          email: "revocation-alias@example.com",
          role: "viewer",
        },
      }),
      "invitation-created",
    );
    expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "workspace.member.revoke",
          workspaceId,
          userId: admin.user.id,
        },
      }),
      "workspace-member-revoked",
    );
    await expect(
      database.query<{ revoked_at: Date | string | null }>(
        `SELECT revoked_at
           FROM workspace_invitations
          WHERE id = $1`,
        [revocationInvitation.invitationId],
      ),
    ).resolves.toEqual([{ revoked_at: NOW }]);
  });

  it("keeps workspace membership administration owner-only for every role", async () => {
    const owner = await bootstrapOwner();
    const workspaceId = requireWorkspaceId(owner);
    const admin = await registerMember(
      owner,
      workspaceId,
      "admin@example.com",
      "admin",
    );
    const editor = await registerMember(
      owner,
      workspaceId,
      "editor@example.com",
      "editor",
    );
    const viewer = await registerMember(
      owner,
      workspaceId,
      "viewer@example.com",
      "viewer",
    );

    const members = expectProjection(
      await workflow.read({
        evidence: { sessionToken: owner.sessionToken },
        query: { type: "workspace.members", workspaceId },
      }),
      "workspace-members",
    );
    expect(members.members.map((member) => member.role)).toEqual([
      "owner",
      "admin",
      "editor",
      "viewer",
    ]);

    for (const nonOwner of [admin, editor, viewer]) {
      expectFailure(
        await workflow.read({
          evidence: { sessionToken: nonOwner.sessionToken },
          query: { type: "workspace.members", workspaceId },
        }),
        403,
        "ROLE_FORBIDDEN",
      );
      expectFailure(
        await workflow.execute({
          evidence: ownerEvidence(nonOwner),
          command: {
            type: "workspace.member.role.change",
            workspaceId,
            userId: viewer.user.id,
            role: "editor",
          },
        }),
        403,
        "ROLE_FORBIDDEN",
      );
      expectFailure(
        await workflow.execute({
          evidence: ownerEvidence(nonOwner),
          command: {
            type: "workspace.member.revoke",
            workspaceId,
            userId: viewer.user.id,
          },
        }),
        403,
        "ROLE_FORBIDDEN",
      );
    }

    for (const role of ["admin", "editor", "viewer"] as const) {
      const changed = expectReceipt(
        await workflow.execute({
          evidence: ownerEvidence(owner),
          command: {
            type: "workspace.member.role.change",
            workspaceId,
            userId: editor.user.id,
            role,
          },
        }),
        "workspace-member-role-changed",
      );
      expect(changed.member).toMatchObject({
        user: { id: editor.user.id },
        role,
      });
    }

    expectFailure(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "workspace.member.role.change",
          workspaceId,
          userId: editor.user.id,
          role: "owner",
        } as unknown as AppCommand,
      }),
      422,
      "INVALID_INPUT",
    );
    expectFailure(
      await workflow.authorizeWorkspace({
        evidence: ownerEvidence(editor),
        workspaceId,
        action: "create_design",
        requireMutationProof: true,
      }),
      403,
      "ROLE_FORBIDDEN",
    );
  });

  it("does not disclose foreign workspaces or foreign membership targets", async () => {
    const firstOwner = await bootstrapOwner();
    const firstWorkspaceId = requireWorkspaceId(firstOwner);
    const collaborator = await registerMember(
      firstOwner,
      firstWorkspaceId,
      "collaborator@example.com",
      "admin",
    );
    const secondWorkspace = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(collaborator),
        command: { type: "workspace.create", name: "Second Studio" },
      }),
      "workspace-created",
    ).workspace;
    const secondOnly = await registerMember(
      collaborator,
      secondWorkspace.id,
      "second-only@example.com",
      "viewer",
    );

    expectFailure(
      await workflow.read({
        evidence: { sessionToken: firstOwner.sessionToken },
        query: {
          type: "workspace.members",
          workspaceId: secondWorkspace.id,
        },
      }),
      404,
      "RESOURCE_NOT_FOUND",
    );
    for (const command of [
      {
        type: "workspace.member.role.change",
        workspaceId: secondWorkspace.id,
        userId: collaborator.user.id,
        role: "viewer",
      },
      {
        type: "workspace.member.revoke",
        workspaceId: secondWorkspace.id,
        userId: collaborator.user.id,
      },
      {
        type: "workspace.member.role.change",
        workspaceId: firstWorkspaceId,
        userId: secondOnly.user.id,
        role: "viewer",
      },
      {
        type: "workspace.member.revoke",
        workspaceId: firstWorkspaceId,
        userId: secondOnly.user.id,
      },
    ] as const) {
      expectFailure(
        await workflow.execute({
          evidence: ownerEvidence(firstOwner),
          command,
        }),
        404,
        "RESOURCE_NOT_FOUND",
      );
    }
  });

  it("preserves the final owner and immediately invalidates every revoked member session", async () => {
    const owner = await bootstrapOwner();
    const workspaceId = requireWorkspaceId(owner);
    expectFailure(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "workspace.member.role.change",
          workspaceId,
          userId: owner.user.id,
          role: "admin",
        },
      }),
      409,
      "FINAL_WORKSPACE_OWNER",
    );
    expectFailure(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "workspace.member.revoke",
          workspaceId,
          userId: owner.user.id,
        },
      }),
      409,
      "FINAL_WORKSPACE_OWNER",
    );

    const editor = await registerMember(
      owner,
      workspaceId,
      "revoked-editor@example.com",
      "editor",
    );
    const secondEditorSession = expectSessionGrant(
      await workflow.execute({
        evidence: {},
        command: {
          type: "session.login",
          email: editor.user.email,
          password: "correct horse battery staple",
        },
      }),
    );
    const revoked = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "workspace.member.revoke",
          workspaceId,
          userId: editor.user.id,
        },
      }),
      "workspace-member-revoked",
    );
    expect(revoked.currentSessionRevoked).toBe(false);
    for (const sessionToken of [
      editor.sessionToken,
      secondEditorSession.sessionToken,
    ]) {
      expectFailure(
        await workflow.read({
          evidence: { sessionToken },
          query: { type: "session.current" },
        }),
        401,
        "AUTH_REQUIRED",
      );
    }
    expectFailure(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "workspace.member.revoke",
          workspaceId,
          userId: editor.user.id,
        },
      }),
      404,
      "RESOURCE_NOT_FOUND",
    );

    const stored = await database.query<{
      role: string;
      revoked_at: Date | string | null;
      revoked_by: string | null;
    }>(
      `SELECT role, revoked_at, revoked_by
         FROM workspace_memberships
        WHERE workspace_id = $1
          AND user_id = $2`,
      [workspaceId, editor.user.id],
    );
    expect(stored).toEqual([
      {
        role: "editor",
        revoked_at: NOW,
        revoked_by: owner.user.id,
      },
    ]);
    const members = expectProjection(
      await workflow.read({
        evidence: { sessionToken: owner.sessionToken },
        query: { type: "workspace.members", workspaceId },
      }),
      "workspace-members",
    );
    expect(members.members.map((member) => member.user.id)).not.toContain(
      editor.user.id,
    );
  });

  it("allows self-revocation only when another active owner exists", async () => {
    const owner = await bootstrapOwner();
    const workspaceId = requireWorkspaceId(owner);
    const successor = await registerMember(
      owner,
      workspaceId,
      "successor@example.com",
      "admin",
    );
    await seedPreexistingOwner(workspaceId, successor.user.id);

    const revoked = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "workspace.member.revoke",
          workspaceId,
          userId: owner.user.id,
        },
      }),
      "workspace-member-revoked",
    );
    expect(revoked.currentSessionRevoked).toBe(true);
    expectFailure(
      await workflow.read({
        evidence: { sessionToken: owner.sessionToken },
        query: { type: "session.current" },
      }),
      401,
      "AUTH_REQUIRED",
    );

    const members = expectProjection(
      await workflow.read({
        evidence: { sessionToken: successor.sessionToken },
        query: { type: "workspace.members", workspaceId },
      }),
      "workspace-members",
    );
    expect(members.members).toHaveLength(1);
    expect(members.members[0]).toMatchObject({
      user: { id: successor.user.id },
      role: "owner",
    });
  });

  it("serializes concurrent owner exits so one active owner always remains", async () => {
    const firstOwner = await bootstrapOwner();
    const workspaceId = requireWorkspaceId(firstOwner);
    const secondOwner = await registerMember(
      firstOwner,
      workspaceId,
      "concurrent-owner@example.com",
      "admin",
    );
    await seedPreexistingOwner(workspaceId, secondOwner.user.id);

    const results = await Promise.all([
      workflow.execute({
        evidence: ownerEvidence(firstOwner),
        command: {
          type: "workspace.member.revoke",
          workspaceId,
          userId: firstOwner.user.id,
        },
      }),
      workflow.execute({
        evidence: ownerEvidence(secondOwner),
        command: {
          type: "workspace.member.revoke",
          workspaceId,
          userId: secondOwner.user.id,
        },
      }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const failures = results.filter((result) => !result.ok);
    expect(failures).toHaveLength(1);
    const failedExit = failures[0];
    expect(failedExit.status).toBe(409);
    expect(failedExit.error.code).toBe("FINAL_WORKSPACE_OWNER");
    await expect(
      database.query<{ owner_count: number }>(
        `SELECT count(*)::integer AS owner_count
           FROM workspace_memberships
          WHERE workspace_id = $1
            AND role = 'owner'
            AND revoked_at IS NULL`,
        [workspaceId],
      ),
    ).resolves.toEqual([{ owner_count: 1 }]);
  });

  it("keeps immutable snapshots and append-only revisions exact across reopen and revise", async () => {
    const owner = await bootstrapOwner();
    const workspaceId = owner.workspaces.at(0)?.id;
    if (workspaceId === undefined) throw new Error("Owner workspace missing.");

    const firstBrand = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "brand.publish",
          workspaceId,
          name: "Kiln Brand",
          snapshot: brandDraft("#A4462A"),
        },
      }),
      "brand-snapshot-published",
    );
    const firstDesign = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "design.create",
          workspaceId,
          name: "Launch proof",
          brandSnapshotId: firstBrand.snapshotId,
          draft: quoteDraft("First immutable copy"),
        },
      }),
      "design-saved",
    );

    const secondBrand = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "brand.publish",
          workspaceId,
          brandKitId: firstBrand.brandKitId,
          name: "A browser cannot rename this trusted kit",
          snapshot: brandDraft("#47665C"),
        },
      }),
      "brand-snapshot-published",
    );
    expect(secondBrand.version).toBe("1.0.1");
    expect(secondBrand.snapshot.name).toBe("Kiln Brand");

    const revised = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "design.revise",
          workspaceId,
          designId: firstDesign.designId,
          baseRevisionId: firstDesign.revisionId,
          brandSnapshotId: secondBrand.snapshotId,
          draft: quoteDraft("Second immutable copy"),
          changeNote: "Adopt the second snapshot",
        },
      }),
      "design-saved",
    );
    expect(revised.revisionNumber).toBe(2);

    const reopenedFirst = expectProjection(
      await workflow.read({
        evidence: { sessionToken: owner.sessionToken },
        query: {
          type: "design.revision",
          workspaceId,
          designId: firstDesign.designId,
          revision: { revisionId: firstDesign.revisionId },
        },
      }),
      "design-revision",
    );
    const reopenedHead = expectProjection(
      await workflow.read({
        evidence: { sessionToken: owner.sessionToken },
        query: {
          type: "design.revision",
          workspaceId,
          designId: firstDesign.designId,
          revision: "head",
        },
      }),
      "design-revision",
    );
    expect(reopenedFirst.document.brand).toEqual(firstBrand.snapshot);
    expect(reopenedFirst.document.layers).toContainEqual(
      expect.objectContaining({ text: "First immutable copy" }),
    );
    expect(reopenedHead.revisionId).toBe(revised.revisionId);
    expect(reopenedHead.document.brand).toEqual(secondBrand.snapshot);

    const staleRevision = await workflow.execute({
      evidence: ownerEvidence(owner),
      command: {
        type: "design.revise",
        workspaceId,
        designId: firstDesign.designId,
        baseRevisionId: firstDesign.revisionId,
        brandSnapshotId: secondBrand.snapshotId,
        draft: quoteDraft("Stale edit"),
      },
    });
    expectFailure(staleRevision, 409, "REVISION_CONFLICT");
  });

  it("pins only same-workspace admitted asset and font versions into saved documents", async () => {
    const owner = await bootstrapOwner();
    const workspaceId = owner.workspaces.at(0)?.id;
    if (workspaceId === undefined) throw new Error("Owner workspace missing.");
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const digest = sha256(bytes);
    resourceStore.add({
      resource: {
        id: "asset-one",
        workspaceId,
        kind: "raster-asset",
        contentHash: digest,
        storageKey: "internal-asset-key",
        mediaType: "image/png",
        byteSize: bytes.byteLength,
        width: 1,
        height: 1,
        origin: { kind: "user-upload", sourceName: "Owner" },
        license: { status: "owned" },
        scan: {
          status: "clean",
          scannerName: "test-scanner",
          scannerVersion: "1",
          scannedAt: NOW,
        },
        createdBy: owner.user.id,
        createdAt: NOW,
      },
      bytes,
    });
    await seedResourceVersion({
      id: "asset-one",
      workspaceId,
      actorUserId: owner.user.id,
      kind: "raster-asset",
      contentHash: digest,
      storageKey: "internal-asset-key",
      mediaType: "image/png",
      byteSize: bytes.byteLength,
      width: 1,
      height: 1,
      originKind: "user-upload",
      originSourceName: "Owner",
      licenseStatus: "owned",
    });
    resourceStore.add({
      resource: {
        id: "font-one",
        workspaceId,
        kind: "font",
        contentHash: digest,
        storageKey: "internal-font-key",
        mediaType: "font/ttf",
        byteSize: bytes.byteLength,
        family: "Kiln Sans",
        weight: 700,
        style: "normal",
        origin: { kind: "licensed-library", sourceName: "Kiln Foundry" },
        license: { status: "licensed", identifier: "license-one" },
        scan: {
          status: "clean",
          scannerName: "test-scanner",
          scannerVersion: "1",
          scannedAt: NOW,
        },
        createdBy: owner.user.id,
        createdAt: NOW,
      },
      bytes,
    });
    await seedResourceVersion({
      id: "font-one",
      workspaceId,
      actorUserId: owner.user.id,
      kind: "font",
      contentHash: digest,
      storageKey: "internal-font-key",
      mediaType: "font/ttf",
      byteSize: bytes.byteLength,
      family: "Kiln Sans",
      weight: 700,
      style: "normal",
      originKind: "licensed-library",
      originSourceName: "Kiln Foundry",
      licenseStatus: "licensed",
      licenseIdentifier: "license-one",
    });
    resourceStore.add({
      resource: {
        id: "font-two",
        workspaceId,
        kind: "font",
        contentHash: digest,
        storageKey: "internal-font-key",
        mediaType: "font/ttf",
        byteSize: bytes.byteLength,
        family: "Kiln Sans",
        weight: 700,
        style: "normal",
        origin: {
          kind: "licensed-library",
          sourceName: "Corrected Foundry",
        },
        license: {
          status: "licensed",
          identifier: "license-corrected",
        },
        scan: {
          status: "clean",
          scannerName: "test-scanner",
          scannerVersion: "1",
          scannedAt: NOW,
        },
        createdBy: owner.user.id,
        createdAt: NOW,
      },
      bytes,
    });
    await seedResourceVersion({
      id: "font-two",
      workspaceId,
      actorUserId: owner.user.id,
      kind: "font",
      contentHash: digest,
      storageKey: "internal-font-key",
      mediaType: "font/ttf",
      byteSize: bytes.byteLength,
      family: "Kiln Sans",
      weight: 700,
      style: "normal",
      originKind: "licensed-library",
      originSourceName: "Corrected Foundry",
      licenseStatus: "licensed",
      licenseIdentifier: "license-corrected",
    });
    const brand = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "brand.publish",
          workspaceId,
          name: "Resource Brand",
          snapshot: brandDraft("#A4462A"),
        },
      }),
      "brand-snapshot-published",
    );
    const draft: ManualDraft = {
      ...quoteDraft("Pinned resource document"),
      resources: {
        assetIds: ["asset-one"],
        fontIds: ["font-two"],
      },
    };
    const saved = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "design.create",
          workspaceId,
          name: "Resource proof",
          brandSnapshotId: brand.snapshotId,
          draft,
        },
      }),
      "design-saved",
    );

    expect(saved.document.assets).toEqual([
      expect.objectContaining({ id: "asset-one", sha256: digest }),
    ]);
    expect(saved.document.fonts).toContainEqual(
      expect.objectContaining({
        family: "Kiln Sans",
        weight: 700,
        sha256: digest,
      }),
    );
    expect(saved.document.metadata).toMatchObject({
      resourceVersions: {
        assets: [
          {
            id: "asset-one",
            sha256: digest,
            origin: { kind: "user-upload", sourceName: "Owner" },
            license: { status: "owned" },
          },
        ],
        fonts: [
          {
            id: "font-two",
            family: "Kiln Sans",
            weight: 700,
            sha256: digest,
            origin: {
              kind: "licensed-library",
              sourceName: "Corrected Foundry",
            },
            license: {
              status: "licensed",
              identifier: "license-corrected",
            },
          },
        ],
      },
    });
    await expect(
      database.query<{
        ordinal: number;
        resource_id: string;
        resource_kind: string;
      }>(
        `SELECT resource_id, resource_kind, ordinal
           FROM design_revision_resources
          WHERE workspace_id = $1
            AND revision_id = $2
          ORDER BY resource_kind, ordinal`,
        [workspaceId, saved.revisionId],
      ),
    ).resolves.toEqual([
      { resource_id: "font-two", resource_kind: "font", ordinal: 0 },
      {
        resource_id: "asset-one",
        resource_kind: "raster-asset",
        ordinal: 0,
      },
    ]);
    const reopened = expectProjection(
      await workflow.read({
        evidence: { sessionToken: owner.sessionToken },
        query: {
          type: "design.revision",
          workspaceId,
          designId: saved.designId,
          revision: { revisionId: saved.revisionId },
        },
      }),
      "design-revision",
    );
    expect(reopened.document.metadata).toEqual(saved.document.metadata);
    await expect(
      database.query(
        `UPDATE design_revision_resources
            SET resource_id = $3
          WHERE workspace_id = $1
            AND revision_id = $2
            AND resource_kind = 'font'`,
        [workspaceId, saved.revisionId, "font-one"],
      ),
    ).rejects.toHaveProperty("code", "55000");

    const secondWorkspace = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: { type: "workspace.create", name: "Other Studio" },
      }),
      "workspace-created",
    ).workspace;
    const secondBrand = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "brand.publish",
          workspaceId: secondWorkspace.id,
          name: "Other Brand",
          snapshot: brandDraft("#47665C"),
        },
      }),
      "brand-snapshot-published",
    );
    expectFailure(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "design.create",
          workspaceId: secondWorkspace.id,
          name: "Foreign resource",
          brandSnapshotId: secondBrand.snapshotId,
          draft,
        },
      }),
      404,
      "RESOURCE_NOT_FOUND",
    );
  });

  it("authorizes every resource through its workspace and renders the exact stored revision", async () => {
    const owner = await bootstrapOwner();
    const firstWorkspaceId = owner.workspaces.at(0)?.id;
    if (firstWorkspaceId === undefined) throw new Error("Owner workspace missing.");
    const secondWorkspace = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: { type: "workspace.create", name: "Separate Studio" },
      }),
      "workspace-created",
    ).workspace;
    const viewerInvitation = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "invitation.create",
          workspaceId: secondWorkspace.id,
          email: "viewer@example.com",
          role: "viewer",
        },
      }),
      "invitation-created",
    );
    const viewer = expectSessionGrant(
      await workflow.execute({
        evidence: {},
        command: {
          type: "invitation.register",
          displayName: "Viewer",
          email: "viewer@example.com",
          password: "correct horse battery staple",
          invitationToken: viewerInvitation.invitationToken,
        },
      }),
    );

    const brand = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "brand.publish",
          workspaceId: firstWorkspaceId,
          name: "Private Brand",
          snapshot: brandDraft("#A4462A"),
        },
      }),
      "brand-snapshot-published",
    );
    const design = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "design.create",
          workspaceId: firstWorkspaceId,
          name: "Private Design",
          brandSnapshotId: brand.snapshotId,
          draft: quoteDraft("Stored render input"),
        },
      }),
      "design-saved",
    );

    const foreignRead = await workflow.read({
      evidence: { sessionToken: viewer.sessionToken },
      query: {
        type: "design.revision",
        workspaceId: firstWorkspaceId,
        designId: design.designId,
        revision: "head",
      },
    });
    expectFailure(foreignRead, 404, "RESOURCE_NOT_FOUND");
    const viewerCreate = await workflow.execute({
      evidence: ownerEvidence(viewer),
      command: {
        type: "design.create",
        workspaceId: secondWorkspace.id,
        name: "Viewer write",
        brandSnapshotId: brand.snapshotId,
        draft: quoteDraft("Denied"),
      },
    });
    expectFailure(viewerCreate, 403, "ROLE_FORBIDDEN");
    expectFailure(
      await workflow.authorizeWorkspace({
        evidence: ownerEvidence(viewer),
        workspaceId: secondWorkspace.id,
        action: "ingest_resources",
        requireMutationProof: true,
      }),
      403,
      "ROLE_FORBIDDEN",
    );
    expectFailure(
      await workflow.authorizeWorkspace({
        evidence: ownerEvidence(viewer),
        workspaceId: firstWorkspaceId,
        action: "read_workspace",
        requireMutationProof: true,
      }),
      404,
      "RESOURCE_NOT_FOUND",
    );
    expectFailure(
      await workflow.authorizeWorkspace({
        evidence: { sessionToken: owner.sessionToken },
        workspaceId: firstWorkspaceId,
        action: "ingest_resources",
        requireMutationProof: true,
      }),
      403,
      "CSRF_REJECTED",
    );
    expectSuccess(
      await workflow.authorizeWorkspace({
        evidence: ownerEvidence(owner),
        workspaceId: firstWorkspaceId,
        action: "ingest_resources",
        requireMutationProof: true,
      }),
    );

    const rendered = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "revision.render",
          workspaceId: firstWorkspaceId,
          designId: design.designId,
          revisionId: design.revisionId,
        },
      }),
      "revision-rendered",
    );
    expect(rendered.document).toEqual(design.document);
    expect(rendered.outputs.map((output) => output.format)).toEqual(["svg", "png"]);
    expect(rendered.outputs.every((output) => output.byteSize > 0)).toBe(true);

    const queued = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "revision.export.request",
          workspaceId: firstWorkspaceId,
          designId: design.designId,
          revisionId: design.revisionId,
          idempotencyKey: "export-request-one",
        },
      }),
      "render-job-queued",
    );
    expect(queued).toMatchObject({ state: "queued", created: true });
    const retried = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "revision.export.request",
          workspaceId: firstWorkspaceId,
          designId: design.designId,
          revisionId: design.revisionId,
          idempotencyKey: "export-request-one",
        },
      }),
      "render-job-queued",
    );
    expect(retried).toMatchObject({ jobId: queued.jobId, created: false });
    const job = expectProjection(
      await workflow.read({
        evidence: { sessionToken: owner.sessionToken },
        query: {
          type: "render.job",
          workspaceId: firstWorkspaceId,
          jobId: queued.jobId,
        },
      }),
      "render-job",
    );
    expect(job).toMatchObject({
      designId: design.designId,
      revisionId: design.revisionId,
      state: "queued",
      attemptCount: 0,
      outputs: [],
    });
    vi.spyOn(renderQueue, "enqueue").mockRejectedValueOnce(
      new RenderQueueCapacityError(100),
    );
    expectFailure(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "revision.export.request",
          workspaceId: firstWorkspaceId,
          designId: design.designId,
          revisionId: design.revisionId,
          idempotencyKey: "export-request-over-capacity",
        },
      }),
      429,
      "RENDER_CAPACITY_REACHED",
    );
    expectFailure(
      await workflow.read({
        evidence: { sessionToken: viewer.sessionToken },
        query: {
          type: "render.job",
          workspaceId: firstWorkspaceId,
          jobId: queued.jobId,
        },
      }),
      404,
      "RESOURCE_NOT_FOUND",
    );
  });

  it("lists completed durable exports for an exact revision", async () => {
    const owner = await bootstrapOwner();
    const workspaceId = requireWorkspaceId(owner);
    const brand = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "brand.publish",
          workspaceId,
          name: "Export Brand",
          snapshot: brandDraft("#A4462A"),
        },
      }),
      "brand-snapshot-published",
    );
    const design = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "design.create",
          workspaceId,
          name: "Exported Design",
          brandSnapshotId: brand.snapshotId,
          draft: quoteDraft("Completed export"),
        },
      }),
      "design-saved",
    );
    const queued = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "revision.export.request",
          workspaceId,
          designId: design.designId,
          revisionId: design.revisionId,
          idempotencyKey: "completed-export-request",
        },
      }),
      "render-job-queued",
    );
    const claim = await renderQueue.claim({
      workerId: "worker-a",
      now: NOW,
    });
    if (claim === undefined)
      throw new Error("Expected the queued export to be claimed.");
    await renderQueue.complete(
      claim,
      completedRenderOutputs(),
      new Date(NOW.getTime() + 1),
    );

    const completed = expectProjection(
      await workflow.read({
        evidence: { sessionToken: owner.sessionToken },
        query: {
          type: "render.jobs.completed",
          workspaceId,
          revisionId: design.revisionId,
        },
      }),
      "completed-render-jobs",
    );

    expect(completed.jobs).toMatchObject([
      {
        jobId: queued.jobId,
        designId: design.designId,
        revisionId: design.revisionId,
        state: "completed",
      },
    ]);
  });

  it("binds review transitions, comments, and approval evidence to the exact head revision", async () => {
    const owner = await bootstrapOwner();
    const workspaceId = requireWorkspaceId(owner);
    const brand = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "brand.publish",
          workspaceId,
          name: "Review Brand",
          snapshot: brandDraft("#A4462A"),
        },
      }),
      "brand-snapshot-published",
    );
    const design = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "design.create",
          workspaceId,
          name: "Reviewed Design",
          brandSnapshotId: brand.snapshotId,
          draft: quoteDraft("Exact review proof"),
        },
      }),
      "design-saved",
    );
    const submitted = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "revision.review.submit",
          workspaceId,
          designId: design.designId,
          revisionId: design.revisionId,
        },
      }),
      "revision-review-submitted",
    ).review;
    expect(submitted).toMatchObject({
      state: "in-review",
      transitions: [{ toState: "in-review" }],
    });

    const viewer = await registerMember(
      owner,
      workspaceId,
      "review-viewer@example.com",
      "viewer",
    );
    const comment = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(viewer),
        command: {
          type: "revision.review.comment",
          workspaceId,
          reviewId: submitted.id,
          body: "Move the proof point closer to the visual center.",
          anchor: { x: 0.45, y: 0.6 },
        },
      }),
      "revision-review-commented",
    ).comment;
    expect(comment).toMatchObject({
      anchor: { x: 0.45, y: 0.6 },
      createdBy: { id: viewer.user.id },
    });

    expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "revision.review.request-changes",
          workspaceId,
          designId: design.designId,
          revisionId: design.revisionId,
          reason: "Address the anchored proof note.",
        },
      }),
      "revision-changes-requested",
    );
    const resubmitted = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "revision.review.submit",
          workspaceId,
          designId: design.designId,
          revisionId: design.revisionId,
        },
      }),
      "revision-review-submitted",
    ).review;
    expect(resubmitted.transitions.map((transition) => transition.toState)).toEqual([
      "in-review",
      "changes-requested",
      "in-review",
    ]);

    const queued = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "revision.export.request",
          workspaceId,
          designId: design.designId,
          revisionId: design.revisionId,
          idempotencyKey: "review-approval-proof",
        },
      }),
      "render-job-queued",
    );
    const claim = await renderQueue.claim({ workerId: "review-worker", now: NOW });
    if (claim === undefined) throw new Error("Expected approval proof render claim.");
    await renderQueue.complete(
      claim,
      completedRenderOutputs(),
      new Date(NOW.getTime() + 1),
    );
    const editor = await registerMember(
      owner,
      workspaceId,
      "review-editor@example.com",
      "editor",
    );
    expectFailure(
      await workflow.execute({
        evidence: ownerEvidence(editor),
        command: {
          type: "revision.review.approve",
          workspaceId,
          designId: design.designId,
          revisionId: design.revisionId,
          renderJobId: queued.jobId,
        },
      }),
      403,
      "ROLE_FORBIDDEN",
    );
    const approved = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "revision.review.approve",
          workspaceId,
          designId: design.designId,
          revisionId: design.revisionId,
          renderJobId: queued.jobId,
        },
      }),
      "revision-approved",
    );
    expect(approved.review).toMatchObject({
      state: "approved",
      comments: [{ id: comment.id }],
      approval: {
        renderJobId: queued.jobId,
        revisionCanonicalHash: design.documentHash,
        resourcePins: [],
        outputEvidence: [
          {
            format: "png",
            artifactSha256: "c".repeat(64),
            manifestSha256: "d".repeat(64),
            fingerprint: "png-fingerprint",
          },
          {
            format: "svg",
            artifactSha256: "a".repeat(64),
            manifestSha256: "b".repeat(64),
            fingerprint: "svg-fingerprint",
          },
        ],
      },
    });
    expectProjection(
      await workflow.read({
        evidence: { sessionToken: viewer.sessionToken },
        query: {
          type: "revision.review",
          workspaceId,
          designId: design.designId,
          revisionId: design.revisionId,
        },
      }),
      "revision-review",
    );
    await expect(
      database.query(
        `UPDATE revision_approval_receipts
            SET revision_canonical_hash = $3
          WHERE workspace_id = $1
            AND review_id = $2`,
        [workspaceId, submitted.id, "0".repeat(64)],
      ),
    ).rejects.toHaveProperty("code", "55000");

    const revised = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "design.revise",
          workspaceId,
          designId: design.designId,
          baseRevisionId: design.revisionId,
          brandSnapshotId: brand.snapshotId,
          draft: quoteDraft("New head revision"),
        },
      }),
      "design-saved",
    );
    expect(revised.revisionId).not.toBe(design.revisionId);
    expectFailure(
      await workflow.execute({
        evidence: ownerEvidence(owner),
        command: {
          type: "revision.review.request-changes",
          workspaceId,
          designId: design.designId,
          revisionId: design.revisionId,
          reason: "This review is now stale.",
        },
      }),
      409,
      "REVISION_CONFLICT",
    );
  });

  async function bootstrapOwner(): Promise<SessionGrant> {
    return expectSessionGrant(
      await workflow.execute({
        evidence: {},
        command: {
          type: "bootstrap.register",
          bootstrapToken: BOOTSTRAP_TOKEN,
          displayName: "Owner",
          email: "Owner@Example.com",
          password: "correct horse battery staple",
          workspaceName: "Kiln Studio",
        },
      }),
    );
  }

  async function seedResourceVersion(input: {
    id: string;
    workspaceId: string;
    actorUserId: string;
    kind: "raster-asset" | "font";
    contentHash: string;
    storageKey: string;
    mediaType: "image/png" | "font/ttf";
    byteSize: number;
    width?: number;
    height?: number;
    family?: string;
    weight?: number;
    style?: "normal" | "italic";
    originKind: "user-upload" | "licensed-library";
    originSourceName: string;
    licenseStatus: "owned" | "licensed";
    licenseIdentifier?: string;
  }): Promise<void> {
    await database.query(
      `INSERT INTO resource_versions (
         id,
         workspace_id,
         kind,
         content_hash,
         storage_key,
         media_type,
         byte_size,
         width,
         height,
         font_family,
         font_weight,
         font_style,
         origin_kind,
         origin_source_name,
         license_status,
         license_identifier,
         scanner_verdict,
         scanner_name,
         scanner_version,
         scanned_at,
         created_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, 'clean', 'test-scanner', '1', $17, $18
       )`,
      [
        input.id,
        input.workspaceId,
        input.kind,
        input.contentHash,
        input.storageKey,
        input.mediaType,
        input.byteSize,
        input.width ?? null,
        input.height ?? null,
        input.family ?? null,
        input.weight ?? null,
        input.style ?? null,
        input.originKind,
        input.originSourceName,
        input.licenseStatus,
        input.licenseIdentifier ?? null,
        NOW,
        input.actorUserId,
      ],
    );
  }

  async function registerMember(
    inviter: SessionGrant,
    workspaceId: string,
    email: string,
    role: Exclude<WorkspaceRole, "owner">,
  ): Promise<SessionGrant> {
    const invitation = expectReceipt(
      await workflow.execute({
        evidence: ownerEvidence(inviter),
        command: {
          type: "invitation.create",
          workspaceId,
          email,
          role,
        },
      }),
      "invitation-created",
    );
    return expectSessionGrant(
      await workflow.execute({
        evidence: {},
        command: {
          type: "invitation.register",
          displayName: email.split("@")[0] ?? "Member",
          email,
          password: "correct horse battery staple",
          invitationToken: invitation.invitationToken,
        },
      }),
    );
  }

  async function seedPreexistingOwner(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    await database.query(
      `UPDATE workspace_memberships
          SET role = 'owner'
        WHERE workspace_id = $1
          AND user_id = $2`,
      [workspaceId, userId],
    );
  }
});

class TestPasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return Promise.resolve(
      `$argon2id$test$${Buffer.from(password).toString("base64url")}`,
    );
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    return passwordHash === (await this.hash(password));
  }
}

class CountingPasswordHasher extends TestPasswordHasher {
  hashCalls = 0;

  override hash(password: string): Promise<string> {
    this.hashCalls += 1;
    return super.hash(password);
  }
}

class DeterministicSecretFactory implements SecretFactory {
  #counter = 0;

  createToken(): string {
    this.#counter += 1;
    return `token-${this.#counter.toString().padStart(48, "0")}`;
  }

  createId(): string {
    this.#counter += 1;
    return `00000000-0000-4000-8000-${this.#counter.toString().padStart(12, "0")}`;
  }
}

class MutableTestClock implements Clock {
  #now: Date;

  constructor(now: Date) {
    this.#now = new Date(now);
  }

  now(): Date {
    return new Date(this.#now);
  }

  advance(milliseconds: number): void {
    this.#now = new Date(this.#now.getTime() + milliseconds);
  }
}

class TestResourceStore implements ResourceStore {
  readonly #resources = new Map<string, ResourceWithBytes>();

  add(resource: ResourceWithBytes): void {
    this.#resources.set(
      this.#key(resource.resource.workspaceId, resource.resource.id),
      {
        resource: resource.resource,
        bytes: new Uint8Array(resource.bytes),
      },
    );
  }

  admit(): Promise<ResourceAdmission> {
    return Promise.reject(new Error("Not used by workflow tests."));
  }

  findById(workspaceId: string, resourceId: string): Promise<ResourceVersion | null> {
    return Promise.resolve(
      this.#resources.get(this.#key(workspaceId, resourceId))?.resource ?? null,
    );
  }

  listByWorkspace(workspaceId: string, maximum: number): Promise<ResourceVersion[]> {
    return Promise.resolve(
      [...this.#resources.values()]
        .map((stored) => stored.resource)
        .filter((resource) => resource.workspaceId === workspaceId)
        .sort(
          (left, right) =>
            right.createdAt.getTime() - left.createdAt.getTime() ||
            right.id.localeCompare(left.id),
        )
        .slice(0, maximum),
    );
  }

  readById(workspaceId: string, resourceId: string): Promise<ResourceWithBytes | null> {
    return Promise.resolve(
      this.#resources.get(this.#key(workspaceId, resourceId)) ?? null,
    );
  }

  async findFontVersion(
    workspaceId: string,
    reference: {
      family: string;
      weight: number;
      style: "normal" | "italic";
      contentHash: string;
    },
  ): Promise<ResourceVersion | null> {
    return (await this.readFontVersion(workspaceId, reference))?.resource ?? null;
  }

  readFontVersion(
    workspaceId: string,
    reference: {
      family: string;
      weight: number;
      style: "normal" | "italic";
      contentHash: string;
    },
  ): Promise<ResourceWithBytes | null> {
    for (const stored of this.#resources.values()) {
      const resource = stored.resource;
      if (
        resource.workspaceId === workspaceId &&
        resource.kind === "font" &&
        resource.family === reference.family &&
        resource.weight === reference.weight &&
        resource.style === reference.style &&
        resource.contentHash === reference.contentHash
      ) {
        return Promise.resolve(stored);
      }
    }
    return Promise.resolve(null);
  }

  #key(workspaceId: string, resourceId: string): string {
    return `${workspaceId}\u0000${resourceId}`;
  }
}

function ownerEvidence(grant: SessionGrant): RequestEvidence {
  return {
    sessionToken: grant.sessionToken,
    csrfToken: grant.csrfToken,
  };
}

function requireWorkspaceId(grant: SessionGrant): string {
  const workspaceId = grant.workspaces.at(0)?.id;
  if (workspaceId === undefined) throw new Error("Workspace missing.");
  return workspaceId;
}

function brandDraft(primary: string): BrandSnapshotDraft {
  return {
    palette: {
      primary,
      secondary: "#47665C",
      accent: "#A4462A",
      neutrals: ["#F4EEDF", "#262119"],
    },
    themes: {
      light: {
        background: "#F4EEDF",
        surface: "#FBF8F0",
        text: "#262119",
        mutedText: "#665E51",
      },
      dark: {
        background: "#262119",
        surface: "#342E25",
        text: "#F4EEDF",
        mutedText: "#C8BCAA",
      },
    },
    typography: {
      headlineFamily: "Inter",
      bodyFamily: "Inter",
      monospaceFamily: "Inter",
    },
    spacingScale: [4, 8, 12, 16, 24, 32],
    borderRadii: [0, 12, 24],
    visualDensity: "balanced",
    preferredProceduralStyles: ["layered-waves"],
    safeArea: { top: 0.07, right: 0.07, bottom: 0.07, left: 0.07 },
    prohibitedColors: [],
    prohibitedStyles: [],
  };
}

function quoteDraft(text: string): ManualDraft {
  return {
    templateId: "quote-card",
    format: "instagram-square",
    seed: "stored-seed",
    mode: "light",
    layers: quoteLayers(text),
  };
}

function imageLedCampaignDraft(seed: string): ManualDraft {
  return {
    templateId: "image-led-campaign",
    format: "linkedin-landscape",
    seed,
    mode: "dark",
    resources: {
      assetIds: ["campaign-image-one", "campaign-logo-one"],
      fontIds: [],
    },
    layers: [
      {
        id: "campaign-image",
        type: "image",
        visible: true,
        assetId: "campaign-image-one",
        alt: "Campaign product photograph.",
        fit: "cover",
        focalPoint: { x: 0.68, y: 0.48 },
        treatment: "dark-scrim",
      },
      {
        id: "brand-mark",
        type: "logo",
        visible: true,
        assetId: "campaign-logo-one",
        alt: "Campaign brand mark.",
        fit: "contain",
      },
      {
        id: "eyebrow",
        type: "eyebrow",
        visible: true,
        text: "CAMPAIGN / SERIES 01",
      },
      {
        id: "headline",
        type: "headline",
        visible: true,
        text: "Put the product in the frame.",
      },
      {
        id: "subtitle",
        type: "subtitle",
        visible: true,
        text: "One admitted image and one deterministic direction.",
      },
      {
        id: "cta",
        type: "cta",
        visible: true,
        text: "DISCOVER THE COLLECTION →",
      },
    ],
  };
}

function quoteLayers(text: string): DesignLayer[] {
  return [
    { id: "background", type: "background", visible: true },
    {
      id: "procedure",
      type: "procedural-decoration",
      visible: true,
      style: "layered-waves",
      intensity: 0.5,
      density: 0.5,
      complexity: 0.5,
      contrast: 0.4,
      quietRegion: { x: 0.05, y: 0.1, width: 0.7, height: 0.7 },
    },
    { id: "quote", type: "headline", visible: true, text },
    {
      id: "attribution",
      type: "attribution",
      visible: true,
      text: "Glyphkiln",
    },
  ];
}

function completedRenderOutputs() {
  return [
    {
      format: "svg" as const,
      mimeType: "image/svg+xml" as const,
      artifactKey: "workspaces/a/render-output/sha256/aa/svg",
      artifactSha256: "a".repeat(64),
      artifactByteSize: 100,
      manifestKey: "workspaces/a/render-manifest/sha256/bb/svg",
      manifestSha256: "b".repeat(64),
      manifestByteSize: 200,
      fingerprint: "svg-fingerprint",
    },
    {
      format: "png" as const,
      mimeType: "image/png" as const,
      artifactKey: "workspaces/a/render-output/sha256/cc/png",
      artifactSha256: "c".repeat(64),
      artifactByteSize: 300,
      manifestKey: "workspaces/a/render-manifest/sha256/dd/png",
      manifestSha256: "d".repeat(64),
      manifestByteSize: 200,
      fingerprint: "png-fingerprint",
    },
  ];
}

function expectSuccess<T>(result: AppResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected success, received ${result.error.code}.`);
  }
  return result.value;
}

function expectSessionGrant(result: AppResult<CommandReceipt>): SessionGrant {
  return expectReceipt(result, "session-granted");
}

function expectReceipt<Kind extends CommandReceipt["kind"]>(
  result: AppResult<CommandReceipt>,
  kind: Kind,
): Extract<CommandReceipt, { kind: Kind }> {
  const receipt = expectSuccess(result);
  expect(receipt.kind).toBe(kind);
  if (receipt.kind !== kind) {
    throw new Error(`Expected ${kind}, received ${receipt.kind}.`);
  }
  return receipt as Extract<CommandReceipt, { kind: Kind }>;
}

function expectProjection<Kind extends QueryProjection["kind"]>(
  result: AppResult<QueryProjection>,
  kind: Kind,
): Extract<QueryProjection, { kind: Kind }> {
  const projection = expectSuccess(result);
  expect(projection.kind).toBe(kind);
  if (projection.kind !== kind) {
    throw new Error(`Expected ${kind}, received ${projection.kind}.`);
  }
  return projection as Extract<QueryProjection, { kind: Kind }>;
}

function expectFailure<T>(result: AppResult<T>, status: number, code: string): void {
  expect(result).toMatchObject({
    ok: false,
    status,
    error: { code },
  });
}
