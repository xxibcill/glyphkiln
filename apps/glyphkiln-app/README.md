# Glyphkiln App

Glyphkiln App Alpha is the self-hostable, manual design workflow built on
`@glyphkiln/core`. It supports authenticated workspaces, immutable brand
snapshots, persisted design revisions, scanner-admitted raster and font
resources, and asynchronous SVG/PNG/manifest exports.

The application keeps rendering inputs as inert structured data. It does not
execute user code, fetch remote resources while rendering, accept active SVG
uploads, or interpret prompts with an LLM. A worker reloads an exact stored
revision and workspace-owned resource versions, reauthorizes the requester,
and invokes Core's permission-limited deterministic renderer.

## Local development

From the monorepo root:

```sh
npm run dev
```

The development launcher binds to loopback by default. Create the first owner,
workspace, and immutable brand snapshot in the browser, then use the manual
controls to preview, save, reopen, revise, and request an export. First-run
registration also requires the operator value from
`GLYPHKILN_BOOTSTRAP_TOKEN`; use at least 32 random characters even on
loopback.

The application APIs are same-origin, cookie-authenticated interfaces under
`/api/app`. They enforce bounded bodies, CSRF protection for commands, and
workspace authorization. The legacy caller-authored `/api/preview` endpoint is
retired and returns `410 Gone`.

## Production build

```sh
npm run build
npm start
```

The build stages the Next.js standalone application and the separately
executable render worker. The worker bundle includes the checked-in SQL
migrations and loads the exact installed Core package at runtime:

```sh
npm run start:worker --workspace @glyphkiln/app
```

Run migrations through the one-shot migration command before starting either
runtime. App and worker processes verify that the schema is current; they do
not apply DDL during normal startup.

Test the packaged artifact on the operating-system and CPU target where it
will run:

```sh
npm run test:standalone --workspace @glyphkiln/app
```

For the supported single-host container topology, environment reference,
reverse-proxy/TLS requirements, health checks, scanner boundary, and
backup/restore procedure, see
[`docs/self-hosting.md`](../../docs/self-hosting.md). Non-loopback operation is
intentionally closed unless the production HTTPS, proxy, secure-cookie, and
database startup gate is satisfied.
