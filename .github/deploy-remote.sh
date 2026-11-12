#!/usr/bin/env bash
# Runs ON the Lightsail box, piped in over SSH by .github/workflows/release.yml.
# $RELEASE is set by the caller.
#
# Kept as a file rather than a heredoc inside the workflow so it can be read, reviewed and
# run by hand during an incident — the deploy path should not only exist inside CI.
set -euo pipefail

: "${RELEASE:?RELEASE not set}"
cd ~/axios

# Backup BEFORE anything moves. A release can carry migrations, and the moment to discover
# there is no recent dump is not after one has already run.
echo "--- backup"
./deploy/backup.sh

PREV=$(grep '^APP_RELEASE=' deploy/.env | cut -d= -f2)
echo "--- rolling ${PREV} -> ${RELEASE}"
sed -i "s/^APP_RELEASE=.*/APP_RELEASE=${RELEASE}/" deploy/.env

COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)

# Pull everything first. If one image is missing, fail before any container is replaced, so a
# partial release cannot leave half the stack rolled forward and half back.
if ! "${COMPOSE[@]}" pull; then
  echo "pull failed - restoring APP_RELEASE=${PREV}" >&2
  sed -i "s/^APP_RELEASE=.*/APP_RELEASE=${PREV}/" deploy/.env
  exit 1
fi

# The migrator container runs pending migrations before the API serves. That ordering is what
# makes image-and-migration ship together: deploying the image without migrating would, for
# example, leave every availability row on a week the app no longer asks for - present in the
# table, invisible everywhere.
"${COMPOSE[@]}" up -d

# Every release pulls six images and nothing removed the old ones: by cci-52 they had filled
# 72 GB of the 77 GB disk. Keep this release and the two before it, so a rollback is still a
# local switch, and remove the rest. A failed cleanup must not fail a deploy that succeeded.
echo "--- pruning old release images"
KEEP=$(docker images --filter 'reference=ghcr.io/cci-global-team/plane-*' --format '{{.Tag}}' | grep -E -- '-cci-[0-9]+$' |
  sort -uV | tail -3)
docker images --filter 'reference=ghcr.io/cci-global-team/plane-*' --format '{{.Repository}}:{{.Tag}}' |
  grep -E -- '-cci-[0-9]+$' | { grep -vE -f <(printf '%s\n' "$KEEP" "$RELEASE" | sed 's/.*/:&$/') || true; } |
  xargs -r docker rmi || echo "image prune failed; continuing" >&2
docker image prune -f >/dev/null || true
df -h / | tail -1

echo "--- containers"
"${COMPOSE[@]}" ps --format '{{.Service}} {{.Image}}'
