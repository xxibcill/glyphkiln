import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SqlDatabase } from "@/server/persistence/database";
import { migrateDatabase } from "@/server/persistence/migrations";
import { createPGliteDatabase } from "@/server/persistence/pglite-database";
import { InMemoryRenderBlobStorage } from "@/server/storage";

import { GET as live } from "./live/route";
import { createReadinessRoute } from "./ready/route";

describe("health routes", () => {
  let database: SqlDatabase;

  beforeEach(async () => {
    database = await createPGliteDatabase();
    await migrateDatabase(database);
  });

  afterEach(async () => {
    await database.close();
  });

  it("reports process liveness without touching dependencies", async () => {
    const response = live();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "glyphkiln-app",
      status: "live",
    });
  });

  it("requires the latest migration and a successful storage write/read probe", async () => {
    const storage = new InMemoryRenderBlobStorage();
    const response = await createReadinessRoute({
      getDatabase: () => Promise.resolve(database),
      getStorage: () => storage,
    })();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: "ready",
      checks: { database: "ready", storage: "ready" },
    });
  });

  it("returns a generic unavailable response without leaking dependency errors", async () => {
    const response = await createReadinessRoute({
      getDatabase: () =>
        Promise.reject(new Error("postgres://operator:secret@database")),
      getStorage: () => new InMemoryRenderBlobStorage(),
    })();
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain("operator");
    expect(body).not.toContain("secret");
    expect(JSON.parse(body)).toMatchObject({
      ok: false,
      status: "unavailable",
    });
  });
});
