import { describe, expect, it, vi } from "vitest";

import type {
  AppResult,
  AppWorkflow,
  CommandEnvelope,
  CommandReceipt,
  QueryProjection,
} from "@/server/app-workflow";
import type { AuthenticationWorkAdmission } from "@/server/security";

import { createCommandRoute } from "./route";

const ENDPOINT = "http://localhost/api/app/commands";

describe("POST /api/app/commands", () => {
  it("rejects cross-origin requests before resolving the application runtime", async () => {
    const getWorkflow = vi.fn<() => Promise<AppWorkflow>>();
    const route = createCommandRoute({
      getWorkflow,
      environment: { NODE_ENV: "test" },
    });
    const response = await route(
      request({ type: "session.logout" }, { origin: "https://attacker.example" }),
    );

    expect(response.status).toBe(403);
    expect(getWorkflow).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CSRF_ORIGIN_REJECTED" },
    });
  });

  it("sets strict cookies but never serializes raw session credentials", async () => {
    const execute = vi.fn((): Promise<AppResult<CommandReceipt>> =>
      Promise.resolve({
        ok: true,
        status: 201,
        value: {
          kind: "session-granted",
          sessionToken: "server-session-token",
          csrfToken: "browser-csrf-token",
          expiresAt: "2026-08-30T01:00:00.000Z",
          user: {
            id: "user-id",
            email: "owner@example.com",
            displayName: "Owner",
          },
          workspaces: [],
        },
      }),
    );
    const route = createCommandRoute({
      getWorkflow: () => Promise.resolve(workflowWith(execute)),
      environment: {
        NODE_ENV: "test",
        GLYPHKILN_PUBLIC_ORIGIN: "https://kiln.example",
      },
    });
    const response = await route(
      request(
        {
          type: "bootstrap.register",
          bootstrapToken: "operator-bootstrap-token-for-route-test",
          displayName: "Owner",
          email: "owner@example.com",
          password: "correct horse battery staple",
          workspaceName: "Kiln Studio",
        },
        { origin: "https://kiln.example" },
      ),
    );
    const bodyText = await response.text();
    const setCookies = response.headers.getSetCookie();

    expect(response.status).toBe(201);
    expect(bodyText).not.toContain("server-session-token");
    expect(bodyText).not.toContain("browser-csrf-token");
    expect(setCookies).toEqual(
      expect.arrayContaining([
        expect.stringContaining("gk_session=server-session-token"),
        expect.stringContaining("gk_csrf=browser-csrf-token"),
      ]),
    );
    const sessionCookie = setCookies.find((cookie) => cookie.startsWith("gk_session="));
    const csrfCookie = setCookies.find((cookie) => cookie.startsWith("gk_csrf="));
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=strict");
    expect(sessionCookie).toContain("Secure");
    expect(csrfCookie).not.toContain("HttpOnly");
  });

  it("passes only matching cookie/header CSRF evidence to the workflow", async () => {
    const execute = vi.fn(
      (envelope: CommandEnvelope): Promise<AppResult<CommandReceipt>> =>
        Promise.resolve({
          ok: false,
          status: 403,
          error: {
            code: "CSRF_REJECTED",
            title: "Rejected",
            detail: envelope.evidence.csrfToken ?? "missing",
          },
        }),
    );
    const route = createCommandRoute({
      getWorkflow: () => Promise.resolve(workflowWith(execute)),
      environment: { NODE_ENV: "test" },
    });
    await route(
      request(
        { type: "session.logout" },
        {
          cookie: "gk_session=session; gk_csrf=csrf-cookie",
          "x-glyphkiln-csrf": "different-header",
        },
      ),
    );

    expect(execute).toHaveBeenCalledWith({
      evidence: { sessionToken: "session", csrfToken: undefined },
      command: { type: "session.logout" },
    });
  });

  it("clears the browser session after a successful self-revocation", async () => {
    const execute = vi.fn((): Promise<AppResult<CommandReceipt>> =>
      Promise.resolve({
        ok: true,
        status: 200,
        value: {
          kind: "workspace-member-revoked",
          workspaceId: "workspace-id",
          userId: "user-id",
          currentSessionRevoked: true,
        },
      }),
    );
    const route = createCommandRoute({
      getWorkflow: () => Promise.resolve(workflowWith(execute)),
      environment: { NODE_ENV: "test" },
    });
    const response = await route(
      request(
        {
          type: "workspace.member.revoke",
          workspaceId: "workspace-id",
          userId: "user-id",
        },
        {
          cookie: "gk_session=session; gk_csrf=csrf",
          "x-glyphkiln-csrf": "csrf",
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("gk_session=;"),
        expect.stringContaining("gk_csrf=;"),
      ]),
    );
  });

  it("gives throttled sign-in clients a bounded retry hint", async () => {
    const execute = vi.fn((): Promise<AppResult<CommandReceipt>> =>
      Promise.resolve({
        ok: false,
        status: 429,
        error: {
          code: "AUTH_THROTTLED",
          title: "Sign in temporarily paused",
          detail: "Wait before trying again.",
        },
      }),
    );
    const route = createCommandRoute({
      getWorkflow: () => Promise.resolve(workflowWith(execute)),
      environment: { NODE_ENV: "test" },
    });
    const response = await route(
      request({
        type: "session.login",
        email: "owner@example.com",
        password: "correct horse battery staple",
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("900");
  });

  it("rejects excess concurrent password work before resolving the workflow", async () => {
    const getWorkflow = vi.fn<() => Promise<AppWorkflow>>();
    const authenticationAdmission: AuthenticationWorkAdmission = {
      run: () => Promise.resolve({ accepted: false }),
    };
    const route = createCommandRoute({
      getWorkflow,
      environment: { NODE_ENV: "test" },
      authenticationAdmission,
    });

    const response = await route(
      request({
        type: "session.login",
        email: "owner@example.com",
        password: "correct horse battery staple",
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(getWorkflow).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTH_CAPACITY_REACHED" },
    });
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

function workflowWith(execute: AppWorkflow["execute"]): AppWorkflow {
  return {
    execute,
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
    read: (): Promise<AppResult<QueryProjection>> =>
      Promise.resolve({
        ok: false,
        status: 500,
        error: {
          code: "STORE_UNAVAILABLE",
          title: "Not used",
          detail: "Not used",
        },
      }),
  };
}
