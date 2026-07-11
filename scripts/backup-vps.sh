#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-hostinger-vps}"

ssh "$REMOTE_HOST" 'bash -se' <<'REMOTE'
set -euo pipefail
umask 077

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$HOME/backups/assinatura/$timestamp"

mkdir -p "$destination"
chmod 700 "$HOME/backups" "$HOME/backups/assinatura" "$destination"

sudo tar -C /opt -czf "$destination/assinatura-portal.tgz" assinatura-portal
sudo tar --exclude=docuseal/pgdata -C /opt -czf "$destination/docuseal-config.tgz" docuseal
docker exec docuseal-db pg_dump -U docuseal -d docuseal -Fc > "$destination/docuseal-db.dump"
sudo tar -C /opt/traefik -czf "$destination/traefik-assinatura.tgz" \
  docker-compose.yml dynamic/assinatura-portal.yml dynamic/icp-trust

sudo chown -R "$(id -u):$(id -g)" "$destination"
chmod 600 "$destination"/*
(
  cd "$destination"
  sha256sum assinatura-portal.tgz docuseal-config.tgz docuseal-db.dump traefik-assinatura.tgz > SHA256SUMS
)
chmod 600 "$destination/SHA256SUMS"

printf 'BACKUP_ID=%s\n' "$timestamp"
REMOTE
