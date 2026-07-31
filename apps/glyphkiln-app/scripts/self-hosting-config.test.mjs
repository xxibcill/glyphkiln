import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { repositoryRoot } from "./standalone-paths.mjs";

const deploymentRoot = join(repositoryRoot, "deploy", "self-host");
const [compose, grants, dockerIgnore, caddy] = await Promise.all([
  readFile(join(deploymentRoot, "compose.yaml"), "utf8"),
  readFile(join(deploymentRoot, "postgres-runtime-grants.sql"), "utf8"),
  readFile(join(repositoryRoot, ".dockerignore"), "utf8"),
  readFile(join(deploymentRoot, "Caddyfile.example"), "utf8"),
]);

describe("supported self-hosting boundary", () => {
  it("keeps runtime roles and networks separate", () => {
    expect(compose).toContain(
      "postgresql://glyphkiln_migrator:${GLYPHKILN_POSTGRES_MIGRATOR_PASSWORD",
    );
    expect(compose).toContain(
      "postgresql://glyphkiln_runtime:${GLYPHKILN_POSTGRES_RUNTIME_PASSWORD",
    );
    expect(compose).toContain(
      "postgresql://glyphkiln_worker:${GLYPHKILN_POSTGRES_WORKER_PASSWORD",
    );

    const clamDaemon = serviceBlock("clamav");
    const clamUpdater = serviceBlock("clamav-updater");
    const app = serviceBlock("app");
    const worker = serviceBlock("worker");
    expect(clamDaemon).toContain("CLAMAV_NO_FRESHCLAMD");
    expect(clamDaemon).toContain("- app-scanner");
    expect(clamDaemon).not.toContain("scanner-egress");
    expect(clamUpdater).toContain("CLAMAV_NO_CLAMD");
    expect(clamUpdater).toContain("- scanner-egress");
    expect(clamUpdater).not.toContain("- backend");
    expect(app).toContain("- app-scanner");
    expect(app).toContain(
      'GLYPHKILN_BOOTSTRAP_TOKEN: "${GLYPHKILN_BOOTSTRAP_TOKEN:-}"',
    );
    expect(app).toContain(
      'GLYPHKILN_WORKSPACE_MAX_PER_INSTALLATION: "${GLYPHKILN_WORKSPACE_MAX_PER_INSTALLATION:-100}"',
    );
    expect(app).toContain(
      'GLYPHKILN_WORKSPACE_MAX_PER_USER: "${GLYPHKILN_WORKSPACE_MAX_PER_USER:-5}"',
    );
    expect(app).toContain(
      'GLYPHKILN_RENDER_MAX_OUTSTANDING_PER_INSTALLATION: "${GLYPHKILN_RENDER_MAX_OUTSTANDING_PER_INSTALLATION:-1000}"',
    );
    expect(app).toContain(
      'GLYPHKILN_RENDER_MAX_OUTSTANDING_PER_WORKSPACE: "${GLYPHKILN_RENDER_MAX_OUTSTANDING_PER_WORKSPACE:-100}"',
    );
    expect(app).toContain(
      'GLYPHKILN_RESOURCE_MAX_INSTALLATION_STORED_BYTES: "${GLYPHKILN_RESOURCE_MAX_INSTALLATION_STORED_BYTES:-10737418240}"',
    );
    expect(app).toContain(
      'GLYPHKILN_RESOURCE_MAX_INSTALLATION_ADMISSIONS: "${GLYPHKILN_RESOURCE_MAX_INSTALLATION_ADMISSIONS:-100000}"',
    );
    expect(app).toContain(
      'GLYPHKILN_RESOURCE_MAX_ADMISSIONS: "${GLYPHKILN_RESOURCE_MAX_ADMISSIONS:-10000}"',
    );
    expect(app).toContain(
      'GLYPHKILN_RESOURCE_MAX_STORED_BYTES: "${GLYPHKILN_RESOURCE_MAX_STORED_BYTES:-1073741824}"',
    );
    expect(app).toContain(
      'GLYPHKILN_RESOURCE_SCAN_GLOBAL_CONCURRENCY: "${GLYPHKILN_RESOURCE_SCAN_GLOBAL_CONCURRENCY:-1}"',
    );
    expect(app).toContain(
      'GLYPHKILN_RESOURCE_SCAN_WORKSPACE_CONCURRENCY: "${GLYPHKILN_RESOURCE_SCAN_WORKSPACE_CONCURRENCY:-1}"',
    );
    expect(worker).not.toContain("app-scanner");
    expect(worker).not.toContain("clamav");
  });

  it("limits worker database privileges to render execution", () => {
    expect(grants).toContain("GRANT SELECT (id, disabled_at)");
    expect(grants).not.toMatch(/GRANT SELECT\s+ON users\s+TO glyphkiln_worker/u);
    expect(grants).toContain("GRANT UPDATE (\n    state,");
    expect(grants).not.toMatch(
      /GRANT (?:SELECT,\s*)?INSERT,\s*UPDATE,\s*DELETE[^;]*TO glyphkiln_worker/u,
    );
    expect(grants).toContain(
      "ON SEQUENCE render_claim_order_sequence\n  TO glyphkiln_worker;",
    );
    expect(grants).toContain(
      "ON render_attempts, render_outputs\n  TO glyphkiln_worker;",
    );
  });

  it("excludes populated environment files and denies framing", () => {
    expect(dockerIgnore).toContain("**/.env.*");
    expect(dockerIgnore).toContain("!**/.env.example");
    expect(caddy).toContain(`Content-Security-Policy "frame-ancestors 'none'"`);
    expect(caddy).toContain('X-Frame-Options "DENY"');
  });
});

function serviceBlock(serviceName) {
  const expression = new RegExp(
    `\\n  ${serviceName}:\\n([\\s\\S]*?)(?=\\n  [a-z][a-z0-9-]*:\\n|\\nvolumes:\\n)`,
    "u",
  );
  const match = expression.exec(compose);
  if (match === null) {
    throw new Error(`Missing Compose service ${serviceName}.`);
  }
  return match[0];
}
