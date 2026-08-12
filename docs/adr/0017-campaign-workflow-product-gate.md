# ADR 0017: Fail-closed campaign workflow dark launch

Status: accepted; product qualification pending

## Context

The campaign persistence implementation exists before the product gate in the
campaign roadmap has passed. Shipping routes, persistence, and UI controls as
enabled-by-default would incorrectly turn implementation completion into
product approval.

## Decision

Campaign persistence is installation-wide and disabled by default. Only the
exact operator value
`GLYPHKILN_CAMPAIGN_WORKFLOW=product-qualified` enables campaign mutations,
seed preparation, handoff generation, and Campaign Studio controls. Unknown
values fail startup. AI proposal approval depends on this campaign gate.

When disabled, authenticated campaign board and proposal-history reads remain
available for recovery. Campaign locks already attached to saved revisions
continue to apply to ordinary preview, revise, render, comparison, and export
paths. The gate therefore removes new product authority without weakening
persisted safety invariants.

## Qualification gate

An operator may enable the feature only after a reviewed qualification record
passes a real brief requiring at least four formats and a multi-slide series.
The record must show coherent direction output, lock survival through every
adaptation, exact reproduction of every canvas, and a complete stably named
handoff bundle.

## Consequences

- Existing installations remain on the manual design/review workflow unless an
  operator makes the explicit qualification assertion.
- Stored campaign history is recoverable while new campaign state and exports
  are blocked.
- Per-workspace rollout would require a separately reviewed persisted policy;
  this decision intentionally uses one fail-closed installation boundary.
