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
});

class RecordingTransaction implements SqlTransaction {
  readonly statements: {
    statement: string;
    parameters: SqlParameters;
  }[] = [];

  query<Row extends SqlRow = SqlRow>(
    statement: string,
    parameters: SqlParameters = [],
  ): Promise<Row[]> {
    this.statements.push({ statement, parameters });
    return Promise.resolve([]);
  }
}
