# App resource-ingestion boundary

Glyphkiln App admits only inert PNG/JPEG rasters and individual TrueType or
OpenType/CFF font faces. Uploaded SVG, font collections, WOFF/WOFF2, URLs,
filesystem paths, modules, callbacks, and executable input are outside this
boundary. Rendering never fetches a remote resource.

## Authorization and admission order

The authenticated binary upload route validates same-origin request evidence,
closed bounded metadata, the session, CSRF proof, workspace membership, and the
`ingest_resources` capability before reading the request body or resolving the
scanner. Owner, admin, and editor roles have that capability; viewers do not.
Missing, unauthorized, and foreign-workspace targets do not disclose whether an
object exists.

Admission is then ordered deliberately:

1. Enter a fail-fast global and per-workspace expensive-work gate without
   retaining a wait queue.
2. Enforce the MIME-specific request-body byte limit while reading the body
   inside that reservation.
3. Validate bounded metadata, identifiers, filename, declared MIME, non-empty
   bytes, file signature, header structure, declared dimensions/pixel count, and
   Core's per-file limits before scanning.
4. Compute SHA-256 over a defensive byte copy.
5. Require a clean receipt from the host malware scanner.
6. Fully validate rasters through Core's pinned structural checks and decoders,
   or parse the complete font through Core's pinned font registry.
7. When raster metadata explicitly sets `normalizeColor: true`, call Core's
   isolated `canonical-srgb-png-v1` normalizer, verify its source and output
   evidence, and fully validate the returned PNG. Font uploads and raster
   uploads without that exact opt-in never enter this path.
8. Publish an immutable workspace-partitioned content-addressed blob.
9. In one installation- and workspace-serialized PostgreSQL transaction,
   enforce durable quotas and commit a new immutable resource admission plus
   its ingestion event.

The cheap envelope checks happen before scanner work, but a clean scan is still
required before full decode and persistence. Core validation is defense in
depth and reproducibility validation. It is not a malware scan.
`RejectByDefaultMalwareScanner` is the default, so ingestion is unavailable
until the host explicitly configures a scanner.

## Malware scanner contract

`ClamAvInstreamScanner` is the production scanner adapter. It uses ClamAV's
length-prefixed `INSTREAM` protocol over an operator-configured TCP or Unix
socket and never invokes a shell. Upload metadata cannot choose the endpoint,
command, or path. Request bytes, response bytes, connect time, scan time, and
scanner-version responses are bounded; connection, protocol, timeout, daemon,
and infected results all fail closed.

Before each scan the adapter queries ClamAV's version response and requires a
parseable signature timestamp within the configured maximum age (48 hours by
default). A clean receipt stores the configured engine/deployment version and
the observed signature-database version. Core cannot supply or replace this
host control.

## Blob identity and admission identity

A content blob is not a resource admission:

- A **resource blob** is immutable bytes addressed by workspace, resource kind,
  and SHA-256.
- A **resource admission** is an immutable selectable row containing the
  submitted origin and license metadata, clean scanner receipt, actor, and font
  face declaration when applicable.
- A **resource ingestion event** records that accepted upload and points to the
  earlier same-workspace admission when it is a duplicate.

Every clean upload creates a new admission. Duplicate bytes reuse the blob but
do not reuse or overwrite an earlier provenance row. Raster duplicate matching
uses content hash. Font duplicate matching additionally requires the same
family, weight, and style; different declared faces may share a blob without
being the same admission. A separate workspace receives its own database
identity and blob key even when the bytes match.

An opted-in raster normalization also creates a new admission; it never updates
the uploaded source admission or a saved revision. The normalized admission's
`content_hash` is the canonical PNG output hash. Immutable provenance alongside
that row records the normalization policy, source MIME and source hash, while
the ingestion event retains the originally declared MIME. The clean scanner
receipt applies to the source bytes; the canonical output is produced in Core's
permission-limited normalizer and then independently revalidated before
publication.

This distinction lets the workflow select a later admission with corrected
origin or license metadata. Saving a design appends immutable,
workspace-qualified revision-resource pins for the exact selected IDs. The
document's app-owned `metadata.resourceVersions` repeats each selected
admission's ID, content hash, origin, and license; reopen and worker load verify
that the pins match the canonical document. Core manifests bind that canonical
document hash, while render fingerprints continue to exclude non-pixel
metadata. Core still receives only the exact declarations and bytes its render
contract supports. See
[ADR 0014](adr/0014-app-alpha-lifecycle-and-capacity-invariants.md).

## Capacity and durable quotas

Body acquisition, defensive copies, scanning, and decoding are bounded by an
in-process admission controller. The safe self-hosted defaults permit one
operation across the web process and one per workspace; excess work is rejected
immediately rather than added to an attacker-controlled memory queue. The
limits are configurable within closed ranges.

The gate is process-local. It is a topology-wide bound only for the supported
single-web-process Alpha deployment. Operators adding web replicas must also
add distributed or reverse-proxy admission control.

PostgreSQL is the cross-process authority for durable growth. Under
installation and workspace capacity locks it limits:

- immutable admission records (10,000 per workspace by default); and
- distinct stored blob bytes (1 GiB per workspace by default);
- immutable admission records across the installation (100,000 by default);
  and
- distinct stored blob bytes across the installation (10 GiB by default).

A duplicate consumes one admission slot but no additional blob-byte quota.
These quotas are configuration limits, not billing or Cloud entitlements.

## Immutable filesystem storage

`FileSystemResourceBlobStorage` is the supported local object adapter. Object
keys are generated from a hash of the workspace identity, resource kind, and
content hash; upload metadata never chooses a path. Writes use an exclusive
temporary file and immutable publication. Reads are bounded, reject symlinks
and non-regular files at every existing path component, and reverify both
length and SHA-256 against PostgreSQL metadata.

The resource service itself is not an HTTP authorization boundary. The route
and the manual-design workflow authenticate first and make workspace-qualified
lookups through the centralized role policy. The worker independently reloads
the stored revision and its immutable resource pins, reauthorizes the requester,
performs metadata-only Core count/byte/dimension/pixel aggregate preflight,
then resolves only those admitted same-workspace blobs and passes explicit
bytes to Core. Synchronous preview uses the same resolver boundary.
