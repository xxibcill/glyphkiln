# AI-assisted authoring threat model

Status: implemented workflow boundary; real-brief product acceptance remains pending

Last reviewed: 2026-08-12

## Status and scope

This is the security gate for the post-Alpha AI-assisted authoring milestone.
Glyphkiln may use an operator-configured model to propose three or four bounded
design directions. The model is never a renderer, resource authority, approval
authority, or source of executable instructions. The complete manual workflow
continues to work when the adapter is disabled.

The implemented slice includes the provider-neutral response and lock
boundaries, one disabled-by-default OpenAI Responses adapter, the
capability-protected campaign workflow, option-board interaction, append-only
AI evidence and decision records, exact resource resolution, Core proofs, and
explicit human acceptance into a new immutable design revision. Proposals have
no path to automatic campaign attachment, approval, export, or publication.

The concrete adapter targets the OpenAI Responses API through a fixed
server-owned endpoint. It uses `store: false`, an operator-selected model, and
the Responses API `text.format` field. Provider behavior and account retention
remain governed by the operator's provider agreement and account settings; the
operator must publish an accurate disclosure in
`GLYPHKILN_AI_RETENTION_DISCLOSURE`. See the official OpenAI guidance for
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
and [Responses text generation](https://developers.openai.com/api/docs/guides/text).

## Protected assets

- operator API credentials and provider configuration;
- workspace briefs, brand snapshots, copy, and admitted-resource metadata;
- immutable resource identities, hashes, provenance, and storage authority;
- human locks, acceptance decisions, review state, and approval evidence; and
- the deterministic Core document, renderer, and output contracts.

## Authority flow

1. After the production gates below are approved, an operator explicitly sets
   `GLYPHKILN_CAMPAIGN_WORKFLOW=product-qualified` and
   `GLYPHKILN_AI_PROPOSALS=production-approved`, then configures an App-owned
   provider adapter. Provider configuration alone remains inert, and AI
   approval cannot bypass the campaign product gate.
2. The adapter sends only operator-approved brief fields under a disclosed
   provider policy.
3. Its parsed JSON response remains `unknown` and enters
   `validateBriefInterpreterResponse`.
4. The App accepts only a strict `1.0.0` envelope containing three or four
   `{ document, rationale }` proposals.
5. Every well-shaped document passes through Core's normal candidate validator.
6. The result has `authority: "proposal-only"`. A human may inspect it, but it
   cannot authorize resources, persistence, rendering, export, or publication.
7. The campaign workflow loads authenticated server-owned locks and passes the
   stored base plus every proposal through `validateAuthoringLocks`.
8. The App requires exact equality with the base document's human-selected
   resource declarations, resolves their workspace-owned immutable bytes, and
   produces a Core SVG/PNG proof before presenting an accept action.
9. Human acceptance reloads the base, locks, candidate, and exact resources,
   reruns validation and Core proof, records an append-only decision, and then
   creates a new immutable design revision with a server-owned ID.

Provider identity, model identity, prompt construction, response hashes,
retention disclosures, workspace identity, resource hashes, and provenance are
trusted App/operator context. The model response cannot supply any of them.

## Implemented response and lock controls

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
- The validation boundary performs no network, filesystem, dynamic import,
  code execution, resource lookup, rendering, persistence, or logging.

Core validation proves document shape and document-level quality only. The App
therefore rejects any proposal whose asset or font declarations differ from
the human-authored base, then resolves the retained declarations against exact
workspace-qualified immutable records before proof or acceptance.

## Implemented adapter controls

1. The operator owns credentials, model selection, timeout, output-token limit,
   and retention disclosure. Credentials never enter browser state or proposal
   data.
2. The adapter accepts only input contract `1.0.0`, a non-empty brief of at most
   4,000 characters, candidate count three or four, unique exact template keys,
   unique closed lock IDs, a Core-valid base document, and an exactly matching
   brand snapshot.
3. The canonical provider input is capped at 1 MiB. Brief and document values
   are serialized as inert JSON data alongside fixed server instructions and
   the published Core authoring contract.
4. The provider request uses a fixed HTTPS endpoint, `store: false`, a bounded
   1–120 second timeout, and a bounded 1,000–50,000 output-token setting. Model
   output cannot choose another URL or credential.
5. Provider responses are streamed through a 4 MiB byte cap, decoded as strict
   UTF-8, and parsed from completed message output. Refusals, incomplete
   envelopes, invalid JSON, timeouts, oversized bodies, and provider errors
   fail closed without echoing provider details.
6. Parsed output remains `unknown` and crosses the same response and Core
   validation boundaries described above.
7. Tests prove that invalid input does not reach the provider and that provider
   details are not retained in public errors.

## Threats and required treatment

| Threat                                                                            | Current treatment                                                                                                                              | Required before user-facing enablement                                                             |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Prompt injection asks for tools, code, URLs, paths, or publication                | Fixed instructions, inert JSON input, no tool authority, and strict output/Core contracts                                                      | Keep adapters tool-free and never execute or linkify response text                                 |
| Oversized or deeply nested input/output consumes resources                        | Brief, request, response, candidate, rationale, timeout, and token limits are bounded                                                          | Retain limits at every workflow and persistence boundary; monitor trusted timing/code metadata     |
| Model spoofs provider, model, workspace, provenance, or retention policy          | Extra authority fields are rejected; output is `proposal-only`                                                                                 | Derive and immutably record these values from operator configuration and server state              |
| Model forges asset/font hashes, origins, or licenses                              | Proposals must retain the base declarations; the App resolves exact workspace-qualified immutable versions before proof and acceptance         | Continue rejecting any model-selected resource identity                                            |
| Rationale is presented as fact or provenance                                      | Rationale is typed as a model suggestion and excluded from Core documents/manifests                                                            | Preserve that label in every option-board and audit view                                           |
| Duplicate options create an illusion of choice                                    | Exact normalized duplicates are rejected deterministically                                                                                     | Human review with real briefs must assess meaningful visual distinctness                           |
| Selective regeneration changes a human lock                                       | Stored locks/base are reloaded and checked at proposal, save, queued render, comparison, and export boundaries                                 | Validate with approved real selective-regeneration attempts                                        |
| Sensitive brief data is retained or used for training                             | Adapter is disabled by default, uses `store: false`, and requires a disclosure                                                                 | Approve exact outbound fields and provider/account retention and training policy before submission |
| Invalid output is logged or reflected                                             | Fixed public issues do not echo rejected values or provider details                                                                            | Logs may contain only request IDs, trusted adapter identity, timing, hashes, and stable codes      |
| Valid proposal is saved, rendered, exported, approved, or published automatically | Core proof is allowed, but saving requires explicit human acceptance into a new design; no automatic attach/approve/export/publish path exists | Keep acceptance explicit and retain the separation between proposal proof and campaign authority   |

## Stable response and lock issues

The response boundary returns only:

- `RESPONSE_SHAPE_INVALID`;
- `RESPONSE_VERSION_UNSUPPORTED`;
- `CANDIDATE_COUNT_INVALID`;
- `CANDIDATE_SHAPE_INVALID`;
- `CANDIDATE_RATIONALE_INVALID`; and
- `DUPLICATE_NORMALIZED_DOCUMENT`.

A response-level failure returns one issue and no candidates. A well-shaped
three-or-four-candidate response can return at most three duplicate issues and
one envelope issue per rejected candidate. Core independently retains at most
32 document issues per evaluated candidate.

Lock validation additionally returns only:

- `LOCK_SELECTION_INVALID`;
- `BASE_DOCUMENT_INVALID`;
- `CANDIDATE_DOCUMENT_INVALID`; and
- one `*_LOCK_VIOLATED` code for each of copy, image, crop, typography,
  palette, and composition.

At most six fixed lock issues are retained. Core document reports remain
independently bounded and never expose a normalized document for invalid input.

## Current implementation boundary

Implemented now:

- provider-neutral `BriefInterpreter` and strict response/lock validators;
- one operator-configured OpenAI Responses adapter, disabled by default;
- an independent fail-closed campaign product gate that AI enablement depends
  on;
- bounded runtime configuration, request input, response streaming, failure
  handling, and retention disclosure; and
- capability-protected campaign proposal commands and option-board UI;
- exact base-resource pinning and resource-backed Core SVG/PNG proofs;
- append-only provider/model, request/response hash, validation, proof metadata,
  and human decision records;
- explicit acceptance into a new immutable design revision; and
- lock checks across proposal, revision, preview/export, queued-worker,
  comparison, and campaign-handoff boundaries.

Still required before enabling an adapter for production users:

- operator approval of the exact outbound brief fields, provider account
  retention/training policy, model allowlist, and operational monitoring;
- interaction acceptance against a real approved brief with at least three
  visibly distinct valid directions; and
- documented recovery behavior when a provider returns too few usable
  candidates or exact resources become unavailable.

## Open decision gate

Before enabling any adapter for users, approve:

- the exact brief fields permitted to leave the App;
- provider/model allowlisting, retries, retention/training disclosure, and
  operational monitoring;
- interaction approval of the implemented lock projections and overlap rules
  using real selective-regeneration attempts;
- authenticated immutable storage for the base revision and server-owned lock
  selection, with commands blocked on any lock issue;
- workspace resource pinning and replacement of model resource claims;
- prompt/response hashing and append-only decision records;
- rationale labeling, rejected-candidate recovery, and manual-only behavior in
  the option-board interaction; and
- acceptance tests using real briefs that establish meaningful—not merely
  byte-distinct—directions.

Until these gates pass, the adapter is infrastructure only and must not be
described as an autonomous design or approval feature.
