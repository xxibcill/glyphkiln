import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TEMPLATE_IDS } from "@glyphkiln/core/schema";

import Home from "./page";

describe("Home", () => {
  it("presents every template exposed by the Core schema API", () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain("Application foundation");
    for (const templateId of TEMPLATE_IDS) {
      expect(markup).toContain(templateId);
    }
  });
});
