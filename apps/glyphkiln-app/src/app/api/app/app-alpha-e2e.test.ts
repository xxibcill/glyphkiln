import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  renderGraphic,
  verifyRenderReproduction,
  type DesignLayer,
} from "@glyphkiln/core";

import { createProjectPreview } from "@/lib/project-preview/render-preview";
import {
  createAppWorkflow,
  type AppResult,
  type BrandSnapshotDraft,
  type CommandReceipt,
  type ManualDraft,
  type QueryProjection,
} from "@/server/app-workflow";
import {
  createPGliteDatabase,
  type PGliteDatabase,
} from "@/server/persistence/pglite-database";
import { migrateDatabase } from "@/server/persistence/migrations";
import {
  hashSecret,
  type Clock,
  type PasswordHasher,
  type SecretFactory,
} from "@/server/security";

import { createCommandRoute } from "./commands/route";
import { createQueryRoute } from "./queries/route";

const NOW = new Date("2026-07-31T02:00:00.000Z");
const ORIGIN = "http://localhost";
const BOOTSTRAP_TOKEN = "operator-bootstrap-token-for-http-e2e";

describe("App Alpha manual HTTP workflow", () => {
  let database: PGliteDatabase;

  beforeEach(async () => {
    database = await createPGliteDatabase();
    await migrateDatabase(database);
  });

  afterEach(async () => {
    await database.close();
  });

  it("creates, previews, saves, reopens, revises, and reproduces exact exports", async () => {
    const workflow = createAppWorkflow({
      database,
      bootstrapTokenHash: hashSecret(BOOTSTRAP_TOKEN),
      clock: fixedClock,
      passwordHasher: new TestPasswordHasher(),
      secretFactory: new DeterministicSecretFactory(),
      campaignWorkflowEnabled: true,
      render: async (document) =>
        (
          await createProjectPreview(document, {
            render: async (input, options) => renderGraphic(input, options),
            now: () => NOW,
          })
        ).body,
    });
    const commands = createCommandRoute({
      getWorkflow: () => Promise.resolve(workflow),
      environment: { NODE_ENV: "test" },
    });
    const queries = createQueryRoute({
      getWorkflow: () => Promise.resolve(workflow),
      environment: { NODE_ENV: "test" },
    });

    const registration = await commands(
      request({
        type: "bootstrap.register",
        bootstrapToken: BOOTSTRAP_TOKEN,
        displayName: "Owner",
        email: "owner@example.com",
        password: "correct horse battery staple",
        workspaceName: "Kiln Studio",
      }),
    );
    expect(registration.status).toBe(201);
    const registrationText = await registration.clone().text();
    expect(registrationText).not.toContain("session-token");
    const browserSession = readBrowserSession(registration);
    const registered = parseSuccess(
      JSON.parse(registrationText) as unknown,
    ) as CommandReceipt;
    expect(registered.kind).toBe("session-granted");
    if (registered.kind !== "session-granted") {
      throw new Error("Expected a session grant.");
    }
    const workspaceId = registered.workspaces.at(0)?.id;
    if (workspaceId === undefined) throw new Error("Workspace missing.");

    const brand = parseReceipt(
      await mutate(commands, browserSession, {
        type: "brand.publish",
        workspaceId,
        name: "Kiln Brand",
        snapshot: brandDraft(),
      }),
      "brand-snapshot-published",
    );

    const preview = parseReceipt(
      await mutate(commands, browserSession, {
        type: "design.preview",
        workspaceId,
        brandSnapshotId: brand.snapshotId,
        draft: manualDraft("Unsigned preview"),
      }),
      "design-previewed",
    );
    expect(preview.document.id).toMatch(/^preview_/u);
    expect(preview.outputs.map((output) => output.format)).toEqual(["svg", "png"]);

    const firstSave = parseReceipt(
      await mutate(commands, browserSession, {
        type: "design.create",
        workspaceId,
        name: "Launch proof",
        brandSnapshotId: brand.snapshotId,
        draft: manualDraft("First saved revision"),
      }),
      "design-saved",
    );
    expect(firstSave.document.id).toBe(firstSave.designId);

    const reopenedFirst = parseProjection(
      await query(queries, browserSession, {
        type: "design.revision",
        workspaceId,
        designId: firstSave.designId,
        revision: { revisionId: firstSave.revisionId },
      }),
      "design-revision",
    );
    expect(reopenedFirst.documentHash).toBe(firstSave.documentHash);
    expect(reopenedFirst.document).toEqual(firstSave.document);

    const revised = parseReceipt(
      await mutate(commands, browserSession, {
        type: "design.revise",
        workspaceId,
        designId: firstSave.designId,
        baseRevisionId: firstSave.revisionId,
        brandSnapshotId: brand.snapshotId,
        draft: manualDraft("Second saved revision"),
        changeNote: "Revise the message",
      }),
      "design-saved",
    );
    expect(revised.revisionNumber).toBe(2);

    const reopenedOriginalAgain = parseProjection(
      await query(queries, browserSession, {
        type: "design.revision",
        workspaceId,
        designId: firstSave.designId,
        revision: { revisionId: firstSave.revisionId },
      }),
      "design-revision",
    );
    expect(reopenedOriginalAgain.document).toEqual(reopenedFirst.document);

    const rendered = parseReceipt(
      await mutate(commands, browserSession, {
        type: "revision.render",
        workspaceId,
        designId: firstSave.designId,
        revisionId: firstSave.revisionId,
      }),
      "revision-rendered",
    );
    expect(rendered.document).toEqual(reopenedFirst.document);
    for (const output of rendered.outputs) {
      const reproductionIssues = verifyRenderReproduction({
        document: rendered.document,
        bytes: Buffer.from(output.base64, "base64"),
        manifest: output.manifest,
      });
      expect(reproductionIssues.filter((issue) => issue.severity === "error")).toEqual(
        [],
      );
      expect(output.manifest.designDocumentId).toBe(firstSave.designId);
    }

    const campaign = parseReceipt(
      await mutate(commands, browserSession, {
        type: "campaign.create",
        workspaceId,
        name: "HTTP campaign",
        brief: "Coordinate exact saved revisions through the HTTP workflow.",
        campaignSeed: "http-campaign-seed",
        familyId: "image-led-campaign",
      }),
      "campaign-created",
    ).campaign;
    const direction = parseReceipt(
      await mutate(commands, browserSession, {
        type: "campaign.direction.create",
        workspaceId,
        campaignId: campaign.id,
        directionKey: "editorial-a",
        name: "Editorial A",
        locks: ["copy", "palette"],
      }),
      "campaign-direction-created",
    ).direction;
    const branch = parseReceipt(
      await mutate(commands, browserSession, {
        type: "campaign.direction.branch",
        workspaceId,
        campaignId: campaign.id,
        sourceDirectionId: direction.id,
        directionKey: "editorial-b",
        name: "Editorial B",
      }),
      "campaign-direction-created",
    ).direction;
    expect(branch.locks).toEqual(direction.locks);

    const board = parseProjection(
      await query(queries, browserSession, {
        type: "campaign.board",
        workspaceId,
        campaignId: campaign.id,
      }),
      "campaign-board",
    );
    expect(board.directions).toMatchObject([
      { id: direction.id, directionKey: "editorial-a", canvases: [] },
      { id: branch.id, directionKey: "editorial-b", canvases: [] },
    ]);

    const comparison = parseProjection(
      await query(queries, browserSession, {
        type: "revision.compare",
        workspaceId,
        leftDesignId: firstSave.designId,
        leftRevisionId: firstSave.revisionId,
        rightDesignId: revised.designId,
        rightRevisionId: revised.revisionId,
      }),
      "revision-comparison",
    );
    expect(comparison.left.revision.document).toEqual(firstSave.document);
    expect(comparison.right.revision.document).toEqual(revised.document);
    expect(comparison.left.outputs.map((output) => output.format)).toEqual([
      "svg",
      "png",
    ]);
    expect(comparison.right.outputs.map((output) => output.format)).toEqual([
      "svg",
      "png",
    ]);

    await expectWorkflowFailure(
      commands,
      browserSession,
      {
        type: "campaign.proposals.request",
        workspaceId,
        campaignId: campaign.id,
        directionId: direction.id,
        baseCanvasId: "missing-canvas",
        candidateCount: 3,
      },
      503,
      "AI_AUTHORING_DISABLED",
    );
    await expectWorkflowFailure(
      queries,
      browserSession,
      {
        type: "campaign.handoff",
        workspaceId,
        campaignId: campaign.id,
      },
      422,
      "INVALID_CAMPAIGN_CANVAS",
    );
  });
});

type BrowserSession = {
  cookie: string;
  csrfToken: string;
};

function readBrowserSession(response: Response): BrowserSession {
  const cookies = response.headers.getSetCookie().map((cookie) => {
    const pair = cookie.split(";", 1).at(0);
    if (pair === undefined) throw new Error("Malformed Set-Cookie header.");
    return pair;
  });
  const csrfPair = cookies.find((cookie) => cookie.startsWith("gk_csrf="));
  if (csrfPair === undefined) throw new Error("CSRF cookie missing.");
  return {
    cookie: cookies.join("; "),
    csrfToken: decodeURIComponent(csrfPair.slice("gk_csrf=".length)),
  };
}

async function mutate(
  route: (request: Request) => Promise<Response>,
  session: BrowserSession,
  body: unknown,
): Promise<unknown> {
  const response = await route(
    request(body, {
      cookie: session.cookie,
      "x-glyphkiln-csrf": session.csrfToken,
    }),
  );
  expect(response.status).toBeLessThan(400);
  return response.json() as Promise<unknown>;
}

async function query(
  route: (request: Request) => Promise<Response>,
  session: BrowserSession,
  body: unknown,
): Promise<unknown> {
  const response = await route(request(body, { cookie: session.cookie }));
  expect(response.status).toBe(200);
  return response.json() as Promise<unknown>;
}

async function expectWorkflowFailure(
  route: (request: Request) => Promise<Response>,
  session: BrowserSession,
  body: unknown,
  status: number,
  code: string,
): Promise<void> {
  const response = await route(
    request(body, {
      cookie: session.cookie,
      "x-glyphkiln-csrf": session.csrfToken,
    }),
  );
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    status,
    error: { code },
  });
}

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/app`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      ...headers,
    },
  });
}

function parseSuccess(input: unknown): unknown {
  const result = input as AppResult<unknown>;
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Unexpected ${result.error.code}.`);
  return result.value;
}

function parseReceipt<Kind extends CommandReceipt["kind"]>(
  input: unknown,
  kind: Kind,
): Extract<CommandReceipt, { kind: Kind }> {
  const receipt = parseSuccess(input) as CommandReceipt;
  expect(receipt.kind).toBe(kind);
  if (receipt.kind !== kind) throw new Error(`Expected ${kind}.`);
  return receipt as Extract<CommandReceipt, { kind: Kind }>;
}

function parseProjection<Kind extends QueryProjection["kind"]>(
  input: unknown,
  kind: Kind,
): Extract<QueryProjection, { kind: Kind }> {
  const projection = parseSuccess(input) as QueryProjection;
  expect(projection.kind).toBe(kind);
  if (projection.kind !== kind) throw new Error(`Expected ${kind}.`);
  return projection as Extract<QueryProjection, { kind: Kind }>;
}

function brandDraft(): BrandSnapshotDraft {
  return {
    palette: {
      primary: "#A4462A",
      secondary: "#47665C",
      accent: "#CB6D3C",
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

function manualDraft(text: string): ManualDraft {
  return {
    templateId: "quote-card",
    format: "instagram-square",
    seed: "http-e2e-seed",
    mode: "light",
    layers: quoteLayers(text),
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

class DeterministicSecretFactory implements SecretFactory {
  #counter = 0;

  createToken(): string {
    this.#counter += 1;
    return `session-token-${this.#counter.toString().padStart(48, "0")}`;
  }

  createId(): string {
    this.#counter += 1;
    return `00000000-0000-4000-8000-${this.#counter.toString().padStart(12, "0")}`;
  }
}

const fixedClock: Clock = {
  now: () => new Date(NOW),
};
