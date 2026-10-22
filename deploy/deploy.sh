#!/usr/bin/env bash
# Deploys one version of শিকড় (Shikor) on this server and rolls back if it is unhealthy.
#
#   GitHub Actions (over SSH):  echo "$TOKEN" | /opt/shikor/deploy.sh <git-sha>
#   Manual rollback:            /opt/shikor/deploy.sh <older-git-sha>
#   Image already on server:    SKIP_PULL=1 /opt/shikor/deploy.sh <tag>
#
# A GHCR token may arrive on stdin; it is only needed while the image is private.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/shikor}"
REPO_RAW="${REPO_RAW:-https://raw.githubusercontent.com/redwanhasan980/Family-Tree}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"

TAG="${1:-}"
if [[ ! "$TAG" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]]; then
  echo "usage: deploy.sh <image-tag>   (for example a git commit SHA)" >&2
  exit 2
fi

log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

set_env() {
  if grep -qE "^$1=" .env; then
    sed -i "s|^$1=.*|$1=$2|" .env
  else
    printf '%s=%s\n' "$1" "$2" >>.env
  fi
}

web_health() {
  local id
  id="$(docker compose ps -q web)"
  [[ -n "$id" ]] || { echo missing; return; }
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id"
}

wait_healthy() {
  local waited=0 status
  while ((waited < HEALTH_TIMEOUT)); do
    status="$(web_health)"
    [[ "$status" == healthy ]] && return 0
    [[ "$status" == unhealthy || "$status" == exited || "$status" == dead ]] && return 1
    sleep 2
    waited=$((waited + 2))
  done
  return 1
}

cd "$APP_DIR"
[[ -f .env ]] || { echo "$APP_DIR/.env is missing; run setup-server.sh first" >&2; exit 1; }

# 1. Use the compose file and Caddyfile from the same commit as the image.
if [[ "${SKIP_CONFIG_SYNC:-0}" != 1 ]]; then
  for file in compose.yml Caddyfile; do
    if curl -fsSL "$REPO_RAW/$TAG/deploy/$file" -o "$file.new"; then
      mv "$file.new" "$file"
    else
      rm -f "$file.new"
      log "could not fetch $file for $TAG; keeping the current one"
    fi
  done
fi

# 2. Log in to the registry only if a token was piped in, and always log out afterwards.
token=""
if [[ ! -t 0 ]]; then IFS= read -r token || true; fi
if [[ -n "$token" ]]; then
  printf '%s' "$token" | docker login ghcr.io -u "${GHCR_USER:-deploy}" --password-stdin >/dev/null
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
fi

# 3. Pull and start the new version. IMAGE_TAG in .env keeps it across restarts and reboots.
previous="$(grep -E '^IMAGE_TAG=' .env | cut -d= -f2- || true)"
set_env IMAGE_TAG "$TAG"
if [[ "${SKIP_PULL:-0}" == 1 ]]; then
  log "using the local image for $TAG (SKIP_PULL=1)"
else
  log "pulling $TAG"
  docker compose pull web
fi
docker compose up -d --remove-orphans
log "waiting for the app to become healthy"

if wait_healthy; then
  log "deployed $TAG (previous: ${previous:-none})"
  docker image prune -af --filter "until=168h" >/dev/null 2>&1 || true
  exit 0
fi

# 4. Roll back to the previous version.
log "$TAG is not healthy; recent logs:"
docker compose logs --tail 80 web || true
if [[ -n "$previous" && "$previous" != "$TAG" ]]; then
  log "rolling back to $previous"
  set_env IMAGE_TAG "$previous"
  docker compose up -d web
  if wait_healthy; then log "rolled back to $previous"; else log "rollback is not healthy either"; fi
fi
exit 1
