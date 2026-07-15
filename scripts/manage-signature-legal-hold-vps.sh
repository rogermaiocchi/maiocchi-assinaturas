#!/usr/bin/env bash
set -euo pipefail

umask 077

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/assinatura-cifrada}"
EXPORT_ROOT="${EXPORT_ROOT:-/var/lib/maiocchi-signature-backup-export}"
EXPORT_OWNER="${EXPORT_OWNER:-hostinger}"
EXPORT_GROUP="${EXPORT_GROUP:-hostinger}"
action="${1:-status}"

[[ "$action" =~ ^(enable|disable|status)$ ]]

case "$action" in
  enable)
    install -d -m 0700 "$BACKUP_ROOT"
    install -d -m 0700 -o "$EXPORT_OWNER" -g "$EXPORT_GROUP" "$EXPORT_ROOT"
    printf 'ENABLED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BACKUP_ROOT/.legal-hold"
    install -m 0600 -o "$EXPORT_OWNER" -g "$EXPORT_GROUP" "$BACKUP_ROOT/.legal-hold" "$EXPORT_ROOT/.legal-hold"
    printf '{"event":"signature_legal_hold","status":"enabled"}\n'
    ;;
  disable)
    rm -f "$BACKUP_ROOT/.legal-hold" "$EXPORT_ROOT/.legal-hold"
    printf '{"event":"signature_legal_hold","status":"disabled"}\n'
    ;;
  status)
    if [[ -e "$BACKUP_ROOT/.legal-hold" ]]; then
      printf '{"event":"signature_legal_hold","status":"enabled"}\n'
    else
      printf '{"event":"signature_legal_hold","status":"disabled"}\n'
    fi
    ;;
esac
