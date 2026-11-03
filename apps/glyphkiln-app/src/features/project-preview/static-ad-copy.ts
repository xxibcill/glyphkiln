import type { DesignDocument, DesignLayer } from "@glyphkiln/core";
import type { PreviewFormState } from "./types";

export const STATIC_AD_TEMPLATE_IDS = [
  "testimonial-evidence",
  "comparison",
  "problem-solution",
  "offer-urgency",
] as const;
export type StaticAdTemplateId = (typeof STATIC_AD_TEMPLATE_IDS)[number];
export type StaticAdCopy = {
  eyebrow: string;
  headline: string;
  subtitle: string;
  attribution: string;
  badge: string;
  cta: string;
  footer: string;
  leftLabel: string;
  rightLabel: string;
  rows: { label: string; left: string; right: string }[];
  problemTitle: string;
  problem: string;
  solutionTitle: string;
  solution: string;
};
export type StaticAdCopies = Record<StaticAdTemplateId, StaticAdCopy>;
export type StaticAdTextField = {
  key: Exclude<keyof StaticAdCopy, "rows">;
  label: string;
  required: boolean;
  maximum: number;
};
const field = (
  key: StaticAdTextField["key"],
  label: string,
  required = false,
  maximum = 2000,
): StaticAdTextField => ({ key, label, required, maximum });
export const STATIC_AD_FIELDS: Record<
  StaticAdTemplateId,
  readonly StaticAdTextField[]
> = {
  "testimonial-evidence": [
    field("eyebrow", "Campaign context"),
    field("headline", "Customer quote", true),
    field("attribution", "Customer name", true),
    field("subtitle", "Customer role"),
    field("badge", "Rating and scale"),
    field("cta", "Call to action"),
    field("footer", "Testimonial source or qualification", true),
  ],
  comparison: [
    field("eyebrow", "Campaign context"),
    field("headline", "Comparison headline", true),
    field("leftLabel", "First option", true, 60),
    field("rightLabel", "Second option", true, 60),
    field("cta", "Call to action"),
    field("footer", "Comparison source or qualification", true),
  ],
  "problem-solution": [
    field("eyebrow", "Campaign context"),
    field("headline", "Problem / solution headline", true),
    field("problemTitle", "Problem title", true, 80),
    field("problem", "Problem explanation", true, 180),
    field("solutionTitle", "Solution title", true, 80),
    field("solution", "Solution explanation", true, 180),
    field("cta", "Call to action"),
    field("footer", "Source or qualification"),
  ],
  "offer-urgency": [
    field("eyebrow", "Campaign context"),
    field("headline", "Offer headline", true),
    field("badge", "Price or discount", true),
    field("subtitle", "Deadline or offer scope"),
    field("cta", "Call to action"),
    field("footer", "Offer terms", true),
  ],
};

export function isStaticAdTemplateId(id: string): id is StaticAdTemplateId {
  return STATIC_AD_TEMPLATE_IDS.some((candidate) => candidate === id);
}

export function createStaticAdCopies(): StaticAdCopies {
  const empty: StaticAdCopy = {
    eyebrow: "GLYPHKILN / SAMPLE BRIEF",
    headline: "",
    subtitle: "",
    attribution: "",
    badge: "",
    cta: "Explore the collection →",
    footer: "Illustrative sample · not a live advertisement",
    leftLabel: "",
    rightLabel: "",
    rows: [],
    problemTitle: "",
    problem: "",
    solutionTitle: "",
    solution: "",
  };
  return {
    "testimonial-evidence": {
      ...empty,
      headline: "“A calmer way to work.”",
      attribution: "Alex Morgan · fictional customer",
      subtitle: "Illustrative testimonial",
      footer: "Demo quote · not a real customer endorsement",
    },
    comparison: {
      ...empty,
      headline: "Choose a repeatable workflow.",
      leftLabel: "Manual exports",
      rightLabel: "Glyphkiln",
      rows: [
        { label: "Inputs", left: "Rebuilt by hand", right: "Pinned document" },
        { label: "Review", left: "Check each file", right: "Keep render evidence" },
      ],
      footer: "Illustrative comparison · verify against your process",
    },
    "problem-solution": {
      ...empty,
      headline: "Less rework. More repeatability.",
      problemTitle: "Rebuild every size",
      problem: "Copy drifts across manually assembled exports.",
      solutionTitle: "Pin the design",
      solution: "Keep the copy and inputs in a versioned document.",
    },
    "offer-urgency": {
      ...empty,
      headline: "Make room for something new.",
      badge: "20% OFF",
      subtitle: "Sample offer · ends Sunday",
      footer: "Demo only · selected items · no live promotion",
    },
  };
}

export function buildStaticAdLayers(
  id: StaticAdTemplateId,
  copy: StaticAdCopy,
  resources: PreviewFormState["resources"],
): DesignLayer[] {
  const layers: DesignLayer[] = [];
  for (const definition of STATIC_AD_FIELDS[id]) {
    const { key, required } = definition;
    if (
      ![
        "eyebrow",
        "headline",
        "subtitle",
        "attribution",
        "badge",
        "cta",
        "footer",
      ].includes(key)
    )
      continue;
    const text = copy[key].trim();
    if (text || required)
      layers.push({
        id: key,
        type: key as
          | "headline"
          | "eyebrow"
          | "subtitle"
          | "attribution"
          | "badge"
          | "cta"
          | "footer",
        visible: true,
        text,
      });
  }
  if (id === "comparison")
    layers.push({
      id: "comparison",
      type: "comparison-table",
      visible: true,
      leftLabel: copy.leftLabel.trim(),
      rightLabel: copy.rightLabel.trim(),
      rows: copy.rows.map((row) => ({
        label: row.label.trim(),
        left: row.left.trim(),
        right: row.right.trim(),
      })),
    });
  if (id === "problem-solution")
    layers.push({
      id: "problem-solution",
      type: "problem-solution",
      visible: true,
      problemTitle: copy.problemTitle.trim(),
      problem: copy.problem.trim(),
      solutionTitle: copy.solutionTitle.trim(),
      solution: copy.solution.trim(),
    });
  if (
    (id === "testimonial-evidence" || id === "offer-urgency") &&
    resources.imageAssetId !== undefined
  )
    layers.push({
      id: "product",
      type: "product-screenshot",
      visible: true,
      assetId: resources.imageAssetId,
      alt: resources.imageAlt?.trim() ?? "",
      fit: "contain",
    });
  if (resources.logoAssetId !== undefined)
    layers.push({
      id: "logo",
      type: "logo",
      visible: true,
      assetId: resources.logoAssetId,
      alt: resources.logoAlt?.trim() ?? "",
      fit: "contain",
    });
  if (id === "testimonial-evidence" && resources.portraitAssetId !== undefined)
    layers.push({
      id: "portrait",
      type: "image",
      visible: true,
      assetId: resources.portraitAssetId,
      alt: resources.portraitAlt?.trim() ?? "",
      fit: "contain",
      focalPoint: { x: 0.5, y: 0.5 },
      treatment: "none",
    });
  return layers;
}

export function staticAdCopiesFromDocument(document: DesignDocument): StaticAdCopies {
  const copies = createStaticAdCopies();
  const id = document.template.id;
  if (!isStaticAdTemplateId(id)) return copies;
  const copy = copies[id];
  for (const field of STATIC_AD_FIELDS[id]) copy[field.key] = "";
  for (const layer of document.layers) {
    if ("text" in layer && layer.type in copy)
      Object.assign(copy, { [layer.type]: layer.text });
    if (layer.type === "comparison-table")
      Object.assign(copy, {
        leftLabel: layer.leftLabel,
        rightLabel: layer.rightLabel,
        rows: layer.rows.map((row) => ({ ...row })),
      });
    if (layer.type === "problem-solution")
      Object.assign(copy, {
        problemTitle: layer.problemTitle,
        problem: layer.problem,
        solutionTitle: layer.solutionTitle,
        solution: layer.solution,
      });
  }
  return copies;
}
