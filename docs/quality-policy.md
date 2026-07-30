# Validation and quality policy

Core separates failures by when they can be known:

- schema, resource, asset/font integrity, unsupported-version, isolation, and
  output-write failures throw `GlyphkilnError` with a stable `code`;
- composition checks return `QualityIssue` records, and any error-severity issue
  blocks rendering with `QUALITY_VALIDATION_FAILED`;
- warning-severity issues remain in the successful result and manifest;
- `verifyRenderReproduction` returns issue records for document, byte-size, and
  output-hash mismatches so callers can report all reproduction differences at
  once.

This is intentional API policy, not an accidental mix of exceptions and issues.
Failures that make safe interpretation impossible stop immediately. Checks that
can be evaluated together—required/supported layers, brand preferences,
contrast, safe areas, quiet-region alignment, text fit, and glyph coverage—are
aggregated. Known unsupported text layout is checked from pinned Unicode 17.0.0
tables before asset and font resolution. Hidden fields appear in inspection but
do not become render-blocking quality issues. Render failures retain at most 128
visible text-layout issues and expose `details.textLayout.totalDiagnostics`,
`retainedDiagnostics`, and `truncated` so the bounded error remains explicit.

Stable quality codes currently include `REQUIRED_LAYER_MISSING`,
`UNSUPPORTED_VISIBLE_LAYER`, `DUPLICATE_VISIBLE_LAYER`,
`CONFLICTING_VISIBLE_LAYERS`, `PROHIBITED_COLOR`, `PROHIBITED_STYLE`,
`NON_PREFERRED_PROCEDURAL_STYLE`, `LOW_TEXT_CONTRAST`, `TEXT_OVERFLOW`,
`MISSING_GLYPH`, `QUIET_REGION_MISALIGNED`, `BIDI_CONTROL_UNSUPPORTED`,
`BIDI_LAYOUT_UNSUPPORTED`, `VERTICAL_LAYOUT_UNSUPPORTED`, and reproduction
mismatch codes. The three text-layout codes carry a document-rooted field path,
numeric code-point evidence, scalar indexes, and an independent diagnostic
policy version. Tests exercise every policy family; new codes require a
regression test and documentation update.
