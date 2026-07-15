#!/usr/bin/env bash
set -euo pipefail

umask 077

REMOTE_HOST="${REMOTE_HOST:-hostinger-vps}"
REMOTE_EXPORT_ROOT="${REMOTE_EXPORT_ROOT:-/var/lib/maiocchi-signature-backup-export}"
LOCAL_BACKUP_ROOT="${LOCAL_BACKUP_ROOT:-$HOME/.local/share/maiocchi-signature/backups}"
AGE_IDENTITY_FILE="${AGE_IDENTITY_FILE:-$HOME/.config/age/maiocchi-signature-backup.key}"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-35}"
LOCK_FILE="${LOCK_FILE:-$HOME/.cache/maiocchi-signature-backup-offsite.lock}"

for command_name in age flock rsync shasum ssh; do
  command -v "$command_name" >/dev/null
done
[[ -s "$AGE_IDENTITY_FILE" ]]
[[ "$LOCAL_RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( LOCAL_RETENTION_DAYS >= 1 ))
[[ "$REMOTE_HOST" =~ ^[A-Za-z0-9._-]+$ ]]
[[ "$REMOTE_EXPORT_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]]

mkdir -p "$(dirname "$LOCK_FILE")" "$LOCAL_BACKUP_ROOT"
chmod 700 "$LOCAL_BACKUP_ROOT"
exec 9>"$LOCK_FILE"
flock -n 9 || { printf 'off-site backup pull already running\n' >&2; exit 75; }

remote_marker="$(ssh -o BatchMode=yes "$REMOTE_HOST" "cat '$REMOTE_EXPORT_ROOT/.last-success'")"
legal_hold="$(ssh -o BatchMode=yes "$REMOTE_HOST" "if test -e '$REMOTE_EXPORT_ROOT/.legal-hold'; then printf true; else printf false; fi")"
backup_id="$(printf '%s\n' "$remote_marker" | awk -F= '$1 == "BACKUP_ID" { print $2; exit }')"
[[ "$backup_id" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]

destination="$LOCAL_BACKUP_ROOT/$backup_id"
staging="$LOCAL_BACKUP_ROOT/.$backup_id.staging"
rm -rf "$staging"
mkdir "$staging"
trap 'rm -rf "$staging"' EXIT

rsync -a --delete --chmod=Du=rwx,Dgo=,Fu=rw,Fgo= \
  "$REMOTE_HOST:$REMOTE_EXPORT_ROOT/$backup_id/" "$staging/"

[[ "$(find "$staging" -maxdepth 1 -type f -name '*.age' | wc -l | tr -d ' ')" == "7" ]]
(cd "$staging" && shasum -a 256 -c SHA256SUMS >/dev/null)
for encrypted in "$staging"/*.age; do
  [[ "$(head -n 1 "$encrypted")" == "age-encryption.org/v1" ]]
done
manifest="$(age --decrypt -i "$AGE_IDENTITY_FILE" "$staging/manifest.txt.age")"
grep -qx 'format=maiocchi-signature-backup-v2' <<<"$manifest"
grep -qx "created_at=$backup_id" <<<"$manifest"
grep -qx 'consistency=application-writers-quiesced' <<<"$manifest"

if [[ -e "$destination" ]]; then
  rm -rf "$staging"
else
  mv "$staging" "$destination"
fi
trap - EXIT

completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  printf 'BACKUP_ID=%s\n' "$backup_id"
  printf 'COPIED_AT=%s\n' "$completed_at"
  printf 'RESTORE_PROBE=manifest-decrypted-in-memory\n'
} | ssh -o BatchMode=yes "$REMOTE_HOST" \
  "umask 077; tmp='$REMOTE_EXPORT_ROOT/.offsite-success.tmp'; cat > \"\$tmp\"; chmod 600 \"\$tmp\"; mv \"\$tmp\" '$REMOTE_EXPORT_ROOT/.offsite-success'"

local_marker_tmp="$LOCAL_BACKUP_ROOT/.last-success.tmp"
{
  printf 'BACKUP_ID=%s\n' "$backup_id"
  printf 'COPIED_AT=%s\n' "$completed_at"
} > "$local_marker_tmp"
mv "$local_marker_tmp" "$LOCAL_BACKUP_ROOT/.last-success"

if [[ "$legal_hold" != "true" ]]; then
  find "$LOCAL_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d \
    ! -name '.*.staging' -mtime "+$LOCAL_RETENTION_DAYS" -exec rm -rf -- {} +
fi

printf 'BACKUP_ID=%s\n' "$backup_id"
printf 'OFFSITE_PATH=%s\n' "$destination"
