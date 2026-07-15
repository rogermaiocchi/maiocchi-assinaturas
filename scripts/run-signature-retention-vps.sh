#!/usr/bin/env bash
set -euo pipefail

umask 077

LOCK_FILE="${LOCK_FILE:-$HOME/.cache/maiocchi-signature-retention.lock}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/assinatura-cifrada}"
LAST_SUCCESS_FILE="${LAST_SUCCESS_FILE:-$BACKUP_ROOT/.last-success}"
OFFSITE_SUCCESS_FILE="${OFFSITE_SUCCESS_FILE:-$BACKUP_ROOT/.offsite-success}"
LEGAL_HOLD_FILE="${LEGAL_HOLD_FILE:-$BACKUP_ROOT/.legal-hold}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-30}"
PKI_PROJECT_ROOT="${PKI_PROJECT_ROOT:-/opt/pki-bridge}"
PKI_COMPOSE_FILE="${PKI_COMPOSE_FILE:-$PKI_PROJECT_ROOT/deploy/pki-bridge.yml}"
PKI_ENV_FILE="${PKI_ENV_FILE:-$PKI_PROJECT_ROOT/.env}"
PKI_RETENTION_DAYS="${PKI_RETENTION_DAYS:-30}"
PKI_RETENTION_LIMIT="${PKI_RETENTION_LIMIT:-100}"
PKI_RETENTION_QUEUE_GRACE_HOURS="${PKI_RETENTION_QUEUE_GRACE_HOURS:-24}"
PKI_RETENTION_DRY_RUN="${PKI_RETENTION_DRY_RUN:-false}"

for command_name in docker flock sha256sum stat; do
  command -v "$command_name" >/dev/null
done
for integer in "$BACKUP_MAX_AGE_HOURS" "$PKI_RETENTION_DAYS" "$PKI_RETENTION_LIMIT" "$PKI_RETENTION_QUEUE_GRACE_HOURS"; do
  [[ "$integer" =~ ^[0-9]+$ ]]
done

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || { printf 'retention already running\n' >&2; exit 75; }

if [[ -e "$LEGAL_HOLD_FILE" ]]; then
  printf '{"event":"signature_retention","status":"held","reason":"legal_hold"}\n'
  exit 0
fi

if [[ "$PKI_RETENTION_DRY_RUN" == "true" ]]; then
  docker exec -w /app docuseal bin/rails runner \
    'puts({ event: "certificate_auth_retention", dry_run: true, candidates: CertificateAuthChallenge.where(expires_at: ...CertificateAuthChallenge::RETENTION_GRACE_PERIOD.ago).count }.to_json)'
else
  docker exec -w /app docuseal bin/rails maiocchi:prune_certificate_auth_challenges
fi

marker_value() {
  local marker="$1" name="$2"
  awk -F= -v expected="$name" '$1 == expected { print substr($0, index($0, "=") + 1); exit }' "$marker"
}

if [[ "$PKI_RETENTION_DRY_RUN" == "true" ]]; then
  docker exec \
    -e "RETENTION_DAYS=$PKI_RETENTION_DAYS" \
    -e "RETENTION_LIMIT=$PKI_RETENTION_LIMIT" \
    -e "RETENTION_QUEUE_GRACE_HOURS=$PKI_RETENTION_QUEUE_GRACE_HOURS" \
    -e RETENTION_DRY_RUN=true \
    -e RETENTION_ARTIFACT_DELETE_ALLOWED=false \
    pki-bridge node src/retention-cli.mjs
  exit 0
fi

[[ -s "$LAST_SUCCESS_FILE" && -s "$OFFSITE_SUCCESS_FILE" ]] || {
  printf '{"event":"pki_retention","status":"deferred","reason":"backup_markers_missing"}\n' >&2
  exit 78
}
backup_id="$(marker_value "$LAST_SUCCESS_FILE" BACKUP_ID)"
offsite_id="$(marker_value "$OFFSITE_SUCCESS_FILE" BACKUP_ID)"
[[ "$backup_id" =~ ^[0-9]{8}T[0-9]{6}Z$ && "$offsite_id" == "$backup_id" ]] || {
  printf '{"event":"pki_retention","status":"deferred","reason":"offsite_backup_not_current"}\n' >&2
  exit 78
}
last_success_epoch="$(stat -c %Y "$LAST_SUCCESS_FILE")"
(( $(date +%s) - last_success_epoch <= BACKUP_MAX_AGE_HOURS * 3600 )) || {
  printf '{"event":"pki_retention","status":"deferred","reason":"backup_stale"}\n' >&2
  exit 78
}
backup_path="$BACKUP_ROOT/$backup_id"
[[ -d "$backup_path" ]] || { printf 'current backup directory is missing\n' >&2; exit 78; }
(cd "$backup_path" && sha256sum --check SHA256SUMS >/dev/null)

queue_cutoff="${backup_id:0:4}-${backup_id:4:2}-${backup_id:6:2}T${backup_id:9:2}:${backup_id:11:2}:${backup_id:13:2}Z"
[[ -r "$PKI_COMPOSE_FILE" && -r "$PKI_ENV_FILE" ]]

bridge_stopped=false
restart_bridge() {
  if [[ "$bridge_stopped" == "true" ]]; then
    docker start pki-bridge >/dev/null
    bridge_stopped=false
  fi
}
trap restart_bridge EXIT

docker stop --time 45 pki-bridge >/dev/null
bridge_stopped=true
docker compose --project-directory "$PKI_PROJECT_ROOT" -f "$PKI_COMPOSE_FILE" --env-file "$PKI_ENV_FILE" \
  run --rm --no-deps \
  -e "RETENTION_DAYS=$PKI_RETENTION_DAYS" \
  -e "RETENTION_LIMIT=$PKI_RETENTION_LIMIT" \
  -e "RETENTION_QUEUE_GRACE_HOURS=$PKI_RETENTION_QUEUE_GRACE_HOURS" \
  -e "RETENTION_QUEUE_CUTOFF=$queue_cutoff" \
  -e RETENTION_DRY_RUN=false \
  -e RETENTION_ARTIFACT_DELETE_ALLOWED=true \
  pki-bridge node src/retention-cli.mjs
restart_bridge
trap - EXIT

for _ in $(seq 1 30); do
  [[ "$(docker inspect --format '{{.State.Running}}' pki-bridge)" == "true" ]] && exit 0
  sleep 2
done
printf 'pki-bridge did not restart after retention\n' >&2
exit 1
