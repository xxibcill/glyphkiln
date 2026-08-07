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

The same entry point exports
`mapQualityIssuesToAuthoringIssues(unknown)`. This pure `1.0.0` mapping turns
Core proof issues into the closed action vocabulary without importing the
renderer. It retains at most 128 input issues, preserves array indices and
order, reports truncation, and marks malformed issue arrays with `valid: false`.
Unknown future quality codes produce `QUALITY_REVIEW_REQUIRED` rather than
silent acceptance.

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

## App model-response boundary

The App exports an internal `validateBriefInterpreterResponse(unknown)` seam
for future operator-configured adapters. The strict `1.0.0` response contains
only `contractVersion` and three or four ordered `{ document, rationale }`
proposals. Candidate envelopes reject additional authority fields. Rationales
are one bounded inert paragraph and emerge as `kind: "model-suggestion"`.

Well-shaped documents are evaluated in one Core candidate-validation call.
Malformed candidate envelopes are rejected at their original indices, invalid
documents contain only Core's bounded issues, and exact duplicate normalized
documents receive a fixed duplicate issue. The result always declares
`authority: "proposal-only"`: `success: true` means the response is suitable
for human review, not that assets, fonts, provenance, persistence, rendering,
export, or publication are authorized.

The boundary has no provider SDK or network call. See the
[AI-assisted authoring threat model](ai-authoring-threat-model.md) for the
implemented controls and the decisions required before enabling an adapter.

## Actionable issues

Candidate issues have a closed authoring code, severity, category, action, and
fixed guidance. Optional paths are capped at 256 characters, layer IDs already
use the schema's 128-character identifier bound, and issue details never echo
unknown model values. The browser-safe issue registry also publishes actions
for render-time crop, asset, contrast, and safe-area evidence so a UI can use
one bounded vocabulary across candidate and proof review.

The proof mapper covers current template, brand, typography, glyph, crop,
contrast, and safe-area issue codes. Mapping guidance always comes from the
static registry; runtime messages and `details` remain inert evidence and are
never copied into the action contract. The App Proof Ledger displays both the
original Core evidence and the mapped next action, and discloses when the
bounded action view omits additional evidence.

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

Authoring metadata, actionable issue metadata, candidate validation, and the
quality-to-action mapping each start at `1.0.0`. These slices add public
coordination contracts and proof-ledger guidance only. They do not change the
design schema, renderer, templates, procedural algorithms, manifest,
fingerprints, SVG, PNG, or legacy validation/render behavior.
