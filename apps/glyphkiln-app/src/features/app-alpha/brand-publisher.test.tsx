// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialPreviewForm } from "@/features/project-preview/document-builder";
import { createPreviewCatalog } from "@/lib/project-preview/catalog";

import { BrandPublisher } from "./brand-publisher";
import type { BrandPublishInput } from "./brand-publisher";

describe("BrandPublisher", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("submits only manually entered brand values for server publication", () => {
    const onPublish = vi.fn<(input: BrandPublishInput) => Promise<void>>((input) => {
      void input;
      return Promise.resolve();
    });
    act(() => {
      root.render(
        <BrandPublisher
          initialState={createInitialPreviewForm(createPreviewCatalog())}
          isPublishing={false}
          onPublish={onPublish}
        />,
      );
    });

    setInput("#published-brand-name", "Foundry & Field");
    setInput("#publish-primary", "#884422");
    clickButton("Publish immutable snapshot");

    expect(onPublish).toHaveBeenCalledTimes(1);
    const submitted = onPublish.mock.calls[0][0];
    expect(submitted.name).toBe("Foundry & Field");
    expect(submitted.snapshot.palette.primary).toBe("#884422");
    expect(submitted.snapshot).not.toHaveProperty("snapshotId");
    expect(submitted.snapshot).not.toHaveProperty("version");
  });

  function clickButton(label: string): void {
    const button = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === label,
    );
    if (button === undefined) {
      throw new Error(`Button “${label}” was not found.`);
    }
    act(() => {
      button.click();
    });
  }

  function setInput(selector: string, value: string): void {
    const input = container.querySelector<HTMLInputElement>(selector);
    if (input === null) throw new Error(`Input “${selector}” was not found.`);
    const setter = Reflect.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (setter === undefined) throw new Error("Input value setter was not found.");
    act(() => {
      Reflect.apply(setter, input, [value]);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
});
