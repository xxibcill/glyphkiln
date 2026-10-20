import type { StaticAdFormat, StaticAdTemplateId } from "@glyphkiln/core/browser";
import type { ManualDraft } from "@/server/app-workflow";
import type {
  PreviewCatalog,
  PreviewFormState,
} from "@/features/project-preview/types";
import { buildManualDraft } from "./manual-state";

export const STATIC_AD_LABELS: Record<StaticAdTemplateId, string> = {
  "product-announcement": "Product + offer",
  "benefit-proof": "Benefit / feature proof",
  "testimonial-evidence": "Testimonial",
  comparison: "Comparison",
  "problem-solution": "Problem / solution",
  "offer-urgency": "Offer / urgency",
};
export const STATIC_AD_BRIEF_FIELDS = [
  ["headline", "Main promise", 160],
  ["eyebrow", "Product or campaign context", 80],
  ["subtitle", "Supporting message", 240],
  ["cta", "Call to action", 60],
  ["offer", "Price or offer", 80],
  ["terms", "Offer terms", 240],
  ["source", "Evidence source or qualification", 240],
  ["deadline", "Real deadline or offer scope", 120],
  ["benefits", "Benefits (one per line, up to three)", 240],
  ["quote", "Exact customer quote", 300],
  ["customer", "Customer name", 100],
  ["leftLabel", "First option", 60],
  ["rightLabel", "Second option", 60],
  ["comparisonLabel", "Comparison criterion", 60],
  ["leftValue", "First option evidence", 100],
  ["rightValue", "Second option evidence", 100],
  ["problem", "Problem", 180],
  ["solution", "Solution", 180],
] as const;
export type StaticAdBrief = Record<(typeof STATIC_AD_BRIEF_FIELDS)[number][0], string>;

export function staticAdBriefFromForm(form: FormData): StaticAdBrief {
  return Object.fromEntries(
    STATIC_AD_BRIEF_FIELDS.map(([key]) => [key, formText(form, key)]),
  ) as StaticAdBrief;
}

export function buildStaticAdCampaignDrafts(
  brief: StaticAdBrief,
  families: readonly StaticAdTemplateId[],
  formats: readonly StaticAdFormat[],
  state: PreviewFormState,
  catalog: PreviewCatalog,
): ManualDraft[] {
  requireText(brief.headline, "Main promise");
  const benefits = brief.benefits
    .split("\n")
    .map((title) => title.trim())
    .filter(Boolean);
  if (
    families.includes("benefit-proof") &&
    (benefits.length < 1 || benefits.length > 3)
  )
    throw new Error("Enter one to three benefits.");
  if (families.includes("testimonial-evidence")) {
    requireText(brief.quote, "Exact customer quote");
    requireText(brief.customer, "Customer name");
    requireText(brief.source, "Evidence source");
  }
  if (families.includes("comparison"))
    for (const key of [
      "leftLabel",
      "rightLabel",
      "comparisonLabel",
      "leftValue",
      "rightValue",
      "source",
    ] as const)
      requireText(brief[key], key);
  if (families.includes("problem-solution")) {
    requireText(brief.problem, "Problem");
    requireText(brief.solution, "Solution");
  }
  if (families.includes("offer-urgency")) {
    requireText(brief.offer, "Price or offer");
    requireText(brief.terms, "Offer terms");
  }
  if (families.length === 0 || formats.length === 0)
    throw new Error("Choose at least one family and one size.");
  const common = {
    eyebrow: brief.eyebrow,
    headline: brief.headline,
    subtitle: brief.subtitle,
    cta: brief.cta,
    footer: brief.source,
  };
  const staticCopy = {
    ...common,
    attribution: "",
    badge: "",
    leftLabel: brief.leftLabel,
    rightLabel: brief.rightLabel,
    rows: [
      { label: brief.comparisonLabel, left: brief.leftValue, right: brief.rightValue },
    ],
    problemTitle: "Problem",
    problem: brief.problem,
    solutionTitle: "Solution",
    solution: brief.solution,
  };
  const copy: PreviewFormState["copy"] = {
    ...state.copy,
    productAnnouncement: { ...common, badge: brief.offer, footer: brief.terms },
    benefitProof: {
      ...common,
      items: benefits.map((title) => ({ title, description: "" })),
    },
    staticAds: {
      "testimonial-evidence": {
        ...staticCopy,
        headline: brief.quote,
        attribution: brief.customer,
        subtitle: "",
      },
      comparison: staticCopy,
      "problem-solution": staticCopy,
      "offer-urgency": {
        ...staticCopy,
        badge: brief.offer,
        footer: brief.terms,
        subtitle: brief.deadline,
      },
    },
  };
  return families.flatMap((templateId) =>
    formats.map((formatId) => {
      const draft = buildManualDraft(
        { ...state, copy, composition: { ...state.composition, templateId, formatId } },
        catalog,
      );
      const usedAssets = new Set(
        draft.layers.flatMap((layer) => ("assetId" in layer ? [layer.assetId] : [])),
      );
      return {
        ...draft,
        resources: {
          assetIds: [...usedAssets].sort(),
          fontIds: [...state.resources.fontIds],
        },
      };
    }),
  );
}
function requireText(value: string, label: string): void {
  if (value.length === 0)
    throw new Error(`${label} is required for the selected families.`);
}

export function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
