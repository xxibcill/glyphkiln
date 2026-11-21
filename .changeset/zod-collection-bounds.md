---
"@glyphkiln/core": patch
---

Update the pinned Zod runtime to 4.6.7 so validating untrusted design documents with oversized bounded collections can no longer exhaust memory (GHSA-mrhx-c7xc-m3w5). Collections that exceed their size limit now report only the size issue instead of also listing element issues. SVG and PNG pixels remain unchanged.
