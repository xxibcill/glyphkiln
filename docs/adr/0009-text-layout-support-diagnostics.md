# ADR 0009: Deterministic text-layout support diagnostics

Status: accepted

## Context

Core shapes glyphs but lays out text with horizontal, whitespace-driven
wrapping and exposes alignment without text direction or writing mode. Strong
RTL text, bidi controls, and vertical-primary text can therefore reach a
renderer that cannot faithfully place them. Core needs a deterministic
capability diagnostic before resource resolution, without changing successful
pixels or treating accepted text as universally correct.

## Options considered

Continue rendering all schema-valid text, depend on host Unicode/ICU behavior,
implement bidi and vertical layout now, normalize or rewrite unsupported input,
or diagnose a narrow unsupported set from pinned Unicode data.

## Decision

Add a pure text-layout support analyzer for the current LTR-horizontal renderer.
It detects known unsupported constructs; it does not prove that all accepted
text is laid out or shaped correctly. User text remains inert data and is never
normalized, reordered, stripped, rewritten, executed, or used to fetch
resources.

The diagnostic policy is identified independently as
`unicode-17.0.0/ltr-horizontal-v1` and exposes exactly these codes, in this
order:

1. `BIDI_CONTROL_UNSUPPORTED`
2. `BIDI_LAYOUT_UNSUPPORTED`
3. `VERTICAL_LAYOUT_UNSUPPORTED`

Diagnostics are emitted in that code order, and evidence within each diagnostic
is emitted in source order by zero-based Unicode scalar index. A scalar
contributes to at most one diagnostic. `Bidi_Control` classification takes
precedence over every other classification for the same scalar; the initial
strong-bidi and vertical range sets do not otherwise overlap, and a future
overlap requires a new diagnostic-policy version.

Pin Unicode `17.0.0`; runtime behavior must use compiled range tables rather
than host ICU, locale, Unicode regular-expression properties, network access,
or dynamic filesystem reads. Maintainer-controlled Unicode inputs are
checksum-verified and generated offline from:

- `DerivedBidiClass.txt` for assigned strong `R` and `AL` ranges;
- `PropList.txt` for `Bidi_Control`;
- `Scripts.txt` for reviewed Mongolian and Phags-pa ranges; and
- `DerivedDecompositionType.txt` for scalars whose `Decomposition_Type` is
  exactly `Vertical`.

The initial classification policy assigns Unicode `Bidi_Control` scalars to
`BIDI_CONTROL_UNSUPPORTED`, assigned strong `R` or `AL` scalars to
`BIDI_LAYOUT_UNSUPPORTED`, and Mongolian, Phags-pa, and
`Decomposition_Type=Vertical` scalars to `VERTICAL_LAYOUT_UNSUPPORTED`.
Ordinary horizontal CJK without one of those classifications, emoji, accented
Latin, and standalone Arabic-Indic digits are accepted by this policy. This is
a renderer capability boundary, not a Unicode-validity or general
shaping-conformance test.

Analyzer messages are fixed and never contain raw user text or invisible
controls. Each diagnostic retains at most 16 evidence matches while preserving
`totalMatches` and `truncated`. A non-string runtime call fails with
`INVALID_TEXT_INPUT`.

Evidence property values are limited to `Bidi_Control`, `Bidi_Class=R`,
`Bidi_Class=AL`, `Script=Mongolian`, `Script=Phags_Pa`, and
`Decomposition_Type=Vertical`. For well-formed UTF-16, `scalarIndex` counts
Unicode scalar values rather than UTF-16 code units. Each unpaired surrogate
advances `scalarIndex` once, is accepted by this diagnostic policy, and never
emits a match.

Document inspection covers every rendered semantic text field:
`headline.text`, `subtitle.text`, `eyebrow.text`, `cta.text`, `footer.text`,
`attribution.text`, `badge.text`, `statistic.value`, `statistic.label`, optional
`statistic.trend`, and every `chart.values[index].label`. Asset `alt` text is not
renderer text and is excluded. Collection order is document layer order, schema
field order, chart-value index, then diagnostic-code order. Field paths are
RFC 6901 JSON Pointers rooted at the complete validated `DesignDocument`, for
example `/layers/0/text`, `/layers/3/value`, and
`/layers/5/values/2/label`. The collector must exhaustively switch on
`DesignLayer`.

Inspection includes hidden layers. Hidden-layer records have `visible: false`
and `blocksRender: false`; they do not make `textLayout.renderable` false.
Unsupported visible fields have `blocksRender: true` and make
`textLayout.renderable` false. Document inspection retains at most 128
diagnostic records while preserving `totalDiagnostics` and `truncated`.

Unsupported visible diagnostics become error-severity `QualityIssue` records
with the same codes. They run in the existing document-quality phase before
asset or font resolution and block SVG and PNG with outer code
`QUALITY_VALIDATION_FAILED`, before output bytes, fingerprints, or manifests
exist. Hidden unsupported text does not block rendering.

CLI syntax remains unchanged. `glyphkiln validate` stays structural, so
schema-valid unsupported text validates. `glyphkiln inspect` exits zero and
includes `textLayout`; automation reads `textLayout.renderable`.
`glyphkiln render` exits nonzero for unsupported visible text and retains the
existing `QUALITY_VALIDATION_FAILED` header and nested issue lines. No command
or flag is added.

Ship the additive public API and changed rejection policy in package `0.3.0`
with a minor Changeset. Keep design schema `1.0.0`, manifest `1.1.0`, all
template and procedural-algorithm versions, and renderer `0.2.0` unchanged if
every accepted document remains byte- and fingerprint-identical. The diagnostic
policy version is independent and is not added to successful fingerprints or
manifests. Any accepted SVG or PNG byte change stops this work for ownership,
version-bump, and baseline review.

Release readiness requires a packed local tarball consumer and a signed GitHub
source release; npm registry publication is not a milestone dependency and may
remain paused.

## Rationale

A narrow rejection boundary closes a silent-correctness risk before Core widens
font or resource inputs. Pinned data makes decisions reproducible across Node
and operating-system Unicode versions. Fixed ordering and bounded evidence make
SDK, inspection, isolated-render, and CLI behavior stable under adversarially
large but schema-valid input while preserving the audited successful-output
baseline.

## Tradeoffs

The conservative policy can reject text that happens to render acceptably and
can miss unsupported constructs outside the initial data sets. It adds vendored
Unicode licensing and regeneration duties. Hidden layers can carry warnings
without blocking output, so callers that edit documents must inspect them
explicitly.

## Migration path

Add real bidi or vertical layout only with explicit document controls, a new
diagnostic-policy version, renderer-version review, and pixel baselines. Expand
or relax classification only in a newly reviewed diagnostics policy. Preserve
this policy for callers that require its exact acceptance boundary.
