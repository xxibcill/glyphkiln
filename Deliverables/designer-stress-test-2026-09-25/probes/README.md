# Glyphkiln negative probes

These three controlled probes use only the public `@glyphkiln/core` API and
checked-in example documents. The runner first validates, inspects, and renders
each unchanged source as a positive control. It then changes one input and
asserts the expected rejection. No SVG or PNG is written for failed cases.

| Changed input                                                        | Validation | Inspection                              | Render rejection                                           |
| -------------------------------------------------------------------- | ---------- | --------------------------------------- | ---------------------------------------------------------- |
| Carousel headline exceeds its template line limit                    | Pass       | Renderable                              | `QUALITY_VALIDATION_FAILED` with `TEXT_OVERFLOW`           |
| Visible Hebrew character in an LTR headline                          | Pass       | `BIDI_LAYOUT_UNSUPPORTED`; unrenderable | `QUALITY_VALIDATION_FAILED` with `BIDI_LAYOUT_UNSUPPORTED` |
| Image-led document declares the wrong SHA-256 for its supplied photo | Pass       | Renderable                              | `ASSET_DECLARATION_MISMATCH`, field `sha256`               |

The exact observed stages and codes are in [probe-results.json](probe-results.json).
Here, “inspection pass” means the API completed; its `renderable` value is
reported separately. The RTL case is first detected by inspection. The other
two are first detected during rendering.

From the repository root, with dependencies installed:

```sh
npm run build --workspace @glyphkiln/core
node Deliverables/designer-stress-test-2026-09-25/probes/run-probes.mjs --verify
```

Run without `--verify` to regenerate `probe-results.json`. The runner exits
nonzero if a positive control fails, a negative probe unexpectedly renders, a
code differs from the expected contract, or the verified result file changes.
It performs no network requests and uses only pinned local raster bytes for the
asset probe.
