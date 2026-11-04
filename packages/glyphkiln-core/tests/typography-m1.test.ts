import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { beforeAll, describe, expect, it } from "vitest";

import { FontRegistry } from "../src/fonts/index.js";
import { loadHarfBuzzShaper, type HarfBuzzShaper } from "../src/fonts/harfbuzz.js";
import { fontkitShaper } from "../src/fonts/shaper.js";
import {
  automaticOpticalSize,
  resolveCoordinates,
  type FontModel,
} from "../src/typography/font-model.js";
import { createTypesetter, loadTypographyEngine } from "../src/typography/engine.js";
import { itemizeScripts, scriptOf } from "../src/typography/script-runs.js";
import type { M1Typesetter } from "../src/typography/typesetter.js";

type Corpus = {
  face: { family: string; weight: number };
  entries: { id: string; text: string }[];
};

function corpus(name: string): Corpus {
  return JSON.parse(
    readFileSync(new URL(`typography/corpora/${name}.json`, import.meta.url), "utf8"),
  ) as Corpus;
}

let shaper: HarfBuzzShaper;
let registry: FontRegistry;

beforeAll(async () => {
  await loadTypographyEngine();
  shaper = await loadHarfBuzzShaper();
  registry = new FontRegistry();
});

function typesetter(
  model: Partial<FontModel> & { family: string },
  layerId = "test",
): M1Typesetter {
  return createTypesetter({
    registry,
    model: { weight: 400, style: "normal", ...model },
    shortSidePx: 1080,
    layerId,
  });
}

function setLine(
  engine: M1Typesetter,
  text: string,
  fontSize: number,
  letterSpacing = 0,
  weight = 400,
) {
  return engine.setLines({
    lines: [text],
    family: "unused",
    weight,
    style: "normal",
    fontSize,
    lineHeight: 1,
    x: 0,
    y: 0,
    align: "left",
    letterSpacing,
  })[0]!;
}

describe("script-runs@1.0.0", () => {
  it("attaches Common and Inherited to the preceding run, else the following", () => {
    expect(scriptOf(0x0e01)).toBe("Thai");
    expect(scriptOf(0x0041)).toBe("Latin");
    expect(scriptOf(0x0020)).toBe("Common");
    expect(itemizeScripts("AI ที่ป้ญู 2026")).toEqual([
      { script: "Latin", start: 0, end: 3 },
      { script: "Thai", start: 3, end: 15 },
    ]);
    expect(itemizeScripts("“499 บาท”")).toEqual([{ script: "Thai", start: 0, end: 9 }]);
    expect(itemizeScripts("2026 — 499")).toEqual([
      { script: "Common", start: 0, end: 10 },
    ]);
    expect(itemizeScripts("")).toEqual([]);
  });
});

describe("T01 script-run shaping on C-MIX", () => {
  it("equals each script run shaped alone by the pinned hb-shape oracle", async () => {
    // Independent oracle: harfbuzzjs directly, OpenType script tags, runs
    // from the M0 development itemizer over the vendored Scripts.txt.
    const oracles = await import("../scripts/typography/oracles.mjs");
    const itemize = oracles.createScriptItemizer();
    const hb = await import("harfbuzzjs");
    const mix = corpus("c-mix");
    const font = registry.get(mix.face.family, mix.face.weight, "normal");
    const hbFace = new hb.Face(new hb.Blob(font.bytes), 0);
    const hbFont = new hb.Font(hbFace);
    hbFont.setVariations([new hb.Variation("wght", 400)]);
    const upem = hbFace.upem;
    const engine = typesetter({ family: mix.face.family });
    expect(mix.entries.length).toBeGreaterThanOrEqual(200);
    let changed = 0;
    for (const entry of mix.entries) {
      const expected: { id: number; x: number; y: number }[] = [];
      let pen = 0;
      for (const run of itemize(entry.text)) {
        const buffer = new hb.Buffer();
        buffer.addText(entry.text.slice(run.start, run.end));
        buffer.setClusterLevel(hb.ClusterLevel.CHARACTERS);
        buffer.guessSegmentProperties();
        buffer.setScript(
          run.script === "Thai" ? "thai" : run.script === "Latin" ? "latn" : "zyyy",
        );
        buffer.setDirection(hb.Direction.LTR);
        hb.shape(hbFont, buffer, []);
        for (const glyph of buffer.getGlyphInfosAndPositions()) {
          expected.push({
            id: glyph.codepoint,
            x: pen + (glyph.xOffset ?? 0),
            y: 0 - (glyph.yOffset ?? 0) + 0,
          });
          pen += glyph.xAdvance ?? 0;
        }
      }
      const set = setLine(engine, entry.text, upem);
      const actual = set.glyphs.map((glyph) => ({
        id: glyph.id,
        x: glyph.x,
        y: glyph.y - set.baseline + 0,
      }));
      expect(actual, entry.id).toEqual(expected);
      const whole = shaper.shape(
        shaper.instantiate(shaper.loadFace(font.bytes), { wght: 400 }),
        {
          text: entry.text,
        },
      );
      if (
        whole.glyphs.map((glyph) => glyph.id).join() !==
        actual.map((glyph) => glyph.id).join()
      ) {
        changed += 1;
      }
    }
    // Itemization changes the same 32 lines the M0 spike found.
    expect(changed).toBe(32);
  }, 60_000);

  it("fixes the §3.1 probe: AI ที่ป้ญู picks the contextual Thai forms", () => {
    const engine = typesetter({ family: "Noto Sans Thai" });
    const face = shaper.loadFace(registry.get("Noto Sans Thai", 400, "normal").bytes);
    const names = setLine(engine, "AI ที่ป้ญู", 1000).glyphs.map(
      (glyph) => shaper.glyphOutline(face, glyph.id).name,
    );
    expect(names).toEqual(
      expect.arrayContaining(["uni0E48.small", "uni0E49.narrow", "uni0E0D.less"]),
    );
  });
});

describe("T08 cluster tracking on C-TH", () => {
  const th = corpus("c-th");

  it("keeps every mark on its base, adds gaps between units only, and splits sara am", () => {
    const engine = typesetter({ family: th.face.family });
    const fontSize = 1000;
    const noLigatures = { liga: false, clig: false, dlig: false };
    for (const entry of th.entries) {
      // Tracking switches optional ligatures off, so compare with that set.
      const plain = engine.setLines({
        lines: [entry.text],
        family: "x",
        weight: 400,
        style: "normal",
        fontSize,
        lineHeight: 1,
        x: 0,
        y: 0,
        align: "left",
        features: noLigatures,
      })[0]!;
      for (const trackingEm of [-0.02, 0.05, 0.1]) {
        const tracking = trackingEm * fontSize;
        const tracked = setLine(engine, entry.text, fontSize, tracking);
        expect(
          tracked.glyphs.map((glyph) => glyph.id),
          entry.id,
        ).toEqual(plain.glyphs.map((glyph) => glyph.id));
        // Offsets between consecutive glyphs change only at unit starts, by
        // exactly the tracking; within a unit (base + marks) they are equal.
        let gaps = 0;
        for (let index = 1; index < plain.glyphs.length; index += 1) {
          const before = plain.glyphs[index]!.x - plain.glyphs[index - 1]!.x;
          const after = tracked.glyphs[index]!.x - tracked.glyphs[index - 1]!.x;
          const delta = Math.round((after - before) * 1000) / 1000;
          expect(
            [0, Math.round(tracking * 1000) / 1000],
            `${entry.id} glyph ${index}`,
          ).toContain(delta);
          if (delta !== 0) gaps += 1;
          expect(tracked.glyphs[index]!.y).toBe(plain.glyphs[index]!.y);
        }
        expect(tracked.width).toBeCloseTo(plain.width + gaps * tracking, 6);
        // No trailing tracking: the last glyph's advance carries no gap.
        const last = tracked.glyphs.at(-1)!;
        expect(last.advance).toBeCloseTo(plain.glyphs.at(-1)!.advance, 6);
      }
    }
  });

  it("counts units as grapheme clusters with sara am split before sara aa", () => {
    const engine = typesetter({ family: "Noto Sans Thai" });
    const plain = setLine(engine, "น้ำ", 1000, 0);
    const tracked = setLine(engine, "น้ำ", 1000, 100);
    // One grapheme, two units (นํ้ + า): exactly one gap, before sara aa.
    expect(tracked.width - plain.width).toBeCloseTo(100, 6);
    const face = shaper.loadFace(registry.get("Noto Sans Thai", 400, "normal").bytes);
    const names = tracked.glyphs.map(
      (glyph) => shaper.glyphOutline(face, glyph.id).name,
    );
    const aa = names.findIndex((name) => name === "uni0E32");
    const nikhahit = names.findIndex((name) => name?.startsWith("uni0E4D") === true);
    expect(aa).toBeGreaterThan(nikhahit);
    // The nikhahit keeps its offset over the consonant; only sara aa moves.
    expect(tracked.glyphs[nikhahit]!.x).toBe(plain.glyphs[nikhahit]!.x);
    expect(tracked.glyphs[aa]!.x - plain.glyphs[aa]!.x).toBeCloseTo(100, 6);
    // The line-width rule: untracked width + (units − 1) × tracking.
    const units = (text: string) => {
      const base = setLine(engine, text, 1000, 0).width;
      return Math.round((setLine(engine, text, 1000, 100).width - base) / 100) + 1;
    };
    expect(units("กำลัง")).toBe(4);
    expect(units("ทำ ได้")).toBe(5);
  });

  it("turns optional ligatures off under tracking unless asked for", () => {
    const engine = typesetter({ family: "Source Serif 4" });
    const plain = setLine(engine, "office", 1000, 0).glyphs.length;
    const tracked = setLine(engine, "office", 1000, 50).glyphs.length;
    expect(plain).toBeLessThan(6);
    expect(tracked).toBe(6);
    const asked = createTypesetter({
      registry,
      model: { family: "Source Serif 4", weight: 400, style: "normal" },
      shortSidePx: 1080,
      layerId: "t",
      requestedFeatures: { liga: true },
    });
    const withLiga = asked.setLines({
      lines: ["office"],
      family: "x",
      weight: 400,
      style: "normal",
      fontSize: 1000,
      lineHeight: 1,
      x: 0,
      y: 0,
      align: "left",
      letterSpacing: 50,
      features: { liga: true },
    })[0]!;
    expect(withLiga.glyphs.length).toBe(plain);
  });
});

describe("T04 optical-size-auto@1.0.0 (Q6 provisional: opsz = 0.75 × px at 1080)", () => {
  it("follows the documented mapping, clamps, and yields to an explicit value", () => {
    const table: [number, number, number][] = [
      // [font size px, canvas short side, opsz before clamping]
      [16, 1080, 12],
      [24, 1080, 18],
      [32, 1080, 24],
      [42.67, 1080, 32],
      [64, 1080, 48],
      [96, 1080, 72],
      [48, 2160, 18],
      [30, 720, 33.75],
    ];
    for (const [size, side, opsz] of table) {
      expect(automaticOpticalSize(size, side), `${size}@${side}`).toBe(opsz);
    }
    const inter = {
      opsz: { min: 14, default: 14, max: 32 },
      wght: { min: 100, default: 400, max: 900 },
    };
    const resolve = (model: FontModel | object, fontSizePx: number) =>
      resolveCoordinates({
        model,
        weight: 700,
        axes: inter,
        namedInstances: [],
        fontSizePx,
        shortSidePx: 1080,
        layerId: "l",
        family: "Inter",
        primary: true,
      });
    expect(resolve({}, 12).coordinates).toEqual({ opsz: 14, wght: 700 });
    expect(resolve({}, 24).coordinates).toEqual({ opsz: 18, wght: 700 });
    // Inter headlines at or above 42.67 px (reference) render with opsz 32.
    expect(resolve({}, 42.67).coordinates["opsz"]).toBe(32);
    expect(resolve({}, 168).coordinates["opsz"]).toBe(32);
    expect(resolve({ opsz: 20 }, 168).coordinates["opsz"]).toBe(20);
    expect(resolve({ opticalSizing: "none" }, 168).coordinates["opsz"]).toBe(14);
    expect(resolve({ axes: { opsz: 16 } }, 168).coordinates["opsz"]).toBe(16);
  });

  it("renders a large Inter headline with the display cut", () => {
    const engine = typesetter({ family: "Inter" });
    setLine(engine, "Light", 96, 0, 700);
    expect(engine.usedFaces()[0]?.coordinates).toEqual({ opsz: 32, wght: 700 });
  });
});

describe("T03 every fvar axis, named instances and range errors", () => {
  it("matches the fontTools 4.60.1 reference within 0.5/1000 em for every bundled variable file", () => {
    const reference = JSON.parse(
      gunzipSync(
        readFileSync(
          new URL("typography/oracles/instancer-reference-m1.json.gz", import.meta.url),
        ),
      ).toString("utf8"),
    ) as {
      fontTools: string;
      fonts: Record<
        string,
        {
          sha256: string;
          unitsPerEm: number;
          glyphNames: string[];
          rows: {
            axis: string;
            value: number;
            position: string;
            glyphs: Record<string, { float: [string, number[]][] }>;
          }[];
        }
      >;
    };
    expect(reference.fontTools).toBe("4.60.1");
    expect(Object.keys(reference.fonts)).toHaveLength(9);
    let worst = 0;
    for (const [file, font] of Object.entries(reference.fonts)) {
      const path =
        file === "Inter-Variable.ttf"
          ? "../assets/fonts/Inter-Variable.ttf"
          : `../assets/fonts/${file.replace(/[-[].*$/, "").toLowerCase()}/${file}`;
      const bytes = readFileSync(new URL(path, import.meta.url));
      const base = shaper.loadFace(bytes);
      // fontTools names the sampled glyphs from the cmap; map them back.
      const characterOf = (name: string): string =>
        name === "ampersand"
          ? "&"
          : name === "zero"
            ? "0"
            : name.startsWith("uni")
              ? String.fromCodePoint(Number.parseInt(name.slice(3), 16))
              : name;
      const byName = new Map(
        font.glyphNames.map((name) => [
          name,
          shaper.nominalGlyph(base, characterOf(name).codePointAt(0)!)!,
        ]),
      );
      for (const row of font.rows) {
        const instance = shaper.instantiate(base, { [row.axis]: row.value });
        for (const [name, glyph] of Object.entries(row.glyphs)) {
          const actual = shaper
            .glyphOutline(instance, byName.get(name)!)
            .commands.flatMap((command) => command.args);
          const expected = glyph.float.flatMap(([, args]) => args);
          const points = Math.min(actual.length, expected.length);
          for (let index = 0; index < points; index += 1) {
            worst = Math.max(
              worst,
              (Math.abs(actual[index]! - expected[index]!) * 1000) / font.unitsPerEm,
            );
          }
          expect(
            Math.abs(actual.length - expected.length),
            `${file} ${row.axis}=${row.value} ${name}`,
          ).toBeLessThanOrEqual(0);
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(0.5);
  }, 120_000);

  it("resolves named instances by name and rejects out-of-range values", () => {
    // IBM Plex Sans names weight instances only; width comes from axes.
    const named = typesetter({
      family: "IBM Plex Sans",
      namedInstance: "SemiBold",
      axes: { wdth: 85 },
    });
    setLine(named, "Plex", 40);
    expect(named.usedFaces()[0]).toMatchObject({
      namedInstance: "SemiBold",
      coordinates: { wdth: 85, wght: 600 },
    });
    expect(named.issues).toEqual([]);

    const unknown = typesetter({
      family: "IBM Plex Sans",
      namedInstance: "Ultra Wide",
    });
    setLine(unknown, "Plex", 40);
    expect(unknown.issues.map((issue) => issue.code)).toEqual([
      "FONT_NAMED_INSTANCE_UNKNOWN",
    ]);

    const outside = typesetter({ family: "Noto Sans Thai", axes: { wdth: 50 } });
    setLine(outside, "ไทย", 40);
    expect(outside.issues).toEqual([
      expect.objectContaining({
        code: "FONT_AXIS_OUT_OF_RANGE",
        severity: "error",
        details: {
          family: "Noto Sans Thai",
          axis: "wdth",
          value: 50,
          min: 62.5,
          max: 100,
        },
      }),
    ]);
    expect(outside.usedFaces()[0]?.coordinates).toEqual({ wdth: 62.5, wght: 400 });

    const missing = typesetter({ family: "Kanit", axes: { wdth: 80 } });
    setLine(missing, "กา", 40);
    expect(missing.issues.map((issue) => issue.code)).toEqual([
      "FONT_AXIS_UNAVAILABLE",
    ]);
  });
});

const PAIRINGS: [latin: string, thai: string][] = [
  ["IBM Plex Sans", "IBM Plex Sans Thai"],
  ["Inter", "Noto Sans Thai"],
  ["Source Serif 4", "Noto Serif Thai"],
  ["Instrument Serif", "Trirong"],
  ["Barlow Condensed", "Kanit"],
  ["Schibsted Grotesk", "Sarabun"],
];

describe("T05 fallback stacks and composite fonts", () => {
  it("takes every Thai cluster from the Thai face and every Latin cluster from the Latin face", () => {
    for (const [latin, thai] of PAIRINGS) {
      const engine = typesetter({ family: latin, fallback: [{ family: thai }] });
      const text = "วางแผน AI Pilot ให้ชัด ก่อนลงมือทำจริง";
      const line = setLine(engine, text, 64);
      for (const glyph of line.glyphs) {
        const script = scriptOf(text.codePointAt(glyph.cluster)!);
        if (script === "Thai")
          expect(glyph.face, `${latin} ${text[glyph.cluster]}`).toBe(thai);
        if (script === "Latin") expect(glyph.face).toBe(latin);
      }
      expect(engine.missingCodePoints(text, latin, 400, "normal")).toEqual([]);
      expect(engine.usedFaces().map((face) => [face.family, face.role])).toEqual([
        [thai, "fallback"],
        [latin, "primary"],
      ]);
    }
  });

  it("never splits a grapheme cluster across faces and reports only uncovered clusters", () => {
    // Inter has no Thai: with no fallback the Thai clusters are missing.
    const alone = typesetter({ family: "Inter" });
    expect(alone.missingCodePoints("Aก", "Inter", 400, "normal")).toEqual([0x0e01]);
    const stacked = typesetter({ family: "Inter", fallback: [{ family: "Kanit" }] });
    const text = "ก่ำ x";
    const line = setLine(stacked, text, 50);
    const faces = new Set(
      line.glyphs.filter((glyph) => glyph.cluster < 3).map((glyph) => glyph.face),
    );
    expect([...faces]).toEqual(["Kanit"]);
    expect(stacked.missingCodePoints("ก่ำ x ㄱ", "Inter", 400, "normal")).toEqual([
      0x3131,
    ]);
  });

  it("puts script faces ahead of the stack", () => {
    const engine = typesetter({
      family: "Noto Sans Thai",
      scriptFaces: { latn: { family: "IBM Plex Sans" } },
    });
    const line = setLine(engine, "AI ไทย", 40);
    expect(line.glyphs.map((glyph) => glyph.face)).toEqual([
      "IBM Plex Sans",
      "IBM Plex Sans",
      "IBM Plex Sans",
      ...Array<string>(line.glyphs.length - 3).fill("Noto Sans Thai"),
    ]);
  });
});

describe("T06 cross-script optical matching (script-matching@1.0.0)", () => {
  function inkHeight(engine: M1Typesetter, text: string, fontSize: number): number {
    const line = setLine(engine, text, fontSize);
    const numbers = line.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const ys = numbers.filter((_, index) => index % 2 === 1);
    return Math.max(...ys) - Math.min(...ys);
  }

  it("matches Latin x-height to Thai body height within 3 % for every approved pairing", () => {
    for (const [latin, thai] of PAIRINGS) {
      const engine = typesetter({
        family: latin,
        fallback: [{ family: thai, scale: "auto" }],
      });
      const ratio = inkHeight(engine, "x", 400) / inkHeight(engine, "น", 400);
      expect(Math.abs(ratio - 1), `${latin} + ${thai}: ${ratio}`).toBeLessThanOrEqual(
        0.03,
      );
      expect(engine.usedFaces().find((face) => face.family === thai)?.scale).not.toBe(
        1,
      );
    }
  });

  it("reproduces explicit scale and baseline shift exactly", () => {
    const engine = typesetter({
      family: "IBM Plex Sans",
      fallback: [{ family: "IBM Plex Sans Thai", scale: 0.9, baselineShift: 0.05 }],
    });
    const plain = typesetter({ family: "IBM Plex Sans Thai" });
    const scaledLine = setLine(engine, "น", 100);
    const referenceLine = setLine(plain, "น", 90);
    const scaled = scaledLine.glyphs[0]!;
    const reference = referenceLine.glyphs[0]!;
    expect(scaled.advance).toBeCloseTo(reference.advance, 9);
    // Shifted 0.05 em (5 px) above the shared baseline.
    expect(scaled.y - scaledLine.baseline).toBeCloseTo(
      reference.y - referenceLine.baseline - 5,
      9,
    );
    expect(engine.usedFaces()[0]).toMatchObject({ scale: 0.9, baselineShift: 0.05 });
  });
});

describe("ADR 0019 seven→eight kerning", () => {
  it("is fontkit applying Inter's duplicated DFLT kern lookups twice", () => {
    const bytes = registry.get("Inter", 400, "normal").bytes;
    const hbFace = shaper.loadFace(bytes);
    const fkFace = fontkitShaper.loadFace(bytes);
    const advances = (
      face: typeof hbFace,
      use: typeof shaper | typeof fontkitShaper,
      script?: string,
    ) =>
      use
        .shape(face, { text: "78", ...(script === undefined ? {} : { script }) })
        .glyphs.map((glyph) => glyph.xAdvance);
    const unkerned = fontkitShaper.shape(fkFace, {
      text: "78",
      features: { kern: false },
    }).glyphs[0]!.xAdvance;
    expect(unkerned).toBe(1159);
    // HarfBuzz applies the 7→8 pair once (−29) whatever the script.
    expect(advances(hbFace, shaper)).toEqual([1130, 1267]);
    expect(advances(hbFace, shaper, "Latn")).toEqual([1130, 1267]);
    // fontkit applies it once under latn, but twice (−58) when digits alone
    // resolve to DFLT, whose kern feature lists lookups [2, 3, 1, 2, 3, 1].
    expect(advances(fkFace, fontkitShaper, "latn")).toEqual([1130, 1267]);
    expect(advances(fkFace, fontkitShaper)).toEqual([1101, 1267]);
  });
});
