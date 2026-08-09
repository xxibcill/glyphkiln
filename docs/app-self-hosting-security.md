# App self-hosting network security

Glyphkiln App binds to `127.0.0.1` by default. `localhost`, `127.0.0.1`, and
`::1` remain supported for local operation without production infrastructure.
Wildcard bind addresses such as `0.0.0.0`, `::`, and `*` are rejected; use a
concrete interface address or valid DNS hostname.

## Non-loopback startup gate

A non-loopback `GLYPHKILN_HOSTNAME` starts only when all of these settings are
valid:

| Variable                   | Required value                                                                  |
| -------------------------- | ------------------------------------------------------------------------------- |
| `NODE_ENV`                 | Exactly `production`                                                            |
| `GLYPHKILN_PUBLIC_ORIGIN`  | A non-loopback `https://` origin, with no credentials, path, query, or fragment |
| `GLYPHKILN_TRUST_PROXY`    | Exactly `true`                                                                  |
| `DATABASE_URL`             | A nonempty `postgres://` or `postgresql://` URL with a host                     |
| `GLYPHKILN_SECURE_COOKIES` | Exactly `true`                                                                  |

The gate validates configuration syntax only. It does not test database
connectivity, apply migrations, configure TLS, or prove that a proxy is
trustworthy. Startup errors name invalid or missing variables but do not echo
their values.

Fresh-installation registration is separately protected by the
operator-provisioned `GLYPHKILN_BOOTSTRAP_TOKEN`. Same-origin checks alone do
not establish who may become the first owner. Send the token to the intended
owner over a separate protected channel and enter it only over the configured
HTTPS origin. Registration fails closed when no token is configured, and the
database still permits only one successful bootstrap transaction.

## Reverse-proxy and TLS assumptions

For a non-loopback deployment, the supported Compose topology terminates TLS at
its pinned Caddy service and makes the application reachable only over the
internal `app-proxy` network. Caddy overwrites client-supplied forwarding
headers and provides the original HTTPS scheme and host consistently with
`GLYPHKILN_PUBLIC_ORIGIN`. The app publishes no host port, so clients cannot
reach it directly and forge forwarding metadata.

`GLYPHKILN_TRUST_PROXY=true` is an operator assertion that those network
controls are in place. `GLYPHKILN_SECURE_COOKIES=true` ensures session cookies
are restricted to HTTPS transport. The public origin must be the external
origin seen by browsers, for example `https://glyphkiln.example` or
`https://glyphkiln.example:8443`. Do not add a trailing slash; it is a path.
Glyphkiln App does not support deployment under an origin path prefix.

The supported Compose profile separates the DDL-owning
`glyphkiln_migrator`, web `glyphkiln_runtime`, and queue-limited
`glyphkiln_worker` roles. Keep all three credentials in the host's
secret-management facility and restrict database ingress to the internal
application network. The checked-in Caddy configuration owns certificate
issuance, renewal, modern TLS policy, request size limits, and anti-framing
headers. It does not implement rate
limiting; without a trusted upstream admission policy, restrict the service to
a controlled-access network.

## Boundary of this protection

The startup gate prevents accidental remote exposure under obviously
incomplete deployment configuration. It is not authentication, authorization,
a firewall, a malware scanner, or a substitute for workspace-isolation
enforcement. Do not treat possession of the application hostname, access to
the proxy network, or successful startup as proof that a request is authorized.

Workspace membership is checked from PostgreSQL on every authorized request;
roles are not copied into the session cookie. Owners can soft-revoke a member,
which preserves creator/requester provenance while immediately invalidating
all of that user's sessions and outstanding invitations they issued. Invitation
acceptance also locks and rechecks that the issuer still has the capability to
grant the requested role. Queued render jobs recheck that the requesting
membership is still active before Core receives the stored revision. App Alpha
does not expose owner grant or ownership transfer, and it refuses to demote or
revoke the final active owner.

The supported container topology, health checks, queue/storage boundaries,
backup/restore process, and environment reference are documented in
[`self-hosting.md`](self-hosting.md).
