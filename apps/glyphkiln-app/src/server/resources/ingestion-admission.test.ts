import { describe, expect, it } from "vitest";

import { InProcessResourceIngestionAdmissionController } from "./ingestion-admission";

function deferred<Result>(): {
  promise: Promise<Result>;
  resolve(value: Result): void;
} {
  let resolvePromise: ((value: Result) => void) | undefined;
  const promise = new Promise<Result>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value) {
      resolvePromise?.(value);
    },
  };
}

describe("in-process resource-ingestion admission", () => {
  it("rejects instead of queueing beyond workspace and global bounds", async () => {
    const controller = new InProcessResourceIngestionAdmissionController({
      maximumGlobalOperations: 2,
      maximumWorkspaceOperations: 1,
    });
    const first = deferred<string>();
    const second = deferred<string>();
    const firstOperation = controller.run("workspace-a", () => first.promise);

    await expect(
      controller.run("workspace-a", () => Promise.resolve("unexpected")),
    ).rejects.toHaveProperty("code", "RESOURCE_CAPACITY_REACHED");

    const secondOperation = controller.run("workspace-b", () => second.promise);
    await expect(
      controller.run("workspace-c", () => Promise.resolve("unexpected")),
    ).rejects.toHaveProperty("code", "RESOURCE_CAPACITY_REACHED");

    first.resolve("first");
    await expect(firstOperation).resolves.toBe("first");
    await expect(
      controller.run("workspace-c", () => Promise.resolve("third")),
    ).resolves.toBe("third");

    second.resolve("second");
    await expect(secondOperation).resolves.toBe("second");
  });

  it("releases capacity after a failed operation", async () => {
    const controller = new InProcessResourceIngestionAdmissionController({
      maximumGlobalOperations: 1,
      maximumWorkspaceOperations: 1,
    });

    await expect(
      controller.run("workspace-a", () => Promise.reject(new Error("failed"))),
    ).rejects.toThrow("failed");
    await expect(
      controller.run("workspace-a", () => Promise.resolve("recovered")),
    ).resolves.toBe("recovered");
  });
});
