---
"@glyphkiln/core": minor
---

Add deterministic Unicode 17.0.0 diagnostics for unsupported bidi controls,
strong right-to-left text, and vertical-primary text. Export the public analyzer
and diagnostic types, include document inspection, and reject unsupported
visible copy before resource resolution across direct, isolated, and CLI
rendering while preserving accepted output bytes and fingerprints.
