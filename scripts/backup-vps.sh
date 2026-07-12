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

artifacts=(assinatura-portal.tgz docuseal-config.tgz docuseal-db.dump traefik-assinatura.tgz)
if [[ -d /opt/pki-bridge ]] && docker inspect pki-db >/dev/null 2>&1; then
  sudo tar --exclude=pki-bridge/pgdata -C /opt -czf "$destination/pki-bridge-config.tgz" pki-bridge
  docker exec pki-db pg_dump -U pki -d pki -Fc > "$destination/pki-db.dump"
  artifacts+=(pki-bridge-config.tgz pki-db.dump)
fi

sudo chown -R "$(id -u):$(id -g)" "$destination"
chmod 600 "$destination"/*
(
  cd "$destination"
  sha256sum "${artifacts[@]}" > SHA256SUMS
)
chmod 600 "$destination/SHA256SUMS"

printf 'BACKUP_ID=%s\n' "$timestamp"
REMOTE
