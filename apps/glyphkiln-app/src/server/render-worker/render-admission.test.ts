import { describe, expect, it } from "vitest";

import { InProcessRenderAdmissionController } from "./render-admission";

describe("InProcessRenderAdmissionController", () => {
  it("fails fast without retaining a wait queue and releases capacity", async () => {
    const controller = new InProcessRenderAdmissionController({
      maximumGlobalOperations: 1,
      maximumWorkspaceOperations: 1,
    });
    let release: (() => void) | undefined;
    const held = controller.run(
      "workspace-a",
      () =>
        new Promise<string>((resolve) => {
          release = () => {
            resolve("rendered");
          };
        }),
    );

    await expect(
      controller.run("workspace-b", () => Promise.resolve("must-not-run")),
    ).resolves.toEqual({ accepted: false });
    release?.();
    await expect(held).resolves.toEqual({ accepted: true, value: "rendered" });
    await expect(
      controller.run("workspace-b", () => Promise.resolve("next")),
    ).resolves.toEqual({ accepted: true, value: "next" });
  });

  it("enforces a workspace partition below the global limit", async () => {
    const controller = new InProcessRenderAdmissionController({
      maximumGlobalOperations: 2,
      maximumWorkspaceOperations: 1,
    });
    let release: (() => void) | undefined;
    const held = controller.run(
      "workspace-a",
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    await expect(
      controller.run("workspace-a", () => Promise.resolve()),
    ).resolves.toEqual({ accepted: false });
    await expect(
      controller.run("workspace-b", () => Promise.resolve("independent")),
    ).resolves.toEqual({ accepted: true, value: "independent" });
    release?.();
    await held;
  });
});
