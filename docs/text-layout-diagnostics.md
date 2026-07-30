# Text-layout diagnostics

Core lays out text horizontally from left to right. Package `0.3.0` adds a
deterministic preflight for constructs that this renderer is known not to place
faithfully. It diagnoses and rejects unsupported layout; it does not implement
bidi or vertical layout and does not prove every accepted string correct.

## Public API

`analyzeTextLayoutSupport(text)` returns `TextLayoutAnalysis` with policy
version `unicode-17.0.0/ltr-horizontal-v1`, a `supported` flag, and ordered
diagnostics. The root package also exports:

- `TEXT_LAYOUT_DIAGNOSTICS_VERSION`
- `TextLayoutAnalysis`
- `TextLayoutDiagnostic` and `TextLayoutDiagnosticCode`
- `TextLayoutMatch` and `TextLayoutMatchProperty`
- `DesignTextLayoutDiagnostic` and `DesignTextLayoutInspection`

The diagnostic codes are always ordered as:

1. `BIDI_CONTROL_UNSUPPORTED`
2. `BIDI_LAYOUT_UNSUPPORTED`
3. `VERTICAL_LAYOUT_UNSUPPORTED`

Evidence uses numeric code points, zero-based Unicode scalar indexes, and one of
`Bidi_Control`, `Bidi_Class=R`, `Bidi_Class=AL`, `Script=Mongolian`,
`Script=Phags_Pa`, or `Decomposition_Type=Vertical`. Each diagnostic retains at
most 16 matches while preserving `totalMatches` and `truncated`. Messages are
fixed and never contain user text or invisible controls.

## Classification

Runtime tables are generated from checksum-verified Unicode Character Database
17.0.0 files:

- `PropList.txt`: `Bidi_Control`
- `DerivedBidiClass.txt`: assigned strong `R` and `AL`
- `Scripts.txt`: Mongolian and Phags-pa
- `DerivedDecompositionType.txt`: exact `Vertical`

Bidi-control classification takes precedence for a scalar. Ordinary horizontal
CJK, emoji, accented Latin, standalone Arabic-Indic digits, empty strings, and
lone UTF-16 surrogates are not rejected by this policy.

The runtime imports compiled range tables. It does not read Unicode source
files, use host ICU or locale behavior, or fetch data. Maintainers can reproduce
and verify the tables offline:

```bash
npm run text-layout-data:update
npm run text-layout-data:verify
```

The checked-in source hashes are in
`packages/glyphkiln-core/vendor/unicode/17.0.0/source-checksums.json`; licensing
is retained in `packages/glyphkiln-core/vendor/unicode/LICENSE.txt` and
`packages/glyphkiln-core/NOTICE`.

## Documents, rendering, and CLI

`inspectDesignDocument(document).textLayout` covers every rendered semantic
text field. Records include document-rooted JSON Pointer paths such as
`/layers/0/text` and `/layers/5/values/2/label`. Inspection includes hidden
layers, caps retained records at 128, and preserves the full count and
`truncated` flag. Hidden records have `blocksRender: false`.

Visible unsupported text becomes an error-severity `QualityIssue` with the same
diagnostic code and blocks direct and isolated SVG/PNG rendering with outer code
`QUALITY_VALIDATION_FAILED`. Render errors retain at most 128 visible
text-layout issues; `details.textLayout` reports the total and retained counts
plus a truncation flag. The check runs before asset and font resolution, and a
blocked render creates no output, fingerprint, or manifest.

CLI behavior is unchanged structurally:

- `glyphkiln validate` validates schema and can accept unsupported copy.
- `glyphkiln inspect` exits zero and reports `textLayout.renderable`.
- `glyphkiln render` exits nonzero for unsupported visible copy and reports the
  nested stable code.

The policy version is independent of the design schema, renderer, and manifest.
Because accepted documents retain identical pixels and fingerprints, package
`0.3.0` keeps renderer `0.2.0`, schema `1.0.0`, and manifest `1.1.0`.
