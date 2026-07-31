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
