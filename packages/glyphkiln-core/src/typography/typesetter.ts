import GraphemeSplitter from "grapheme-splitter";

import {
  GlyphkilnError,
  type QualityIssue,
  type ResolvedFont,
} from "../domain/types.js";
import type {
  FontRegistry,
  OpenTypeFeatureMap,
  PositionedGlyph,
  SetLine,
  SetLinesInput,
  SetSegment,
  SetSegmentsInput,
} from "../fonts/index.js";
import { HARFBUZZ_SHAPER_IDENTITY, type HarfBuzzShaper } from "../fonts/harfbuzz.js";
import type { OutlineCommand, ShaperFace } from "../fonts/shaper.js";
import {
  FONT_VARIATION_POLICY_VERSION,
  MAXIMUM_STACK_FACES,
  OPTICAL_SIZE_POLICY,
  SCRIPT_MATCHING_POLICY,
  resolveCoordinates,
  roundTo,
  type FontFaceSpec,
  type FontModel,
  type ScriptFaceTag,
} from "./font-model.js";
import { itemizeScripts, scriptTag, SCRIPT_RUNS_POLICY } from "./script-runs.js";

/**
 * `cluster-tracking@1.0.0` (plan M1b, T08): tracking is added between
 * typographic character units, never after the last one, so marks keep their
 * offset to their base. A unit is a grapheme cluster (grapheme-splitter
 * 1.0.4), except that Thai sara am splits around its nikhahit: the nikhahit
 * stays with its consonant and the gap falls before sara aa. With nonzero
 * tracking, optional ligatures (`liga`, `clig`, `dlig`) are off unless a
 * layer asks for them explicitly.
 */
export const CLUSTER_TRACKING_POLICY_VERSION = "cluster-tracking@1.0.0" as const;
export const CLUSTER_TRACKING_POLICY = Object.freeze({
  version: CLUSTER_TRACKING_POLICY_VERSION,
  unit: "grapheme-splitter@1.0.4/unicode-10.0.0",
  thaiSaraAm: "split-before-sara-aa",
  trailingTracking: false,
  optionalLigaturesUnderTracking: "off-unless-requested",
});

/** The M1 typography policy recorded in manifests and fingerprints. */
export const M1_TYPOGRAPHY_POLICY = Object.freeze({
  shaper: HARFBUZZ_SHAPER_IDENTITY,
  scriptRuns: SCRIPT_RUNS_POLICY,
  clusterTracking: CLUSTER_TRACKING_POLICY,
  fontVariation: FONT_VARIATION_POLICY_VERSION,
  opticalSize: OPTICAL_SIZE_POLICY,
  scriptMatching: SCRIPT_MATCHING_POLICY,
});

const SARA_AM = 0x0e33;
const OPTIONAL_LIGATURES = ["liga", "clig", "dlig"] as const;
/** Default-ignorable controls a face need not map to cover a cluster. */
const IGNORABLE_RANGES: readonly (readonly [number, number])[] = [
  [0x00ad, 0x00ad],
  [0x034f, 0x034f],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x206f],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
];

function isIgnorable(character: string): boolean {
  const codePoint = character.codePointAt(0)!;
  return IGNORABLE_RANGES.some(
    ([start, end]) => codePoint >= start && codePoint <= end,
  );
}

const splitter = new GraphemeSplitter();

export type FaceRole = "primary" | "fallback" | `script:${ScriptFaceTag}`;

/** One face actually used to draw text (manifest font identity v2). */
export type UsedFace = {
  family: string;
  weight: number;
  style: "normal" | "italic";
  sha256: string;
  role: FaceRole;
  coordinates: Readonly<Record<string, number>>;
  namedInstance?: string;
  scale: number;
  baselineShift: number;
  scripts: readonly string[];
};

type StackEntry = {
  spec: FontFaceSpec;
  role: FaceRole;
  index: number;
};

type FaceInstance = {
  key: string;
  entry: StackEntry;
  font: ResolvedFont;
  face: ShaperFace;
  coordinates: Readonly<Record<string, number>>;
  namedInstance: string | undefined;
  scale: number;
  baselineShift: number;
  unitsPerEm: number;
};

/** A glyph set by the typesetter, in px, with its face and unit start. */
type LineGlyph = {
  id: number;
  cluster: number;
  codePointCount: number;
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
  instance: FaceInstance;
  /** px per font unit for this glyph's face at the set size. */
  pxPerUnit: number;
  script: string;
  unitStart: boolean;
};

type ShapedLine = { glyphs: LineGlyph[]; width: number; gaps: number };

export type TypesetterOptions = {
  registry: FontRegistry;
  shaper: HarfBuzzShaper;
  model: FontModel;
  /** Canvas short side in px, for the optical-size reference. */
  shortSidePx: number;
  layerId: string;
  /** Explicit feature requests; they win over the tracking ligature rule. */
  requestedFeatures?: OpenTypeFeatureMap;
};

/**
 * The M1 text setter. It has the same measuring and setting surface as
 * `FontRegistry`, so `layoutText` and the fitter use it unchanged, but it
 * shapes with HarfBuzz per script run and per face, applies cluster tracking,
 * and instantiates every face with the font model's coordinates.
 */
export class M1Typesetter {
  readonly shaperId = HARFBUZZ_SHAPER_IDENTITY.id;
  readonly issues: QualityIssue[] = [];
  readonly #options: TypesetterOptions;
  readonly #stack: StackEntry[];
  readonly #scriptFaces: Map<ScriptFaceTag, StackEntry>;
  readonly #instances = new Map<string, FaceInstance>();
  readonly #baseFaces = new Map<string, ShaperFace>();
  readonly #rawInstances = new Map<string, ShaperFace>();
  readonly #used = new Map<string, UsedFace>();
  readonly #measured = new Map<string, number>();
  readonly #autoScales = new Map<string, number>();
  readonly #reported = new Set<string>();

  public constructor(options: TypesetterOptions) {
    this.#options = options;
    const fallback = options.model.fallback ?? [];
    this.#stack = [
      { spec: { family: options.model.family }, role: "primary", index: 0 },
      ...fallback.map((spec, index) => ({
        spec,
        role: "fallback" as const,
        index: index + 1,
      })),
    ];
    this.#scriptFaces = new Map();
    for (const tag of ["latn", "thai"] as const) {
      const spec = options.model.scriptFaces?.[tag];
      if (spec !== undefined) {
        this.#scriptFaces.set(tag, {
          spec,
          role: `script:${tag}`,
          index: this.#stack.length + this.#scriptFaces.size,
        });
      }
    }
    if (this.#stack.length + this.#scriptFaces.size > MAXIMUM_STACK_FACES) {
      throw new GlyphkilnError(
        `A text element may name at most ${MAXIMUM_STACK_FACES} faces.`,
        "FONT_STACK_TOO_LARGE",
        { layerId: options.layerId },
      );
    }
  }

  /** Faces used to draw text so far, in first-use order. */
  public usedFaces(): UsedFace[] {
    return [...this.#used.values()];
  }

  /** Families the stack tries, in order (for diagnostics). */
  public stackFamilies(): string[] {
    return [
      ...[...this.#scriptFaces.values()].map((entry) => entry.spec.family),
      ...this.#stack.map((entry) => entry.spec.family),
    ];
  }

  public measure(
    text: string,
    _family: string,
    weight: number,
    style: ResolvedFont["style"],
    fontSize: number,
    letterSpacing = 0,
    features?: OpenTypeFeatureMap,
  ): number {
    const key = `${text}\u0000${weight}\u0000${style}\u0000${fontSize}\u0000${letterSpacing}\u0000${featureKey(features)}`;
    const cached = this.#measured.get(key);
    if (cached !== undefined) return cached;
    const width = this.#shapeLine(
      text,
      weight,
      style,
      fontSize,
      letterSpacing,
      features,
    ).width;
    this.#measured.set(key, width);
    return width;
  }

  /** Em-relative ascent of the primary face at the default instance. */
  public ascent(_family: string, weight: number, style: ResolvedFont["style"]): number {
    const instance = this.#instance(this.#stack[0]!, weight, style, undefined);
    if (instance === undefined) {
      throw new GlyphkilnError(
        `Font "${this.#options.model.family}" (${weight} ${style}) is not available.`,
        "UNSUPPORTED_FONT",
        { family: this.#options.model.family, weight, style },
      );
    }
    const metrics = this.#options.shaper.metrics(instance.face);
    return metrics.ascent / metrics.unitsPerEm;
  }

  /** Code points no face in the stack can draw as part of a whole cluster. */
  public missingCodePoints(
    text: string,
    _family: string,
    weight: number,
    style: ResolvedFont["style"],
  ): number[] {
    const missing = new Set<number>();
    for (const cluster of this.#clusters(text)) {
      if (this.#faceFor(cluster, weight, style, undefined) !== undefined) continue;
      const primary = this.#instance(this.#stack[0]!, weight, style, undefined);
      for (const character of cluster.text) {
        const codePoint = character.codePointAt(0)!;
        if (isIgnorable(character)) continue;
        if (
          primary === undefined ||
          !this.#options.shaper.hasGlyphForCodePoint(primary.face, codePoint)
        ) {
          missing.add(codePoint);
        }
      }
    }
    return [...missing];
  }

  public setLines(input: SetLinesInput): SetLine[] {
    const firstBaseline =
      input.y + this.ascent(input.family, input.weight, input.style) * input.fontSize;
    return input.lines.map((line, lineIndex) => {
      const shaped = this.#shapeLine(
        line,
        input.weight,
        input.style,
        input.fontSize,
        input.letterSpacing ?? 0,
        input.features,
      );
      const x =
        input.align === "center"
          ? input.x - shaped.width / 2
          : input.align === "right"
            ? input.x - shaped.width
            : input.x;
      const baseline = firstBaseline + lineIndex * input.fontSize * input.lineHeight;
      const set = this.#outline(shaped, x, baseline, input.letterSpacing ?? 0);
      return { path: set.path, x, baseline, width: shaped.width, glyphs: set.glyphs };
    });
  }

  public setSegments(input: SetSegmentsInput): {
    segments: SetSegment[];
    width: number;
  } {
    const letterSpacing = input.letterSpacing ?? 0;
    const segments: SetSegment[] = [];
    let penX = input.x;
    for (const [index, segment] of input.segments.entries()) {
      if (index > 0) penX += letterSpacing;
      const shaped = this.#shapeLine(
        segment.text,
        segment.weight,
        segment.style,
        input.fontSize,
        letterSpacing,
        input.features,
      );
      const set = this.#outline(shaped, penX, input.baseline, letterSpacing);
      segments.push({
        path: set.path,
        x: penX,
        width: shaped.width,
        glyphs: set.glyphs,
      });
      penX += shaped.width;
    }
    return { segments, width: penX - input.x };
  }

  public outlineText(input: SetLinesInput): string[] {
    return this.setLines(input).map((line) => line.path);
  }

  #clusters(text: string): { text: string; start: number; script: string }[] {
    const runs = itemizeScripts(text);
    const clusters: { text: string; start: number; script: string }[] = [];
    let offset = 0;
    let runIndex = 0;
    for (const grapheme of splitter.splitGraphemes(text)) {
      while (runIndex < runs.length - 1 && offset >= runs[runIndex]!.end) runIndex += 1;
      clusters.push({
        text: grapheme,
        start: offset,
        script: runs[runIndex]?.script ?? "Common",
      });
      offset += grapheme.length;
    }
    return clusters;
  }

  /** CSS Fonts §5.3 style matching per cluster: script face, then the stack. */
  #faceFor(
    cluster: { text: string; script: string },
    weight: number,
    style: ResolvedFont["style"],
    fontSize: number | undefined,
  ): FaceInstance | undefined {
    const tag =
      cluster.script === "Thai"
        ? "thai"
        : cluster.script === "Latin"
          ? "latn"
          : undefined;
    const scriptEntry = tag === undefined ? undefined : this.#scriptFaces.get(tag);
    const candidates =
      scriptEntry === undefined ? this.#stack : [scriptEntry, ...this.#stack];
    for (const entry of candidates) {
      const instance = this.#instance(entry, weight, style, fontSize);
      if (instance === undefined) continue;
      if (this.#covers(instance, cluster.text)) return instance;
    }
    return undefined;
  }

  #covers(instance: FaceInstance, text: string): boolean {
    for (const character of text) {
      if (isIgnorable(character)) continue;
      if (
        !this.#options.shaper.hasGlyphForCodePoint(
          instance.face,
          character.codePointAt(0)!,
        )
      )
        return false;
    }
    return true;
  }

  #baseFace(font: ResolvedFont): ShaperFace {
    let face = this.#baseFaces.get(font.sha256!);
    if (face === undefined) {
      face = this.#options.shaper.loadFace(font.bytes);
      this.#baseFaces.set(font.sha256!, face);
    }
    return face;
  }

  /**
   * `font-variation@1.0.0` and `optical-size-auto@1.0.0` coordinates for a
   * stack entry at a set size in px. Without a size (coverage and ascent) the
   * optical size stays at the axis default unless it is explicit.
   */
  #coordinatesFor(
    entry: StackEntry,
    font: ResolvedFont,
    weight: number,
    sizePx: number | undefined,
  ): { coordinates: Record<string, number>; namedInstance: string | undefined } {
    const { shaper, model } = this.#options;
    const base = this.#baseFace(font);
    const axes = shaper.variationAxes(base);
    const primary = entry.role === "primary";
    const resolved = resolveCoordinates({
      model: primary
        ? model
        : model.opticalSizing === undefined
          ? {}
          : { opticalSizing: model.opticalSizing },
      weight,
      axes,
      namedInstances: primary ? shaper.namedInstances(base) : [],
      fontSizePx: sizePx ?? 0,
      shortSidePx: this.#options.shortSidePx,
      layerId: this.#options.layerId,
      family: entry.spec.family,
      primary,
    });
    const coordinates = { ...resolved.coordinates };
    const explicitOpsz =
      primary && (model.opsz !== undefined || model.axes?.["opsz"] !== undefined);
    if (sizePx === undefined && axes["opsz"] !== undefined && !explicitOpsz) {
      coordinates["opsz"] = axes["opsz"].default;
    }
    for (const issue of resolved.issues) {
      const issueKey = `${issue.code}\u0000${JSON.stringify(issue.details)}`;
      if (this.#reported.has(issueKey)) continue;
      this.#reported.add(issueKey);
      this.issues.push(issue);
    }
    return { coordinates, namedInstance: resolved.namedInstance };
  }

  #rawInstance(
    font: ResolvedFont,
    coordinates: Readonly<Record<string, number>>,
  ): ShaperFace {
    const key = `${font.sha256}\u0000${JSON.stringify(coordinates)}`;
    let face = this.#rawInstances.get(key);
    if (face === undefined) {
      const base = this.#baseFace(font);
      face =
        Object.keys(coordinates).length === 0
          ? base
          : this.#options.shaper.instantiate(base, coordinates);
      this.#rawInstances.set(key, face);
    }
    return face;
  }

  /** The face instance for a stack entry at a weight, style and size. */
  #instance(
    entry: StackEntry,
    weight: number,
    style: ResolvedFont["style"],
    fontSize: number | undefined,
  ): FaceInstance | undefined {
    const { registry, shaper } = this.#options;
    if (!registry.has(entry.spec.family, weight, style)) return undefined;
    const font = registry.get(entry.spec.family, weight, style);
    const scale = this.#scaleFor(entry, font, weight, style, fontSize);
    const resolved = this.#coordinatesFor(
      entry,
      font,
      weight,
      fontSize === undefined ? undefined : fontSize * scale,
    );
    const coordinates = resolved.coordinates;
    const key = `${entry.index}\u0000${font.sha256}\u0000${weight}\u0000${style}\u0000${scale}\u0000${JSON.stringify(coordinates)}`;
    const cached = this.#instances.get(key);
    if (cached !== undefined) return cached;
    const instance: FaceInstance = {
      key,
      entry,
      font,
      face: this.#rawInstance(font, coordinates),
      coordinates,
      namedInstance: resolved.namedInstance,
      scale,
      baselineShift: this.#baselineShiftFor(entry),
      unitsPerEm: shaper.metrics(this.#baseFace(font)).unitsPerEm,
    };
    this.#instances.set(key, instance);
    return instance;
  }

  #baselineShiftFor(entry: StackEntry): number {
    const shift = entry.spec.baselineShift;
    return shift === undefined || shift === "auto"
      ? SCRIPT_MATCHING_POLICY.autoBaselineShift
      : shift;
  }

  /**
   * `script-matching@1.0.0` auto scale for a non-primary face: the primary
   * face's reference ink height over this face's, using `x` for the Latin
   * face and `น` for the Thai face, each measured on the instance it is set
   * in at this size (so automatic optical size is accounted for).
   */
  #scaleFor(
    entry: StackEntry,
    font: ResolvedFont,
    weight: number,
    style: ResolvedFont["style"],
    fontSize: number | undefined,
  ): number {
    const scale = entry.spec.scale;
    if (entry.role === "primary" || scale === undefined) return 1;
    if (scale !== "auto") return scale;
    const key = `${entry.index}\u0000${weight}\u0000${style}\u0000${fontSize ?? ""}`;
    const cached = this.#autoScales.get(key);
    if (cached !== undefined) return cached;
    const { registry } = this.#options;
    const primaryEntry = this.#stack[0]!;
    if (!registry.has(primaryEntry.spec.family, weight, style)) return 1;
    const primaryFont = registry.get(primaryEntry.spec.family, weight, style);
    const faceScript: ScriptFaceTag =
      entry.role === "script:latn"
        ? "latn"
        : entry.role === "script:thai"
          ? "thai"
          : this.#coversThai(font) && !this.#coversThai(primaryFont)
            ? "thai"
            : "latn";
    const primaryScript: ScriptFaceTag = faceScript === "thai" ? "latn" : "thai";
    const primaryHeight = this.#referenceHeight(
      this.#rawInstance(
        primaryFont,
        this.#coordinatesFor(primaryEntry, primaryFont, weight, fontSize).coordinates,
      ),
      primaryScript,
    );
    const faceHeight = this.#referenceHeight(
      this.#rawInstance(
        font,
        this.#coordinatesFor(entry, font, weight, fontSize).coordinates,
      ),
      faceScript,
    );
    const resolved =
      primaryHeight === undefined || faceHeight === undefined
        ? 1
        : roundTo(primaryHeight / faceHeight, SCRIPT_MATCHING_POLICY.scaleRounding);
    this.#autoScales.set(key, resolved);
    return resolved;
  }

  #coversThai(font: ResolvedFont): boolean {
    return this.#options.shaper.hasGlyphForCodePoint(this.#baseFace(font), 0x0e19);
  }

  /** Ink height above the baseline of the script reference glyph, in em. */
  #referenceHeight(face: ShaperFace, script: ScriptFaceTag): number | undefined {
    const { shaper } = this.#options;
    const glyph = shaper.nominalGlyph(
      face,
      SCRIPT_MATCHING_POLICY.references[script].codePointAt(0)!,
    );
    if (glyph === undefined) return undefined;
    const ink = shaper.glyphInk(face, glyph);
    if (ink === undefined) return undefined;
    return (ink.yMax - Math.max(0, ink.yMin)) / shaper.metrics(face).unitsPerEm;
  }

  #shapeLine(
    text: string,
    weight: number,
    style: ResolvedFont["style"],
    fontSize: number,
    letterSpacing: number,
    features: OpenTypeFeatureMap | undefined,
  ): ShapedLine {
    const clusters = this.#clusters(text);
    const primary = this.#instance(this.#stack[0]!, weight, style, fontSize);
    if (primary === undefined) {
      throw new GlyphkilnError(
        `Font "${this.#options.model.family}" (${weight} ${style}) is not available.`,
        "UNSUPPORTED_FONT",
        { family: this.#options.model.family, weight, style },
      );
    }
    // Group consecutive clusters with the same face and script into runs.
    const runs: {
      instance: FaceInstance;
      script: string;
      start: number;
      end: number;
    }[] = [];
    for (const cluster of clusters) {
      const instance = this.#faceFor(cluster, weight, style, fontSize) ?? primary;
      const last = runs.at(-1);
      if (last?.instance === instance && last.script === cluster.script) {
        last.end = cluster.start + cluster.text.length;
      } else {
        runs.push({
          instance,
          script: cluster.script,
          start: cluster.start,
          end: cluster.start + cluster.text.length,
        });
      }
    }
    const graphemeStarts = new Set(clusters.map((cluster) => cluster.start));
    const shapeFeatures = this.#features(features, letterSpacing);
    const glyphs: LineGlyph[] = [];
    let width = 0;
    let gaps = 0;
    let previousUnit: number | undefined;
    for (const run of runs) {
      const runText = text.slice(run.start, run.end);
      const script = scriptTag(run.script);
      const shaped = this.#options.shaper.shape(run.instance.face, {
        text: runText,
        ...(script === undefined || script === "Zyyy" ? {} : { script }),
        ...(shapeFeatures === undefined ? {} : { features: shapeFeatures }),
      });
      const pxPerUnit = (fontSize * run.instance.scale) / run.instance.unitsPerEm;
      const shift = run.instance.baselineShift * fontSize;
      let unit = previousUnit;
      for (const glyph of shaped.glyphs) {
        const cluster = run.start + glyph.cluster;
        const unitOffset = this.#unitOffset(
          text,
          cluster,
          graphemeStarts,
          glyph.xAdvance,
        );
        const unitStart = unit !== undefined && unitOffset !== unit;
        if (unitStart) gaps += 1;
        unit = unitOffset;
        glyphs.push({
          id: glyph.id,
          cluster,
          codePointCount: glyph.codePointCount,
          xAdvance: glyph.xAdvance * pxPerUnit,
          yAdvance: glyph.yAdvance * pxPerUnit,
          xOffset: glyph.xOffset * pxPerUnit,
          yOffset: glyph.yOffset * pxPerUnit + shift,
          instance: run.instance,
          pxPerUnit,
          script: run.script,
          unitStart,
        });
        width += glyph.xAdvance * pxPerUnit;
      }
      previousUnit = unit;
    }
    return { glyphs, width: width + gaps * letterSpacing, gaps };
  }

  /**
   * The character unit a glyph belongs to, as the UTF-16 offset that starts
   * it: its grapheme cluster, or for the spacing glyph of a decomposed sara
   * am, the sara am itself.
   */
  #unitOffset(
    text: string,
    cluster: number,
    graphemeStarts: ReadonlySet<number>,
    xAdvance: number,
  ): number {
    if (
      text.codePointAt(cluster) === SARA_AM &&
      xAdvance > 0 &&
      !graphemeStarts.has(cluster)
    ) {
      return cluster;
    }
    let start = cluster;
    while (start > 0 && !graphemeStarts.has(start)) start -= 1;
    return start;
  }

  #features(
    requested: OpenTypeFeatureMap | undefined,
    letterSpacing: number,
  ): OpenTypeFeatureMap | undefined {
    if (letterSpacing === 0) return requested;
    const features: Record<string, boolean> = {};
    for (const tag of OPTIONAL_LIGATURES) features[tag] = false;
    const explicit = this.#options.requestedFeatures ?? {};
    for (const [tag, value] of Object.entries(requested ?? {})) {
      if (
        (OPTIONAL_LIGATURES as readonly string[]).includes(tag) &&
        value &&
        explicit[tag] !== true
      )
        continue;
      features[tag] = value;
    }
    return features;
  }

  #outline(
    shaped: ShapedLine,
    startX: number,
    baseline: number,
    letterSpacing: number,
  ): { path: string; glyphs: PositionedGlyph[] } {
    const paths: string[] = [];
    const glyphs: PositionedGlyph[] = [];
    let penX = startX;
    let penY = baseline;
    const { shaper } = this.#options;
    for (const [index, glyph] of shaped.glyphs.entries()) {
      if (glyph.unitStart) penX += letterSpacing;
      const instance = glyph.instance;
      const outline = shaper.glyphOutline(instance.face, glyph.id);
      if (outline.color) {
        throw new GlyphkilnError(
          `Color glyph "${outline.name}" cannot be represented by the portable SVG outliner.`,
          "COLOR_GLYPH_UNSUPPORTED",
          { glyphId: glyph.id, glyphName: outline.name },
        );
      }
      const originX = penX + glyph.xOffset;
      const originY = penY - glyph.yOffset;
      const path = serializePath(outline.commands, glyph.pxPerUnit, originX, originY);
      if (path.length > 0) paths.push(path);
      const next = shaped.glyphs[index + 1];
      glyphs.push({
        id: glyph.id,
        cluster: glyph.cluster,
        codePointCount: glyph.codePointCount,
        x: originX,
        y: originY,
        advance: glyph.xAdvance + (next?.unitStart === true ? letterSpacing : 0),
        face: instance.entry.spec.family,
      });
      penX += glyph.xAdvance;
      penY -= glyph.yAdvance;
      this.#recordUse(instance, glyph);
    }
    return { path: paths.join(" "), glyphs };
  }

  #recordUse(instance: FaceInstance, glyph: LineGlyph): void {
    const key = instance.key;
    const script = glyph.script;
    const existing = this.#used.get(key);
    if (existing !== undefined) {
      if (!existing.scripts.includes(script)) {
        this.#used.set(key, {
          ...existing,
          scripts: [...existing.scripts, script].sort(),
        });
      }
      return;
    }
    this.#used.set(key, {
      family: instance.entry.spec.family,
      weight: instance.font.weight,
      style: instance.font.style,
      sha256: instance.font.sha256!,
      role: instance.entry.role,
      coordinates: instance.coordinates,
      ...(instance.namedInstance === undefined
        ? {}
        : { namedInstance: instance.namedInstance }),
      scale: instance.scale,
      baselineShift: instance.baselineShift,
      scripts: [script],
    });
  }
}

function featureKey(features: OpenTypeFeatureMap | undefined): string {
  if (features === undefined) return "";
  return Object.keys(features)
    .sort()
    .map((tag) => `${tag}=${features[tag] ? 1 : 0}`)
    .join(",");
}

function serializePath(
  commands: readonly OutlineCommand[],
  scale: number,
  offsetX: number,
  offsetY: number,
): string {
  return commands
    .map((command) => {
      const points = command.args.map((value, index) =>
        coordinate(index % 2 === 0 ? offsetX + value * scale : offsetY - value * scale),
      );
      switch (command.command) {
        case "moveTo":
          return `M ${points.join(" ")}`;
        case "lineTo":
          return `L ${points.join(" ")}`;
        case "quadraticCurveTo":
          return `Q ${points.join(" ")}`;
        case "bezierCurveTo":
          return `C ${points.join(" ")}`;
        case "closePath":
          return "Z";
      }
    })
    .join(" ");
}

function coordinate(value: number): string {
  const rounded = Math.round(value * 1_000) / 1_000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
