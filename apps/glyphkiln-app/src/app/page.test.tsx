import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("presents the authenticated manual workshop entry state", () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain("Manual workshop");
    expect(markup).toContain("APP ALPHA / MANUAL TRACK");
    expect(markup).toContain("Opening the manual design workshop");
    expect(markup).toContain("Checking the local session");
  });
});
