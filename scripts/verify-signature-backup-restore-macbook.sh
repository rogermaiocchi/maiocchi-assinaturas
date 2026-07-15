#!/usr/bin/env bash
set -euo pipefail

umask 077

LOCAL_BACKUP_ROOT="${LOCAL_BACKUP_ROOT:-$HOME/.local/share/maiocchi-signature/backups}"
AGE_IDENTITY_FILE="${AGE_IDENTITY_FILE:-$HOME/.config/age/maiocchi-signature-backup.key}"
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

age --decrypt -i "$AGE_IDENTITY_FILE" "$backup_path/pki-bridge.tar.gz.age" \
  | tar -tzf - > "$tmpdir/pki-tree"

referenced_count=0
while IFS= read -r storage_key; do
  [[ -n "$storage_key" ]]
  referenced_count=$((referenced_count + 1))
  grep -Fxq "pki-bridge/artifacts/$storage_key" "$tmpdir/pki-tree"
done < "$tmpdir/referenced-storage-keys"

printf '{"event":"signature_restore_drill","backupId":"%s","docusealTables":%s,"pkiMigrations":%s,"referencedArtifacts":%s,"status":"valid"}\n' \
  "$backup_id" "$docuseal_tables" "$pki_migrations" "$referenced_count"
