#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <deploy-root> <frontend-archive> <release>" >&2
  exit 2
fi

deploy_root="$1"
frontend_archive="$2"
release="$3"
environment_file="$deploy_root/.env.production"
compose_file="$deploy_root/docker-compose.production.yml"
frontend_root="$deploy_root/frontend"
release_root="$deploy_root/frontend-releases"
new_release="$release_root/$release"

if [[ ! "$deploy_root" =~ ^/[a-zA-Z0-9._/-]+$ ]]; then
  echo "Invalid deploy root: $deploy_root" >&2
  exit 2
fi
if [[ ! "$release" =~ ^[a-z0-9._-]+$ ]]; then
  echo "Invalid frontend release: $release" >&2
  exit 2
fi
if [[ ! -f "$frontend_archive" ]]; then
  echo "Frontend archive does not exist: $frontend_archive" >&2
  exit 2
fi
if [[ ! -f "$environment_file" || ! -f "$compose_file" ]]; then
  echo "Production environment or Compose file is missing." >&2
  exit 2
fi

command -v docker >/dev/null
command -v flock >/dev/null
command -v curl >/dev/null

install -d -m 0755 "$release_root"
exec 9>"$deploy_root/.frontend-deploy.lock"
if ! flock -n 9; then
  echo "Another frontend deployment is already running." >&2
  exit 3
fi

if [[ -e "$new_release" ]]; then
  echo "Frontend release already exists: $new_release" >&2
  exit 4
fi

while IFS= read -r entry; do
  case "$entry" in
    /*|../*|*/../*|*/..)
      echo "Unsafe archive entry: $entry" >&2
      exit 4
      ;;
  esac
done < <(tar -tzf "$frontend_archive")

install -d -m 0755 "$new_release"
tar -xzf "$frontend_archive" -C "$new_release"
if [[ ! -f "$new_release/index.html" ]]; then
  echo "Frontend release does not contain index.html." >&2
  exit 4
fi
find "$new_release" -type d -exec chmod 0755 {} +
find "$new_release" -type f -exec chmod 0644 {} +

previous_frontend=''
if [[ -d "$frontend_root" ]]; then
  previous_frontend="$release_root/previous-$(date -u +%Y%m%d%H%M%S)-$release"
  mv -- "$frontend_root" "$previous_frontend"
fi
mv -- "$new_release" "$frontend_root"

deployed_image="$(cat "$deploy_root/.deployed-image")"
export JOKESTER_IMAGE="$deployed_image"
compose=(
  docker compose
  --project-directory "$deploy_root"
  --env-file "$environment_file"
  --file "$compose_file"
)

rollback() {
  failed_frontend="$release_root/failed-$(date -u +%Y%m%d%H%M%S)-$release"
  if [[ -d "$frontend_root" ]]; then
    mv -- "$frontend_root" "$failed_frontend"
  fi
  if [[ -n "$previous_frontend" && -d "$previous_frontend" ]]; then
    mv -- "$previous_frontend" "$frontend_root"
    "${compose[@]}" up --detach --no-deps --force-recreate caddy || true
  fi
}

if ! "${compose[@]}" up --detach --no-deps --force-recreate caddy; then
  rollback
  exit 1
fi

domain="$(sed -n 's/^APP_DOMAIN=//p' "$environment_file" | tail -n 1)"
if [[ -z "$domain" ]]; then
  echo "APP_DOMAIN is missing." >&2
  rollback
  exit 1
fi

healthy=false
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error \
      --resolve "$domain:443:127.0.0.1" \
      "https://$domain/" | grep -q '<div id="app"></div>'; then
    healthy=true
    break
  fi
  sleep 2
done
if [[ "$healthy" != true ]]; then
  echo "Frontend health check failed." >&2
  docker logs --tail 100 jokester-caddy >&2 || true
  rollback
  exit 1
fi

printf '%s\n' "$release" >"$deploy_root/.deployed-frontend"
rm -f -- "$frontend_archive"
echo "Frontend deployment succeeded: $release"
