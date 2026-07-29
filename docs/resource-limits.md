# Resource limits and worker profile

Core applies fixed limits before expensive validation, hashing, font parsing, or
rasterization. The public `RENDER_RESOURCE_LIMITS` constant is the authoritative
profile:

| Resource                         | Limit           |
| -------------------------------- | --------------- |
| Encoded design document          | 1 MiB           |
| Design depth / entries           | 32 / 10,000     |
| Metadata encoded size            | 64 KiB          |
| Metadata depth / entries         | 12 / 2,048      |
| Resolved assets                  | 100             |
| Asset bytes                      | 16 MiB each     |
| Total asset bytes                | 48 MiB          |
| Asset width or height            | 8,192 px        |
| Asset decoded pixels             | 40 million each |
| Total decoded asset pixels       | 80 million      |
| Caller-supplied fonts            | 32              |
| Font bytes                       | 10 MiB each     |
| Total caller-supplied font bytes | 32 MiB          |
| Requested output formats         | 2               |

SDK input is inspected iteratively before Zod validation. Cycles, accessors,
non-JSON object instances, excessive nesting, excessive entry counts, and
oversized metadata fail with structured validation problems. The CLI reads at
most 1 MiB plus one sentinel byte, so an oversized file is rejected without
loading the whole file.

PNG assets must have a complete bounded chunk structure with `IHDR` dimensions
and an `IEND` at end of file. JPEG assets must have a bounded marker structure,
a start-of-frame dimension record, a scan, and an end-of-image marker. Core then
fully decompresses every raster with pinned PNG/JPEG decoders, verifies decoder
dimensions, and enforces declared, encoded, per-image, and aggregate pixel
limits before the asset can enter a scene.

## Process isolation

`renderGraphicIsolated` applies `RENDER_WORKER_PROFILE` itself:

- one concurrent render per worker;
- a 15-second wall-clock timeout;
- no network or executable-code capability exposed to render input;
- package/dependency read access, temporary-directory read/write access, and no
  child-process capability inside the render process;
- Node worker limits of 256 MiB old generation, 64 MiB young generation, and a
  4 MiB stack.

The SDK serializes isolated calls, launches a permission-limited Node child
process, applies V8 heap/stack limits, and kills it on timeout. The render job
loads only fixed Core modules and receives data, never callbacks or module
paths. A host can still add a container/seccomp policy for kernel-level network,
credential, and tenant isolation; this is defense in depth rather than a
missing Core lifecycle implementation.
