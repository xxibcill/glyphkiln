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
order, reports truncation, and marks malformed or truncated issue arrays with
`valid: false`. A `valid: true` result therefore describes the entire supplied
array, not only the retained prefix. Unknown future quality codes produce
`QUALITY_REVIEW_REQUIRED` rather than silent acceptance.

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

The App uses `validateBriefInterpreterResponse(unknown)` for its
operator-configured proposal adapter. The strict `1.0.0` response contains
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

The validator itself has no provider SDK or network call. See the
[AI-assisted authoring threat model](ai-authoring-threat-model.md) for the
implemented controls and the decisions required before enabling an adapter.

## Server-owned lock enforcement

The App's internal `validateAuthoringLocks(base, candidate, serverLocks)` seam
enforces selective-regeneration locks without accepting paths, comparison
expressions, or values from a model. It accepts only the closed `copy`, `image`,
`crop`, `typography`, `palette`, and `composition` IDs. Duplicate, sparse,
oversized, or unknown selections fail with fixed guidance and are not echoed.
The App must derive this array from authenticated server state; it is not part
of the BriefInterpreter response.

Both unknown documents pass together through Core candidate validation before
any comparison. Lock projections are computed from Core-normalized documents,
so schema defaults compare consistently. Invalid documents expose only their
bounded Core reports, and no lock comparison runs.

| Lock          | Normalized choices preserved                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `copy`        | Text, statistic/chart content, asset alt text, semantic role identity, and visibility                                  |
| `image`       | Full asset declarations, asset-to-layer choices, image treatment, image role identity, and visibility                  |
| `crop`        | Asset-layer fit and image focal point                                                                                  |
| `typography`  | Font declarations, brand typography, and per-text color, family, weight, size, line, alignment, and keep-together data |
| `palette`     | Mode, brand palette/themes/prohibited colors, and explicit layer/chart colors                                          |
| `composition` | Schema/template/format/seed, brand layout policy and identity, ordered layer identity/visibility, and structural data  |

Overlap is deliberate and fail-closed. Layer identity ties a choice to its
semantic role; copy and image locks include visibility so an unlocked
composition cannot merely hide a locked choice. Explicit text color belongs to
both typography and palette. A selected lock fails if any field in its
projection differs, even when another unselected lock also owns that field.

Document revision `id` and inert `metadata` are outside creative locks. The
result remains `authority: "proposal-only"`; successful equality does not
authorize a candidate's resource claims, workspace access, persistence,
rendering, export, or publication. The App campaign workflow separately reloads
immutable server records, requires the base resource declarations, produces a
Core proof, and records explicit human acceptance before creating a revision.

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
metadata. The lock validator intentionally ignores document `metadata`; trusted
lock selections do not enter Core documents, fingerprints, or manifests.

## Version and output impact

Authoring metadata, actionable issue metadata, candidate validation, the
quality-to-action mapping, the App response boundary, and the App lock contract
each start at `1.0.0`. These slices add coordination, validation, and
proof-ledger guidance only. They do not change the design schema, renderer,
templates, procedural algorithms, manifest, fingerprints, SVG, PNG, or legacy
validation/render behavior.
