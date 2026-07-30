import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FORMAT_IDS, PROCEDURAL_STYLE_IDS, TEMPLATE_IDS } from "@glyphkiln/core";

import Home from "./page";

describe("Home", () => {
  it("presents the complete local preview contract from Core", () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain("Local project proof");
    expect(markup).toContain("Shape the contract. Fire the proof.");
    expect(markup).toContain("Nothing is saved in this milestone.");
    expect(markup).toContain("Contract evidence");
    for (const templateId of TEMPLATE_IDS) {
      expect(markup).toContain(templateId);
    }
    for (const formatId of FORMAT_IDS) {
      expect(markup).toContain(formatId);
    }
    for (const styleId of PROCEDURAL_STYLE_IDS) {
      expect(markup).toContain(styleId);
    }
  });
});
