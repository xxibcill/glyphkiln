import { readFileSync } from "node:fs";

import { bundledFontFile, type DesignDocument } from "../../../src/index.js";
import type { SceneDocument } from "../../../src/scene/index.js";

/**
 * Inputs for the typography M1 visual baselines. Every document is built
 * from this pinned table, so a baseline change is always a source change.
 *
 * - One specimen per bundled family at three sizes (28, 56 and 112 px on a
 *   1080 px canvas), on Scene 1.1.0.
 * - Each provisional Thai–Latin pairing set on benchmark brief A (Scene
 *   1.1.0, 1600 × 1600) and on the Kilnform quote (quote-card@1.4.0).
 * - One baseline for each new M1 template version.
 */

type Family = { family: string; weight: number; thai: boolean };

export const FAMILY_SPECIMENS: readonly Family[] = [
  { family: "IBM Plex Sans Thai", weight: 400, thai: true },
  { family: "Noto Sans Thai", weight: 400, thai: true },
  { family: "Sarabun", weight: 400, thai: true },
  { family: "Kanit", weight: 400, thai: true },
  { family: "Trirong", weight: 400, thai: true },
  { family: "Noto Serif Thai", weight: 400, thai: true },
  { family: "IBM Plex Sans", weight: 400, thai: false },
  { family: "Schibsted Grotesk", weight: 400, thai: false },
  { family: "Barlow Condensed", weight: 400, thai: false },
  { family: "Instrument Serif", weight: 400, thai: false },
  { family: "Source Serif 4", weight: 400, thai: false },
  { family: "IBM Plex Mono", weight: 400, thai: false },
];

/**
 * Provisional Thai–Latin pairings (owner review pending): each Thai family
 * with a Latin companion from the approved set, matched with
 * `script-matching@1.0.0` auto scale. Instrument Serif ships one weight, so
 * its pairing sets everything at 400.
 */
export type Pairing = {
  id: string;
  thai: string;
  latin: string;
  headlineWeight: number;
  bodyWeight: number;
  /** Whether the Latin face has `case`, which the K2 attribution requests. */
  caseForms: boolean;
};

export const PAIRINGS: readonly Pairing[] = [
  {
    id: "plex",
    thai: "IBM Plex Sans Thai",
    latin: "IBM Plex Sans",
    headlineWeight: 700,
    bodyWeight: 400,
    caseForms: false,
  },
  {
    id: "noto-inter",
    thai: "Noto Sans Thai",
    latin: "Inter",
    headlineWeight: 700,
    bodyWeight: 400,
    caseForms: true,
  },
  {
    id: "noto-serif",
    thai: "Noto Serif Thai",
    latin: "Source Serif 4",
    headlineWeight: 700,
    bodyWeight: 400,
    caseForms: true,
  },
  {
    id: "trirong-instrument",
    thai: "Trirong",
    latin: "Instrument Serif",
    headlineWeight: 400,
    bodyWeight: 400,
    caseForms: true,
  },
  {
    id: "kanit-barlow",
    thai: "Kanit",
    latin: "Barlow Condensed",
    headlineWeight: 700,
    bodyWeight: 400,
    caseForms: false,
  },
  {
    id: "sarabun-schibsted",
    thai: "Sarabun",
    latin: "Schibsted Grotesk",
    headlineWeight: 700,
    bodyWeight: 400,
    caseForms: true,
  },
];

const INTER_SHA256 = "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031";

function declaration(family: string, weight: number) {
  const sha256 =
    family === "Inter"
      ? INTER_SHA256
      : bundledFontFile(family, weight, "normal")!.sha256;
  return { family, weight, style: "normal" as const, sha256 };
}

function uniqueDeclarations(faces: readonly [string, number][]) {
  const seen = new Set<string>();
  return faces
    .filter(([family, weight]) => {
      const key = `${family}/${weight}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(([family, weight]) => declaration(family, weight));
}

function text(
  id: string,
  content: string,
  font: SceneDocument["elements"][number] extends infer E
    ? E extends { type: "text"; font: infer F }
      ? F
      : never
    : never,
  box: { x: number; y: number; width: number; height: number },
  fit: {
    size: number;
    minimum?: number;
    lines: number;
    lineHeight: number;
    letterSpacing?: number;
    keepTogether?: string[];
  },
  fill: `#${string}`,
): SceneDocument["elements"][number] {
  return {
    id,
    type: "text",
    text: content,
    box,
    font,
    fit: {
      preferredFontSize: fit.size,
      minimumFontSize: fit.minimum ?? fit.size,
      maximumLines: fit.lines,
      lineHeight: fit.lineHeight,
      align: "left",
      ...(fit.letterSpacing === undefined ? {} : { letterSpacing: fit.letterSpacing }),
      ...(fit.keepTogether === undefined ? {} : { keepTogether: fit.keepTogether }),
    },
    fill,
    textMode: "outline",
  };
}

export function familySpecimen(family: Family): SceneDocument {
  const font = {
    family: family.family,
    weight: family.weight,
    style: "normal" as const,
  };
  const lines = family.thai
    ? [
        "ให้ชัด AI",
        "วางแผน AI Pilot 499 บาท",
        "น้ำ ก่ำ ปู่ ญี่ปุ่น ฝั่ง ฟ้า — Office 2026",
      ]
    : ["Glyphkiln", "Light should give a room", "Office AVAWAY 0123456789 — 499 €"];
  return {
    schemaVersion: "1.1.0",
    id: `m1-specimen-${family.family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    seed: "typography-m1",
    dimensions: { width: 1080, height: 1080 },
    title: `${family.family} specimen`,
    description: `${family.family} at 112, 56 and 28 px on the M1 typography.`,
    backgroundColor: "#F4F0E6",
    assets: [],
    fonts: [declaration(family.family, family.weight)],
    elements: [
      text(
        "size-112",
        lines[0]!,
        font,
        { x: 72, y: 96, width: 936, height: 300 },
        { size: 112, lines: 2, lineHeight: 1.2 },
        "#242829",
      ),
      text(
        "size-56",
        lines[1]!,
        font,
        { x: 72, y: 460, width: 936, height: 220 },
        { size: 56, lines: 2, lineHeight: 1.3 },
        "#242829",
      ),
      text(
        "size-28",
        lines[2]!,
        font,
        { x: 72, y: 760, width: 936, height: 200 },
        { size: 28, lines: 3, lineHeight: 1.5, letterSpacing: 1.4 },
        "#5B5F60",
      ),
    ],
    readingOrder: ["size-112", "size-56", "size-28"],
  };
}

/** Benchmark brief A (GD20 input A), fixed copy preserved exactly. */
export function briefA(pairing: Pairing): SceneDocument {
  const face = (weight: number) => ({
    family: pairing.thai,
    weight,
    style: "normal" as const,
    scriptFaces: { latn: { family: pairing.latin, scale: "auto" as const } },
  });
  const ink = "#242829" as const;
  return {
    schemaVersion: "1.1.0",
    id: `m1-brief-a-${pairing.id}`,
    seed: "typography-m1-brief-a",
    dimensions: { width: 1600, height: 1600 },
    title: "Thai planning-service cover",
    description:
      "Benchmark brief A set with a Thai–Latin pairing on the M1 typography.",
    backgroundColor: "#F4F0E6",
    assets: [],
    fonts: uniqueDeclarations([
      [pairing.thai, pairing.headlineWeight],
      [pairing.latin, pairing.headlineWeight],
      [pairing.thai, pairing.bodyWeight],
      [pairing.latin, pairing.bodyWeight],
    ]),
    elements: [
      text(
        "headline",
        "วางแผน AI Pilot ให้ชัด ก่อนลงมือทำจริง",
        face(pairing.headlineWeight),
        { x: 120, y: 140, width: 1360, height: 470 },
        // The brief's starting point: break after ให้ชัด.
        { size: 132, minimum: 72, lines: 3, lineHeight: 1.3, keepTogether: ["ให้ชัด"] },
        ink,
      ),
      text(
        "support",
        "แผนผังกระบวนการ + Pilot Brief สำหรับ 1 เวิร์กโฟลว์",
        face(pairing.bodyWeight),
        { x: 120, y: 680, width: 1360, height: 220 },
        { size: 60, minimum: 36, lines: 2, lineHeight: 1.45 },
        ink,
      ),
      {
        id: "route",
        type: "path",
        data: "M 160 1130 L 1040 1130",
        fill: "none",
        stroke: "#C85F35",
        strokeWidth: 6,
        lineCap: "round",
        semantic: { role: "decoration" },
      },
      ...[160, 453, 747, 1040].map((x, index): SceneDocument["elements"][number] => ({
        id: `node-${index + 1}`,
        type: "circle",
        cx: x,
        cy: 1130,
        radius: 26,
        fill: index === 0 ? "#C85F35" : "#F4F0E6",
        stroke: "#C85F35",
        strokeWidth: 6,
        semantic: { role: "decoration" },
      })),
      {
        id: "brief-sheet",
        type: "rect",
        x: 1180,
        y: 1010,
        width: 300,
        height: 240,
        radius: 12,
        fill: "#FFFFFF",
        stroke: ink,
        strokeWidth: 4,
        semantic: { role: "decoration" },
      },
      text(
        "caption",
        "ภาพประกอบแนวคิด",
        face(pairing.bodyWeight),
        { x: 160, y: 1200, width: 900, height: 70 },
        { size: 30, lines: 1, lineHeight: 1.4 },
        "#5B5F60",
      ),
      text(
        "exclusions",
        "ไม่รวมการติดตั้งระบบ • ไม่รับประกันการประหยัด",
        face(pairing.bodyWeight),
        { x: 120, y: 1350, width: 1360, height: 160 },
        { size: 48, minimum: 32, lines: 2, lineHeight: 1.45 },
        "#C85F35",
      ),
    ],
    readingOrder: ["headline", "support", "caption", "exclusions"],
  };
}

const QUOTE_SOURCE = new URL(
  "../../../../../Deliverables/benchmarks/p1-craft-2026-10-b2/designs/quote.json",
  import.meta.url,
);

/** The Kilnform quote (K2) on quote-card@1.4.0 with a pairing's faces. */
export function kilnformQuote(pairing: Pairing | undefined): DesignDocument {
  const source = JSON.parse(readFileSync(QUOTE_SOURCE, "utf8")) as DesignDocument & {
    brand: { typography: Record<string, unknown> };
  };
  const latin = pairing?.latin ?? "Inter";
  const quoteWeight = pairing?.headlineWeight ?? 700;
  const attributionWeight =
    pairing === undefined || pairing.headlineWeight === 700 ? 600 : 400;
  const role = (weight: number) => ({
    family: latin,
    weight,
    lineHeight: 1.1,
    tracking: 0,
    ...(pairing === undefined
      ? {}
      : { fallback: [{ family: pairing.thai, scale: "auto" }] }),
  });
  const document = {
    ...source,
    schemaVersion: "1.8.0",
    id: `m1-kilnform-quote-${pairing?.id ?? "inter"}`,
    template: { id: "quote-card", version: "1.4.0" },
    brand: {
      ...source.brand,
      typography: {
        ...source.brand.typography,
        // The hanging mark is drawn from headlineFamily at 700.
        headlineFamily: quoteWeight === 700 ? latin : "Inter",
        bodyFamily: latin,
        roles: { display: role(quoteWeight), label: role(attributionWeight) },
      },
    },
    // No procedural layer: decoration without a job is a finding.
    layers: source.layers
      .filter((layer) => layer.type !== "procedural-decoration")
      .map((layer) =>
        layer.id === "quote"
          ? { ...layer, fontWeight: quoteWeight }
          : layer.id === "attribution"
            ? withoutCaseRequest(
                { ...layer, fontWeight: attributionWeight },
                pairing === undefined || pairing.caseForms,
              )
            : layer,
      ),
    fonts: uniqueDeclarations([
      ["Inter", 700],
      [latin, quoteWeight],
      [latin, attributionWeight],
      ...(pairing === undefined
        ? []
        : ([
            [pairing.thai, quoteWeight],
            [pairing.thai, attributionWeight],
          ] as [string, number][])),
    ]),
  };
  return document as unknown as DesignDocument;
}

/** Drop the `case` request where the face lacks it (it would be reported). */
function withoutCaseRequest<T extends object>(layer: T, keep: boolean): T {
  if (keep || !("openType" in layer)) return layer;
  const { openType, ...rest } = layer as T & { openType: Record<string, unknown> };
  const remaining = Object.fromEntries(
    Object.entries(openType).filter(([key]) => key !== "caseSensitiveForms"),
  );
  return (Object.keys(remaining).length === 0
    ? rest
    : { ...rest, openType: remaining }) as unknown as T;
}
