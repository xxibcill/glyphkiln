# AI-ready authoring contracts

Core does not call a model or choose a creative direction. It publishes inert,
bounded contracts that manual tools and optional App-owned model adapters can
use before every accepted document passes the same Core boundary.

## Browser-safe authoring metadata

`AUTHORING_TEMPLATE_REGISTRY` is immutable static data with contract version
`1.0.0`. It covers every supported template version, including preserved
`tiktok-carousel-slide@1.0.1` and `1.0.2` documents. Each exact template key
publishes:

- compatible design-schema versions and formats;
- its fixed named composition variant;
- required and optional content roles with field-length bounds;
- supported raster asset roles, MIME types, fits, focal-point behavior, and
  closed treatments;
- maximum layers, assets, fonts, visible layers per role, and headline lines;
- mutually exclusive roles, safe-area guidance, and concise authoring notes.

The registry and `AUTHORING_ISSUE_REGISTRY` are available from
`@glyphkiln/core/browser`. That entry point contains no renderer, filesystem,
network, raster decoder, or model adapter. Composition-variant IDs describe
fixed template behavior; they are not user code or an unvalidated document
field.

## Candidate validation

`validateCandidateDocuments(input)` accepts unknown data and returns a bounded
report. It accepts one to eight candidates, preserves input order, and retains
at most 32 issues for each candidate. Expected invalid model output does not
throw. Invalid candidates never contain a normalized `document` or
`canonicalDocument`; valid candidates contain both.

```ts
import {
  AUTHORING_TEMPLATE_REGISTRY,
  validateCandidateDocuments,
} from "@glyphkiln/core";

const contract = AUTHORING_TEMPLATE_REGISTRY["product-announcement@1.1.1"];
const report = validateCandidateDocuments(modelResponse);

for (const candidate of report.candidates) {
  if (candidate.status === "invalid") {
    console.log(candidate.issues);
    continue;
  }
  await saveForHumanReview(candidate.document, candidate.canonicalDocument);
}

void contract;
```

Each candidate runs through the normal encoded-input limits, strict versioned
`DesignDocument` schema, exact template lookup, template-role checks, brand
policy, and pinned text-layout checks. Successful schema parsing applies the
same defaults as rendering. Canonical JSON uses Core's deterministic canonical
serializer; candidate order is never sorted or inferred.

This pure helper intentionally stops before resource resolution and scene
composition. A host must still resolve exact admitted asset/font bytes and call
`renderGraphic` or `renderGraphicIsolated`. Render-time evidence remains the
authority for glyph coverage, crop geometry, logo suitability, text fit,
contrast, and safe-area placement.

## Actionable issues

Candidate issues have a closed authoring code, severity, category, action, and
fixed guidance. Optional paths are capped at 256 characters, layer IDs already
use the schema's 128-character identifier bound, and issue details never echo
unknown model values. The browser-safe issue registry also publishes actions
for render-time crop, asset, contrast, and safe-area evidence so a UI can use
one bounded vocabulary across candidate and proof review.

Unknown future quality codes map to `QUALITY_REVIEW_REQUIRED`; they never become
silent acceptance. The original `QualityIssue` remains available from a render
result for evidence-specific diagnostics.

## Trust boundary

Model output remains unknown inert data. Strict objects reject generated URL,
path, CSS, JavaScript, SVG, callback, module, or expression fields. Text fields
remain escaped content data and cannot become code. Asset declarations identify
already-resolved raster resources; the App must never let a model choose a URL,
filesystem path, admitted byte hash, or trusted provenance value.

Candidate rationales, prompts, providers, models, response hashes, locks,
grouping, ordering, acceptance decisions, and retention disclosures are App
metadata. They do not enter Core documents, fingerprints, or manifests.

## Version and output impact

Authoring metadata, actionable issue metadata, and candidate validation each
start at `1.0.0`. This slice adds public coordination contracts only. It does
not change the design schema, renderer, templates, procedural algorithms,
manifest, fingerprints, SVG, PNG, or legacy validation/render behavior.
