import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SqlDatabase } from "./database";
import {
  ALPHA_ROLLBACK_WARNING,
  assertDatabaseMigrationsCurrent,
  loadMigrations,
  migrateDatabase,
  rollbackMigrations,
} from "./migrations";
import { createPGliteDatabase } from "./pglite-database";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$Z2x5cGhraWxu$YXBwLWFscGhh";

const WORKSPACE_OWNED_TABLES = [
  "audit_events",
  "brand_kits",
  "brand_snapshots",
  "campaign_canvases",
  "campaign_direction_locks",
  "campaign_directions",
  "campaign_proposal_candidates",
  "campaign_proposal_decisions",
  "campaign_proposal_runs",
  "campaigns",
  "design_revision_resources",
  "design_revisions",
  "designs",
  "render_attempts",
  "render_jobs",
  "render_outputs",
  "render_workspace_queue_schedules",
  "resource_ingestions",
  "resource_versions",
  "revision_approval_receipts",
  "revision_review_comments",
  "revision_review_transitions",
  "revision_reviews",
  "workspace_invitations",
  "workspace_memberships",
] as const;

const WORKSPACE_ENTITY_TABLES = WORKSPACE_OWNED_TABLES.filter(
  (tableName) =>
    tableName !== "render_attempts" &&
    tableName !== "render_outputs" &&
    tableName !== "render_workspace_queue_schedules" &&
    tableName !== "design_revision_resources" &&
    tableName !== "campaign_direction_locks",
);

const MIGRATION_VERSIONS = [
  "202607310001_app_alpha_foundation",
  "202607310002_safe_resources",
  "202607310003_async_render_jobs",
  "202607310004_membership_lifecycle",
  "202607310005_resource_admission_identity",
  "202607310006_render_queue_capacity_fairness",
  "202607310007_revision_resource_provenance",
  "202608120008_campaign_workflow",
  "202608120009_revision_review_approval",
  "202608120010_resource_color_normalization_provenance",
  "202608120011_campaign_proposals",
] as const;

type TableNameRow = {
  table_name: string;
};

type ConstraintRow = {
  condeferred: boolean;
  condeferrable: boolean;
  conname: string;
  definition: string;
  table_name: string;
};

type CountRow = {
  count: number;
};

async function seedIdentityAndWorkspaces(database: SqlDatabase): Promise<void> {
  await database.query(
    `
      INSERT INTO users (id, email, display_name, password_hash)
      VALUES
        ($1, $2, $3, $4),
        ($5, $6, $7, $8)
    `,
    [
      "user-a",
      "owner-a@example.test",
      "Owner A",
      PASSWORD_HASH,
      "user-b",
      "owner-b@example.test",
      "Owner B",
      PASSWORD_HASH,
    ],
  );
  await database.query(
    `
      INSERT INTO workspaces (id, name, slug, created_by)
      VALUES
        ($1, $2, $3, $4),
        ($5, $6, $7, $8)
    `,
    [
      "workspace-a",
      "Workspace A",
      "workspace-a",
      "user-a",
      "workspace-b",
      "Workspace B",
      "workspace-b",
      "user-b",
    ],
  );
  await database.query(
    `
      INSERT INTO workspace_memberships
        (workspace_id, user_id, role)
      VALUES
        ($1, $2, $3),
        ($4, $5, $6)
    `,
    ["workspace-a", "user-a", "owner", "workspace-b", "user-b", "owner"],
  );
}

async function seedBrandAndDesignState(database: SqlDatabase): Promise<void> {
  await seedIdentityAndWorkspaces(database);
  await database.query(
    `
      INSERT INTO brand_kits (id, workspace_id, name, created_by)
      VALUES
        ($1, $2, $3, $4),
        ($5, $6, $7, $8)
    `,
    [
      "brand-a",
      "workspace-a",
      "Brand A",
      "user-a",
      "brand-b",
      "workspace-b",
      "Brand B",
      "user-b",
    ],
  );
  await database.query(
    `
      INSERT INTO brand_snapshots
        (
          id,
          workspace_id,
          brand_kit_id,
          sequence,
          version,
          snapshot,
          canonical_hash,
          created_by
        )
      VALUES
        ($1, $2, $3, $4, $5, $6::jsonb, $7, $8),
        ($9, $10, $11, $12, $13, $14::jsonb, $15, $16)
    `,
    [
      "snapshot-a",
      "workspace-a",
      "brand-a",
      1,
      "1.0.0",
      { name: "Brand A" },
      HASH_A,
      "user-a",
      "snapshot-b",
      "workspace-b",
      "brand-b",
      1,
      "1.0.0",
      { name: "Brand B" },
      HASH_B,
      "user-b",
    ],
  );
  await database.query(
    `
      INSERT INTO designs (id, workspace_id, name, created_by)
      VALUES
        ($1, $2, $3, $4),
        ($5, $6, $7, $8)
    `,
    [
      "design-a",
      "workspace-a",
      "Design A",
      "user-a",
      "design-b",
      "workspace-a",
      "Design B",
      "user-a",
    ],
  );
}

async function insertRevision(
  database: SqlDatabase,
  input: {
    brandSnapshotId: string;
    designId: string;
    documentName: string;
    id: string;
    parentRevisionId?: string;
    revisionNumber: number;
    workspaceId?: string;
  },
): Promise<void> {
  await database.query(
    `
      INSERT INTO design_revisions
        (
          id,
          workspace_id,
          design_id,
          revision_number,
          parent_revision_id,
          brand_snapshot_id,
          design_document,
          canonical_hash,
          source,
          change_note,
          created_by
        )
      VALUES
        ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'manual', $9, $10)
    `,
    [
      input.id,
      input.workspaceId ?? "workspace-a",
      input.designId,
      input.revisionNumber,
      input.parentRevisionId ?? null,
      input.brandSnapshotId,
      { name: input.documentName, schemaVersion: "1.0.0" },
      HASH_C,
      "test revision",
      "user-a",
    ],
  );
}

async function insertApprovalReceipt(
  database: SqlDatabase,
  input: {
    designId: string;
    id: string;
    renderJobId: string;
    reviewId: string;
    revisionId: string;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO revision_approval_receipts (
       id, workspace_id, review_id, design_id, revision_id, render_job_id,
       revision_canonical_hash, resource_pins, output_evidence, approved_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
    [
      input.id,
      "workspace-a",
      input.reviewId,
      input.designId,
      input.revisionId,
      input.renderJobId,
      HASH_C,
      [],
      [{ format: "svg" }],
      "user-a",
    ],
  );
}

describe("App Alpha PostgreSQL migration", () => {
  let database: SqlDatabase;

  beforeEach(async () => {
    database = await createPGliteDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  it("runs forward, records an immutable checksum, rolls back with warning, and runs forward again", async () => {
    await expect(assertDatabaseMigrationsCurrent(database)).rejects.toThrow();
    await expect(migrateDatabase(database)).resolves.toEqual({
      alreadyApplied: [],
      applied: MIGRATION_VERSIONS,
    });
    await expect(migrateDatabase(database)).resolves.toEqual({
      alreadyApplied: MIGRATION_VERSIONS,
      applied: [],
    });

    const migrationRows = await database.query<{
      checksum: string;
      version: string;
    }>("SELECT version, checksum FROM schema_migrations ORDER BY version");
    expect(migrationRows).toHaveLength(MIGRATION_VERSIONS.length);
    expect(migrationRows.map((row) => row.version)).toEqual(MIGRATION_VERSIONS);
    expect(migrationRows.every((row) => /^[0-9a-f]{64}$/.test(row.checksum))).toBe(
      true,
    );
    await expect(assertDatabaseMigrationsCurrent(database)).resolves.toEqual({
      applied: MIGRATION_VERSIONS,
    });

    await expect(
      rollbackMigrations(database, { allowDataLoss: false }),
    ).rejects.toThrow("allowDataLoss: true");

    const warnings: string[] = [];
    await expect(
      rollbackMigrations(database, {
        allowDataLoss: true,
        warn(message) {
          warnings.push(message);
        },
      }),
    ).resolves.toEqual({
      rolledBack: [...MIGRATION_VERSIONS].reverse(),
    });
    expect(warnings).toEqual([ALPHA_ROLLBACK_WARNING]);

    const remainingTables = await database.query<TableNameRow>(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `,
    );
    expect(remainingTables).toEqual([{ table_name: "schema_migrations" }]);

    await expect(migrateDatabase(database)).resolves.toEqual({
      alreadyApplied: [],
      applied: MIGRATION_VERSIONS,
    });
    await expect(
      database.query("SELECT singleton FROM installation_state"),
    ).resolves.toEqual([{ singleton: true }]);
  });

  it("creates all tenant keys and the deferred same-design head constraint", async () => {
    await migrateDatabase(database);

    const workspaceColumns = await database.query<TableNameRow>(
      `
        SELECT table_name
        FROM information_schema.columns
        WHERE
          table_schema = 'public'
          AND column_name = 'workspace_id'
        ORDER BY table_name
      `,
    );
    expect(workspaceColumns.map((row) => row.table_name)).toEqual(
      WORKSPACE_OWNED_TABLES,
    );

    const uniqueConstraints = await database.query<ConstraintRow>(
      `
        SELECT
          constraint_table.relname AS table_name,
          constraint_record.conname,
          constraint_record.condeferrable,
          constraint_record.condeferred,
          pg_get_constraintdef(constraint_record.oid) AS definition
        FROM pg_constraint AS constraint_record
        JOIN pg_class AS constraint_table
          ON constraint_table.oid = constraint_record.conrelid
        WHERE constraint_record.contype = 'u'
        ORDER BY constraint_table.relname, constraint_record.conname
      `,
    );
    for (const tableName of WORKSPACE_ENTITY_TABLES) {
      expect(uniqueConstraints).toContainEqual(
        expect.objectContaining({
          definition: "UNIQUE (workspace_id, id)",
          table_name: tableName,
        }),
      );
    }

    const headConstraints = await database.query<ConstraintRow>(
      `
        SELECT
          constraint_table.relname AS table_name,
          constraint_record.conname,
          constraint_record.condeferrable,
          constraint_record.condeferred,
          pg_get_constraintdef(constraint_record.oid) AS definition
        FROM pg_constraint AS constraint_record
        JOIN pg_class AS constraint_table
          ON constraint_table.oid = constraint_record.conrelid
        WHERE constraint_record.conname = $1
      `,
      ["designs_head_revision_same_design_fk"],
    );
    expect(headConstraints).toHaveLength(1);
    expect(headConstraints[0]).toMatchObject({
      condeferred: true,
      condeferrable: true,
      table_name: "designs",
    });
    expect(headConstraints[0]?.definition).toContain(
      "FOREIGN KEY (workspace_id, id, head_revision_id)",
    );

    const singletonRows = await database.query<CountRow>(
      "SELECT count(*)::integer AS count FROM installation_state",
    );
    expect(singletonRows).toEqual([{ count: 1 }]);
  });

  it("enforces role, invitation, session, and audit constraints", async () => {
    await migrateDatabase(database);
    await seedIdentityAndWorkspaces(database);

    await expect(
      database.query(
        `
          INSERT INTO workspace_invitations
            (
              id,
              workspace_id,
              email,
              role,
              token_hash,
              invited_by,
              expires_at
            )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          "invitation-owner",
          "workspace-a",
          "new@example.test",
          "owner",
          HASH_A,
          "user-a",
          new Date("2030-01-01T00:00:00.000Z"),
        ],
      ),
    ).rejects.toHaveProperty("code", "23514");

    await expect(
      database.query(
        `
          INSERT INTO workspace_invitations
            (
              id,
              workspace_id,
              email,
              role,
              token_hash,
              invited_by,
              expires_at
            )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          "invitation-cross-workspace",
          "workspace-a",
          "new@example.test",
          "editor",
          HASH_A,
          "user-b",
          new Date("2030-01-01T00:00:00.000Z"),
        ],
      ),
    ).rejects.toHaveProperty("code", "23503");

    await expect(
      database.query(
        `
          INSERT INTO sessions
            (
              id,
              user_id,
              token_hash,
              csrf_token_hash,
              expires_at
            )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          "invalid-session",
          "user-a",
          HASH_A.toUpperCase(),
          HASH_B,
          new Date("2030-01-01T00:00:00.000Z"),
        ],
      ),
    ).rejects.toHaveProperty("code", "23514");

    await expect(
      database.query(
        `
          INSERT INTO audit_events
            (
              id,
              workspace_id,
              actor_user_id,
              action,
              target_type,
              target_id
            )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          "audit-cross-workspace",
          "workspace-a",
          "user-b",
          "brand.publish",
          "brand_snapshot",
          "snapshot-a",
        ],
      ),
    ).rejects.toHaveProperty("code", "23503");

    await expect(
      database.query(
        `
          INSERT INTO audit_events
            (id, actor_user_id, action, target_type, target_id)
          VALUES ($1, $2, $3, $4, $5)
        `,
        ["audit-global", "user-a", "session.login", "session", "session-a"],
      ),
    ).resolves.toEqual([]);
    await expect(
      database.query("DELETE FROM audit_events WHERE id = $1", ["audit-global"]),
    ).rejects.toHaveProperty("code", "55000");
  });

  it("soft-revokes memberships without breaking workspace provenance", async () => {
    await migrateDatabase(database);
    await seedIdentityAndWorkspaces(database);
    await database.query(
      `INSERT INTO workspace_memberships (
         workspace_id, user_id, role
       ) VALUES ($1, $2, $3)`,
      ["workspace-a", "user-b", "editor"],
    );
    await database.query(
      `INSERT INTO workspace_invitations (
         id, workspace_id, email, role, token_hash, invited_by, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        "invitation-by-editor",
        "workspace-a",
        "invitee@example.test",
        "viewer",
        HASH_A,
        "user-b",
        new Date("2030-01-01T00:00:00.000Z"),
      ],
    );

    await expect(
      database.query(
        `UPDATE workspace_memberships
            SET revoked_at = $3
          WHERE workspace_id = $1
            AND user_id = $2`,
        ["workspace-a", "user-b", new Date("2029-01-01T00:00:00.000Z")],
      ),
    ).rejects.toHaveProperty("code", "23514");
    await expect(
      database.query(
        `UPDATE workspace_memberships
            SET revoked_at = $3,
                revoked_by = $4
          WHERE workspace_id = $1
            AND user_id = $2`,
        [
          "workspace-a",
          "user-b",
          new Date("2029-01-01T00:00:00.000Z"),
          "missing-revoker",
        ],
      ),
    ).rejects.toHaveProperty("code", "23503");

    await database.query(
      `UPDATE workspace_memberships
          SET revoked_at = $3,
              revoked_by = $4
        WHERE workspace_id = $1
          AND user_id = $2`,
      ["workspace-a", "user-b", new Date("2029-01-01T00:00:00.000Z"), "user-a"],
    );
    await expect(
      database.query(
        `SELECT invited_by
           FROM workspace_invitations
          WHERE id = $1`,
        ["invitation-by-editor"],
      ),
    ).resolves.toEqual([{ invited_by: "user-b" }]);
    await expect(
      database.query(
        `SELECT role, revoked_by
           FROM workspace_memberships
          WHERE workspace_id = $1
            AND user_id = $2`,
        ["workspace-a", "user-b"],
      ),
    ).resolves.toEqual([{ role: "editor", revoked_by: "user-a" }]);
  });

  it("backfills legacy font selections to their deterministic immutable admission", async () => {
    const migrations = await loadMigrations();
    for (const migration of migrations.slice(0, 6)) {
      for (const statement of migration.upStatements) {
        await database.query(statement);
      }
    }
    await seedBrandAndDesignState(database);
    await database.query(
      `INSERT INTO resource_versions (
         id, workspace_id, kind, content_hash, storage_key, media_type,
         byte_size, font_family, font_weight, font_style, origin_kind,
         license_status, scanner_verdict, scanner_name, scanner_version,
         scanned_at, created_by
       ) VALUES (
         $1, $2, 'font', $3, $4, 'font/ttf', 4, $5, 700, 'normal',
         'licensed-library', 'licensed', 'clean', 'test-scanner', '1',
         $6, $7
       )`,
      [
        "font-legacy",
        "workspace-a",
        HASH_A,
        "workspaces/a/resources/font/aa/legacy",
        "Kiln Sans",
        new Date("2029-01-01T00:00:00.000Z"),
        "user-a",
      ],
    );
    await database.query(
      `INSERT INTO design_revisions (
         id, workspace_id, design_id, revision_number, brand_snapshot_id,
         design_document, canonical_hash, source, created_by, created_at
       ) VALUES (
         $1, $2, $3, 1, $4, $5::jsonb, $6, 'manual', $7, $8
       )`,
      [
        "revision-legacy-resource",
        "workspace-a",
        "design-a",
        "snapshot-a",
        {
          schemaVersion: "1.0.0",
          metadata: {
            resourceVersions: {
              assets: [],
              fonts: [
                {
                  family: "Kiln Sans",
                  weight: 700,
                  style: "normal",
                  sha256: HASH_A,
                },
              ],
            },
          },
        },
        HASH_B,
        "user-a",
        new Date("2029-01-01T00:00:00.000Z"),
      ],
    );

    const provenanceMigration = migrations.find(
      (migration) => migration.version === "202607310007_revision_resource_provenance",
    );
    if (provenanceMigration === undefined) {
      throw new Error("Revision-resource provenance migration missing.");
    }
    for (const statement of provenanceMigration.upStatements) {
      await database.query(statement);
    }

    await expect(
      database.query(
        `SELECT resource_id, resource_kind, ordinal
           FROM design_revision_resources
          WHERE workspace_id = $1
            AND revision_id = $2`,
        ["workspace-a", "revision-legacy-resource"],
      ),
    ).resolves.toEqual([
      { resource_id: "font-legacy", resource_kind: "font", ordinal: 0 },
    ]);
  });

  it("keeps proposal evidence and human decisions append-only and campaign-scoped", async () => {
    await migrateDatabase(database);
    await seedBrandAndDesignState(database);
    await insertRevision(database, {
      brandSnapshotId: "snapshot-a",
      designId: "design-a",
      documentName: "Proposal base",
      id: "revision-proposal-base",
      revisionNumber: 1,
    });
    await database.query(
      `INSERT INTO campaigns (
         id, workspace_id, name, brief, campaign_seed, family_id, created_by
       ) VALUES ($1, $2, $3, $4, $5, 'image-led-campaign', $6)`,
      [
        "campaign-proposal-a",
        "workspace-a",
        "Proposal campaign",
        "Keep the provider boundary append-only.",
        "proposal-seed",
        "user-a",
      ],
    );
    await database.query(
      `INSERT INTO campaign_directions (
         id, workspace_id, campaign_id, direction_key, name, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        "direction-proposal-a",
        "workspace-a",
        "campaign-proposal-a",
        "direction-a",
        "Direction A",
        "user-a",
      ],
    );
    await database.query(
      `INSERT INTO campaign_canvases (
         id, workspace_id, campaign_id, direction_id, canvas_key,
         design_id, revision_id, template_id, template_version, format_id,
         composition_variant_id, seed_derivation_version, direction_seed,
         canvas_seed, ordinal, created_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'image-led-campaign', '1.0.0',
         'linkedin-landscape', 'focal-editorial', 'sha256/canonical-scope-v1',
         $8, $9, 0, $10
       )`,
      [
        "canvas-proposal-a",
        "workspace-a",
        "campaign-proposal-a",
        "direction-proposal-a",
        "hero-a",
        "design-a",
        "revision-proposal-base",
        HASH_A,
        HASH_B,
        "user-a",
      ],
    );
    await database.query(
      `INSERT INTO campaign_proposal_runs (
         id, workspace_id, campaign_id, direction_id, base_canvas_id,
         base_design_id, base_revision_id, provider_id, model_id,
         retention_disclosure, input_hash, response_hash, locks, validation,
         requested_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13::jsonb, $14::jsonb, $15
       )`,
      [
        "run-proposal-a",
        "workspace-a",
        "campaign-proposal-a",
        "direction-proposal-a",
        "canvas-proposal-a",
        "design-a",
        "revision-proposal-base",
        "provider-a",
        "model-a",
        "The provider receives bounded inert campaign data.",
        HASH_A,
        HASH_B,
        [],
        { version: "1.0.0" },
        "user-a",
      ],
    );
    await database.query(
      `INSERT INTO campaign_proposal_candidates (
         id, workspace_id, run_id, candidate_index, status, validation
       ) VALUES ($1, $2, $3, 0, 'rejected', $4::jsonb)`,
      [
        "candidate-proposal-a",
        "workspace-a",
        "run-proposal-a",
        { issues: [{ code: "RESOURCE_BACKED_PROOF_FAILED" }] },
      ],
    );
    await database.query(
      `INSERT INTO campaign_proposal_decisions (
         id, workspace_id, run_id, candidate_id, decision, reason, decided_by
       ) VALUES ($1, $2, $3, $4, 'rejected', $5, $6)`,
      [
        "decision-proposal-a",
        "workspace-a",
        "run-proposal-a",
        "candidate-proposal-a",
        "Human rejected this bounded suggestion.",
        "user-a",
      ],
    );

    for (const [tableName, id] of [
      ["campaign_proposal_runs", "run-proposal-a"],
      ["campaign_proposal_candidates", "candidate-proposal-a"],
      ["campaign_proposal_decisions", "decision-proposal-a"],
    ] as const) {
      await expect(
        database.query(
          `UPDATE ${tableName} SET created_at = created_at WHERE id = $1`,
          [id],
        ),
      ).rejects.toHaveProperty("code", "55000");
    }
    await expect(
      database.query(
        `INSERT INTO campaign_proposal_decisions (
           id, workspace_id, run_id, candidate_id, decision, decided_by
         ) VALUES ($1, $2, $3, $4, 'rejected', $5)`,
        [
          "decision-proposal-duplicate",
          "workspace-a",
          "run-proposal-a",
          "candidate-proposal-a",
          "user-a",
        ],
      ),
    ).rejects.toHaveProperty("code", "23505");
  });

  it("rejects cross-workspace and cross-design references and keeps history append-only", async () => {
    await migrateDatabase(database);
    await seedBrandAndDesignState(database);

    await expect(
      insertRevision(database, {
        brandSnapshotId: "snapshot-b",
        designId: "design-a",
        documentName: "Foreign snapshot",
        id: "revision-cross-workspace",
        revisionNumber: 1,
      }),
    ).rejects.toHaveProperty("code", "23503");

    await insertRevision(database, {
      brandSnapshotId: "snapshot-a",
      designId: "design-a",
      documentName: "Stored revision",
      id: "revision-a",
      revisionNumber: 1,
    });
    await insertRevision(database, {
      brandSnapshotId: "snapshot-a",
      designId: "design-b",
      documentName: "Other design",
      id: "revision-b",
      revisionNumber: 1,
    });

    await expect(
      insertRevision(database, {
        brandSnapshotId: "snapshot-a",
        designId: "design-a",
        documentName: "Wrong parent",
        id: "revision-wrong-parent",
        parentRevisionId: "revision-b",
        revisionNumber: 2,
      }),
    ).rejects.toHaveProperty("code", "23503");

    await expect(
      database.transaction(async (transaction) => {
        await transaction.query(
          `
            UPDATE designs
            SET head_revision_id = $1
            WHERE workspace_id = $2 AND id = $3
          `,
          ["revision-a", "workspace-a", "design-b"],
        );
      }),
    ).rejects.toHaveProperty("code", "23503");

    await expect(
      database.query(
        `
          UPDATE brand_snapshots
          SET snapshot = $1::jsonb
          WHERE workspace_id = $2 AND id = $3
        `,
        [{ name: "Mutated" }, "workspace-a", "snapshot-a"],
      ),
    ).rejects.toHaveProperty("code", "55000");
    await expect(
      database.query(
        `
          UPDATE design_revisions
          SET design_document = $1::jsonb
          WHERE workspace_id = $2 AND id = $3
        `,
        [{ name: "Mutated" }, "workspace-a", "revision-a"],
      ),
    ).rejects.toHaveProperty("code", "55000");

    await database.transaction(async (transaction) => {
      await transaction.query(
        `
          UPDATE designs
          SET head_revision_id = $1
          WHERE workspace_id = $2 AND id = $3
        `,
        ["revision-a", "workspace-a", "design-a"],
      );
    });

    const storedRows = await database.query<{
      brand_snapshot_id: string;
      design_document: { name: string; schemaVersion: string };
      head_revision_id: string;
    }>(
      `
        SELECT
          revisions.brand_snapshot_id,
          revisions.design_document,
          designs.head_revision_id
        FROM design_revisions AS revisions
        JOIN designs
          ON designs.workspace_id = revisions.workspace_id
          AND designs.id = revisions.design_id
        WHERE revisions.workspace_id = $1 AND revisions.id = $2
      `,
      ["workspace-a", "revision-a"],
    );
    expect(storedRows).toEqual([
      {
        brand_snapshot_id: "snapshot-a",
        design_document: {
          name: "Stored revision",
          schemaVersion: "1.0.0",
        },
        head_revision_id: "revision-a",
      },
    ]);
  });

  it("binds approval receipts to the reviewed revision and its render job", async () => {
    await migrateDatabase(database);
    await seedBrandAndDesignState(database);
    await insertRevision(database, {
      brandSnapshotId: "snapshot-a",
      designId: "design-a",
      documentName: "Reviewed revision",
      id: "revision-a",
      revisionNumber: 1,
    });
    await insertRevision(database, {
      brandSnapshotId: "snapshot-a",
      designId: "design-b",
      documentName: "Other revision",
      id: "revision-b",
      revisionNumber: 1,
    });
    await database.query(
      `INSERT INTO revision_reviews (
         id, workspace_id, design_id, revision_id, state, started_by, updated_by
       ) VALUES ($1, $2, $3, $4, 'in-review', $5, $5)`,
      ["review-a", "workspace-a", "design-a", "revision-a", "user-a"],
    );
    for (const [jobId, designId, revisionId] of [
      ["job-a", "design-a", "revision-a"],
      ["job-b", "design-b", "revision-b"],
    ] as const) {
      await database.query(
        `INSERT INTO render_jobs (
           id, workspace_id, design_id, revision_id, requested_by,
           idempotency_key, available_at, manifest_creation_timestamp
         ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [jobId, "workspace-a", designId, revisionId, "user-a", `approval-${jobId}`],
      );
    }

    await expect(
      insertApprovalReceipt(database, {
        id: "approval-wrong-review",
        reviewId: "review-a",
        designId: "design-b",
        revisionId: "revision-b",
        renderJobId: "job-b",
      }),
    ).rejects.toHaveProperty("code", "23503");
    await expect(
      insertApprovalReceipt(database, {
        id: "approval-wrong-job",
        reviewId: "review-a",
        designId: "design-a",
        revisionId: "revision-a",
        renderJobId: "job-b",
      }),
    ).rejects.toHaveProperty("code", "23503");
    await expect(
      insertApprovalReceipt(database, {
        id: "approval-a",
        reviewId: "review-a",
        designId: "design-a",
        revisionId: "revision-a",
        renderJobId: "job-a",
      }),
    ).resolves.toBeUndefined();
  });
});
