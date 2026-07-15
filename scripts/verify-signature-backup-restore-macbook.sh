#!/usr/bin/env bash
set -euo pipefail

umask 077

LOCAL_BACKUP_ROOT="${LOCAL_BACKUP_ROOT:-$HOME/.local/share/maiocchi-signature/backups}"
AGE_IDENTITY_FILE="${AGE_IDENTITY_FILE:-$HOME/.config/age/maiocchi-signature-backup.key}"
PORTAL_ARCHIVE_ROOT="${PORTAL_ARCHIVE_ROOT:-assinatura-portal}"
DOCUSEAL_ARCHIVE_ROOT="${DOCUSEAL_ARCHIVE_ROOT:-docuseal}"
PKI_ARCHIVE_ROOT="${PKI_ARCHIVE_ROOT:-pki-bridge}"
backup_id="${1:-}"

for command_name in age docker shasum tar; do
  command -v "$command_name" >/dev/null
done
[[ -s "$AGE_IDENTITY_FILE" ]]
if [[ -z "$backup_id" ]]; then
  backup_id="$(awk -F= '$1 == "BACKUP_ID" { print $2; exit }' "$LOCAL_BACKUP_ROOT/.last-success")"
fi
[[ "$backup_id" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]
backup_path="$LOCAL_BACKUP_ROOT/$backup_id"
[[ -d "$backup_path" ]]
(cd "$backup_path" && shasum -a 256 -c SHA256SUMS >/dev/null)

tmpdir="$(mktemp -d)"
normalized_id="$(printf '%s' "$backup_id" | tr '[:upper:]' '[:lower:]')"
db_container="maiocchi-restore-$normalized_id-$$"
cleanup() {
  docker rm -f "$db_container" >/dev/null 2>&1 || true
  rm -rf "$tmpdir"
}
trap cleanup EXIT

restore_archive() {
  local encrypted="$1" destination="$2" expected_path="$3"
  mkdir -p "$destination"
  age --decrypt -i "$AGE_IDENTITY_FILE" "$encrypted" | tar -xzf - -C "$destination"
  [[ -e "$destination/$expected_path" ]]
}

archive_file_count() {
  local archive_root="$1" count
  count="$(find "$archive_root" -type f | wc -l | tr -d ' ')"
  [[ "$count" =~ ^[1-9][0-9]*$ ]]
  printf '%s' "$count"
}

restore_archive "$backup_path/portal.tar.gz.age" "$tmpdir/portal" "$PORTAL_ARCHIVE_ROOT"
restore_archive "$backup_path/docuseal.tar.gz.age" "$tmpdir/docuseal" "$DOCUSEAL_ARCHIVE_ROOT"
restore_archive "$backup_path/pki-bridge.tar.gz.age" "$tmpdir/pki" "$PKI_ARCHIVE_ROOT"
restore_archive "$backup_path/traefik-signature.tar.gz.age" "$tmpdir/traefik" "docker-compose.yml"
[[ -d "$tmpdir/traefik/dynamic" ]]

portal_files="$(archive_file_count "$tmpdir/portal")"
docuseal_files="$(archive_file_count "$tmpdir/docuseal")"
pki_files="$(archive_file_count "$tmpdir/pki")"
traefik_files="$(archive_file_count "$tmpdir/traefik")"

docker run -d --name "$db_container" \
  -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for _ in $(seq 1 40); do
  docker exec "$db_container" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$db_container" pg_isready -U postgres >/dev/null
docker exec "$db_container" createdb -U postgres docuseal_restore
docker exec "$db_container" createdb -U postgres pki_restore

age --decrypt -i "$AGE_IDENTITY_FILE" "$backup_path/docuseal-db.dump.age" \
  | docker exec -i "$db_container" pg_restore --no-owner --no-privileges -U postgres -d docuseal_restore
age --decrypt -i "$AGE_IDENTITY_FILE" "$backup_path/pki-db.dump.age" \
  | docker exec -i "$db_container" pg_restore --no-owner --no-privileges -U postgres -d pki_restore

docuseal_tables="$(docker exec "$db_container" psql -U postgres -d docuseal_restore -Atc \
  "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
pki_migrations="$(docker exec "$db_container" psql -U postgres -d pki_restore -Atc \
  "SELECT count(*) FROM pki_schema_migrations")"
[[ "$docuseal_tables" =~ ^[1-9][0-9]*$ && "$pki_migrations" =~ ^[1-9][0-9]*$ ]]

docker exec "$db_container" psql -U postgres -d pki_restore -Atc \
  "COPY (
     SELECT DISTINCT storage_key FROM (
       SELECT source_pdf_storage_key AS storage_key FROM pades_private_tickets
       UNION ALL SELECT presentation_pdf_storage_key FROM pades_private_tickets
       UNION ALL SELECT evidence_page_storage_key FROM pades_private_tickets
       UNION ALL SELECT signed_pdf_storage_key FROM pades_private_tickets
       UNION ALL SELECT frozen_pdf_storage_key FROM pki_workflows
       UNION ALL SELECT storage_key FROM pki_artifacts
       UNION ALL SELECT original_storage_key FROM authenticity_records
       UNION ALL SELECT validation_report_storage_key FROM authenticity_records
       UNION ALL SELECT validator_attestation_storage_key FROM authenticity_records
       UNION ALL SELECT representation_storage_key FROM authenticity_records
       UNION ALL SELECT envelope_storage_key FROM authenticity_records
     ) referenced WHERE storage_key IS NOT NULL ORDER BY storage_key
   ) TO STDOUT" > "$tmpdir/referenced-storage-keys"

referenced_count=0
while IFS= read -r storage_key; do
  [[ -n "$storage_key" ]]
  [[ "$storage_key" != /* && "$storage_key" != *"../"* && "$storage_key" != *"/.."* ]]
  referenced_count=$((referenced_count + 1))
  [[ -e "$tmpdir/pki/$PKI_ARCHIVE_ROOT/artifacts/$storage_key" ]]
done < "$tmpdir/referenced-storage-keys"

printf '{"event":"signature_restore_drill","backupId":"%s","docusealTables":%s,"pkiMigrations":%s,"referencedArtifacts":%s,"portalFiles":%s,"docusealFiles":%s,"pkiFiles":%s,"traefikFiles":%s,"status":"valid"}\n' \
  "$backup_id" "$docuseal_tables" "$pki_migrations" "$referenced_count" \
  "$portal_files" "$docuseal_files" "$pki_files" "$traefik_files"
