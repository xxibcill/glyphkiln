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

## Choose how to run it

- Use the local guide below to try the app on one computer.
- Use the [self-hosting guide](../../docs/self-hosting.md) for a persistent
  production installation with TLS, PostgreSQL, ClamAV, backups, and hardened
  app and worker containers.

The development server is for local use only. Do not expose it directly to a
network.

## Run the app locally

This guide starts the web app and render worker on your computer and runs
PostgreSQL in Docker. The local path supports the complete built-in design and
export workflow with the bundled Inter font. Resource upload remains closed
unless a malware scanner is configured.

### 1. Install the prerequisites

You need:

- Git
- Node.js 22.22.2 or newer in the Node 22 line, or Node.js 24 or newer
- npm 10.9.8
- Docker Engine or Docker Desktop with the Docker daemon running
- OpenSSL, used once to create the first-owner token

Check the main tools:

```bash
node --version
npm --version
docker version
openssl version
```

The repository pins npm `10.9.8`. If your npm version differs, install that
version globally while your shell is outside the repository:

```bash
cd ..
npm install --global npm@10.9.8
cd glyphkiln
```

### 2. Clone and install Glyphkiln

Skip the clone command if you already have this repository.

```bash
git clone https://github.com/xxibcill/glyphkiln.git
cd glyphkiln
npm ci
```

Run all remaining commands from the repository root.

### 3. Start a development PostgreSQL database

The following command creates a PostgreSQL container on host port `54329` and
keeps its database in a named Docker volume:

```bash
docker run --name glyphkiln-dev-postgres \
  --detach \
  --publish 127.0.0.1:54329:5432 \
  --env POSTGRES_DB=glyphkiln \
  --env POSTGRES_USER=glyphkiln \
  --env POSTGRES_PASSWORD=glyphkiln-development-only \
  --volume glyphkiln-dev-postgres:/var/lib/postgresql/data \
  postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3
```

The password in this command is for loopback development only. Never reuse it
for a shared or production database.

Check that PostgreSQL is ready:

```bash
docker exec glyphkiln-dev-postgres \
  pg_isready --username glyphkiln --dbname glyphkiln
```

If it reports that PostgreSQL is not ready, wait a few seconds and run the
check again. On later sessions, restart the existing container with:

```bash
docker start glyphkiln-dev-postgres
```

### 4. Configure this terminal

These variables apply only to the current terminal. The storage path is
absolute and is ignored by Git.

```bash
export DATABASE_URL="postgresql://glyphkiln:glyphkiln-development-only@127.0.0.1:54329/glyphkiln"
export GLYPHKILN_DATABASE_SSL="prefer"
export GLYPHKILN_STORAGE_ROOT="$PWD/.glyphkiln-dev/storage"
export GLYPHKILN_BOOTSTRAP_TOKEN="$(openssl rand -hex 32)"

mkdir -p "$GLYPHKILN_STORAGE_ROOT"
printf 'First-owner token: %s\n' "$GLYPHKILN_BOOTSTRAP_TOKEN"
```

Keep the printed token private. You will enter it once in the browser. The
token must contain 32–256 characters.

Optional AI proposals are disabled by default and are not required for any
manual workflow. Provider configuration alone cannot enable workspace-data
egress. After the documented product, outbound-field, provider-account, and
retention gates have been approved, the operator must set the exact production
approval value together with every provider value:

```bash
export GLYPHKILN_AI_PROPOSALS="production-approved"
export GLYPHKILN_CAMPAIGN_WORKFLOW="product-qualified"
export GLYPHKILN_AI_PROVIDER="openai-responses"
export GLYPHKILN_OPENAI_API_KEY="operator-secret"
export GLYPHKILN_AI_MODEL="operator-approved-model-snapshot"
export GLYPHKILN_AI_RETENTION_DISCLOSURE="Accurate operator-reviewed provider and account retention disclosure."

# Optional bounded overrides:
export GLYPHKILN_AI_TIMEOUT_MS="45000"
export GLYPHKILN_AI_MAX_OUTPUT_TOKENS="20000"
```

The adapter uses the fixed OpenAI Responses endpoint with `store: false`, but
that setting is not a substitute for reviewing the provider agreement and
account-level retention controls. The model is an untrusted proposal producer:
responses remain unknown until strict App and Core validation, and model URLs,
paths, hashes, provenance, and resource identities have no authority. See the
[AI authoring threat model](../../docs/ai-authoring-threat-model.md) for the
implemented boundary and remaining product gates. Leave
`GLYPHKILN_AI_PROPOSALS` absent or set it to `disabled` to keep the adapter off;
in that state, provider variables are inert. AI approval is accepted only with
`GLYPHKILN_CAMPAIGN_WORKFLOW=product-qualified`; campaign persistence is
otherwise dark-launched and hidden from the workshop.

### 5. Prepare the database and worker

Apply the checked-in database migrations, build Core, and build the separate
render worker:

```bash
node apps/glyphkiln-app/scripts/migrate.mjs up
npm run build --workspace @glyphkiln/core
npm run build:worker --workspace @glyphkiln/app
```

A successful migration prints the number of applied and already-applied
migrations.

### 6. Start the web app

In the same terminal, run:

```bash
npm run dev
```

Wait for the ready message, then open
[`http://localhost:3000`](http://localhost:3000). The development launcher
binds to loopback by default.

### 7. Start the render worker

Open a second terminal. Give it the same database and storage configuration,
then start the worker:

```bash
cd /absolute/path/to/glyphkiln

export DATABASE_URL="postgresql://glyphkiln:glyphkiln-development-only@127.0.0.1:54329/glyphkiln"
export GLYPHKILN_DATABASE_SSL="prefer"
export GLYPHKILN_STORAGE_ROOT="$PWD/.glyphkiln-dev/storage"

npm run start:worker --workspace @glyphkiln/app
```

Replace `/absolute/path/to/glyphkiln` with the path printed by `pwd` in the
first terminal. Keep this terminal running. The app submits durable export
jobs; the worker reloads the exact saved revision and produces their SVG, PNG,
and manifest artifacts.

### 8. Create the first account and design

In the browser:

1. Choose **First-run setup**.
2. Enter the printed first-owner token, your display name, email, a strong
   password, and a workspace name.
3. Select **Create owner and workspace**.
4. Enter a brand-kit name and colors, then select **Publish immutable
   snapshot**.
5. Choose a format, template, procedural style, and copy.
6. Select **Preview draft · does not save**.
7. Enter a design name and optional change note, then select **Save revision
   1**.
8. Select **Render saved revision** to reproduce the stored revision.
9. Select **Queue durable export**. When the worker finishes, download the SVG,
   PNG, and manifest artifacts.

After claiming the installation, stop the app with `Ctrl+C`, remove the
bootstrap token from that terminal, and restart the app:

```bash
unset GLYPHKILN_BOOTSTRAP_TOKEN
npm run dev
```

An absent token closes first-owner registration without changing the account
or workspace you created.

### 9. Stop and restart

Stop the app and worker with `Ctrl+C` in their terminals. Stop PostgreSQL with:

```bash
docker stop glyphkiln-dev-postgres
```

The named Docker volume preserves the database, and `.glyphkiln-dev/storage`
preserves resources and rendered artifacts. On the next session:

1. Run `docker start glyphkiln-dev-postgres`.
2. Export `DATABASE_URL`, `GLYPHKILN_DATABASE_SSL`, and
   `GLYPHKILN_STORAGE_ROOT` again in each terminal.
3. Run the migration command; it is safe when migrations are already current.
4. Rebuild the worker after pulling or changing application code.
5. Start the app and worker. Do not set a new bootstrap token for an
   installation that already has its first owner.

## Troubleshooting

- `DATABASE_URL is required`: export the database variables in the terminal
  that produced the error.
- A migration-current error: run
  `node apps/glyphkiln-app/scripts/migrate.mjs up`.
- A durable export remains queued: confirm the worker terminal is running and
  uses the same `DATABASE_URL` and `GLYPHKILN_STORAGE_ROOT` as the app.
- PostgreSQL port `54329` is already in use: choose another host port in both
  the Docker `--publish` option and `DATABASE_URL`.
- Resource ingestion reports `SCANNER_UNAVAILABLE`: the local guide
  intentionally omits ClamAV. Follow the production self-hosting profile to
  enable admitted font and raster uploads.

The application APIs are same-origin, cookie-authenticated interfaces under
`/api/app`. They enforce bounded bodies, CSRF protection for commands, and
workspace authorization. The legacy caller-authored `/api/preview` endpoint is
retired and returns `410 Gone`.

Campaign and review foundations use the same command/query boundary. Campaign
canvases refer to exact immutable design revisions and Core-derived seeds.
Review comments and state transitions are revision-bound; approval is restricted
to owner/admin capability and snapshots the exact revision hash, resource pins,
and completed-render output hashes/fingerprints. The current browser workshop
does not yet expose option boards, visual revision comparison, or campaign
handoff bundles.

## Production build

```bash
npm run build
npm start
```

The build stages the Next.js standalone application and the separately
executable render worker. The worker bundle includes the checked-in SQL
migrations and loads the exact installed Core package at runtime:

```bash
npm run start:worker --workspace @glyphkiln/app
```

Run migrations through the one-shot migration command before starting either
runtime. App and worker processes verify that the schema is current; they do
not apply DDL during normal startup.

Test the packaged artifact on the operating-system and CPU target where it
will run:

```bash
npm run test:standalone --workspace @glyphkiln/app
```

For the supported single-host container topology, environment reference,
reverse-proxy/TLS requirements, health checks, scanner boundary, and
backup/restore procedure, see
[`docs/self-hosting.md`](../../docs/self-hosting.md). Non-loopback operation is
intentionally closed unless the production HTTPS, proxy, secure-cookie, and
database startup gate is satisfied.
