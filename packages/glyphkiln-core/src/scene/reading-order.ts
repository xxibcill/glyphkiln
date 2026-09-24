import type { QualityIssue } from "../domain/types.js";
import type { SceneDocument } from "./types.js";

/** Advisory coverage check. A group's reading-order entry covers its descendants. */
export function reviewSceneReadingOrder(document: SceneDocument): QualityIssue[] {
  const ordered = new Set(document.readingOrder);
  const issues: QualityIssue[] = [];
  const pending = document.elements
    .map((element) => ({
      element,
      covered: false,
      decorative: false,
    }))
    .reverse();
  while (pending.length > 0) {
    const { element, covered, decorative } = pending.pop()!;
    const isDecorative = decorative || element.semantic?.role === "decoration";
    const isCovered = covered || ordered.has(element.id);
    const meaningful =
      element.semantic?.role === "content" ||
      element.semantic?.role === "annotation" ||
      (element.type === "text" && element.semantic?.role !== "decoration");
    if (meaningful && !isDecorative && !isCovered && issues.length < 128) {
      issues.push({
        code: "SCENE_READING_ORDER_UNCOVERED",
        severity: "warning",
        layerId: element.id,
        message: `Meaningful scene element "${element.id}" has no reading-order entry or ordered ancestor.`,
      });
    }
    if (element.type === "group") {
      for (let index = element.elements.length - 1; index >= 0; index -= 1) {
        pending.push({
          element: element.elements[index]!,
          covered: isCovered,
          decorative: isDecorative,
        });
      }
    }
  }
  return issues;
}
