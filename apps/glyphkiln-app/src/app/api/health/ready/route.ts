import { NextResponse } from "next/server";

import type { SqlDatabase } from "@/server/persistence/database";
import type { RenderBlobStorage } from "@/server/storage";
import { createRenderBlobStorageFromEnvironment } from "@/server/storage/configured-storage";
import { getAppRuntime } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
};
const HEALTH_BYTES = new TextEncoder().encode('{"health":"glyphkiln-ready-v1"}\n');

type ReadinessDependencies = {
  readonly getDatabase: () => Promise<SqlDatabase>;
  readonly getStorage: () => RenderBlobStorage;
};

const DEFAULT_DEPENDENCIES: ReadinessDependencies = {
  getDatabase: async () => (await getAppRuntime()).database,
  getStorage: () => createRenderBlobStorageFromEnvironment(process.env),
};

export function createReadinessRoute(
  dependencies: ReadinessDependencies = DEFAULT_DEPENDENCIES,
): () => Promise<NextResponse> {
  return async () => {
    try {
      const [database, storage] = await Promise.all([
        dependencies.getDatabase(),
        Promise.resolve(dependencies.getStorage()),
      ]);
      const migrations = await database.query<{ version: string }>(
        `SELECT version
           FROM schema_migrations
          WHERE version = $1`,
        ["202607310003_async_render_jobs"],
      );
      if (migrations[0]?.version !== "202607310003_async_render_jobs") {
        throw new Error("render migration missing");
      }
      await storage.ready();
      const stored = await storage.put({
        workspaceId: "__installation_health__",
        purpose: "render-manifest",
        mediaType: "application/vnd.glyphkiln.manifest+json",
        bytes: HEALTH_BYTES,
      });
      const read = await storage.read(stored);
      if (!bytesEqual(read, HEALTH_BYTES)) {
        throw new Error("storage probe mismatch");
      }
      return NextResponse.json(
        {
          ok: true,
          service: "glyphkiln-app",
          status: "ready",
          checks: { database: "ready", storage: "ready" },
        },
        { status: 200, headers: HEADERS },
      );
    } catch {
      return NextResponse.json(
        {
          ok: false,
          service: "glyphkiln-app",
          status: "unavailable",
          checks: { database: "unknown", storage: "unknown" },
        },
        { status: 503, headers: HEADERS },
      );
    }
  };
}

export const GET = createReadinessRoute();

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
