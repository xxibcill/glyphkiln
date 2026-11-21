import type { DesignDocument } from "../../../src/index.js";
import { PAIRINGS, kilnformQuote } from "../m1/specimens.js";

const THAI_QUOTE = "เด็กๆ ชอบมาก ลดราคาพิเศษ 499 บาท ที่เพื่อนไร่เพื่อนสวน";

function withoutEmphasis(layer: object): object {
  return Object.fromEntries(
    Object.entries(layer).filter(([key]) => key !== "emphasis"),
  );
}

/** The Kanit + Barlow Kilnform quote with Thai copy, on quote-card `version`. */
export function thaiQuote(
  version: "1.4.0" | "1.5.0",
  extra: object = {},
): DesignDocument {
  const pairing = PAIRINGS.find((candidate) => candidate.id === "kanit-barlow")!;
  const document = kilnformQuote(pairing);
  return {
    ...document,
    id: `m3-thai-quote-${version.replaceAll(".", "-")}`,
    template: { ...document.template, version },
    layers: document.layers.map((layer) =>
      layer.id === "quote" ? { ...withoutEmphasis(layer), text: THAI_QUOTE } : layer,
    ),
    ...extra,
  } as DesignDocument;
}
