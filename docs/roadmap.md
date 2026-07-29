# Roadmap

## Core next

1. Broader bidi/vertical-script shaping diagnostics.
2. A validated CLI resource-bundle format for offline assets/fonts.
3. Optional color-profile normalization and upload malware-scanner adapters.
4. Additional chart primitives and template versions driven by real product
   requirements.
5. A browser-compatible SVG-only adapter that preserves the same contracts.
6. Optional signed provenance/C2PA integration outside the pure renderer.

## Glyphkiln App integration

The recommended first App milestone is a read-only local project preview:
brand-snapshot form → structured design document → inline validation issues →
Core SVG preview → explicit PNG/SVG download with manifest. Keep prompt
interpretation, persistence, authentication, and Cloud orchestration out until
that trust boundary and resource-resolution path are proven.

The App should preserve immutable brand snapshots, content-address uploaded
assets/fonts, pass bytes explicitly to Core, and display provenance without
rewriting asset origins.
