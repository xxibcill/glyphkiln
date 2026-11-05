import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { sha256 } from "../cache/canonical.js";
import { GlyphkilnError } from "../domain/types.js";
import type {
  FaceMetrics,
  GlyphOutline,
  OutlineCommand,
  ShapedGlyph,
  Shaper,
  ShaperFace,
  VariationAxis,
} from "./shaper.js";

/**
 * HarfBuzz behind the `Shaper` interface (ADR 0019, accepted 4 November
 * 2026). Only typography policies introduced in M1 use it; every existing
 * policy stays on fontkit 2.0.4 byte for byte. The wasm build is pinned by
 * version and SHA-256 and is checked before it is loaded.
 */
export const HARFBUZZJS_VERSION = "1.6.4" as const;
export const HARFBUZZ_VERSION = "15.0.0" as const;
export const HARFBUZZ_WASM_SHA256 =
  "6eeed8e1bc9ad7773038e48ff8f9e07e0ad228572c594b45e5357e9c2f7a0b2e" as const;
export const HARFBUZZ_SHAPER_ID =
  `harfbuzzjs@${HARFBUZZJS_VERSION}/harfbuzz@${HARFBUZZ_VERSION}` as const;

export type ShaperIdentity = {
  id: string;
  wasmSha256?: string;
};

export const HARFBUZZ_SHAPER_IDENTITY = Object.freeze({
  id: HARFBUZZ_SHAPER_ID,
  wasmSha256: HARFBUZZ_WASM_SHA256,
});

type HarfBuzzModule = typeof import("harfbuzzjs");
type HbFace = InstanceType<HarfBuzzModule["Face"]>;
type HbFont = InstanceType<HarfBuzzModule["Font"]>;
type HbBlob = InstanceType<HarfBuzzModule["Blob"]>;

/** A named instance from a face's `fvar` table. */
export type NamedInstance = {
  name: string;
  coordinates: Readonly<Record<string, number>>;
};

/** HarfBuzz-only face capabilities used by the M1 font model. */
export type HarfBuzzFaceInfo = {
  namedInstances(face: ShaperFace): readonly NamedInstance[];
  /** Ink extents of one glyph in font units (y up), if it has ink. */
  glyphInk(
    face: ShaperFace,
    glyphId: number,
  ): { xMin: number; xMax: number; yMin: number; yMax: number } | undefined;
  nominalGlyph(face: ShaperFace, codePoint: number): number | undefined;
  coordinates(face: ShaperFace): Readonly<Record<string, number>>;
};

export type HarfBuzzShaper = Shaper & HarfBuzzFaceInfo;

type FaceState = {
  readonly shaper: typeof HARFBUZZ_SHAPER_ID;
  readonly blob: HbBlob;
  readonly face: HbFace;
  readonly font: HbFont;
  readonly coordinates: Readonly<Record<string, number>>;
  /** Per-instance outline cache (ADR 0019 pre-ship condition). */
  readonly outlines: Map<number, GlyphOutline>;
  readonly shared: SharedFaceState;
};

type SharedFaceState = {
  metrics?: FaceMetrics;
  axes?: Readonly<Partial<Record<string, VariationAxis>>>;
  features?: readonly string[];
  instances?: readonly NamedInstance[];
  colorLayers?: boolean;
  cmap: Map<number, number | undefined>;
};

let loaded: HarfBuzzShaper | undefined;
let loading: Promise<HarfBuzzShaper> | undefined;

/**
 * Load the pinned HarfBuzz build once per process. The wasm bytes are hashed
 * before harfbuzzjs reads them, and the embedded HarfBuzz version must match.
 */
export async function loadHarfBuzzShaper(): Promise<HarfBuzzShaper> {
  if (loaded !== undefined) return loaded;
  loading ??= (async () => {
    const wasmPath = fileURLToPath(
      import.meta.resolve("harfbuzzjs/dist/harfbuzz.wasm"),
    );
    const actual = sha256(readFileSync(wasmPath));
    if (actual !== HARFBUZZ_WASM_SHA256) {
      throw new GlyphkilnError(
        "The installed HarfBuzz wasm does not match its pinned SHA-256.",
        "SHAPER_INTEGRITY_MISMATCH",
        { expected: HARFBUZZ_WASM_SHA256, actual },
      );
    }
    const hb = await import("harfbuzzjs");
    if (hb.versionString() !== HARFBUZZ_VERSION) {
      throw new GlyphkilnError(
        `harfbuzzjs embeds HarfBuzz ${hb.versionString()}, not ${HARFBUZZ_VERSION}.`,
        "SHAPER_INTEGRITY_MISMATCH",
        { expected: HARFBUZZ_VERSION, actual: hb.versionString() },
      );
    }
    loaded = createShaper(hb);
    return loaded;
  })();
  try {
    return await loading;
  } catch (error) {
    loading = undefined;
    throw error;
  }
}

/** The loaded shaper, or a stable error telling the caller to load it. */
export function loadedHarfBuzzShaper(): HarfBuzzShaper {
  if (loaded === undefined) {
    throw new GlyphkilnError(
      "The M1 typography engine is not loaded; await loadTypographyEngine() first.",
      "TYPOGRAPHY_ENGINE_NOT_LOADED",
    );
  }
  return loaded;
}

function createShaper(hb: HarfBuzzModule): HarfBuzzShaper {
  const make = (
    blob: HbBlob,
    face: HbFace,
    font: HbFont,
    coordinates: Readonly<Record<string, number>>,
    shared: SharedFaceState,
  ): FaceState =>
    Object.freeze({
      shaper: HARFBUZZ_SHAPER_ID,
      blob,
      face,
      font,
      coordinates: Object.freeze({ ...coordinates }),
      outlines: new Map<number, GlyphOutline>(),
      shared,
    });
  const unwrap = (handle: ShaperFace): FaceState => {
    if (handle.shaper !== HARFBUZZ_SHAPER_ID) {
      throw new GlyphkilnError(
        `A ${handle.shaper} face cannot be shaped by ${HARFBUZZ_SHAPER_ID}.`,
        "SHAPER_FACE_MISMATCH",
      );
    }
    return handle as FaceState;
  };
  return {
    id: HARFBUZZ_SHAPER_ID,
    loadFace(bytes) {
      const blob = new hb.Blob(bytes);
      const face = new hb.Face(blob, 0);
      if (face.upem === 0) {
        throw new GlyphkilnError(
          "Font bytes could not be parsed as an OpenType face.",
          "FONT_PARSE_FAILED",
        );
      }
      return make(blob, face, new hb.Font(face), {}, { cmap: new Map() });
    },
    variationAxes(handle) {
      const state = unwrap(handle);
      state.shared.axes ??= Object.freeze(
        Object.fromEntries(
          Object.entries(state.face.getAxisInfos()).map(([tag, axis]) => [
            tag,
            Object.freeze({ min: axis.min, default: axis.default, max: axis.max }),
          ]),
        ),
      );
      return state.shared.axes;
    },
    instantiate(handle, coordinates) {
      const { blob, face, shared } = unwrap(handle);
      const font = new hb.Font(face);
      const entries = Object.entries(coordinates).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      );
      font.setVariations(entries.map(([tag, value]) => new hb.Variation(tag, value)));
      return make(blob, face, font, Object.fromEntries(entries), shared);
    },
    shape(handle, request) {
      if (request.direction !== undefined && request.direction !== "ltr") {
        throw new GlyphkilnError(
          `Shaping direction "${request.direction}" is not supported.`,
          "SHAPING_DIRECTION_UNSUPPORTED",
          { direction: request.direction },
        );
      }
      const state = unwrap(handle);
      const buffer = new hb.Buffer();
      buffer.addText(request.text);
      buffer.setClusterLevel(hb.ClusterLevel.CHARACTERS);
      buffer.guessSegmentProperties();
      if (request.script !== undefined) buffer.setScript(request.script);
      if (request.language !== undefined) buffer.setLanguage(request.language);
      buffer.setDirection(hb.Direction.LTR);
      const features = Object.entries(request.features ?? {})
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([tag, on]) => new hb.Feature(tag, on ? 1 : 0));
      hb.shape(state.font, buffer, features);
      const infos = buffer.getGlyphInfosAndPositions();
      const clusterStarts = [...new Set(infos.map((info) => info.cluster))].sort(
        (left, right) => left - right,
      );
      const glyphs: ShapedGlyph[] = infos.map((info) => {
        const next =
          clusterStarts.find((cluster) => cluster > info.cluster) ??
          request.text.length;
        return {
          id: info.codepoint,
          cluster: info.cluster,
          codePointCount: countCodePoints(request.text, info.cluster, next),
          xAdvance: info.xAdvance ?? 0,
          yAdvance: info.yAdvance ?? 0,
          xOffset: info.xOffset ?? 0,
          yOffset: info.yOffset ?? 0,
        };
      });
      return {
        glyphs,
        advanceWidth: glyphs.reduce((total, glyph) => total + glyph.xAdvance, 0),
        unitsPerEm: state.face.upem,
        script: request.script,
        direction: "ltr",
      };
    },
    glyphOutline(handle, glyphId) {
      const state = unwrap(handle);
      const cached = state.outlines.get(glyphId);
      if (cached !== undefined) return cached;
      state.shared.colorLayers ??= state.face.hasColorLayers();
      const outline: GlyphOutline = Object.freeze({
        commands: Object.freeze(dropClosingLines(state.font.glyphToJson(glyphId))),
        color:
          state.shared.colorLayers &&
          state.face.getGlyphColorLayers(glyphId).length > 0,
        name: state.font.glyphName(glyphId),
      });
      state.outlines.set(glyphId, outline);
      return outline;
    },
    metrics(handle) {
      const state = unwrap(handle);
      if (
        state.shared.metrics !== undefined &&
        Object.keys(state.coordinates).length === 0
      ) {
        return state.shared.metrics;
      }
      const extents = state.font.hExtents();
      const metrics = Object.freeze({
        unitsPerEm: state.face.upem,
        ascent: extents.ascender,
        descent: extents.descender,
        xHeight: state.font.getMetricPositionWithFallback(hb.MetricsTag.X_HEIGHT),
        capHeight: state.font.getMetricPositionWithFallback(hb.MetricsTag.CAP_HEIGHT),
      });
      if (Object.keys(state.coordinates).length === 0) state.shared.metrics = metrics;
      return metrics;
    },
    hasGlyphForCodePoint(handle, codePoint) {
      return this.nominalGlyph(handle, codePoint) !== undefined;
    },
    nominalGlyph(handle, codePoint) {
      const state = unwrap(handle);
      if (state.shared.cmap.has(codePoint)) return state.shared.cmap.get(codePoint);
      const glyph = state.font.nominalGlyph(codePoint);
      const resolved = glyph === undefined || glyph === 0 ? undefined : glyph;
      state.shared.cmap.set(codePoint, resolved);
      return resolved;
    },
    availableFeatures(handle) {
      const state = unwrap(handle);
      state.shared.features ??= Object.freeze([
        ...new Set([
          ...state.face.getTableFeatureTags("GSUB"),
          ...state.face.getTableFeatureTags("GPOS"),
        ]),
      ]);
      return state.shared.features;
    },
    namedInstances(handle) {
      const state = unwrap(handle);
      state.shared.instances ??= Object.freeze(readNamedInstances(state.face));
      return state.shared.instances;
    },
    glyphInk(handle, glyphId) {
      const extents = unwrap(handle).font.glyphExtents(glyphId);
      if (extents === undefined || extents.width === 0 || extents.height === 0) {
        return undefined;
      }
      // HarfBuzz extents: bearing from the origin and a negative height (y up).
      const x0 = extents.xBearing;
      const x1 = extents.xBearing + extents.width;
      const y0 = extents.yBearing + extents.height;
      const y1 = extents.yBearing;
      return {
        xMin: Math.min(x0, x1),
        xMax: Math.max(x0, x1),
        yMin: Math.min(y0, y1),
        yMax: Math.max(y0, y1),
      };
    },
    coordinates(handle) {
      return unwrap(handle).coordinates;
    },
  };
}

/**
 * HarfBuzz emits an explicit `lineTo` back to the contour start before each
 * `Z`. The close already draws that segment, so it is dropped; the geometry
 * is unchanged and paths stay shorter.
 */
function dropClosingLines(
  segments: readonly { type: string; values: number[] }[],
): OutlineCommand[] {
  const commands: OutlineCommand[] = [];
  let start: readonly number[] | undefined;
  for (const [index, segment] of segments.entries()) {
    switch (segment.type) {
      case "M":
        start = segment.values;
        commands.push({ command: "moveTo", args: segment.values });
        break;
      case "L": {
        const closes =
          segments[index + 1]?.type === "Z" &&
          start !== undefined &&
          segment.values[0] === start[0] &&
          segment.values[1] === start[1];
        if (!closes) commands.push({ command: "lineTo", args: segment.values });
        break;
      }
      case "Q":
        commands.push({ command: "quadraticCurveTo", args: segment.values });
        break;
      case "C":
        commands.push({ command: "bezierCurveTo", args: segment.values });
        break;
      case "Z":
        commands.push({ command: "closePath", args: [] });
        break;
      default:
        throw new GlyphkilnError(
          `Unexpected outline segment "${segment.type}".`,
          "GLYPH_OUTLINE_INVALID",
        );
    }
  }
  return commands;
}

/** Parse `fvar` named instances (OpenType 1.9 `fvar` table, version 1.0). */
function readNamedInstances(face: HbFace): NamedInstance[] {
  const table = face.referenceTable("fvar");
  if (table === undefined || table.byteLength < 16) return [];
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const axesOffset = view.getUint16(4);
  const axisCount = view.getUint16(8);
  const axisSize = view.getUint16(10);
  const instanceCount = view.getUint16(12);
  const instanceSize = view.getUint16(14);
  const tags: string[] = [];
  for (let index = 0; index < axisCount; index += 1) {
    const offset = axesOffset + index * axisSize;
    if (offset + 4 > table.byteLength) return [];
    tags.push(String.fromCharCode(...table.subarray(offset, offset + 4)));
  }
  const instances: NamedInstance[] = [];
  const instancesOffset = axesOffset + axisCount * axisSize;
  for (let index = 0; index < instanceCount; index += 1) {
    const offset = instancesOffset + index * instanceSize;
    if (offset + 4 + axisCount * 4 > table.byteLength) break;
    const nameId = view.getUint16(offset);
    const coordinates: Record<string, number> = {};
    for (const [axis, tag] of tags.entries()) {
      coordinates[tag] = view.getInt32(offset + 4 + axis * 4) / 65_536;
    }
    const name = face.getName(nameId, "en").trim();
    if (name.length === 0) continue;
    instances.push(Object.freeze({ name, coordinates: Object.freeze(coordinates) }));
  }
  return instances;
}

function countCodePoints(text: string, start: number, end: number): number {
  let count = 0;
  for (let index = start; index < end; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit < 0xdc00 || unit > 0xdfff || index === start) count += 1;
  }
  return count;
}
