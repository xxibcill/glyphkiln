import { describe, expect, it, vi } from "vitest";

import type {
  AppQuery,
  AppResult,
  AppWorkflow,
  CommandReceipt,
  QueryProjection,
} from "@/server/app-workflow";

import { createQueryRoute } from "./route";

const ENDPOINT = "http://localhost/api/app/queries";

describe("POST /api/app/queries", () => {
  it("takes the opaque session only from the cookie", async () => {
    const read = vi.fn((): Promise<AppResult<QueryProjection>> =>
      Promise.resolve({
        ok: true,
        status: 200,
        value: {
          kind: "current-session",
          user: {
            id: "user-id",
            email: "owner@example.com",
            displayName: "Owner",
          },
          workspaces: [],
          expiresAt: "2026-08-30T01:00:00.000Z",
        },
      }),
    );
    const route = createQueryRoute({
      getWorkflow: () => Promise.resolve(workflowWith(read)),
      environment: { NODE_ENV: "test" },
    });
    const response = await route(
      request(
        { type: "session.current", sessionToken: "body-token-is-rejected" },
        { cookie: "gk_session=cookie-token" },
      ),
    );

    expect(response.status).toBe(422);
    expect(read).not.toHaveBeenCalled();

    const accepted = await route(
      request({ type: "session.current" }, { cookie: "gk_session=cookie-token" }),
    );
    expect(accepted.status).toBe(200);
    expect(read).toHaveBeenCalledWith({
      evidence: { sessionToken: "cookie-token" },
      query: { type: "session.current" },
    });
    expect(accepted.headers.get("cache-control")).toBe("no-store");
  });

  it("forwards campaign proposal, handoff, and exact-revision comparison queries", async () => {
    const queries = [
      {
        type: "campaign.proposal.run",
        workspaceId: "workspace-id",
        campaignId: "campaign-id",
        runId: "proposal-run-id",
      },
      {
        type: "campaign.handoff",
        workspaceId: "workspace-id",
        campaignId: "campaign-id",
        directionId: "direction-id",
      },
      {
        type: "revision.compare",
        workspaceId: "workspace-id",
        leftDesignId: "left-design-id",
        leftRevisionId: "left-revision-id",
        rightDesignId: "right-design-id",
        rightRevisionId: "right-revision-id",
      },
    ] as const satisfies readonly AppQuery[];
    const read = vi.fn<AppWorkflow["read"]>().mockResolvedValue({
      ok: false,
      status: 404,
      error: {
        code: "RESOURCE_NOT_FOUND",
        title: "Not found",
        detail: "The campaign test stops at the HTTP boundary.",
      },
    });
    const route = createQueryRoute({
      getWorkflow: () => Promise.resolve(workflowWith(read)),
      environment: { NODE_ENV: "test" },
    });

    const incompleteHandoff = await route(
      request({
        type: "campaign.handoff",
        workspaceId: "workspace-id",
        campaignId: "campaign-id",
      }),
    );
    expect(incompleteHandoff.status).toBe(422);
    expect(read).not.toHaveBeenCalled();

    for (const query of queries) {
      const response = await route(
        request(query, { cookie: "gk_session=cookie-token" }),
      );
      expect(response.status).toBe(404);
    }

    expect(read.mock.calls.map(([envelope]) => envelope)).toEqual(
      queries.map((query) => ({
        evidence: { sessionToken: "cookie-token" },
        query,
      })),
    );
  });
});

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
  });
}

function workflowWith(read: AppWorkflow["read"]): AppWorkflow {
  return {
    authorizeWorkspace: (): Promise<AppResult<never>> =>
      Promise.resolve({
        ok: false,
        status: 500,
        error: {
          code: "STORE_UNAVAILABLE",
          title: "Not used",
          detail: "Not used",
        },
      }),
    execute: (): Promise<AppResult<CommandReceipt>> =>
      Promise.resolve({
        ok: false,
        status: 500,
        error: {
          code: "STORE_UNAVAILABLE",
          title: "Not used",
          detail: "Not used",
        },
      }),
    read,
  };
}
