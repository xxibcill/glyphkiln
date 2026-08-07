# AI-assisted authoring threat model

## Status and scope

This is the draft security gate for Glyphkiln `0.7.0`. The implemented slice
contains no model SDK, provider call, prompt transport, persistence, resource
resolution, render request, or publication action. It defines the
provider-neutral response boundary that every future `BriefInterpreter`
adapter must cross and a pure server-owned lock comparison that later
selective-regeneration workflows must use.

The contract does not approve a provider or the complete interaction. The open
decisions at the end of this document still require operator and product
review with real briefs.

## Authority flow

1. An operator will explicitly configure a future App-owned provider adapter.
2. The adapter will send only operator-approved brief fields under a disclosed
   provider policy.
3. Its parsed JSON response remains `unknown` and enters
   `validateBriefInterpreterResponse`.
4. The App accepts only a strict `1.0.0` envelope containing three or four
   `{ document, rationale }` proposals.
5. Every well-shaped document passes through Core's normal candidate validator.
6. The result has `authority: "proposal-only"`. A human may inspect it, but it
   cannot authorize resources, persistence, rendering, export, or publication.
7. Later App workflow code must load authenticated server-owned locks and pass
   the stored base plus proposal through `validateAuthoringLocks`.
8. That workflow must still resolve exact workspace-owned resources, revalidate
   the final document, and record the human decision.

Provider identity, model identity, prompt construction, response hashes,
retention disclosures, workspace identity, resource hashes, and provenance are
trusted App/operator context. The model response cannot supply any of them.

## Implemented controls

- The response object permits only `contractVersion` and `candidates`.
- Each candidate permits only `document` and `rationale`; extra URL, path,
  provider, model, code, or authority fields reject the envelope or candidate.
- Candidate count is three or four. Sparse indices are retained and rejected,
  never skipped.
- Rationale text is required, limited to 800 UTF-16 code units, and restricted
  to one control-character-free paragraph. Valid rationale remains inert text
  and is labeled `kind: "model-suggestion"`.
- Malformed response data produces fixed, bounded issue codes and guidance;
  rejected values are not echoed.
- Candidate documents pass through `validateCandidateDocuments`, including the
  strict design schema, exact template lookup, template requirements, brand
  policy, and pinned text-layout policy. Invalid candidates contain no
  normalized document or canonical JSON.
- Exact duplicate normalized documents are reported with stable indices.
- Lock selection accepts only six closed IDs and rejects duplicate, sparse,
  oversized, or unknown values without echoing them.
- Base and proposed documents both pass through Core candidate validation
  before fixed normalized projections compare copy, imagery, crop, typography,
  palette, and composition. Fixed lock issues contain no paths or values.
- Copy and image locks retain visibility, and text color overlaps typography
  and palette, so changing an unselected category cannot conceal a selected
  choice.
- The boundary performs no network, filesystem, dynamic import, code
  execution, resource lookup, rendering, persistence, or logging.

Core validation proves document shape and document-level quality only. It does
not prove that a model-selected asset ID, font declaration, hash, origin, or
license belongs to a workspace. A proposal containing resource claims remains
untrusted until a later server workflow replaces or verifies those claims
against exact immutable workspace records.

## Threats and required treatment

| Threat                                                                   | Current treatment                                                                              | Required before provider enablement                                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Prompt injection asks for tools, code, URLs, paths, or publication       | Output has no tool authority; strict envelopes and Core reject active document fields          | Keep adapters tool-free and never execute or linkify response text                                |
| Oversized or deeply nested output consumes resources                     | Candidate/rationale counts and Core document limits are bounded                                | Add provider timeout and raw response-byte limits before JSON parsing                             |
| Model spoofs provider, model, workspace, provenance, or retention policy | Extra authority fields are rejected; output is `proposal-only`                                 | Derive and store these values from operator configuration and server state                        |
| Model forges asset/font hashes, origins, or licenses                     | Candidate validation grants no resource authority                                              | Resolve exact workspace-qualified immutable versions and revalidate before save/render            |
| Rationale is presented as fact or provenance                             | Rationale is explicitly typed as a model suggestion and excluded from Core documents/manifests | Preserve the label in every option-board and audit view                                           |
| Duplicate options create an illusion of choice                           | Exact normalized duplicates are rejected deterministically                                     | Human review with real briefs must assess meaningful visual distinctness                          |
| Selective regeneration changes a human lock                              | A pure closed lock contract compares Core-normalized proposals against a validated base        | Load locks/base from authorized immutable server state and block save/render on any lock issue    |
| Sensitive brief data is retained or used for training                    | No provider call exists                                                                        | Require explicit field selection and provider retention/training disclosure before submission     |
| Invalid output is logged or reflected                                    | Fixed issues do not echo rejected values; no logging is added                                  | Logs may contain only request IDs, trusted adapter identity, timing, hashes, and stable codes     |
| Valid proposal is saved, rendered, exported, or published automatically  | No workflow command consumes the result                                                        | Keep human acceptance explicit and re-run authorization, resource resolution, and Core validation |

## Stable response and lock issues

The response boundary returns only:

- `RESPONSE_SHAPE_INVALID`;
- `RESPONSE_VERSION_UNSUPPORTED`;
- `CANDIDATE_COUNT_INVALID`;
- `CANDIDATE_SHAPE_INVALID`;
- `CANDIDATE_RATIONALE_INVALID`;
- `DUPLICATE_NORMALIZED_DOCUMENT`.

A response-level failure returns one issue and no candidates. A well-shaped
three-or-four-candidate response can return at most three duplicate issues and
one envelope issue per rejected candidate. Core independently retains at most
32 document issues per evaluated candidate.

Lock validation additionally returns only:

- `LOCK_SELECTION_INVALID`;
- `BASE_DOCUMENT_INVALID`;
- `CANDIDATE_DOCUMENT_INVALID`;
- one `*_LOCK_VIOLATED` code for each of copy, image, crop, typography,
  palette, and composition.

At most six fixed lock issues are retained. Core document reports remain
independently bounded and never expose a normalized document for invalid input.

## Open decision gate

Before enabling any adapter, approve:

- the exact brief fields permitted to leave the App;
- provider/model allowlisting, timeouts, raw byte limits, retry policy, and
  retention/training disclosure;
- interaction approval of the implemented lock projections and overlap rules
  using real selective-regeneration attempts;
- authenticated immutable storage for the base revision and server-owned lock
  selection, with save/render commands blocked on any lock issue;
- workspace resource pinning and replacement of model resource claims;
- prompt/response hashing and append-only decision records;
- rationale labeling, rejected-candidate recovery, and manual-only behavior in
  the option-board interaction;
- acceptance tests using real briefs that establish meaningful—not merely
  byte-distinct—directions.
