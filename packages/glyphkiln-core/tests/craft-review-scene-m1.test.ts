import { describe, expect, it } from "vitest";

import { reviewSceneCraft } from "../src/scene/index.js";
import { PAIRINGS, briefA } from "./visual/m1/specimens.js";

// Its own file, so the M1 engine starts unloaded: nothing else in this
// module context renders first.
describe("reviewSceneCraft on Scene 1.1.0", () => {
  it("loads the M1 typography engine itself", async () => {
    const review = await reviewSceneCraft(briefA(PAIRINGS[0]!), {
      thresholds: { displayWidth: 400 },
    });
    expect(review.findings).toEqual([]);
    expect(review.metrics.text.map((metric) => metric.elementId)).toEqual([
      "headline",
      "support",
      "caption",
      "exclusions",
    ]);
  });
});
