# Self-hosting Glyphkiln App Alpha

The supported Alpha topology is:

```text
browser
  → bundled Caddy TLS reverse proxy
    → Glyphkiln App
      → PostgreSQL (application state and durable render queue)
      → shared filesystem volume (resources, outputs, manifests)
      → ClamAV parser (ingestion only, internal scanner network)
    → render worker
      → PostgreSQL
      → shared filesystem volume
      → permission-limited Core render child
  FreshClam updater → signature volume (scanner-only egress)
```

There is no Redis or MinIO dependency in this profile. PostgreSQL is the
durable queue, and the shared named volume is the supported local object store.
This profile targets one Docker host. Do not place app and worker on different
hosts until an independently tested shared object-storage adapter exists.
Only the Caddy proxy and FreshClam updater join non-internal networks. Caddy
reaches the app only over `app-proxy`; FreshClam shares only the signature
volume with the parser. The ClamAV parser has no egress or database-network
access and is reachable from the app only over `app-scanner`. App, worker,
migration, grant, and database services remain without general internet egress.

## Prerequisites

- Docker Engine 28 or a compatible current engine with Compose v2
- a DNS name controlled by the operator
- inbound TCP ports 80 and 443 available to the bundled Caddy proxy
- persistent local capacity for PostgreSQL and `glyphkiln-storage`
- at least 6 GiB host memory (8 GiB preferred) so ClamAV can reload signatures
  without competing with PostgreSQL, app, and the bounded render worker

The checked-in images are pinned by tag and multi-architecture digest. Review
and deliberately update those pins during an upgrade.

## First installation

From the repository root:

```sh
cp deploy/self-host/.env.example deploy/self-host/.env
chmod 600 deploy/self-host/.env
```

Set distinct long URL-safe PostgreSQL passwords for the migration owner, web
runtime, and render worker, plus the exact browser-visible HTTPS origin. Set
`GLYPHKILN_BOOTSTRAP_TOKEN` to another `openssl rand -hex 32` value and give
that token out-of-band only to the intended first owner; the first-run form
requires it before creating any account or workspace. A separate
`openssl rand -hex 32` value for each secret is URL-safe. Do not use a database
password containing unescaped URL delimiters because Compose interpolates those
values into `DATABASE_URL`.

After the first owner succeeds, clear `GLYPHKILN_BOOTSTRAP_TOKEN` from the
protected environment and recreate the app container. An absent token closes
bootstrap registration; it does not reopen or alter the bootstrapped database.

The bundled Caddy service loads `deploy/self-host/Caddyfile.example`. It obtains
and renews the certificate for `GLYPHKILN_PUBLIC_ORIGIN`; make sure public DNS
and inbound ports 80/443 reach the Docker host before starting the stack. Then
validate and start it:

```sh
docker compose \
  --env-file deploy/self-host/.env \
  -f deploy/self-host/compose.yaml \
  config

docker compose \
  --env-file deploy/self-host/.env \
  -f deploy/self-host/compose.yaml \
  up --build -d
```

The one-shot `migrate` service applies DDL as `glyphkiln_migrator`. The
`grant-runtime` service grants application DML to `glyphkiln_runtime`, while
`glyphkiln_worker` receives only the authorization/input columns it must read
and render-queue columns it must change. App and worker use separate credentials
and only verify migration checksums during normal startup. `app` additionally
waits for ClamAV's health check. ClamAV is not ready merely because its
container is running: `clamd` must answer its ping check, the daily signature
database must have been refreshed within 48 hours, and the version loaded by
the daemon must match that on-disk database after FreshClam updates it.
Ingestion fails closed whenever the scanner is unavailable or signatures are
stale.

On a fresh signature volume, Compose waits for FreshClam to verify a current
daily database before starting ClamD. This ordering prevents ClamD from loading
the image's older bundled database while the updater atomically replaces it.

Inspect startup:

```sh
docker compose \
  --env-file deploy/self-host/.env \
  -f deploy/self-host/compose.yaml \
  ps

curl --fail --silent --show-error \
  https://glyphkiln.example.com/api/health/live

curl --fail --silent --show-error \
  https://glyphkiln.example.com/api/health/ready
```

Liveness proves only that the web process answers. Runtime startup verifies all
checked-in migration checksums; readiness then checks database access and a
bounded immutable storage write/read probe. Worker health independently checks
its migration state, queue schema, and storage directory.

## Environment reference

| Variable                                            | Service                          | Required / meaning                                                                                      |
| --------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `GLYPHKILN_POSTGRES_MIGRATOR_PASSWORD`              | postgres, migrate, grant-runtime | Required long URL-safe secret for the DDL-owning migration role                                         |
| `GLYPHKILN_POSTGRES_RUNTIME_PASSWORD`               | postgres, app                    | Required distinct long URL-safe secret for the non-DDL web role                                         |
| `GLYPHKILN_POSTGRES_WORKER_PASSWORD`                | postgres, worker                 | Required distinct long URL-safe secret for the queue-limited worker role                                |
| `GLYPHKILN_BOOTSTRAP_TOKEN`                         | app                              | Secret of 32–256 characters required only to claim a fresh installation; clear it after setup           |
| `GLYPHKILN_PUBLIC_ORIGIN`                           | app                              | Required exact HTTPS origin, without path or trailing slash                                             |
| `GLYPHKILN_PROXY_BIND_ADDRESS`                      | proxy                            | Host address for Caddy; production default `0.0.0.0`, use `127.0.0.1` only for a controlled local drill |
| `GLYPHKILN_PROXY_HTTP_PORT`                         | proxy                            | Caddy HTTP/ACME and redirect port; supported production value `80`                                      |
| `GLYPHKILN_PROXY_HTTPS_PORT`                        | proxy                            | Caddy HTTPS port; supported production value `443`                                                      |
| `GLYPHKILN_CADDY_TLS`                               | proxy                            | Leave unset for public automatic HTTPS; `tls internal` requires explicitly trusting Caddy's local CA    |
| `DATABASE_URL`                                      | app, worker, migrate             | Compose-generated role-specific PostgreSQL URL; keep secret                                             |
| `GLYPHKILN_DATABASE_SSL`                            | app, worker                      | `prefer` for the private Compose network; use `require` or `verify-full` for external PostgreSQL        |
| `GLYPHKILN_DATABASE_MAX_CONNECTIONS`                | app                              | Integer 1–100; Compose uses 10                                                                          |
| `GLYPHKILN_STORAGE_ROOT`                            | app, worker                      | Non-root absolute path; Compose uses `/var/lib/glyphkiln`                                               |
| `GLYPHKILN_WORKSPACE_MAX_PER_USER`                  | app                              | Workspaces one account may create, 1–1,000; default and Compose policy `5`                              |
| `GLYPHKILN_WORKSPACE_MAX_PER_INSTALLATION`          | app                              | Installation-wide workspace count, 1–100,000; default and Compose policy `100`                          |
| `GLYPHKILN_RENDER_MAX_OUTSTANDING_PER_INSTALLATION` | app                              | Installation-wide queued/retrying/claimed jobs, 1–100,000; default and Compose policy `1000`            |
| `GLYPHKILN_RENDER_MAX_OUTSTANDING_PER_WORKSPACE`    | app                              | Durable queued/retrying/claimed jobs per workspace, 1–10,000; default and Compose policy `100`          |
| `GLYPHKILN_RESOURCE_MAX_INSTALLATION_ADMISSIONS`    | app                              | Installation-wide immutable admissions, 1–10,000,000; default and Compose policy `100000`               |
| `GLYPHKILN_RESOURCE_MAX_INSTALLATION_STORED_BYTES`  | app                              | Installation-wide logical blob bytes, 1–16 TiB; default and Compose policy `10737418240` (10 GiB)       |
| `GLYPHKILN_RESOURCE_MAX_ADMISSIONS`                 | app                              | Immutable resource admissions per workspace, 1–1,000,000; default and Compose policy `10000`            |
| `GLYPHKILN_RESOURCE_MAX_STORED_BYTES`               | app                              | Logical admitted resource bytes per workspace, 1–1 TiB; default and Compose policy `1073741824` (1 GiB) |
| `GLYPHKILN_RESOURCE_SCAN_GLOBAL_CONCURRENCY`        | app                              | In-process concurrent scan admissions, 1–64; safe default and Compose policy `1`                        |
| `GLYPHKILN_RESOURCE_SCAN_WORKSPACE_CONCURRENCY`     | app                              | In-process concurrent scans per workspace, 1 through the global value; safe default and policy `1`      |
| `GLYPHKILN_CLAMAV_HOST`                             | app                              | Operator-controlled daemon name; Compose uses `clamav`                                                  |
| `GLYPHKILN_CLAMAV_PORT`                             | app                              | ClamAV INSTREAM port; default `3310`                                                                    |
| `GLYPHKILN_CLAMAV_VERSION`                          | app                              | Required receipt label when ClamAV is configured                                                        |
| `GLYPHKILN_CLAMAV_MAX_SIGNATURE_AGE_HOURS`          | app                              | Maximum accepted daemon signature age, 1–168 hours; default and Compose policy `48`                     |
| `GLYPHKILN_CLAMAV_SOCKET`                           | app                              | Unix-socket alternative; mutually exclusive with host                                                   |
| `GLYPHKILN_WORKER_ID`                               | worker                           | Optional stable log/claim label, maximum 160 characters                                                 |
| `GLYPHKILN_WORKER_DATABASE_CONNECTIONS`             | worker                           | Integer 1–20; default 2                                                                                 |
| `GLYPHKILN_WORKER_POLL_MS`                          | worker                           | Idle poll interval 50–60,000 ms; default 500                                                            |
| `GLYPHKILN_WORKER_LEASE_MS`                         | worker                           | Attempt lease 20,000–900,000 ms; default 60,000                                                         |

Compose also sets `GLYPHKILN_HOSTNAME=app-proxy-upstream`,
`GLYPHKILN_TRUST_PROXY=true`, and `GLYPHKILN_SECURE_COOKIES=true`. See
[`app-self-hosting-security.md`](app-self-hosting-security.md) before changing
network settings.

The PostgreSQL role initializer runs only when `postgres-data` is empty. Do not
copy an existing database volume between installations or change only one of
the three passwords in a populated volume. Rotate database credentials with
PostgreSQL `ALTER ROLE`, update the protected Compose environment atomically,
and restart clients.

Workspace creation, render outstanding-job limits, and resource
admission/byte budgets have transactionally enforced installation-wide bounds
in addition to their per-user or per-workspace bounds. Exact render idempotency
replays are returned before capacity checks. The two scan-concurrency limits
protect one app process; the supported 768 MiB profile deliberately runs one
app container with both limits set to `1`, because a maximum-dimension raster
may require roughly 256 MiB merely for its decoded RGBA buffer. Raise either
limit only together with a measured app memory-limit increase. If a future
topology adds app replicas, their in-process global scan limits multiply and
must be replaced or supplemented by a shared admission provider before
treating the configured value as cluster-wide.

## Queue and worker behavior

Each render job references an immutable stored revision and one fixed manifest
timestamp. Workers claim with a lease and recheck active account, active
workspace, non-revoked membership, current role, revision/brand hashes, and
workspace resource ownership. Revoking a member therefore closes already
queued work before rendering. Workers never render a document embedded in
queue data.

Transient isolated-process and storage availability failures retry at
deterministic exponential delays (1 second, 2 seconds, then bounded at 60
seconds). The default maximum is three attempts. Validation, authorization,
resource mismatch, and integrity failures are terminal. A crash leaves a
lease; another worker records the abandoned attempt after expiry. A late worker
cannot commit after losing its claim.

Useful inspection queries:

```sql
SELECT state, count(*) FROM render_jobs GROUP BY state ORDER BY state;

SELECT workspace_id, job_id, attempt_number, worker_id, outcome,
       error_code, started_at, finished_at
FROM render_attempts
ORDER BY finished_at DESC
LIMIT 100;
```

Do not log documents, resource bytes, tokens, database URLs, or private
filenames while diagnosing a job.

## Reverse proxy and TLS

The app has no published host port. The bundled Caddy service is the only
public container and reaches `app-proxy-upstream:3000` over the isolated
`app-proxy` network. That network-scoped alias also gives the multi-network app
a single concrete bind address without using a wildcard listener.
Caddy overwrites untrusted forwarding headers with the observed client, scheme,
and host. The public origin must match the browser's HTTPS origin exactly.
Glyphkiln does not support an origin path prefix. The supported production
profile uses standard ports 80 and 443 so automatic certificate issuance and
renewal can complete.

Use an automatically renewed certificate, modern TLS policy, HSTS only after
HTTPS is proven, and a request-body limit no lower than the admitted 16 MiB
raster boundary plus protocol overhead. Deny framing with both CSP
`frame-ancestors 'none'` and `X-Frame-Options: DENY`.

The checked-in Caddy configuration supplies TLS, body limits, and security
headers, but stock Caddy has no source-rate-limit directive. Before exposing
the service to untrusted public traffic, add a trusted upstream or proxy module
that enforces per-source and global request admission on `/api/app/commands`,
especially registration and login. Without that external admission policy,
the profile is suitable only behind a controlled-access network; the
application's persistent credential throttle and bounded Argon2 work queue are
defense in depth, not a source-level denial-of-service control.

Core's render process has no network permission. The ClamAV parser also has no
egress; only its separate FreshClam updater can reach signature servers, and it
shares only the signature volume with the parser. Caddy has certificate/network
egress but no application or database credential. Do not join app, worker, or
the parser to either egress network.

## Back up

PostgreSQL is authoritative for identities, workspaces, immutable revisions,
resource metadata, queue history, and output keys. The `glyphkiln-storage`
volume contains admitted bytes, rendered artifacts, and canonical manifests.
Both are required. ClamAV signatures can be re-downloaded and need not be
backed up.

Stop writers for a consistent pair, but leave PostgreSQL running:

```sh
export SNAPSHOT_DIR="$PWD/glyphkiln-backup-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 "$SNAPSHOT_DIR"

docker compose --env-file deploy/self-host/.env \
  -f deploy/self-host/compose.yaml stop app worker

docker compose --env-file deploy/self-host/.env \
  -f deploy/self-host/compose.yaml exec -T postgres \
  pg_dump --username glyphkiln_migrator --dbname glyphkiln \
  --format=custom --no-owner --no-acl > "$SNAPSHOT_DIR/database.dump"

mkdir -m 700 "$SNAPSHOT_DIR/storage"
docker compose --env-file deploy/self-host/.env \
  -f deploy/self-host/compose.yaml cp -a \
  app:/var/lib/glyphkiln/. "$SNAPSHOT_DIR/storage"

tar -C "$SNAPSHOT_DIR/storage" -cpf "$SNAPSHOT_DIR/storage.tar" .
(
  cd "$SNAPSHOT_DIR"
  sha256sum database.dump storage.tar > SHA256SUMS
)
docker compose --env-file deploy/self-host/.env \
  -f deploy/self-host/compose.yaml start app worker
```

Verify every backup immediately:

```sh
docker compose --env-file deploy/self-host/.env \
  -f deploy/self-host/compose.yaml exec -T postgres \
  pg_restore --list < "$SNAPSHOT_DIR/database.dump" >/dev/null
(
  cd "$SNAPSHOT_DIR"
  sha256sum --check SHA256SUMS
  tar -tf storage.tar >/dev/null
)
```

Encrypt the backup at rest, restrict access, copy it off-host, and test restore
on a schedule. `database.dump`, `storage.tar`, and `SHA256SUMS` are the
authoritative backup set; the copied `storage` directory is staging only.
Database-only or storage-only backups are incomplete.

## Restore verification

Never test a restore over the production project. Use a fresh Docker Compose
project and fresh volumes:

1. Copy `deploy/self-host/.env` to an isolated restore environment with three
   new database passwords, an isolated HTTPS origin, and unused HTTP/HTTPS
   proxy ports. Keep `GLYPHKILN_PROXY_HTTPS_PORT` equal to the port in that
   origin.
2. Set `COMPOSE_PROJECT_NAME=glyphkiln-restore`.
3. Start only PostgreSQL and wait for health.
4. Pipe `database.dump` into the pinned PostgreSQL service with `docker compose
exec -T postgres pg_restore --username glyphkiln_migrator --dbname glyphkiln
--no-owner --no-acl`.
5. Create the stopped app container with `docker compose create app`. Compose
   also creates its dependency containers in the stopped state; it does not
   start them. Extract verified `storage.tar` into a new empty staging
   directory, and copy that directory's contents to `/var/lib/glyphkiln` using
   `docker compose cp -a`.
6. Start ClamAV and its updater, run `migrate`, run `grant-runtime`, then start
   app, worker, and proxy.
7. Require both health endpoints, run the worker `--healthcheck`, compare row
   counts for `workspaces`, `design_revisions`, `resource_versions`,
   `render_jobs`, and `render_outputs`, then reopen and verify at least one
   stored SVG/PNG/manifest set in the application.
8. Destroy only the explicitly named restore project after recording the
   result.

If a restore target is already populated, stop and investigate; do not merge
two installations by copying database or object files.

## Upgrade and failure recovery

Before upgrading, take and verify a complete backup. Build the new image, run
the one-shot migration service, then recreate app and worker:

```sh
docker compose --env-file deploy/self-host/.env \
  -f deploy/self-host/compose.yaml build --pull
docker compose --env-file deploy/self-host/.env \
  -f deploy/self-host/compose.yaml run --rm migrate
docker compose --env-file deploy/self-host/.env \
  -f deploy/self-host/compose.yaml run --rm --no-deps grant-runtime
docker compose --env-file deploy/self-host/.env \
  -f deploy/self-host/compose.yaml up -d app worker
```

Migration rollback files are destructive and are not an ordinary application
rollback mechanism. Restore the verified pre-upgrade database and storage pair
instead. If a worker repeatedly exhausts, retain its rows and attempt history,
fix the underlying renderer/storage/resource issue, and submit a new render
request rather than editing immutable attempts or outputs.

The Docker build copies only the Next standalone runtime, the bundled worker,
all checked-in SQL migrations, and Core runtime/license files into the final
image. Source tests and development dependencies remain in the build stage.
