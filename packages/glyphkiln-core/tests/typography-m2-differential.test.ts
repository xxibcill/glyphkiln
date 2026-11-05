import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { beforeAll, describe, expect, it } from "vitest";

import {
  FontRegistry,
  type PositionedGlyph,
  type SetLine,
  type SetLinesInput,
} from "../src/fonts/index.js";
import { loadHarfBuzzShaper, type HarfBuzzShaper } from "../src/fonts/harfbuzz.js";
import { fontkitShaper, type ShaperFace } from "../src/fonts/shaper.js";
import { createTypesetter, loadTypographyEngine } from "../src/typography/engine.js";
import { itemizeScripts, scriptTag } from "../src/typography/script-runs.js";
import type { M1Typesetter } from "../src/typography/typesetter.js";

/**
 * Typography M2 differential corpus (plan §5 M2 exit gate, ADR 0019).
 *
 * C-LAT, C-TH and C-MIX go through both production text paths:
 *
 * - legacy: `FontRegistry.setLines`, fontkit 2.0.4, the whole line in one
 *   call (every policy before M1);
 * - M1: the `M1Typesetter` from `createTypesetter`, HarfBuzz per script run
 *   (`quote-card@1.4.0`, `statistic-card@1.4.0`, `image-led-campaign@1.3.0`
 *   and Scene 1.1.0).
 *
 * Glyph IDs and positions must match line for line. Every difference must be
 * listed in `typography/differential/allowlist.json` with one of its kinds,
 * and each kind is proved mechanically below. A new, changed or vanished
 * difference fails.
 */

type Corpus = {
  id: string;
  face: { family: string; weight: number };
  entries: { id: string; text: string }[];
};

type Kind =
  | "script-itemization"
  | "thai-mark-shaping"
  | "inter-endash-case"
  | "dflt-duplicate-kern";

type AllowlistEntry = {
  corpus: string;
  id: string;
  kind: Kind;
  glyphIds: boolean;
  change: string;
};

type Allowlist = {
  shapers: { legacy: string; m1: string };
  kinds: Record<Kind, { explanation: string; proof: string }>;
  entries: AllowlistEntry[];
};

/** Positions are compared in font units (the line is set at 1 px per unit). */
const POSITION_TOLERANCE = 0.5;
const CORPORA = ["c-lat", "c-th", "c-mix"] as const;
const THAI_MARKS = new Set([
  0x0e31, 0x0e34, 0x0e35, 0x0e36, 0x0e37, 0x0e38, 0x0e39, 0x0e3a, 0x0e47, 0x0e48,
  0x0e49, 0x0e4a, 0x0e4b, 0x0e4c, 0x0e4d, 0x0e4e,
]);

function corpus(name: string): Corpus {
  return JSON.parse(
    readFileSync(new URL(`typography/corpora/${name}.json`, import.meta.url), "utf8"),
  ) as Corpus;
}

const allowlist = JSON.parse(
  readFileSync(
    new URL("typography/differential/allowlist.json", import.meta.url),
    "utf8",
  ),
) as Allowlist;

let shaper: HarfBuzzShaper;
let registry: FontRegistry;

beforeAll(async () => {
  await loadTypographyEngine();
  shaper = await loadHarfBuzzShaper();
  registry = new FontRegistry();
});

type Setter = { setLines(input: SetLinesInput): SetLine[] };

function m1(family: string): M1Typesetter {
  // Optical size stays at the axis default so both paths set the same
  // instance; `opsz` is an M1 feature with no legacy counterpart.
  return createTypesetter({
    registry,
    model: { family, weight: 400, style: "normal", opticalSizing: "none" },
    shortSidePx: 1080,
    layerId: "m2-differential",
  });
}

function setLine(
  setter: Setter,
  family: string,
  text: string,
  fontSize: number,
  letterSpacing = 0,
  features?: SetLinesInput["features"],
): SetLine {
  return setter.setLines({
    lines: [text],
    family,
    weight: 400,
    style: "normal",
    fontSize,
    lineHeight: 1,
    x: 0,
    y: 0,
    align: "left",
    letterSpacing,
    ...(features === undefined ? {} : { features }),
  })[0]!;
}

type Glyph = Pick<PositionedGlyph, "id" | "x" | "y" | "advance">;

function sameIds(left: readonly Glyph[], right: readonly Glyph[]): boolean {
  return (
    left.length === right.length &&
    left.every((glyph, index) => glyph.id === right[index]!.id)
  );
}

function samePositions(left: readonly Glyph[], right: readonly Glyph[]): boolean {
  return left.every((glyph, index) => {
    const other = right[index]!;
    return (
      Math.abs(glyph.x - other.x) <= POSITION_TOLERANCE &&
      Math.abs(glyph.y - other.y) <= POSITION_TOLERANCE &&
      Math.abs(glyph.advance - other.advance) <= POSITION_TOLERANCE
    );
  });
}

function same(left: readonly Glyph[], right: readonly Glyph[]): boolean {
  return sameIds(left, right) && samePositions(left, right);
}

/**
 * fontkit given M1's script runs: the legacy shaper, but each
 * `script-runs@1.0.0` run shaped alone with its OpenType script tag. If this
 * equals the M1 line, the difference is itemization, not the shaper.
 */
function fontkitPerRun(face: ShaperFace, text: string, baseline: number): Glyph[] {
  const glyphs: Glyph[] = [];
  let pen = 0;
  for (const run of itemizeScripts(text)) {
    const tag = scriptTag(run.script);
    const shaped = fontkitShaper.shape(face, {
      text: text.slice(run.start, run.end),
      ...(tag === undefined || tag === "Zyyy" ? {} : { script: tag.toLowerCase() }),
    });
    for (const glyph of shaped.glyphs) {
      glyphs.push({
        id: glyph.id,
        x: pen + glyph.xOffset,
        y: baseline - glyph.yOffset,
        advance: glyph.xAdvance,
      });
      pen += glyph.xAdvance;
    }
  }
  return glyphs;
}

function format(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

type Difference = {
  corpus: string;
  id: string;
  text: string;
  legacy: SetLine;
  m1: SetLine;
  legacyNames: string[];
  m1Names: string[];
  perRun: Glyph[];
  fontkitFace: ShaperFace;
  change: string;
};

/** A short, exact description of how M1 differs from legacy on one line. */
function describeChange(
  legacy: SetLine,
  m1Line: SetLine,
  legacyNames: readonly string[],
  m1Names: readonly string[],
): string {
  if (!sameIds(legacy.glyphs, m1Line.glyphs)) {
    if (legacyNames.length === m1Names.length) {
      return legacyNames
        .flatMap((name, index) =>
          name === m1Names[index] ? [] : [`${index}:${name}→${m1Names[index]}`],
        )
        .join(", ");
    }
    let start = 0;
    while (legacyNames[start] === m1Names[start]) start += 1;
    let end = 0;
    while (legacyNames.at(-1 - end) === m1Names.at(-1 - end)) end += 1;
    return `${start}:${legacyNames.slice(start, legacyNames.length - end).join(" ")} ⇒ ${m1Names.slice(start, m1Names.length - end).join(" ")}`;
  }
  // Same glyphs: report each advance that differs (pair kerning) and any
  // vertical offset that differs.
  const parts: string[] = [];
  for (const [index, glyph] of legacy.glyphs.entries()) {
    const other = m1Line.glyphs[index]!;
    const advance = other.advance - glyph.advance;
    if (Math.abs(advance) > POSITION_TOLERANCE) {
      parts.push(
        `${legacyNames[index]} ${legacyNames[index + 1] ?? "(end)"} advance ${format(advance)}`,
      );
    }
    if (Math.abs(other.y - glyph.y) > POSITION_TOLERANCE) {
      parts.push(`${legacyNames[index]} y ${format(other.y - glyph.y)}`);
    }
  }
  return parts.join(", ");
}

function computeDifferences(): { lines: number; differences: Difference[] } {
  const differences: Difference[] = [];
  let lines = 0;
  for (const name of CORPORA) {
    const data = corpus(name);
    const { family, weight } = data.face;
    const font = registry.get(family, weight, "normal");
    const base = fontkitShaper.loadFace(font.bytes);
    const fontkitFace =
      fontkitShaper.variationAxes(base)["wght"] === undefined
        ? base
        : fontkitShaper.instantiate(base, { wght: weight });
    const hbFace = shaper.loadFace(font.bytes);
    const upem = shaper.metrics(hbFace).unitsPerEm;
    const engine = m1(family);
    const nameOf = (id: number) => shaper.glyphOutline(hbFace, id).name ?? `gid${id}`;
    for (const entry of data.entries) {
      lines += 1;
      const legacy = setLine(registry, family, entry.text, upem);
      const m1Line = setLine(engine, family, entry.text, upem);
      if (same(legacy.glyphs, m1Line.glyphs)) continue;
      const legacyNames = legacy.glyphs.map((glyph) => nameOf(glyph.id));
      const m1Names = m1Line.glyphs.map((glyph) => nameOf(glyph.id));
      differences.push({
        corpus: data.id,
        id: entry.id,
        text: entry.text,
        legacy,
        m1: m1Line,
        legacyNames,
        m1Names,
        perRun: fontkitPerRun(fontkitFace, entry.text, legacy.baseline),
        fontkitFace,
        change: describeChange(legacy, m1Line, legacyNames, m1Names),
      });
    }
  }
  return { lines, differences };
}

function codePointOfName(name: string): number | undefined {
  const match = /^uni([0-9A-F]{4})(?:\.|$)/.exec(name);
  return match === null ? undefined : Number.parseInt(match[1]!, 16);
}

/** Mechanical proof of each allowlist kind for one difference. */
function proveKind(kind: Kind, difference: Difference): void {
  const label = `${difference.corpus} ${difference.id}`;
  switch (kind) {
    case "script-itemization": {
      // fontkit itself, given M1's script runs, produces the M1 line: the
      // shapers agree and only the legacy one-script-per-line call differs.
      expect(same(difference.perRun, difference.m1.glyphs), label).toBe(true);
      expect(same(difference.perRun, difference.legacy.glyphs), label).toBe(false);
      expect(
        new Set(itemizeScripts(difference.text).map((run) => run.script)),
        label,
      ).toEqual(new Set(["Latin", "Thai"]));
      return;
    }
    case "thai-mark-shaping": {
      // Not itemization (the line is Thai only) but the shaper: the same
      // characters, the same non-mark glyphs in the same order, and only
      // Thai marks reordered or swapped for a contextual form.
      expect(same(difference.perRun, difference.m1.glyphs), label).toBe(false);
      expect(difference.legacyNames.length, label).toBe(difference.m1Names.length);
      const base = (name: string) => name.replace(/\..*$/, "");
      expect([...difference.legacyNames].map(base).sort(), label).toEqual(
        [...difference.m1Names].map(base).sort(),
      );
      const isMark = (name: string) => THAI_MARKS.has(codePointOfName(name) ?? -1);
      expect(
        difference.legacyNames.filter((name) => !isMark(name)),
        label,
      ).toEqual(difference.m1Names.filter((name) => !isMark(name)));
      for (const [index, name] of difference.legacyNames.entries()) {
        if (name !== difference.m1Names[index]) {
          expect(isMark(name) && isMark(difference.m1Names[index]!), label).toBe(true);
        }
      }
      return;
    }
    case "inter-endash-case": {
      // Only the en dash differs, and it is Inter's own `calt` rule: with
      // calt off HarfBuzz gives the plain dash. fontkit applies the same
      // rule when the dash touches figures (`5–2`) but drops it when the
      // context spans a space (`5 – 2`); HarfBuzz applies it to both and,
      // as the font intends, not between lowercase letters (`a – a`).
      const changed = difference.legacyNames.flatMap((name, index) =>
        name === difference.m1Names[index] ? [] : [[name, difference.m1Names[index]]],
      );
      expect(changed, label).toEqual([["endash", "endash.case"]]);
      const bytes = registry.get("Inter", 400, "normal").bytes;
      const hb = shaper.instantiate(shaper.loadFace(bytes), { wght: 400 });
      const fk = difference.fontkitFace;
      const hbNames = (text: string, calt = true) =>
        shaper
          .shape(hb, { text, ...(calt ? {} : { features: { calt: false } }) })
          .glyphs.map((glyph) => shaper.glyphOutline(hb, glyph.id).name);
      const fkNames = (text: string) =>
        fontkitShaper
          .shape(fk, { text, features: { calt: true } })
          .glyphs.map((glyph) => fontkitShaper.glyphOutline(fk, glyph.id).name);
      expect(hbNames(difference.text, false), label).toEqual(difference.legacyNames);
      expect(hbNames("5–2")).toContain("endash.case");
      expect(fkNames("5–2")).toContain("endash.case");
      expect(hbNames("5 – 2")).toContain("endash.case");
      expect(fkNames("5 – 2")).toContain("endash");
      expect(hbNames("a – a")).toContain("endash");
      return;
    }
    case "dflt-duplicate-kern": {
      // Same glyphs; legacy applies Inter's 7→8 pair once more. The line has
      // no strong script, so fontkit uses DFLT, whose kern feature lists
      // lookups [2, 3, 1, 2, 3, 1]; under latn fontkit agrees with M1.
      expect(sameIds(difference.legacy.glyphs, difference.m1.glyphs), label).toBe(true);
      const deltas = difference.legacy.glyphs.flatMap((glyph, index) => {
        const delta = difference.m1.glyphs[index]!.advance - glyph.advance;
        return Math.abs(delta) > POSITION_TOLERANCE
          ? [
              [
                difference.legacyNames[index],
                difference.legacyNames[index + 1],
                Math.round(delta * 1000) / 1000,
              ],
            ]
          : [];
      });
      expect(deltas, label).toEqual([["seven", "eight", 29]]);
      const latn = fontkitShaper.shape(difference.fontkitFace, {
        text: difference.text,
        script: "latn",
      });
      const units = (value: number) => Math.round(value * 1000) / 1000;
      expect(
        latn.glyphs.map((glyph) => units(glyph.xAdvance)),
        label,
      ).toEqual(difference.m1.glyphs.map((glyph) => units(glyph.advance)));
      expect(
        itemizeScripts(difference.text).map((run) => run.script),
        label,
      ).toEqual(["Common"]);
      return;
    }
  }
}

describe("M2 differential corpus: legacy fontkit path against the M1 HarfBuzz path", () => {
  it("records the shapers the allowlist was made with", () => {
    expect(allowlist.shapers).toEqual({
      legacy: fontkitShaper.id,
      m1: shaper.id,
    });
  });

  it("matches glyph IDs and positions on C-LAT, C-TH and C-MIX except the allowlist", () => {
    const { lines, differences } = computeDifferences();
    expect(lines).toBe(314);
    const actual = differences.map((difference) => ({
      corpus: difference.corpus,
      id: difference.id,
      glyphIds: !sameIds(difference.legacy.glyphs, difference.m1.glyphs),
      change: difference.change,
    }));
    const expected = allowlist.entries.map((entry) => ({
      corpus: entry.corpus,
      id: entry.id,
      glyphIds: entry.glyphIds,
      change: entry.change,
    }));
    // A new, changed or vanished difference fails here; the message lists it.
    expect(actual).toEqual(expected);
    const byId = new Map(differences.map((difference) => [difference.id, difference]));
    for (const entry of allowlist.entries) {
      expect(allowlist.kinds[entry.kind], entry.kind).toBeDefined();
      proveKind(entry.kind, byId.get(entry.id)!);
    }
  }, 120_000);

  it("explains every kind and uses each one", () => {
    const kinds = Object.keys(allowlist.kinds).sort();
    expect(kinds).toEqual([
      "dflt-duplicate-kern",
      "inter-endash-case",
      "script-itemization",
      "thai-mark-shaping",
    ]);
    for (const kind of kinds as Kind[]) {
      expect(allowlist.kinds[kind].explanation.length).toBeGreaterThan(80);
      expect(allowlist.entries.some((entry) => entry.kind === kind)).toBe(true);
    }
    const counts: Record<string, number> = {};
    for (const entry of allowlist.entries) {
      const key = `${entry.corpus} ${entry.kind} ${entry.glyphIds ? "ids" : "positions"}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    expect(counts).toEqual({
      "C-LAT inter-endash-case ids": 1,
      "C-LAT dflt-duplicate-kern positions": 1,
      "C-TH thai-mark-shaping ids": 4,
      "C-MIX script-itemization ids": 32,
      "C-MIX script-itemization positions": 26,
    });
  });
});

/** Glyph names of one line on a path. */
function names(set: SetLine, face: ShaperFace): string[] {
  return set.glyphs.map((glyph) => shaper.glyphOutline(face, glyph.id).name ?? "");
}

describe("M2: the known fontkit defects are fixed on M1 and kept on legacy", () => {
  it("§3.1 one script per line: AI ที่ป้ญู", () => {
    const face = shaper.loadFace(registry.get("Noto Sans Thai", 400, "normal").bytes);
    const text = "AI ที่ป้ญู";
    const contextual = ["uni0E48.small", "uni0E49.narrow", "uni0E0D.less"];
    const legacy = names(setLine(registry, "Noto Sans Thai", text, 1000), face);
    const fixed = names(
      setLine(m1("Noto Sans Thai"), "Noto Sans Thai", text, 1000),
      face,
    );
    for (const form of contextual) {
      expect(legacy).not.toContain(form);
      expect(fixed).toContain(form);
    }
    // The Thai-only control line agrees on both paths.
    const control = "ที่ป้ญู";
    expect(names(setLine(registry, "Noto Sans Thai", control, 1000), face)).toEqual(
      names(setLine(m1("Noto Sans Thai"), "Noto Sans Thai", control, 1000), face),
    );
  });

  it("§3.1 tracking after every glyph: marks move and lines over-measure on legacy only", () => {
    const th = corpus("c-th");
    const fontSize = 1000;
    const tracking = 0.05 * fontSize;
    const engine = m1(th.face.family);
    const noLigatures = { liga: false, clig: false, dlig: false };
    const tally = (path: Setter, features?: SetLinesInput["features"]) => {
      let marks = 0;
      let moved = 0;
      let lines = 0;
      let overMeasured = 0;
      for (const entry of th.entries) {
        const plain = setLine(path, th.face.family, entry.text, fontSize, 0, features);
        const tracked = setLine(path, th.face.family, entry.text, fontSize, tracking);
        expect(tracked.glyphs.map((glyph) => glyph.id)).toEqual(
          plain.glyphs.map((glyph) => glyph.id),
        );
        let base = 0;
        for (const [index, glyph] of plain.glyphs.entries()) {
          // A mark is a zero-advance glyph; its base the last spacing glyph.
          if (glyph.advance !== 0 || index === 0) {
            base = index;
            continue;
          }
          marks += 1;
          const before = glyph.x - plain.glyphs[base]!.x;
          const after = tracked.glyphs[index]!.x - tracked.glyphs[base]!.x;
          if (Math.abs(after - before) > 1e-6) moved += 1;
        }
        // Legacy counts a gap after every glyph but the last. On a line
        // with a mark that is more gaps than character units.
        if (!plain.glyphs.some((glyph, index) => index > 0 && glyph.advance === 0)) {
          continue;
        }
        lines += 1;
        const excess = tracked.width - plain.width;
        if (Math.abs(excess - (plain.glyphs.length - 1) * tracking) < 1e-6) {
          overMeasured += 1;
        }
      }
      return { marks, moved, lines, overMeasured };
    };
    const legacy = tally(registry);
    const fixed = tally(engine, noLigatures);
    expect(legacy.marks).toBe(263);
    expect(legacy.moved).toBe(legacy.marks);
    expect(legacy.lines).toBe(53);
    expect(legacy.overMeasured).toBe(legacy.lines);
    expect(fixed.marks).toBe(legacy.marks);
    expect(fixed.moved).toBe(0);
    expect(fixed.lines).toBe(legacy.lines);
    expect(fixed.overMeasured).toBe(0);
  });

  it("ADR 0019: sara am reordering and contextual tone marks", () => {
    const face = shaper.loadFace(registry.get("Noto Sans Thai", 400, "normal").bytes);
    const legacy = names(setLine(registry, "Noto Sans Thai", "น้ำ", 1000), face);
    const fixed = names(
      setLine(m1("Noto Sans Thai"), "Noto Sans Thai", "น้ำ", 1000),
      face,
    );
    expect(legacy).toEqual(["uni0E19", "uni0E49", "uni0E4D", "uni0E32"]);
    expect(fixed).toEqual(["uni0E19", "uni0E4D", "uni0E49.small", "uni0E32"]);
    const legacyPu = names(setLine(registry, "Noto Sans Thai", "ปู่", 1000), face);
    const fixedPu = names(
      setLine(m1("Noto Sans Thai"), "Noto Sans Thai", "ปู่", 1000),
      face,
    );
    expect(legacyPu).toEqual(["uni0E1B", "uni0E39", "uni0E48"]);
    expect(fixedPu).toEqual(["uni0E1B", "uni0E39", "uni0E48.narrow"]);
  });

  it("ADR 0019: seven→eight is kerned twice on legacy and once on M1", () => {
    const legacy = setLine(registry, "Inter", "78", 2048).glyphs;
    const fixed = setLine(m1("Inter"), "Inter", "78", 2048).glyphs;
    expect(legacy[0]!.advance).toBeCloseTo(1101, 6);
    expect(fixed[0]!.advance).toBe(1130);
  });

  it("ADR 0019: instanced outlines are rounded on legacy and exact on M1", () => {
    // Inter rows of the fontTools 4.60.1 reference used by T03.
    const reference = JSON.parse(
      gunzipSync(
        readFileSync(
          new URL("typography/oracles/instancer-reference-m1.json.gz", import.meta.url),
        ),
      ).toString("utf8"),
    ) as {
      fonts: Record<
        string,
        {
          unitsPerEm: number;
          glyphNames: string[];
          rows: {
            axis: string;
            value: number;
            glyphs: Record<string, { float: [string, number[]][] }>;
          }[];
        }
      >;
    };
    const inter = reference.fonts["Inter-Variable.ttf"]!;
    const bytes = registry.get("Inter", 400, "normal").bytes;
    const worst = (use: typeof fontkitShaper | HarfBuzzShaper) => {
      const base = use.loadFace(bytes);
      const ids = new Map<string, number>();
      for (const name of inter.glyphNames) {
        const character =
          name === "ampersand"
            ? "&"
            : name === "zero"
              ? "0"
              : name.startsWith("uni")
                ? String.fromCodePoint(Number.parseInt(name.slice(3), 16))
                : name;
        ids.set(name, use.shape(base, { text: character }).glyphs[0]!.id);
      }
      let delta = 0;
      for (const row of inter.rows) {
        const face = use.instantiate(base, { [row.axis]: row.value });
        for (const [name, glyph] of Object.entries(row.glyphs)) {
          const actual = use
            .glyphOutline(face, ids.get(name)!)
            .commands.filter((command) => command.command !== "closePath")
            .flatMap((command) => command.args);
          const expected = glyph.float.flatMap(([, args]) => args);
          for (
            let index = 0;
            index < Math.min(actual.length, expected.length);
            index += 1
          ) {
            delta = Math.max(
              delta,
              (Math.abs(actual[index]! - expected[index]!) * 1000) / inter.unitsPerEm,
            );
          }
        }
      }
      return delta;
    };
    expect(worst(fontkitShaper)).toBeGreaterThan(0.2);
    expect(worst(shaper)).toBeLessThanOrEqual(0.01);
  }, 60_000);
});
