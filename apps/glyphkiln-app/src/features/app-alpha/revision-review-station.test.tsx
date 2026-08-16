// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPreviewDesign } from "@/test/preview-design";

import { createAppAlphaApi } from "./api-client";
import type { DesignRevision } from "./api-client";
import { RevisionReviewStation } from "./revision-review-station";

const NOW = "2026-08-12T01:00:00.000Z";

describe("RevisionReviewStation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    document.cookie = "gk_csrf=review-ui-proof; Path=/";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.cookie = "gk_csrf=; Max-Age=0; Path=/";
    container.remove();
  });

  it("submits the exact revision and keeps unapproved state explicit", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(requestBody(init?.body)) as { type: string };
      if (body.type === "revision.review") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: false,
              status: 404,
              error: {
                code: "RESOURCE_NOT_FOUND",
                title: "Review unavailable",
                detail: "This revision has not been submitted.",
              },
            }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (body.type === "render.jobs.completed") {
        return Promise.resolve(
          success(200, { kind: "completed-render-jobs", jobs: [] }),
        );
      }
      if (body.type === "revision.review.submit") {
        return Promise.resolve(
          success(201, {
            kind: "revision-review-submitted",
            review: reviewFixture(),
          }),
        );
      }
      throw new Error(`Unexpected review API request: ${body.type}`);
    });
    const revision = revisionFixture();

    await act(async () => {
      root.render(
        <RevisionReviewStation
          api={createAppAlphaApi(fetchMock)}
          workspaceId="workspace-1"
          revision={revision}
          canManage
          canApprove
        />,
      );
      await flushEffects();
    });

    expect(container.textContent).toContain("NOT STARTED");
    await clickButton("Submit exact revision");
    expect(container.textContent).toContain("IN-REVIEW");
    expect(container.textContent).toContain("Approval receipt");
    expect(container.textContent).toContain("Unapproved.");
    expect(requestBodies(fetchMock)).toContainEqual({
      type: "revision.review.submit",
      workspaceId: "workspace-1",
      designId: revision.designId,
      revisionId: revision.revisionId,
    });
  });

  it("resubmits a changes-requested revision for review", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(requestBody(init?.body)) as { type: string };
      if (body.type === "revision.review") {
        return Promise.resolve(success(200, reviewFixture("changes-requested")));
      }
      if (body.type === "render.jobs.completed") {
        return Promise.resolve(
          success(200, { kind: "completed-render-jobs", jobs: [] }),
        );
      }
      if (body.type === "revision.review.submit") {
        return Promise.resolve(
          success(201, {
            kind: "revision-review-submitted",
            review: reviewFixture("in-review"),
          }),
        );
      }
      throw new Error(`Unexpected review API request: ${body.type}`);
    });
    const revision = revisionFixture();

    await act(async () => {
      root.render(
        <RevisionReviewStation
          api={createAppAlphaApi(fetchMock)}
          workspaceId="workspace-1"
          revision={revision}
          canManage
          canApprove
        />,
      );
      await flushEffects();
    });

    expect(container.textContent).toContain("CHANGES-REQUESTED");
    await clickButton("Resubmit exact revision");
    expect(container.textContent).toContain("IN-REVIEW");
    expect(requestBodies(fetchMock)).toContainEqual({
      type: "revision.review.submit",
      workspaceId: "workspace-1",
      designId: revision.designId,
      revisionId: revision.revisionId,
    });
  });

  async function clickButton(label: string): Promise<void> {
    const button = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === label,
    );
    if (button === undefined) throw new Error(`Button “${label}” was not found.`);
    await act(async () => {
      button.click();
      await flushEffects();
    });
  }
});

function revisionFixture(): DesignRevision {
  return {
    kind: "design-revision",
    designId: "design-1",
    designName: "Launch proof",
    revisionId: "revision-1",
    revisionNumber: 1,
    brandSnapshotId: "brand-1",
    documentHash: "a".repeat(64),
    document: createPreviewDesign(),
    createdAt: NOW,
  };
}

function reviewFixture(state: "in-review" | "changes-requested" = "in-review") {
  const user = {
    id: "owner-1",
    email: "owner@example.test",
    displayName: "Owner",
  };
  return {
    kind: "revision-review",
    id: "review-1",
    workspaceId: "workspace-1",
    designId: "design-1",
    revisionId: "revision-1",
    state,
    startedBy: user,
    startedAt: NOW,
    updatedBy: user,
    updatedAt: NOW,
    comments: [],
    transitions: [
      {
        id: "transition-1",
        toState: state,
        createdBy: user,
        createdAt: NOW,
      },
    ],
  };
}

function success(status: 200 | 201, value: unknown): Response {
  return new Response(JSON.stringify({ ok: true, status, value }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestBody(body: BodyInit | null | undefined): string {
  if (typeof body !== "string") throw new Error("Expected a JSON request body.");
  return body;
}

function requestBodies(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls.map((call) =>
    parseUnknownJson(requestBody((call[1] as RequestInit | undefined)?.body)),
  );
}

function parseUnknownJson(input: string): unknown {
  return JSON.parse(input) as unknown;
}

function flushEffects(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
