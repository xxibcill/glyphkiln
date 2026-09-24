import { GlyphkilnError } from "../domain/types.js";
import { isXml10Compatible } from "../security/xml.js";
import type {
  CircleElement,
  ConnectorElement,
  GroupElement,
  ImageElement,
  PathElement,
  RectElement,
  Scene,
  SceneClip,
  SceneKernel,
  SceneKernelElement,
  SceneSemantic,
  SceneTransform,
  TextElement,
} from "./scene.js";

export function renderSceneToSvg(scene: Scene | SceneKernel): string {
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
  if (!isXml10Compatible(svg)) {
    throw new GlyphkilnError(
      "Generated SVG contains characters forbidden by XML 1.0.",
      "UNSAFE_SVG_OUTPUT",
    );
  }
  if (/<!ENTITY\b|<!DOCTYPE\b/i.test(svg)) {
    throwUnsafeSvg();
  }
  const openingTagPattern = /<([A-Za-z][A-Za-z0-9_.:-]*)(?:\s[^<>]*?)?\/?>/g;
  for (const match of svg.matchAll(openingTagPattern)) {
    const tagName = match[1]!.toLowerCase();
    if (tagName === "script" || tagName === "foreignobject") {
      throwUnsafeSvg();
    }
    for (const attribute of parseOpeningTagAttributes(match[0])) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) throwUnsafeSvg();
      if (
        (name === "href" || name === "xlink:href") &&
        /^(?:https?:|file:|javascript:)/i.test(attribute.value)
      ) {
        throwUnsafeSvg();
      }
      if (
        (name === "fill" ||
          name === "stroke" ||
          name === "style" ||
          name === "clip-path" ||
          name === "mask" ||
          name === "filter") &&
        /url\s*\(\s*(?:https?:|file:|javascript:)/i.test(attribute.value)
      ) {
        throwUnsafeSvg();
      }
    }
  }
}

function throwUnsafeSvg(): never {
  throw new GlyphkilnError(
    "Generated SVG contains active or external content.",
    "UNSAFE_SVG_OUTPUT",
  );
}

type SerializedAttribute = { name: string; value: string };

function parseOpeningTagAttributes(tag: string): SerializedAttribute[] {
  const attributes: SerializedAttribute[] = [];
  let cursor = 1;
  while (cursor < tag.length && isXmlNameCharacter(tag[cursor]!)) cursor += 1;
  while (cursor < tag.length) {
    while (cursor < tag.length && /\s/.test(tag[cursor]!)) cursor += 1;
    if (cursor >= tag.length || tag[cursor] === ">" || tag[cursor] === "/") break;
    const nameStart = cursor;
    while (cursor < tag.length && isXmlNameCharacter(tag[cursor]!)) cursor += 1;
    if (cursor === nameStart) {
      cursor += 1;
      continue;
    }
    const name = tag.slice(nameStart, cursor);
    while (cursor < tag.length && /\s/.test(tag[cursor]!)) cursor += 1;
    if (tag[cursor] !== "=") {
      cursor += 1;
      continue;
    }
    cursor += 1;
    while (cursor < tag.length && /\s/.test(tag[cursor]!)) cursor += 1;
    const quote = tag[cursor];
    if (quote !== '"' && quote !== "'") continue;
    cursor += 1;
    const valueStart = cursor;
    while (cursor < tag.length && tag[cursor] !== quote) cursor += 1;
    attributes.push({ name, value: tag.slice(valueStart, cursor) });
    if (cursor < tag.length) cursor += 1;
  }
  return attributes;
}

function isXmlNameCharacter(character: string): boolean {
  return /[A-Za-z0-9_.:-]/.test(character);
}

function renderElement(element: SceneKernelElement): string {
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

function renderPrimitive(element: SceneKernelElement): string {
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
    case "connector":
      return renderConnector(element);
    case "group":
      return renderGroup(element);
  }
}

function renderRect(element: RectElement): string {
  return (
    `<rect id="${escapeAttribute(element.id)}" x="${number(element.x)}" y="${number(element.y)}" ` +
    `width="${number(element.width)}" height="${number(element.height)}" ` +
    `fill="${escapeAttribute(element.fill)}"${optional("rx", element.radius)}` +
    `${optional("stroke", element.stroke)}${optional("stroke-width", element.strokeWidth)}` +
    `${semanticAttributes(element.semantic)}${optional("opacity", element.opacity)}/>`
  );
}

function renderCircle(element: CircleElement): string {
  return (
    `<circle id="${escapeAttribute(element.id)}" cx="${number(element.cx)}" ` +
    `cy="${number(element.cy)}" r="${number(element.radius)}" ` +
    `fill="${escapeAttribute(element.fill)}"${optional("stroke", element.stroke)}` +
    `${optional("stroke-width", element.strokeWidth)}${semanticAttributes(element.semantic)}` +
    `${optional("opacity", element.opacity)}/>`
  );
}

function renderPath(element: PathElement): string {
  return (
    `<path id="${escapeAttribute(element.id)}" d="${escapeAttribute(element.data)}" ` +
    `fill="${escapeAttribute(element.fill)}"${optional("stroke", element.stroke)}` +
    `${optional("stroke-width", element.strokeWidth)}${optional("stroke-linecap", element.lineCap)}` +
    `${optional("stroke-linejoin", element.lineJoin)}${semanticAttributes(element.semantic)}` +
    `${optional("opacity", element.opacity)}/>`
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
  const accessibility =
    element.semantic === undefined
      ? ` role="group" aria-label="${escapeAttribute(element.lines.join(" "))}"`
      : semanticAttributes(element.semantic, element.lines.join(" "));
  const selectableText =
    element.textMode === "outline-with-selectable-text"
      ? renderSelectableText(element)
      : "";
  return (
    `<g id="${escapeAttribute(element.id)}"${accessibility}` +
    `${optional("opacity", element.opacity)}>${paths}${selectableText}</g>`
  );
}

function renderSelectableText(element: TextElement): string {
  const anchor = {
    left: "start",
    center: "middle",
    right: "end",
  }[element.align];
  const lineAdvance = element.fontSize * element.lineHeight;
  const lines = element.lines
    .map(
      (line, index) =>
        `<tspan x="${number(element.x)}" dy="${number(index === 0 ? 0 : lineAdvance)}">` +
        `${escapeText(line)}</tspan>`,
    )
    .join("");
  return (
    `<text id="${escapeAttribute(`${element.id}-selectable-text`)}" x="${number(element.x)}" ` +
    `y="${number(element.y)}" fill="transparent" ` +
    `font-family="${escapeAttribute(element.fontFamily)}" font-weight="${number(element.fontWeight)}" ` +
    `font-style="${escapeAttribute(element.fontStyle)}" font-size="${number(element.fontSize)}" ` +
    `text-anchor="${anchor}" dominant-baseline="text-before-edge" xml:space="preserve" ` +
    `aria-hidden="true"${optional("letter-spacing", element.letterSpacing)}>${lines}</text>`
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
  const groupAttributes = semanticAttributes(element.semantic);
  if (element.clipRadius === undefined && element.clipBounds === undefined) {
    return `<g id="${escapeAttribute(element.id)}"${groupAttributes}>${image}</g>`;
  }
  const clipId = `clip-${element.id}`;
  const clip = element.clipBounds ?? element;
  return (
    `<g id="${escapeAttribute(element.id)}"${groupAttributes}><clipPath id="${escapeAttribute(clipId)}">` +
    `<rect x="${number(clip.x)}" y="${number(clip.y)}" width="${number(clip.width)}" ` +
    `height="${number(clip.height)}" rx="${number(element.clipRadius ?? 0)}"/></clipPath>` +
    `<g clip-path="url(#${escapeAttribute(clipId)})">${image}</g></g>`
  );
}

function renderConnector(element: ConnectorElement): string {
  const path = element.points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${number(point.x)} ${number(point.y)}`,
    )
    .join(" ");
  const line =
    `<path id="${escapeAttribute(`${element.id}-shaft`)}" d="${path}" fill="none" ` +
    `stroke="${escapeAttribute(element.stroke)}" ` +
    `stroke-width="${number(element.strokeWidth)}"${optional("stroke-linecap", element.lineCap)}` +
    `${optional("stroke-linejoin", element.lineJoin)}/>`;
  const start =
    element.startMarker === "arrow"
      ? renderArrowhead(
          element.points[0]!,
          element.points[1]!,
          element.stroke,
          element.strokeWidth,
          `${element.id}-marker-start`,
        )
      : "";
  const lastIndex = element.points.length - 1;
  const end =
    element.endMarker === "arrow"
      ? renderArrowhead(
          element.points[lastIndex]!,
          element.points[lastIndex - 1]!,
          element.stroke,
          element.strokeWidth,
          `${element.id}-marker-end`,
        )
      : "";
  return (
    `<g id="${escapeAttribute(element.id)}" data-from="${escapeAttribute(element.fromId)}" ` +
    `data-to="${escapeAttribute(element.toId)}"${semanticAttributes(element.semantic)}` +
    `${optional("opacity", element.opacity)}>${line}${start}${end}</g>`
  );
}

function renderArrowhead(
  tip: { x: number; y: number },
  previous: { x: number; y: number },
  fill: string,
  strokeWidth: number,
  id: string,
): string {
  const angle = Math.atan2(tip.y - previous.y, tip.x - previous.x);
  const size = Math.max(6, strokeWidth * 4);
  const left = {
    x: tip.x + Math.cos(angle + Math.PI - 0.52) * size,
    y: tip.y + Math.sin(angle + Math.PI - 0.52) * size,
  };
  const right = {
    x: tip.x + Math.cos(angle + Math.PI + 0.52) * size,
    y: tip.y + Math.sin(angle + Math.PI + 0.52) * size,
  };
  return (
    `<path id="${escapeAttribute(id)}" d="M ${number(tip.x)} ${number(tip.y)} ` +
    `L ${number(left.x)} ${number(left.y)} ` +
    `L ${number(right.x)} ${number(right.y)} Z" fill="${escapeAttribute(fill)}"/>`
  );
}

function renderGroup(element: GroupElement): string {
  const content = element.elements.map((child) => renderElement(child)).join("");
  const transform = renderTransforms(element.transforms);
  const attributes =
    `${optional("transform", transform)}${semanticAttributes(element.semantic)}` +
    optional("opacity", element.opacity);
  if (element.clip === undefined) {
    return `<g id="${escapeAttribute(element.id)}"${attributes}>${content}</g>`;
  }
  const clipId = `clip-${element.id}`;
  return (
    `<clipPath id="${escapeAttribute(clipId)}" clipPathUnits="userSpaceOnUse">` +
    `${renderClip(element.clip)}</clipPath>` +
    `<g id="${escapeAttribute(element.id)}"${attributes} clip-path="url(#${escapeAttribute(clipId)})">` +
    `${content}</g>`
  );
}

function renderTransforms(
  transforms: readonly SceneTransform[] | undefined,
): string | undefined {
  if (transforms === undefined || transforms.length === 0) return undefined;
  return transforms
    .map((transform) => {
      switch (transform.type) {
        case "translate":
          return `translate(${number(transform.x)} ${number(transform.y)})`;
        case "scale":
          return `scale(${number(transform.x)} ${number(transform.y)})`;
        case "rotate":
          return `rotate(${number(transform.degrees)} ${number(transform.cx)} ${number(transform.cy)})`;
      }
    })
    .join(" ");
}

function renderClip(clip: SceneClip): string {
  switch (clip.type) {
    case "rect":
      return (
        `<rect x="${number(clip.x)}" y="${number(clip.y)}" width="${number(clip.width)}" ` +
        `height="${number(clip.height)}"${optional("rx", clip.radius)}/>`
      );
    case "circle":
      return `<circle cx="${number(clip.cx)}" cy="${number(clip.cy)}" r="${number(clip.radius)}"/>`;
    case "path":
      return `<path d="${escapeAttribute(clip.data)}"/>`;
  }
}

function semanticAttributes(
  semantic: SceneSemantic | undefined,
  fallbackLabel?: string,
): string {
  if (semantic === undefined) return "";
  if (semantic.role === "decoration") {
    return ` data-semantic-role="decoration" aria-hidden="true"`;
  }
  const label = semantic.label ?? fallbackLabel;
  return (
    ` data-semantic-role="${semantic.role}" role="group"` +
    optional("data-concept-id", semantic.conceptId) +
    optional("data-reading-order", semantic.readingOrder) +
    `${optional("aria-label", label)}${optional("aria-description", semantic.description)}`
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
