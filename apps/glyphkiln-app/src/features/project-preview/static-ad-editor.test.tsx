// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPreviewCatalog } from "@/lib/project-preview/catalog";
import { createInitialPreviewForm, buildPreviewDocument } from "./document-builder";
import { EditorControls } from "./editor-controls";
import type { EditorSelectableResource, PreviewFormState } from "./types";

const catalog = createPreviewCatalog();
const resources: EditorSelectableResource[] = ["product", "person", "mark"].map(
  (id) => ({
    id,
    kind: "raster-asset",
    mediaType: "image/png",
    contentHash: "a".repeat(64),
    width: 100,
    height: 100,
    origin: { kind: "user-upload" },
    license: { status: "owned" },
  }),
);

describe("static ad editor interactions", () => {
  let container: HTMLDivElement;
  let root: Root;
  let state: PreviewFormState;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    state = createInitialPreviewForm(catalog);
  });
  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
  function paint(): void {
    root.render(
      <EditorControls
        catalog={catalog}
        state={state}
        resources={resources}
        response={null}
        isRendering={false}
        hasUnrenderedEdits={true}
        validationIsStale={false}
        onStateChange={(next) => {
          state = next;
          paint();
        }}
        onRender={() => undefined}
      />,
    );
  }
  function button(label: string): HTMLButtonElement {
    const result = [...container.querySelectorAll("button")].find(
      (item) => item.textContent === label,
    );
    if (!result) throw new Error(`Missing ${label}`);
    return result;
  }
  function select(id: string, value: string): void {
    const control = container.querySelector<HTMLSelectElement>(`#${id}`);
    if (!control) throw new Error(`Missing ${id}`);
    act(() => {
      control.value = value;
      control.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  it("bounds comparison rows and keeps edited values when removing another row", () => {
    state.composition.templateId = "comparison";
    act(paint);
    act(() => {
      button("Add criterion").click();
    });
    expect(state.copy.staticAds.comparison.rows).toHaveLength(3);
    expect(button("Add criterion").disabled).toBe(true);
    const control = container.querySelector<HTMLInputElement>("#comparison-2-right");
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    );
    if (!control || !descriptor?.set) throw new Error("Missing comparison input");
    act(() => {
      descriptor.set?.call(control, "Supplied final fact");
      control.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      button("Remove criterion 1").click();
    });
    expect(state.copy.staticAds.comparison.rows.at(-1)?.right).toBe(
      "Supplied final fact",
    );
    act(() => {
      button("Remove criterion 1").click();
    });
    expect(button("Remove criterion 1").disabled).toBe(true);
    expect(state.copy.staticAds.comparison.rows).toHaveLength(1);
  });
  it("keeps portrait, product and logo selections independent and clears incompatible roles on template change", () => {
    state.composition.templateId = "testimonial-evidence";
    act(paint);
    select("campaign-image-resource", "product");
    select("testimonial-portrait", "person");
    select("campaign-logo-resource", "mark");
    expect(state.resources.assetIds).toEqual(["product", "mark", "person"]);
    const document = buildPreviewDocument(state, catalog, resources);
    expect(document.layers).toContainEqual(
      expect.objectContaining({ type: "image", assetId: "person" }),
    );
    expect(document.layers).toContainEqual(
      expect.objectContaining({ type: "product-screenshot", assetId: "product" }),
    );
    select("testimonial-portrait", "");
    expect(state.resources.assetIds).toEqual(["product", "mark"]);
    expect(state.resources.imageAssetId).toBe("product");
    select("template", "comparison");
    expect(state.resources.assetIds).toEqual([]);
    expect(state.resources.portraitAssetId).toBeUndefined();
    expect(container.querySelector("#campaign-image-resource")).toBeNull();
  });
});
