#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "uso: $0 <BACKUP_ID> [--apply] [--with-db]" >&2
  exit 64
}

[[ $# -ge 1 ]] || usage

BACKUP_ID="$1"
shift
APPLY=false
WITH_DB=false

for argument in "$@"; do
  case "$argument" in
    --apply) APPLY=true ;;
    --with-db) WITH_DB=true ;;
    *) usage ;;
  esac
done

[[ "$BACKUP_ID" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || usage

REMOTE_HOST="${REMOTE_HOST:-hostinger-vps}"

ssh "$REMOTE_HOST" bash -se -- "$BACKUP_ID" "$APPLY" "$WITH_DB" <<'REMOTE'
set -euo pipefail

backup_id="$1"
apply="$2"
with_db="$3"
backup="$HOME/backups/assinatura/$backup_id"

required=(assinatura-portal.tgz docuseal-config.tgz docuseal-db.dump traefik-assinatura.tgz SHA256SUMS)
for artifact in "${required[@]}"; do
  [[ -f "$backup/$artifact" ]] || { echo "backup incompleto: $artifact ausente" >&2; exit 66; }
done

(
  cd "$backup"
  sha256sum -c SHA256SUMS
)

if [[ "$apply" != true ]]; then
  echo "backup validado; acrescente --apply para restaurar"
  exit 0
fi

umask 077
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
pre="$HOME/backups/assinatura/pre-rollback-$timestamp"
mkdir -p "$pre"
chmod 700 "$pre"

sudo tar -C /opt -czf "$pre/assinatura-portal.tgz" assinatura-portal
sudo tar --exclude=docuseal/pgdata -C /opt -czf "$pre/docuseal-config.tgz" docuseal
docker exec docuseal-db pg_dump -U docuseal -d docuseal -Fc > "$pre/docuseal-db.dump"
sudo tar -C /opt/traefik -czf "$pre/traefik-assinatura.tgz" \
  docker-compose.yml dynamic/assinatura-portal.yml dynamic/icp-trust
sudo chown -R "$(id -u):$(id -g)" "$pre"
chmod 600 "$pre"/*

sudo tar -C /opt -xzf "$backup/assinatura-portal.tgz"
sudo tar -C /opt -xzf "$backup/docuseal-config.tgz"
sudo tar -C /opt/traefik -xzf "$backup/traefik-assinatura.tgz"

if [[ "$with_db" == true ]]; then
  docker exec -i docuseal-db pg_restore -U docuseal -d docuseal --clean --if-exists < "$backup/docuseal-db.dump"
fi

cd /opt/docuseal
sudo docker compose up -d
cd /opt/assinatura-portal
sudo docker compose up -d --build

echo "rollback aplicado; cópia prévia: pre-rollback-$timestamp"
REMOTE
