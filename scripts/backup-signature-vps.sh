#!/usr/bin/env bash
set -euo pipefail

umask 077

BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/assinatura-cifrada}"
AGE_RECIPIENT_FILE="${AGE_RECIPIENT_FILE:-$HOME/.secrets/backup-age.pub}"
RETENTION_DAYS="${RETENTION_DAYS:-35}"
LEGAL_HOLD_FILE="${LEGAL_HOLD_FILE:-$BACKUP_ROOT/.legal-hold}"
LAST_SUCCESS_FILE="${LAST_SUCCESS_FILE:-$BACKUP_ROOT/.last-success}"
EXPORT_ROOT="${EXPORT_ROOT:-}"
EXPORT_OWNER="${EXPORT_OWNER:-hostinger}"
EXPORT_GROUP="${EXPORT_GROUP:-hostinger}"
EXPORT_RETENTION_DAYS="${EXPORT_RETENTION_DAYS:-7}"
PORTAL_ROOT="${PORTAL_ROOT:?PORTAL_ROOT is required}"
DOCUSEAL_ROOT="${DOCUSEAL_ROOT:?DOCUSEAL_ROOT is required}"
PKI_ROOT="${PKI_ROOT:?PKI_ROOT is required}"
TRAEFIK_ROOT="${TRAEFIK_ROOT:?TRAEFIK_ROOT is required}"
DOCUSEAL_DB_CONTAINER="${DOCUSEAL_DB_CONTAINER:-docuseal-db}"
DOCUSEAL_DB_USER="${DOCUSEAL_DB_USER:-docuseal}"
DOCUSEAL_DB_NAME="${DOCUSEAL_DB_NAME:-docuseal}"
PKI_DB_CONTAINER="${PKI_DB_CONTAINER:-pki-db}"
PKI_DB_USER="${PKI_DB_USER:-pki}"
PKI_DB_NAME="${PKI_DB_NAME:-pki}"
QUIESCE_CONTAINERS="${QUIESCE_CONTAINERS:-docuseal pades-provider pki-bridge}"

for command_name in age docker flock sha256sum tar; do
  command -v "$command_name" >/dev/null
done

[[ -s "$AGE_RECIPIENT_FILE" ]]
[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( RETENTION_DAYS >= 1 ))
[[ "$EXPORT_RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( EXPORT_RETENTION_DAYS >= 1 ))
[[ "$EXPORT_OWNER" =~ ^[a-z_][a-z0-9_-]*$ && "$EXPORT_GROUP" =~ ^[a-z_][a-z0-9_-]*$ ]]

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
exec 9>"$BACKUP_ROOT/.lock"
flock -n 9 || { printf 'backup already running\n' >&2; exit 75; }

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
staging="$BACKUP_ROOT/.${stamp}.staging"
destination="$BACKUP_ROOT/$stamp"
mkdir "$staging"

quiesced=false
running_containers=()

restart_containers() {
  local container state ready
  ((${#running_containers[@]} == 0)) && return 0
  docker start "${running_containers[@]}" >/dev/null || return 1
  for container in "${running_containers[@]}"; do
    ready=false
    for _ in $(seq 1 60); do
      state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")"
      if [[ "$state" == "healthy" || "$state" == "running" ]]; then
        ready=true
        break
      fi
      [[ "$state" == "unhealthy" || "$state" == "exited" || "$state" == "dead" ]] && break
      sleep 2
    done
    [[ "$ready" == "true" ]] || return 1
  done
}

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  rm -rf "$staging"
  [[ -z "$EXPORT_ROOT" ]] || rm -rf "$EXPORT_ROOT/.${stamp}.staging"
  if [[ "$quiesced" == "true" ]]; then
    restart_containers || status=1
  fi
  exit "$status"
}
trap cleanup EXIT

encrypt_tree() {
  local output_name="$1"
  local source_root="$2"
  local source_parent source_name
  source_parent="$(dirname "$source_root")"
  source_name="$(basename "$source_root")"
  tar --exclude="$source_name/pgdata" --exclude="$source_name/tmp" \
    --exclude="$source_name/log/*.log" -C "$source_parent" -czf - "$source_name" \
    | age -R "$AGE_RECIPIENT_FILE" -o "$staging/$output_name.tar.gz.age"
}

for container in $QUIESCE_CONTAINERS; do
  [[ "$(docker inspect --format '{{.State.Running}}' "$container")" == "true" ]] && running_containers+=("$container")
done
if ((${#running_containers[@]} > 0)); then
  docker stop --time 45 "${running_containers[@]}" >/dev/null
  quiesced=true
fi

docker exec "$DOCUSEAL_DB_CONTAINER" pg_dump -U "$DOCUSEAL_DB_USER" -d "$DOCUSEAL_DB_NAME" -Fc \
  | age -R "$AGE_RECIPIENT_FILE" -o "$staging/docuseal-db.dump.age"
docker exec "$PKI_DB_CONTAINER" pg_dump -U "$PKI_DB_USER" -d "$PKI_DB_NAME" -Fc \
  | age -R "$AGE_RECIPIENT_FILE" -o "$staging/pki-db.dump.age"

encrypt_tree portal "$PORTAL_ROOT"
encrypt_tree docuseal "$DOCUSEAL_ROOT"
encrypt_tree pki-bridge "$PKI_ROOT"

tar -C "$TRAEFIK_ROOT" -czf - docker-compose.yml dynamic \
  | age -R "$AGE_RECIPIENT_FILE" -o "$staging/traefik-signature.tar.gz.age"

{
  printf 'format=maiocchi-signature-backup-v2\n'
  printf 'created_at=%s\n' "$stamp"
  printf 'host=%s\n' "$(hostname)"
  printf 'consistency=application-writers-quiesced\n'
  printf 'quiesced_containers=%s\n' "${running_containers[*]}"
  for container in assinatura-portal docuseal pki-bridge pades-provider; do
    docker inspect --format 'image.{{.Name}}={{.Config.Image}}@{{.Image}}' "$container"
  done
} | age -R "$AGE_RECIPIENT_FILE" -o "$staging/manifest.txt.age"

for encrypted in "$staging"/*.age; do
  [[ "$(head -n 1 "$encrypted")" == "age-encryption.org/v1" ]]
done

(
  cd "$staging"
  sha256sum ./*.age > SHA256SUMS
  sha256sum --check SHA256SUMS >/dev/null
)
chmod 600 "$staging"/*
mv "$staging" "$destination"

restart_containers
quiesced=false

if [[ -n "$EXPORT_ROOT" ]]; then
  install -d -m 0700 -o "$EXPORT_OWNER" -g "$EXPORT_GROUP" "$EXPORT_ROOT"
  export_staging="$EXPORT_ROOT/.${stamp}.staging"
  install -d -m 0700 -o "$EXPORT_OWNER" -g "$EXPORT_GROUP" "$export_staging"
  cp "$destination"/*.age "$destination/SHA256SUMS" "$export_staging/"
  chown "$EXPORT_OWNER:$EXPORT_GROUP" "$export_staging"/*
  chmod 0600 "$export_staging"/*
  mv "$export_staging" "$EXPORT_ROOT/$stamp"
  export_marker_tmp="$EXPORT_ROOT/.last-success.$stamp.tmp"
  {
    printf 'BACKUP_ID=%s\n' "$stamp"
    printf 'COMPLETED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$export_marker_tmp"
  chown "$EXPORT_OWNER:$EXPORT_GROUP" "$export_marker_tmp"
  chmod 0600 "$export_marker_tmp"
  mv "$export_marker_tmp" "$EXPORT_ROOT/.last-success"
  if [[ -e "$LEGAL_HOLD_FILE" ]]; then
    install -m 0600 -o "$EXPORT_OWNER" -g "$EXPORT_GROUP" /dev/null "$EXPORT_ROOT/.legal-hold"
  else
    rm -f "$EXPORT_ROOT/.legal-hold"
    find "$EXPORT_ROOT" -mindepth 1 -maxdepth 1 -type d \
      ! -name '.*.staging' -mtime "+$EXPORT_RETENTION_DAYS" -exec rm -rf -- {} +
  fi
fi

marker_tmp="$BACKUP_ROOT/.last-success.$stamp.tmp"
{
  printf 'BACKUP_ID=%s\n' "$stamp"
  printf 'COMPLETED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$marker_tmp"
chmod 600 "$marker_tmp"
mv "$marker_tmp" "$LAST_SUCCESS_FILE"

if [[ ! -e "$LEGAL_HOLD_FILE" ]]; then
  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d \
    ! -name '.*.staging' -mtime "+$RETENTION_DAYS" -exec rm -rf -- {} +
fi

trap - EXIT
printf 'BACKUP_ID=%s\n' "$stamp"
printf 'BACKUP_PATH=%s\n' "$destination"
