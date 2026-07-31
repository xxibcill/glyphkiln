// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAppAlphaApi } from "./api-client";

describe("App Alpha API client", () => {
  afterEach(() => {
    document.cookie = "gk_csrf=; Max-Age=0; Path=/";
  });

  it("rejects a failure whose body status does not match HTTP status", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          {
            ok: false,
            status: 401,
            error: {
              code: "AUTH_REQUIRED",
              title: "Authentication required",
              detail: "Sign in.",
            },
          },
          403,
        ),
      ),
    );
    const api = createAppAlphaApi(fetchMock);

    await expect(api.currentSession()).resolves.toMatchObject({
      ok: false,
      status: 502,
      error: { code: "INVALID_APP_RESPONSE" },
    });
  });

  it("preserves structured validation problems from an aligned failure", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          {
            ok: false,
            status: 422,
            error: {
              code: "INVALID_INPUT",
              title: "Request needs attention",
              detail: "Review the command.",
              problems: [{ path: "name", code: "too_small", message: "Required" }],
            },
          },
          422,
        ),
      ),
    );
    const api = createAppAlphaApi(fetchMock);

    await expect(api.createWorkspace("")).resolves.toMatchObject({
      ok: false,
      error: {
        problems: [{ path: "name", code: "too_small", message: "Required" }],
      },
    });
  });

  it("sends the operator bootstrap token only in the first-run command", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
        jsonResponse(
          {
            ok: true,
            status: 201,
            value: {
              kind: "session-granted",
              user: {
                id: "owner-1",
                email: "owner@example.test",
                displayName: "Owner",
              },
              workspaces: [],
              expiresAt: "2026-08-30T01:00:00.000Z",
            },
          },
          201,
        ),
      );
    });
    const api = createAppAlphaApi(fetchMock);
    const bootstrapToken = "operator-bootstrap-token-for-client-test";

    await expect(
      api.bootstrap({
        bootstrapToken,
        displayName: "Owner",
        email: "owner@example.test",
        password: "correct horse battery staple",
        workspaceName: "Kiln Studio",
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        type: "bootstrap.register",
        bootstrapToken,
        displayName: "Owner",
        email: "owner@example.test",
        password: "correct horse battery staple",
        workspaceName: "Kiln Studio",
      }),
    );
  });

  it("sends a matching CSRF header for mutation commands without exposing the session", async () => {
    document.cookie = "gk_csrf=csrf-token-123; Path=/";
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
        jsonResponse(
          {
            ok: true,
            status: 201,
            value: {
              kind: "workspace-created",
              workspace: {
                id: "workspace-2",
                name: "Second workshop",
                slug: "second-workshop",
                role: "owner",
              },
            },
          },
          201,
        ),
      );
    });
    const api = createAppAlphaApi(fetchMock);

    await expect(api.createWorkspace("Second workshop")).resolves.toMatchObject({
      ok: true,
      value: { id: "workspace-2" },
    });
    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("x-glyphkiln-csrf")).toBe("csrf-token-123");
    expect(init?.body).toBe(
      JSON.stringify({ type: "workspace.create", name: "Second workshop" }),
    );
    expect(init?.body).not.toContain("session");
  });
});

function jsonResponse(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
