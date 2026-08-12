import { createDevelopmentFont, sha256 } from "@glyphkiln/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SqlDatabase } from "../persistence/database";
import { migrateDatabase } from "../persistence/migrations";
import { createPGliteDatabase } from "../persistence/pglite-database";
import type { ImmutableBlobWriteResult, ResourceBlobStorage } from "./blob-storage";
import { DatabaseResourceStore } from "./database-resource-store";
import { ResourceIngestionService } from "./ingestion-service";
import { TestOnlyCleanMalwareScanner } from "./test-support";

const PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$Z2x5cGhraWxu$YXBwLWFscGhh";
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
    "base64",
  ),
);

class MemoryBlobStorage implements ResourceBlobStorage {
  readonly blobs = new Map<string, Uint8Array>();
  readonly reads: string[] = [];

  public putImmutable(
    key: string,
    contentHash: string,
    bytes: Uint8Array,
  ): Promise<ImmutableBlobWriteResult> {
    const existing = this.blobs.get(key);
    if (existing !== undefined) {
      if (sha256(existing) !== contentHash) {
        throw new Error("immutable collision");
      }
      return Promise.resolve("already-present");
    }
    this.blobs.set(key, new Uint8Array(bytes));
    return Promise.resolve("stored");
  }

  public readBounded(key: string, maximumBytes: number): Promise<Uint8Array | null> {
    this.reads.push(key);
    const bytes = this.blobs.get(key);
    if (bytes === undefined) {
      return Promise.resolve(null);
    }
    if (bytes.byteLength > maximumBytes) {
      throw new Error("oversized test blob");
    }
    return Promise.resolve(new Uint8Array(bytes));
  }
}

async function seedWorkspaces(database: SqlDatabase): Promise<void> {
  await database.query(
    `
      INSERT INTO users (id, email, display_name, password_hash)
      VALUES
        ('user-a', 'a@example.test', 'User A', $1),
        ('user-b', 'b@example.test', 'User B', $1)
    `,
    [PASSWORD_HASH],
  );
  await database.query(
    `
      INSERT INTO workspaces (id, name, slug, created_by)
      VALUES
        ('workspace-a', 'Workspace A', 'workspace-a', 'user-a'),
        ('workspace-b', 'Workspace B', 'workspace-b', 'user-b')
    `,
  );
  await database.query(
    `
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES
        ('workspace-a', 'user-a', 'owner'),
        ('workspace-b', 'user-b', 'owner')
    `,
  );
}

function input(workspaceId: string, actorUserId: string): Record<string, unknown> {
  return {
    workspaceId,
    actorUserId,
    declaredMediaType: "image/png",
    bytes: PNG,
    originalFilename: "asset.png",
    origin: { kind: "user-upload" },
    license: { status: "owned" },
  };
}

describe("database resource store", () => {
  let database: SqlDatabase;

  beforeEach(async () => {
    database = await createPGliteDatabase();
    await migrateDatabase(database);
    await seedWorkspaces(database);
  });

  afterEach(async () => {
    await database.close();
  });

  it("deduplicates only inside a workspace and keeps reads workspace-qualified", async () => {
    const blobs = new MemoryBlobStorage();
    const store = new DatabaseResourceStore(database, blobs);
    const ids = [
      "resource-a",
      "ingestion-a",
      "resource-duplicate",
      "ingestion-b",
      "resource-b",
      "ingestion-c",
    ];
    const service = new ResourceIngestionService({
      store,
      scanner: new TestOnlyCleanMalwareScanner(),
      createId: () => ids.shift() ?? "unexpected-id",
    });

    const first = await service.ingestRaster(input("workspace-a", "user-a"));
    const duplicateInput = input("workspace-a", "user-a");
    duplicateInput.origin = {
      kind: "licensed-library",
      sourceName: "Second source",
    };
    duplicateInput.license = {
      status: "licensed",
      identifier: "OFL-1.1",
    };
    const duplicate = await service.ingestRaster(duplicateInput);
    const otherWorkspace = await service.ingestRaster(input("workspace-b", "user-b"));

    expect(first.duplicate).toBe(false);
    expect(first.resource).toMatchObject({
      origin: { kind: "user-upload" },
      license: { status: "owned" },
      scan: {
        status: "clean",
        scannerName: "glyphkiln-test-only-clean",
        scannerVersion: "1",
      },
    });
    expect(duplicate).toMatchObject({
      duplicate: true,
      resource: {
        id: "resource-duplicate",
        workspaceId: "workspace-a",
        origin: {
          kind: "licensed-library",
          sourceName: "Second source",
        },
        license: {
          status: "licensed",
          identifier: "OFL-1.1",
        },
      },
    });
    expect(otherWorkspace).toMatchObject({
      duplicate: false,
      resource: { id: "resource-b", workspaceId: "workspace-b" },
    });
    expect(first.resource.storageKey).not.toBe(otherWorkspace.resource.storageKey);
    expect(first.resource.storageKey).toBe(duplicate.resource.storageKey);
    expect(blobs.blobs).toHaveLength(2);
    await expect(store.findById("workspace-b", "resource-a")).resolves.toBeNull();
    await expect(
      store.findById("workspace-a", "resource-duplicate"),
    ).resolves.toMatchObject({
      id: "resource-duplicate",
      origin: {
        kind: "licensed-library",
        sourceName: "Second source",
      },
      license: {
        status: "licensed",
        identifier: "OFL-1.1",
      },
    });
    await expect(store.readById("workspace-a", "resource-a")).resolves.toMatchObject({
      resource: { contentHash: sha256(PNG) },
      bytes: PNG,
    });
    await expect(store.listByWorkspace("workspace-a", 10)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "resource-a", workspaceId: "workspace-a" }),
        expect.objectContaining({
          id: "resource-duplicate",
          workspaceId: "workspace-a",
        }),
      ]),
    );
    const boundedCatalog = await store.listByWorkspace("workspace-a", 1);
    expect(boundedCatalog).toHaveLength(1);
    expect(boundedCatalog[0]?.workspaceId).toBe("workspace-a");

    await expect(
      database.query<{
        duplicate_of_resource_id: string | null;
        license_status: string;
        origin_kind: string;
        resource_id: string;
        admission_semantics_version: number;
      }>(
        `
          SELECT
            resource_id,
            duplicate_of_resource_id,
            origin_kind,
            license_status,
            admission_semantics_version
          FROM resource_ingestions
          WHERE workspace_id = $1
          ORDER BY id
        `,
        ["workspace-a"],
      ),
    ).resolves.toEqual([
      {
        resource_id: "resource-a",
        duplicate_of_resource_id: null,
        origin_kind: "user-upload",
        license_status: "owned",
        admission_semantics_version: 2,
      },
      {
        resource_id: "resource-duplicate",
        duplicate_of_resource_id: "resource-a",
        origin_kind: "licensed-library",
        license_status: "licensed",
        admission_semantics_version: 2,
      },
    ]);
  });

  it("keeps distinct immutable identities for font weights sharing bytes", async () => {
    const blobs = new MemoryBlobStorage();
    const store = new DatabaseResourceStore(database, blobs);
    const ids = ["font-400", "font-ingestion-400", "font-700", "font-ingestion-700"];
    const service = new ResourceIngestionService({
      store,
      scanner: new TestOnlyCleanMalwareScanner(),
      createId: () => ids.shift() ?? "unexpected-id",
    });
    const font = createDevelopmentFont();
    const fontInput = {
      workspaceId: "workspace-a",
      actorUserId: "user-a",
      declaredMediaType: "font/ttf",
      bytes: font.bytes,
      origin: {
        kind: "licensed-library",
        sourceName: "Google Fonts",
      },
      license: {
        status: "licensed",
        identifier: "OFL-1.1",
      },
      family: "Workspace Inter",
      weight: 400,
      style: "normal",
    };

    const regular = await service.ingestFont(fontInput);
    const bold = await service.ingestFont({ ...fontInput, weight: 700 });

    expect(regular).toMatchObject({
      duplicate: false,
      resource: { id: "font-400", weight: 400 },
    });
    expect(bold).toMatchObject({
      duplicate: false,
      resource: { id: "font-700", weight: 700 },
    });
    expect(regular.resource.storageKey).toBe(bold.resource.storageKey);
    expect(blobs.blobs).toHaveLength(1);
    await expect(
      store.findFontVersion("workspace-a", {
        family: "Workspace Inter",
        weight: 700,
        style: "normal",
        contentHash: bold.resource.contentHash,
      }),
    ).resolves.toMatchObject({
      id: "font-700",
      workspaceId: "workspace-a",
    });
    expect(blobs.reads).toEqual([]);
    const storedBold = await store.readFontVersion("workspace-a", {
      family: "Workspace Inter",
      weight: 700,
      style: "normal",
      contentHash: bold.resource.contentHash,
    });
    expect(storedBold?.resource).toMatchObject({
      id: "font-700",
      workspaceId: "workspace-a",
    });
    expect(storedBold?.bytes.byteLength).toBe(font.bytes.byteLength);
    expect(storedBold === null ? null : sha256(storedBold.bytes)).toBe(
      sha256(font.bytes),
    );
    expect(blobs.reads).toHaveLength(1);
    await expect(
      store.findFontVersion("workspace-b", {
        family: "Workspace Inter",
        weight: 700,
        style: "normal",
        contentHash: bold.resource.contentHash,
      }),
    ).resolves.toBeNull();
    expect(blobs.reads).toHaveLength(1);
  });

  it("enforces durable workspace admission and stored-byte quotas before publication", async () => {
    const rejectedBlobs = new MemoryBlobStorage();
    const rejectedStore = new DatabaseResourceStore(database, rejectedBlobs, {
      maximumInstallationAdmissions: 100,
      maximumInstallationStoredBytes: PNG.byteLength * 100,
      maximumWorkspaceAdmissions: 10,
      maximumWorkspaceStoredBytes: PNG.byteLength - 1,
    });
    const rejectedIds = ["resource-rejected", "ingestion-rejected"];
    const rejectedService = new ResourceIngestionService({
      store: rejectedStore,
      scanner: new TestOnlyCleanMalwareScanner(),
      createId: () => rejectedIds.shift() ?? "unexpected-id",
    });

    await expect(
      rejectedService.ingestRaster(input("workspace-a", "user-a")),
    ).rejects.toHaveProperty("code", "RESOURCE_QUOTA_EXCEEDED");
    expect(rejectedBlobs.blobs).toHaveLength(0);

    const admittedBlobs = new MemoryBlobStorage();
    const admittedStore = new DatabaseResourceStore(database, admittedBlobs, {
      maximumInstallationAdmissions: 100,
      maximumInstallationStoredBytes: PNG.byteLength * 100,
      maximumWorkspaceAdmissions: 1,
      maximumWorkspaceStoredBytes: PNG.byteLength,
    });
    const admittedIds = [
      "resource-first",
      "ingestion-first",
      "resource-over-limit",
      "ingestion-over-limit",
    ];
    const admittedService = new ResourceIngestionService({
      store: admittedStore,
      scanner: new TestOnlyCleanMalwareScanner(),
      createId: () => admittedIds.shift() ?? "unexpected-id",
    });

    await expect(
      admittedService.ingestRaster(input("workspace-a", "user-a")),
    ).resolves.toMatchObject({
      duplicate: false,
      resource: { id: "resource-first" },
    });
    await expect(
      admittedService.ingestRaster(input("workspace-a", "user-a")),
    ).rejects.toHaveProperty("code", "RESOURCE_QUOTA_EXCEEDED");
    expect(admittedBlobs.blobs).toHaveLength(1);
    await expect(
      database.query<{ count: number }>(
        "SELECT COUNT(*)::integer AS count FROM resource_versions WHERE workspace_id = $1",
        ["workspace-a"],
      ),
    ).resolves.toEqual([{ count: 1 }]);
  });

  it("atomically caps resource admissions across workspaces", async () => {
    const blobs = new MemoryBlobStorage();
    const store = new DatabaseResourceStore(database, blobs, {
      maximumInstallationAdmissions: 1,
      maximumInstallationStoredBytes: PNG.byteLength * 10,
      maximumWorkspaceAdmissions: 10,
      maximumWorkspaceStoredBytes: PNG.byteLength * 10,
    });
    const firstIds = ["resource-global-a", "ingestion-global-a"];
    const secondIds = ["resource-global-b", "ingestion-global-b"];
    const firstService = new ResourceIngestionService({
      store,
      scanner: new TestOnlyCleanMalwareScanner(),
      createId: () => firstIds.shift() ?? "unexpected-first-id",
    });
    const secondService = new ResourceIngestionService({
      store,
      scanner: new TestOnlyCleanMalwareScanner(),
      createId: () => secondIds.shift() ?? "unexpected-second-id",
    });

    const results = await Promise.allSettled([
      firstService.ingestRaster(input("workspace-a", "user-a")),
      secondService.ingestRaster(input("workspace-b", "user-b")),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status !== "rejected") {
      throw new Error("Expected one global resource admission rejection.");
    }
    expect(rejected.reason as unknown).toMatchObject({
      code: "RESOURCE_QUOTA_EXCEEDED",
    });
    expect(blobs.blobs).toHaveLength(1);
    await expect(
      database.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM resource_versions",
      ),
    ).resolves.toEqual([{ count: 1 }]);
  });

  it("counts shared workspace blobs once but bounds installation blob bytes", async () => {
    const blobs = new MemoryBlobStorage();
    const store = new DatabaseResourceStore(database, blobs, {
      maximumInstallationAdmissions: 10,
      maximumInstallationStoredBytes: PNG.byteLength,
      maximumWorkspaceAdmissions: 10,
      maximumWorkspaceStoredBytes: PNG.byteLength * 10,
    });
    const firstIds = [
      "resource-byte-a",
      "ingestion-byte-a",
      "resource-byte-a-duplicate",
      "ingestion-byte-a-duplicate",
    ];
    const firstService = new ResourceIngestionService({
      store,
      scanner: new TestOnlyCleanMalwareScanner(),
      createId: () => firstIds.shift() ?? "unexpected-first-id",
    });
    const secondIds = ["resource-byte-b", "ingestion-byte-b"];
    const secondService = new ResourceIngestionService({
      store,
      scanner: new TestOnlyCleanMalwareScanner(),
      createId: () => secondIds.shift() ?? "unexpected-second-id",
    });

    await expect(
      firstService.ingestRaster(input("workspace-a", "user-a")),
    ).resolves.toMatchObject({ duplicate: false });
    await expect(
      firstService.ingestRaster(input("workspace-a", "user-a")),
    ).resolves.toMatchObject({ duplicate: true });
    await expect(
      secondService.ingestRaster(input("workspace-b", "user-b")),
    ).rejects.toHaveProperty("code", "RESOURCE_QUOTA_EXCEEDED");
    expect(blobs.blobs).toHaveLength(1);
    await expect(
      database.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM resource_versions",
      ),
    ).resolves.toEqual([{ count: 2 }]);
  });

  it("enforces membership ownership and append-only resource records", async () => {
    const store = new DatabaseResourceStore(database, new MemoryBlobStorage());
    const ids = ["resource-foreign", "ingestion-foreign"];
    const service = new ResourceIngestionService({
      store,
      scanner: new TestOnlyCleanMalwareScanner(),
      createId: () => ids.shift() ?? "unexpected-id",
    });

    await expect(
      service.ingestRaster(input("workspace-b", "user-a")),
    ).rejects.toHaveProperty("code", "23503");

    const validIds = ["resource-a", "ingestion-a"];
    const validService = new ResourceIngestionService({
      store,
      scanner: new TestOnlyCleanMalwareScanner(),
      createId: () => validIds.shift() ?? "unexpected-id",
    });
    await validService.ingestRaster(input("workspace-a", "user-a"));

    await expect(
      database.query(
        `
          UPDATE resource_versions
          SET content_hash = $1
          WHERE workspace_id = $2 AND id = $3
        `,
        ["f".repeat(64), "workspace-a", "resource-a"],
      ),
    ).rejects.toHaveProperty("code", "55000");
  });
});
