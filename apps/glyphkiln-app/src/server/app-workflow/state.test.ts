import { describe, expect, it } from "vitest";

import type {
  SqlParameters,
  SqlRow,
  SqlTransaction,
} from "@/server/persistence/database";

import { AppState } from "./state";

describe("AppState", () => {
  it("workspace-qualifies invitation acceptance", async () => {
    const database = new RecordingTransaction();
    const state = new AppState(database);

    await state.acceptInvitation(
      "workspace-1",
      "invitation-1",
      "user-1",
      new Date("2026-07-31T01:00:00.000Z"),
    );

    expect(database.statements).toHaveLength(1);
    expect(database.statements[0]?.statement).toMatch(
      /WHERE workspace_id = \$1\s+AND id = \$2/u,
    );
    expect(database.statements[0]?.parameters).toEqual([
      "workspace-1",
      "invitation-1",
      "user-1",
      new Date("2026-07-31T01:00:00.000Z"),
    ]);
  });

  it("locks a workspace-qualified campaign direction before canvas attachment", async () => {
    const database = new RecordingTransaction();
    const state = new AppState(database);

    await expect(
      state.lockCampaignDirection({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        directionId: "direction-1",
      }),
    ).resolves.toBeUndefined();

    expect(database.statements).toHaveLength(1);
    expect(database.statements[0]?.statement).toMatch(
      /WHERE workspace_id = \$1\s+AND campaign_id = \$2\s+AND id = \$3\s+FOR UPDATE/u,
    );
    expect(database.statements[0]?.parameters).toEqual([
      "workspace-1",
      "campaign-1",
      "direction-1",
    ]);
  });

  it("resolves campaign lock contexts through revision ancestry", async () => {
    const database = new RecordingTransaction();
    const state = new AppState(database);

    await expect(
      state.listCampaignLockContextsForRevision({
        workspaceId: "workspace-1",
        designId: "design-1",
        revisionId: "revision-3",
      }),
    ).resolves.toEqual([]);

    expect(database.statements).toHaveLength(1);
    expect(database.statements[0]?.statement).toMatch(
      /WITH RECURSIVE revision_ancestry[\s\S]+parent\.id = child\.parent_revision_id[\s\S]+ancestor\.id = canvas\.revision_id/u,
    );
    expect(database.statements[0]?.parameters).toEqual([
      "workspace-1",
      "design-1",
      "revision-3",
    ]);
  });

  it("bounds proposal-run summaries per campaign direction", async () => {
    const createdAt = new Date("2026-08-12T01:00:00.000Z");
    const database = new RecordingTransaction([
      [
        {
          id: "campaign-1",
          workspace_id: "workspace-1",
          name: "Campaign",
          brief: "A bounded proposal history.",
          campaign_seed: "campaign-seed",
          family_id: "image-led-campaign",
          created_at: createdAt,
          updated_at: createdAt,
        },
      ],
      [
        {
          id: "direction-1",
          direction_key: "direction-a",
          name: "Direction A",
          created_at: createdAt,
        },
      ],
      [],
      [],
      Array.from({ length: 21 }, (_, index) => ({
        id: `run-${index.toString().padStart(2, "0")}`,
        direction_id: "direction-1",
        provider_id: "provider-1",
        model_id: "model-1",
        candidate_count: 3,
        decided_count: 0,
        accepted_count: 0,
        created_at: createdAt,
      })),
    ]);
    const board = await new AppState(database).readCampaignBoard(
      "workspace-1",
      "campaign-1",
    );

    expect(board?.directions[0]?.proposalRuns).toHaveLength(20);
    expect(board?.directions[0]?.proposalRunsTruncated).toBe(true);
    expect(database.statements[4]?.statement).toMatch(
      /row_number\(\) OVER[\s\S]+history_ordinal <= \$3/u,
    );
    expect(database.statements[4]?.parameters).toEqual([
      "workspace-1",
      "campaign-1",
      21,
    ]);
  });
});

class RecordingTransaction implements SqlTransaction {
  readonly statements: {
    statement: string;
    parameters: SqlParameters;
  }[] = [];
  readonly #results: SqlRow[][];

  constructor(results: SqlRow[][] = []) {
    this.#results = [...results];
  }

  query<Row extends SqlRow = SqlRow>(
    statement: string,
    parameters: SqlParameters = [],
  ): Promise<Row[]> {
    this.statements.push({ statement, parameters });
    return Promise.resolve((this.#results.shift() ?? []) as Row[]);
  }
}
