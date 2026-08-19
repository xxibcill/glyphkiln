# Campaign-system contracts

Glyphkiln keeps one `DesignDocument` equal to one canvas. Core publishes the
deterministic facts needed to coordinate related canvases; the App owns
campaigns, directions, slides, ordering, locks, revisions, review state, and
export bundles.

## Family metadata

`CAMPAIGN_FAMILY_REGISTRY` is an immutable, browser-safe catalog with metadata
version `1.2.0`. Its first family, `image-led-campaign`, records:

- exact member template IDs and versions;
- compatible output formats;
- required and optional content and asset roles;
- supported asset fits, focal-point support, and closed treatments;
- named composition variants; and
- safe-area and render-evidence behavior.

The family coordinates `image-led-campaign@1.0.1` across landscape, square, and
portrait plus `tiktok-carousel-slide@1.0.4` for exact 3:4 carousel slides. Each
member carries its own roles, composition variant, and safe-area policy.
`image-led-campaign@1.0.1` uses `focal-editorial` with required image and logo
assets; `tiktok-carousel-slide@1.0.4` uses its authoritative
`organic-photo-editorial` typography-first contract with no asset roles. It adds
content-responsive fields, optional sequence chrome, and deterministic pattern
rails without changing the composition identifier. Neither coordination value
adds a document field. Distinct carousel canvas keys produce distinct slide
seeds while retaining the direction seed. Metadata drift is tested against the
authoritative authoring, template, and treatment registries.

The registry is exported from both `@glyphkiln/core` and
`@glyphkiln/core/browser`. The browser export contains static data only and
does not import the Node renderer, hashing, raster decoding, or filesystem
adapters.

## Carousel sequence and delivery contracts

`DELIVERY_PROFILE_REGISTRY` keeps five publishing paths separate:
`instagram-native-carousel`, `instagram-api-carousel`,
`tiktok-organic-photo`, `tiktok-content-posting-photo`, and
`tiktok-carousel-ad`. Each profile carries exact
compatible formats, item and raster constraints, a dated advisory surface
overlay, portable sources, and an evidence label for every value. Native and API
limits are never merged.

`reviewCarouselSequence()` accepts one selected delivery profile and ordered
slides with explicit `hook`, `context`, `evidence`, `explanation`, `recap`, or
`action` roles. Incompatible formats, actual profile limits, mixed required
aspect ratios, and invalid ordinals are errors. Copy length, hook/close shape,
composition rhythm, generic alt text, and missing statistic sources are warnings
for review—not engagement promises or renderer failures.

`createCarouselDeliverySidecar()` deterministically records each slide's reading
order, meaningful asset descriptions, source notes, narrative role, and exact
delivery-profile metadata version. Neither sequence metadata nor a delivery
sidecar enters the document fingerprint or changes pixels.

## Seed derivation

`createCampaignDirectionKey()` and `createCampaignCanvasKey()` validate distinct,
bounded App-owned scope identities so TypeScript callers cannot accidentally
swap them. `deriveCampaignSeeds()` accepts those keys plus a bounded campaign
seed. It validates that the selected template version, format, and composition
variant belong to the requested family, then returns:

- `directionSeed`, shared by related canvases in one art direction; and
- `canvasSeed`, separated by canvas key, exact template version, format, and
  composition variant.

```ts
import {
  createCampaignCanvasKey,
  createCampaignDirectionKey,
  deriveCampaignSeeds,
} from "@glyphkiln/core";

const seeds = deriveCampaignSeeds({
  campaignSeed: "kiln-launch-2026",
  familyId: "image-led-campaign",
  directionKey: createCampaignDirectionKey("direction-a"),
  canvasKey: createCampaignCanvasKey("hero-square"),
  template: { id: "image-led-campaign", version: "1.0.1" },
  format: "instagram-square",
  compositionVariantId: "focal-editorial",
});
```

Derivation policy `sha256/canonical-scope-v1` hashes explicit canonical scope
objects. Unknown fields are rejected so an ignored slide index or grouping
value cannot accidentally create identical streams. Seed inputs never enter a
manifest unless the caller places the returned `canvasSeed` in a document.

## Version and pixel impact

Campaign-family metadata and seed derivation have independent version labels.
Metadata `1.2.0` selects the aspect-ratio-aligned image-led template `1.0.1` and
the collision-safe organic carousel template `1.0.4`; saved
`image-led-campaign@1.0.0` and `tiktok-carousel-slide@1.0.3` documents remain
exactly renderable outside the current family members. The renderer, design
schema, procedural algorithms, and manifest versions do not change.

Role-specific content recommendations and carousel delivery profiles are
separately versioned metadata and do not affect saved-document rendering. Locks,
grouping, ordering, narrative role, review state, and revision identity remain
App metadata and must not enter Core pixel fingerprints.

## App campaign workflow

The App persists workspace-qualified campaigns, directions, immutable lock
rows, and exact revision canvases. Every canvas stores a closed narrative role,
so the option board exposes the intended sequence instead of a flat file list. A
direction branch copies its closed lock selection but no canvases or hidden
creative state. Attach, revision, preview,
queued render, proposal acceptance, comparison, and handoff paths reload the
stored revisions and fail closed when a selected lock no longer matches the
direction baseline.

The option board compares two exact immutable revisions by rendering them
sequentially through the normal bounded admission and resource resolver. It
does not compare browser screenshots or recompute Core evidence.

Before first attachment, Campaign Studio can request an advisory canvas seed for
one exact campaign, direction, canvas key, template, format, and composition
variant. Applying that result changes only the unsaved draft seed: it does not
preview, save, reopen, or attach a revision. Changing any scoped field invalidates
the plan. Attachment remains disabled until the current draft and reopened
immutable revision carry the planned seed, exact template version, and format.
The server recomputes the seed from the persisted campaign and direction at
attachment, so the browser plan is never authoritative.

For formats with delivery profiles, Campaign Studio sends the operator's
selected publishing path with the attachment and the App stores that exact
profile on the campaign canvas. The server rejects an explicit profile that is
not compatible with the immutable revision format. Older API clients that omit
the field receive the format's deterministic default, while handoff creation
always uses the stored profile verbatim instead of recomputing a default.

Campaign persistence is dark-launched until a reviewed real-brief
qualification passes the four-format and multi-slide gate below. The runtime
defaults to disabled. The exact operator assertion
`GLYPHKILN_CAMPAIGN_WORKFLOW=product-qualified` enables seed preparation,
campaign mutations, handoffs, and Campaign Studio only after the checked-in
qualification status is `pass`; it fails startup while that record is pending.
Stored board and proposal history remains readable for recovery, and locks
already attached to revisions continue to constrain ordinary preview, revise,
render, comparison, and export paths while the product gate is closed. Optional
AI approval cannot bypass this campaign gate.

`campaign.handoff` requires one explicit campaign direction and creates a
canonical JSON archive with stable sorted paths for only that direction. The
direction identifier is bound into both the response receipt and archive. Each
selected canvas contributes its exact design document, immutable resource pins,
SVG and PNG bytes, both render manifests, a deterministic delivery sidecar when
the canvas has a stored delivery profile, and an approval record. The record is
an exact approval receipt only when the included artifact hashes, manifest
hashes, fingerprints, revision hash, and resource pins match that receipt. A
missing or mismatched receipt produces an explicit `unapproved` record. The
archive includes per-file hashes, byte sizes, media types, and approval status;
its own SHA-256 covers the canonical archive bytes. A synchronous verified
handoff is bounded to 64 exact canvases and 64 MiB of canonical archive bytes.

Optional proposals are separate append-only App records. Provider/model
identity, retention disclosure, canonical input/response hashes, validation,
proof metadata, and the human accept/reject decision never enter the Core
document or manifest. A human acceptance creates a new immutable design and
revision; it does not silently replace or attach a campaign canvas.

Each campaign-board direction includes the 20 most recent proposal-run
summaries plus an explicit truncation flag. Those summaries contain only stored
provider/model identity, candidate/decision counts, and creation time; the
existing exact-run read loads one selected immutable record. Board and exact-run
reads remain available when campaign mutations are disabled so proposal history
is recoverable after a browser reload without exposing a table-shaped API.
