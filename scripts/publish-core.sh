#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  npm run publish:core -- --dry-run vX.Y.Z
  GLYPHKILN_APPROVE_NPM_PUBLISH=1 npm run publish:core -- vX.Y.Z

Publishes @glyphkiln/core from an isolated checkout of a verified signed tag.
The real publish requires an authenticated local npm session and the explicit
GLYPHKILN_APPROVE_NPM_PUBLISH=1 owner-approval flag.
EOF
}

dry_run=0
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi
if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=1
  shift
fi
if [[ "$#" -ne 1 ]]; then
  usage >&2
  exit 2
fi

release_tag="$1"
if [[ ! "$release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Release tag must match vX.Y.Z." >&2
  exit 2
fi

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

if [[ "$(git cat-file -t "$release_tag" 2>/dev/null || true)" != "tag" ]]; then
  echo "$release_tag must be a local annotated tag." >&2
  exit 1
fi

npm_version="$(npm --version)"
if [[ "$npm_version" != "10.9.8" ]]; then
  echo "Local publication requires npm 10.9.8; found $npm_version." >&2
  exit 1
fi

node_version="$(node --version)"
if [[ ! "$node_version" =~ ^v24\. ]]; then
  echo "Local publication requires a qualified Node 24 release; found $node_version." >&2
  exit 1
fi

temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/glyphkiln-core-release.XXXXXX")"
release_checkout="$temporary_root/source"
allowed_signers="$temporary_root/release-allowed-signers"

cleanup() {
  git -C "$repository_root" worktree remove --force "$release_checkout" >/dev/null 2>&1 || true
  rm -rf -- "$temporary_root"
}
trap cleanup EXIT

git show "$release_tag:.github/release-allowed-signers" > "$allowed_signers"
git \
  -c gpg.format=ssh \
  -c gpg.ssh.allowedSignersFile="$allowed_signers" \
  tag -v "$release_tag"

release_sha="$(git rev-list -n 1 "$release_tag")"
local_tag_object="$(git rev-parse "$release_tag^{tag}")"
remote_tag_object="$(git ls-remote --exit-code origin "refs/tags/$release_tag" | awk 'NR == 1 { print $1 }')"
remote_release_sha="$(git ls-remote --exit-code origin "refs/tags/$release_tag^{}" | awk 'NR == 1 { print $1 }')"
if [[ "$remote_tag_object" != "$local_tag_object" || "$remote_release_sha" != "$release_sha" ]]; then
  echo "$release_tag does not exactly match the signed tag published to origin." >&2
  exit 1
fi

git fetch --no-tags origin main:refs/remotes/origin/main
if ! git merge-base --is-ancestor "$release_sha" refs/remotes/origin/main; then
  echo "$release_tag is not an ancestor of origin/main." >&2
  exit 1
fi

git worktree add --detach "$release_checkout" "$release_sha"
cd "$release_checkout"

package_version="$(node -p "require('./packages/glyphkiln-core/package.json').version")"
if [[ "$release_tag" != "v$package_version" ]]; then
  echo "$release_tag does not match @glyphkiln/core@$package_version." >&2
  exit 1
fi

if find .changeset -maxdepth 1 -type f -name '*.md' ! -name README.md | grep -q .; then
  echo "Unmaterialized Changesets remain in $release_tag." >&2
  exit 1
fi

if [[ -f scripts/verify-release.sh ]]; then
  verification_script="scripts/verify-release.sh"
elif [[ -f .github/scripts/verify-release.sh ]]; then
  # Compatibility for signed v0.6.0, which predates the local release scripts.
  verification_script=".github/scripts/verify-release.sh"
else
  echo "$release_tag does not contain a release-verification script." >&2
  exit 1
fi

bash "$verification_script"

package_spec="@glyphkiln/core@$package_version"
if [[ "$dry_run" -eq 1 ]]; then
  npm publish --workspace @glyphkiln/core --access public --provenance=false --dry-run
  echo "Dry-run publication passed for $package_spec from $release_tag ($release_sha)."
  exit 0
fi

if [[ "${GLYPHKILN_APPROVE_NPM_PUBLISH:-}" != "1" ]]; then
  echo "Set GLYPHKILN_APPROVE_NPM_PUBLISH=1 to confirm the irreversible npm publish." >&2
  exit 1
fi

if ! npm whoami >/dev/null; then
  echo "Authenticate locally with npm login before publishing." >&2
  exit 1
fi

if npm view "$package_spec" version --json >/dev/null 2>&1; then
  echo "$package_spec already exists; refusing to republish." >&2
  exit 1
fi

npm publish --workspace @glyphkiln/core --access public --provenance=false

attempt=1
max_attempts=6
while ! npm view "$package_spec" version --json >/dev/null 2>&1; do
  if [[ "$attempt" -ge "$max_attempts" ]]; then
    echo "$package_spec was not visible after $max_attempts registry checks." >&2
    exit 1
  fi
  delay_seconds=$((attempt * 5))
  echo "$package_spec is not visible yet; retrying in $delay_seconds seconds."
  sleep "$delay_seconds"
  attempt=$((attempt + 1))
done

GLYPHKILN_PACKAGE_SPEC="$package_spec" npm run test:package-consumer
echo "Published and verified $package_spec from $release_tag ($release_sha)."
