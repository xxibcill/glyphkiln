import { describe, expect, it, vi } from "vitest";

import type {
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
