#!/bin/sh
set -eu

ENV_FILE=${1:-/opt/docuseal/.env}
DEST_DIR=${2:-/opt/signature-secrets}
SECRET_GID=${3:-3400}
SECONDARY_ENV_FILE=${4:-}
DEST_FILE=$DEST_DIR/internal-hmac.key

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' 'Execute como root para preservar proprietário e permissões do secret.' >&2
  exit 1
fi

if [ ! -r "$ENV_FILE" ]; then
  printf 'Arquivo de configuração não encontrado: %s\n' "$ENV_FILE" >&2
  exit 1
fi

if [ -n "$SECONDARY_ENV_FILE" ] && [ ! -r "$SECONDARY_ENV_FILE" ]; then
  printf 'Arquivo de configuração não encontrado: %s\n' "$SECONDARY_ENV_FILE" >&2
  exit 1
fi

case "$SECRET_GID" in
  ''|*[!0-9]*)
    printf '%s\n' 'O GID do grupo de secrets deve ser numérico.' >&2
    exit 1
    ;;
esac

extract_key() {
  value=$(sed -n 's/^[[:space:]]*AUTHENTICITY_INTERNAL_HMAC_KEY=//p' "$1" | tail -n 1 | tr -d '\r')
  case "$value" in
    \"*\") value=${value#\"}; value=${value%\"} ;;
    \'*\') value=${value#\'}; value=${value%\'} ;;
  esac
  printf '%s' "$value"
}

key=$(extract_key "$ENV_FILE")
secondary_key=
if [ -n "$SECONDARY_ENV_FILE" ]; then
  secondary_key=$(extract_key "$SECONDARY_ENV_FILE")
  if [ -n "$key" ] && [ -n "$secondary_key" ] && [ "$key" != "$secondary_key" ]; then
    printf '%s\n' 'As cópias do HMAC interno nos arquivos de ambiente divergem.' >&2
    exit 1
  fi
  [ -n "$key" ] || key=$secondary_key
fi

if [ "${#key}" -lt 32 ]; then
  if [ -r "$DEST_FILE" ] && [ "$(wc -c < "$DEST_FILE" | tr -d ' ')" -ge 32 ]; then
    chown root:"$SECRET_GID" "$DEST_FILE"
    chmod 0440 "$DEST_FILE"
    printf 'Secret interno já está migrado em %s.\n' "$DEST_FILE"
    exit 0
  fi
  printf '%s\n' 'O HMAC interno está ausente ou tem menos de 32 caracteres.' >&2
  exit 1
fi

install -d -m 0750 -o root -g "$SECRET_GID" "$DEST_DIR"
temporary=$(mktemp "$DEST_DIR/.internal-hmac.XXXXXX")
trap 'rm -f "$temporary"' EXIT HUP INT TERM

umask 077
printf '%s' "$key" > "$temporary"
chown root:"$SECRET_GID" "$temporary"
chmod 0440 "$temporary"
mv -f "$temporary" "$DEST_FILE"
trap - EXIT HUP INT TERM
unset key

scrub_env() {
  source_file=$1
  clean_file=$(mktemp "${source_file}.clean.XXXXXX")
  owner=$(stat -c '%u' "$source_file")
  group=$(stat -c '%g' "$source_file")
  mode=$(stat -c '%a' "$source_file")
  awk '!/^[[:space:]]*AUTHENTICITY_INTERNAL_HMAC_KEY=/' "$source_file" > "$clean_file"
  chown "$owner:$group" "$clean_file"
  chmod "$mode" "$clean_file"
  mv -f "$clean_file" "$source_file"
}

scrub_env "$ENV_FILE"
if [ -n "$SECONDARY_ENV_FILE" ] && [ "$SECONDARY_ENV_FILE" != "$ENV_FILE" ]; then
  scrub_env "$SECONDARY_ENV_FILE"
fi
unset secondary_key value

printf 'Secret interno migrado para %s e removido dos arquivos de ambiente. Modo 0440, GID %s.\n' "$DEST_FILE" "$SECRET_GID"
