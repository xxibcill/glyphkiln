# Static-ad campaign workflow

The App's **Static ads** section builds one saved campaign from a shared brief,
brand snapshot and selected resources. Choose any of the six starter families and
four existing sizes: 1:1, 4:5, 9:16 and the existing 1200 × 627 landscape canvas.
The maximum is 24 variants. This is a production workflow, not evidence that any
family or count will outperform alternatives.

## Create and review

This uses the existing installation campaign gate:
`GLYPHKILN_CAMPAIGN_WORKFLOW=product-qualified`. It remains disabled by default;
this change does not alter the installation's setting. Durable export and approval
also require the existing render worker.

1. Publish or select a brand, and select admitted product, portrait, logo and font
   resources in the editor. Resource roles are optional where the template permits.
2. Open **Create a static ad campaign**. Supply audience/objective context and
   explicit copy. Testimonials require an exact quote, customer and source;
   comparisons require supplied evidence; offer ads require offer terms. No
   customer claims, discounts or deadlines are generated.
3. Choose families and sizes. **Create ads** saves the campaign, direction, designs,
   revisions, resource pins and canvas attachments in one database transaction.
   All drafts use the same saved brand. The server derives each seed and resolves
   current exact template versions. A failure rolls back the entire set.
4. Select cards and **Check / refresh selected proofs**. The board shows raster
   proofs at up to 360 CSS pixels wide, safe-zone overlays, readability warnings,
   quality issues, completed export status and revision approval state.
5. **Queue selected exports** requires a configured worker. After completion,
   refresh the proofs. Owners/admins can **Approve selected proofs**. The viewed
   proof's fingerprints, sizes and artifact hashes must match the completed job;
   the existing server workflow pins approval to the immutable revision and job.
6. **Download all approved ads** creates a stored ZIP containing the verified PNG,
   SVG, design document, resource pins, manifests, approval receipt and placement
   report for each approved canvas. Filenames retain campaign, direction, ordinal,
   family and format. Unapproved canvases are excluded on the server; an empty
   approved set returns an actionable error.

The existing 64 MiB handoff limit still applies. Large image-heavy sets may need
fewer families/sizes per campaign; the ZIP preserves original artifact bytes and
does not recompress images to fit the limit.

Batch review, queue and approval actions report per-card failures and continue
with other selected cards. Creation is atomic; these later actions are independent
operations. Queue requests use stable revision-specific idempotency keys. Use the
existing individual export station when retrying an exhausted job. The review
board can be reopened after a browser restart. Campaign canvases keep exact saved
revisions: editing a design does not silently replace a reviewed campaign canvas.
To correct a card, open it in the editor, then use **Campaign coordination** to
select its campaign/direction, choose a new canvas key, plan and apply its seed,
save the revised design, and attach that revision. Return to the static-ad board
and choose **Reload campaign** to review the new card; leave the superseded version
unapproved.

## Placement policy

`STATIC_AD_PLACEMENT_VERSION = 1.0.0` is **Glyphkiln advisory guidance**, not a
platform upload contract. It uses a 5% inset on feed canvases; the story review
zone reserves 14% above and 20% below, with 5% side insets. Text below 12 px at a
360 px viewing width, text overflow and renderer quality findings are reported.
Reports with no text evidence explicitly say readability was not checked.

Warnings do not resize artwork, change brand snapshots, or certify placement
acceptance. Human review remains necessary for product/logo crops, visual
hierarchy, evidence accuracy and current platform interface overlays. The
landscape preset remains 1200 × 627; this work does not silently relabel it as
1200 × 628. There is no platform publishing API or ad-performance inference.

## Contracts and migration

- Campaign metadata **1.5.0** adds `static-ads` and the `static-ad` composition
  variant. Existing seed derivation and old family members are unchanged.
- The closed `campaign.static-ads.create` command accepts 1–24 unique family/format
  manual drafts, one brand snapshot and a brief. Existing session, CSRF,
  membership, capability and resource-admission controls apply before persistence.
- Cross-family directions do not apply layer-identity locks: a testimonial and a
  comparison have different roles. Their initial revisions share the same pinned
  brand snapshot; later revisions and canvas attachments remain explicit.
- `campaign.handoff` accepts optional `approvedOnly`; omitted behavior stays
  compatible. Static-ad handoffs add a versioned `.delivery.json` sidecar.
- Migration `202609250018_static_ad_campaign` extends the family and composition
  constraints. Rollback restores the old constraints; it refuses rollback while
  incompatible static-ad rows exist, preserving data instead of deleting it.
- Renderer, templates, design schema, manifest format and output pixels do not
  change. Placement review is separate from deterministic rendering.

Tests cover 24 deterministic seed scopes, shared brief expansion, required proof
copy, unused asset exclusion, atomic rollback, denied/foreign input, approved-only
handoffs, UI creation and review, proof/job matching, ZIP byte preservation and
unsafe-path rejection. Run the repository's five required gates before release.

## Verification

Build, typecheck, lint, root tests and coverage passed. The final coverage run
passed 506 Core tests, 566 App tests and four example tests. Five existing
live-PostgreSQL qualification tests remain conditionally skipped; migration and
workflow behavior were exercised through the PGlite adapter.

The placement policy, shared brief builder and stored ZIP packager each have
100% statement, branch, function and line coverage. The mixed-family workflow
test exports six unapproved proofs, approves one exact revision/job, and verifies
that approved-only delivery includes only that canvas. It also verifies that a
rollback with static-ad data fails without losing the campaign.

Fresh tarball JavaScript, TypeScript, schema, installed CLI and isolated consumers,
package dry-run and standalone packaging passed. The system unzip tool accepted
the generated ZIP and verified its entry checksums. The creation form was visually
inspected at desktop and 390 px phone widths; component tests exercise creation,
validation, proof mismatch rejection, approval, reopening an exact revision and
reloading the board. No existing artwork bytes or visual baselines were changed
by this workflow addition.
