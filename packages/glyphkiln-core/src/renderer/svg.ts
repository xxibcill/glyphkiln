import { GlyphkilnError } from "../domain/types.js";
import type {
  CircleElement,
  ImageElement,
  PathElement,
  RectElement,
  Scene,
  SceneElement,
  TextElement,
} from "./scene.js";

export function renderSceneToSvg(scene: Scene): string {
  const { width, height } = scene.dimensions;
  const content = scene.elements.map((element) => renderElement(element)).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">` +
    `<title id="title">${escapeText(scene.title)}</title>` +
    `<desc id="desc">${escapeText(scene.description)}</desc>` +
    `<rect width="${width}" height="${height}" fill="${scene.backgroundColor}"/>` +
    content +
    "</svg>";
  assertSafeGeneratedSvg(svg);
  return svg;
}

export function assertSafeGeneratedSvg(svg: string): void {
  const forbidden = [
    /<script\b/i,
    /<foreignObject\b/i,
    /\bon\w+\s*=/i,
    /\b(?:href|xlink:href)\s*=\s*["'](?:https?:|file:|javascript:)/i,
    /<!ENTITY\b/i,
    /<!DOCTYPE\b/i,
  ];
  if (forbidden.some((pattern) => pattern.test(svg))) {
    throw new GlyphkilnError(
      "Generated SVG contains active or external content.",
      "UNSAFE_SVG_OUTPUT",
    );
  }
}

function renderElement(element: SceneElement): string {
  const rendered = renderPrimitive(element);
  if (element.exclusion === undefined) return rendered;
  const maskId = `exclusion-${element.id}`;
  const { canvas, bounds } = element.exclusion;
  return (
    `<mask id="${escapeAttribute(maskId)}" maskUnits="userSpaceOnUse" x="0" y="0" ` +
    `width="${number(canvas.width)}" height="${number(canvas.height)}">` +
    `<rect width="${number(canvas.width)}" height="${number(canvas.height)}" fill="#FFFFFF"/>` +
    `<rect x="${number(bounds.x)}" y="${number(bounds.y)}" width="${number(bounds.width)}" ` +
    `height="${number(bounds.height)}" fill="#000000"/></mask>` +
    `<g mask="url(#${escapeAttribute(maskId)})">${rendered}</g>`
  );
}

function renderPrimitive(element: SceneElement): string {
  switch (element.type) {
    case "rect":
      return renderRect(element);
    case "circle":
      return renderCircle(element);
    case "path":
      return renderPath(element);
    case "text":
      return renderText(element);
    case "image":
      return renderImage(element);
  }
}

function renderRect(element: RectElement): string {
  return (
    `<rect id="${escapeAttribute(element.id)}" x="${number(element.x)}" y="${number(element.y)}" ` +
    `width="${number(element.width)}" height="${number(element.height)}" ` +
    `fill="${escapeAttribute(element.fill)}"${optional("rx", element.radius)}` +
    `${optional("stroke", element.stroke)}${optional("stroke-width", element.strokeWidth)}` +
    `${optional("opacity", element.opacity)}/>`
  );
}

function renderCircle(element: CircleElement): string {
  return (
    `<circle id="${escapeAttribute(element.id)}" cx="${number(element.cx)}" ` +
    `cy="${number(element.cy)}" r="${number(element.radius)}" ` +
    `fill="${escapeAttribute(element.fill)}"${optional("stroke", element.stroke)}` +
    `${optional("stroke-width", element.strokeWidth)}${optional("opacity", element.opacity)}/>`
  );
}

function renderPath(element: PathElement): string {
  return (
    `<path id="${escapeAttribute(element.id)}" d="${escapeAttribute(element.data)}" ` +
    `fill="${escapeAttribute(element.fill)}"${optional("stroke", element.stroke)}` +
    `${optional("stroke-width", element.strokeWidth)}${optional("stroke-linecap", element.lineCap)}` +
    `${optional("stroke-linejoin", element.lineJoin)}${optional("opacity", element.opacity)}/>`
  );
}

function renderText(element: TextElement): string {
  if (element.outlines.length !== element.lines.length) {
    throw new GlyphkilnError(
      `Text element "${element.id}" is missing portable glyph outlines.`,
      "TEXT_OUTLINES_REQUIRED",
      { layerId: element.id },
    );
  }
  const paths = element.outlines
    .map(
      (data, index) =>
        `<path id="${escapeAttribute(`${element.id}-line-${index}`)}" ` +
        `d="${escapeAttribute(data)}" fill="${escapeAttribute(element.fill)}"/>`,
    )
    .join("");
  return (
    `<g id="${escapeAttribute(element.id)}" role="group" aria-label="${escapeAttribute(element.lines.join(" "))}"` +
    `${optional("opacity", element.opacity)}>${paths}</g>`
  );
}

function renderImage(element: ImageElement): string {
  if (!/^data:image\/(?:png|jpeg);base64,[a-zA-Z0-9+/]+=*$/.test(element.href)) {
    throw new GlyphkilnError(
      `Image "${element.id}" is not an embedded PNG or JPEG.`,
      "UNSAFE_IMAGE_REFERENCE",
    );
  }
  const preserveAspectRatio =
    element.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet";
  const image =
    `<image x="${number(element.x)}" y="${number(element.y)}" ` +
    `width="${number(element.width)}" height="${number(element.height)}" ` +
    `href="${element.href}" preserveAspectRatio="${preserveAspectRatio}"` +
    `${optional("opacity", element.opacity)}/>`;
  if (element.clipRadius === undefined && element.clipBounds === undefined) {
    return `<g id="${escapeAttribute(element.id)}">${image}</g>`;
  }
  const clipId = `clip-${element.id}`;
  const clip = element.clipBounds ?? element;
  return (
    `<g id="${escapeAttribute(element.id)}"><clipPath id="${escapeAttribute(clipId)}">` +
    `<rect x="${number(clip.x)}" y="${number(clip.y)}" width="${number(clip.width)}" ` +
    `height="${number(clip.height)}" rx="${number(element.clipRadius ?? 0)}"/></clipPath>` +
    `<g clip-path="url(#${escapeAttribute(clipId)})">${image}</g></g>`
  );
}

function optional(name: string, value: number | string | undefined): string {
  if (value === undefined) return "";
  return ` ${name}="${typeof value === "number" ? number(value) : escapeAttribute(value)}"`;
}

function number(value: number): string {
  const rounded = Math.round(value * 1_000) / 1_000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
