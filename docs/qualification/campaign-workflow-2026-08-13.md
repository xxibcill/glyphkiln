# Campaign workflow product qualification — 2026-08-13

Status: **PENDING**

The implementation and automated trust-boundary tests are complete, but no
reviewed real-brief record currently proves the product gate. Production and
self-host defaults therefore keep `GLYPHKILN_CAMPAIGN_WORKFLOW=disabled`. The
runtime also rejects the `product-qualified` assertion while this checked-in
record remains **PENDING**, so an operator string cannot substitute for product
evidence.

The status can become **PASS** only when one controlled run records all of the
following without manual design repair:

- one approved brief requiring at least four output formats;
- one multi-slide series in the same coherent selected direction;
- every closed copy, image, crop, typography, palette, and composition lock
  surviving descendant adaptations;
- every exact immutable canvas reproducing from its document and admitted
  resources; and
- one complete handoff bundle whose paths, hashes, manifests, approval
  evidence, and ordering remain stable across repeated generation.

Promotion requires one reviewed change that appends the evidence, changes this
record to **PASS**, and changes the runtime qualification status to `pass`.
Until then, operators must not set the `product-qualified` value. Optional AI
proposals remain gated as a dependent campaign capability.
