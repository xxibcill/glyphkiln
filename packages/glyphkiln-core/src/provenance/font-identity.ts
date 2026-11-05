import { GlyphkilnError } from "../domain/types.js";
import { fontReferenceKey } from "../fonts/key.js";
import type { UsedFace } from "../typography/typesetter.js";

/** The text and group shape the collector walks (template and Scene trees). */
type FaceBearingElement = {
  id: string;
  type: string;
  faces?: readonly UsedFace[] | undefined;
  fontStack?: readonly string[] | undefined;
  elements?: readonly FaceBearingElement[];
};

function flattenTextElements(
  elements: readonly FaceBearingElement[],
): FaceBearingElement[] {
  const out: FaceBearingElement[] = [];
  for (const element of elements) {
    if (element.type === "text") out.push(element);
    if (element.type === "group" && element.elements !== undefined) {
      out.push(...flattenTextElements(element.elements));
    }
  }
  return out;
}
import type { ManifestFontV2, ManifestTextStack } from "./index.js";

/**
 * Font identity v2: every face the M1 typesetter drew with, in scene order,
 * merged across elements, and the stack each text element tried. Each face
 * must be declared by the document, exactly like legacy faces.
 */
export function collectFontIdentityV2(
  declared: readonly { family: string; weight: number; style: string }[],
  scene: { elements: readonly FaceBearingElement[] },
): { fonts: ManifestFontV2[]; textStacks: ManifestTextStack[] } {
  const declarations = new Set(
    declared.map((declaration) =>
      fontReferenceKey(declaration.family, declaration.weight, declaration.style),
    ),
  );
  const fonts = new Map<string, ManifestFontV2>();
  const textStacks: ManifestTextStack[] = [];
  for (const element of flattenTextElements(scene.elements)) {
    if (element.faces === undefined) continue;
    for (const face of element.faces) {
      if (!declarations.has(fontReferenceKey(face.family, face.weight, face.style))) {
        throw new GlyphkilnError(
          `Scene text uses undeclared font "${face.family}" (${face.weight} ${face.style}).`,
          "UNDECLARED_FONT_REFERENCE",
          {
            layerId: element.id,
            family: face.family,
            weight: face.weight,
            style: face.style,
          },
        );
      }
      const key = JSON.stringify([
        face.family.toLocaleLowerCase("en-US"),
        face.weight,
        face.style,
        face.sha256,
        face.coordinates,
        face.namedInstance ?? null,
        face.role,
        face.scale,
        face.baselineShift,
      ]);
      const existing = fonts.get(key);
      const scripts = [
        ...new Set([...(existing?.scripts ?? []), ...face.scripts]),
      ].sort();
      fonts.set(key, {
        family: face.family,
        weight: face.weight,
        style: face.style,
        sha256: face.sha256,
        coordinates: face.coordinates,
        ...(face.namedInstance === undefined
          ? {}
          : { namedInstance: face.namedInstance }),
        role: face.role,
        scale: face.scale,
        baselineShift: face.baselineShift,
        scripts,
      });
    }
    textStacks.push({
      layerId: element.id,
      stack: [...(element.fontStack ?? [])],
      faces: element.faces.map((face) => ({
        family: face.family,
        weight: face.weight,
        style: face.style,
        role: face.role,
      })),
    });
  }
  return { fonts: [...fonts.values()], textStacks };
}
