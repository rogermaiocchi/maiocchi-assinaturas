#!/bin/sh
set -eu
umask 077

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

[ "$#" -eq 3 ] || fail 'Uso: provision-docuseal-sso-canary-secret.sh SECRET-UNO DIRETORIO-NOVO GID'
[ "$(id -u)" -eq 0 ] || fail 'O provisionamento deve ser executado como root.'
for command in install cmp mktemp mv chown chmod rm grep; do
  command -v "$command" >/dev/null 2>&1 || fail "$command não está disponível."
done

source_file=$1
target_dir=$2
target_gid=$3
case "$source_file:$target_dir" in /*:/*) ;; *) fail 'Fonte e destino devem ser absolutos.' ;; esac
printf '%s\n' "$target_gid" | grep -Eq '^[1-9][0-9]*$' || fail 'GID inválido.'
[ -f "$source_file" ] && [ ! -L "$source_file" ] && [ -s "$source_file" ] || fail 'Secret UNO inválido.'
[ ! -e "$target_dir" ] && [ ! -L "$target_dir" ] || fail 'O diretório de destino já existe.'

parent=$(dirname -- "$target_dir")
[ -d "$parent" ] && [ ! -L "$parent" ] || fail 'Diretório pai inválido.'

tmp_dir=$(mktemp -d "$parent/.docuseal-sso-secret.XXXXXX")
cleanup() {
  [ -n "${tmp_dir:-}" ] && [ -d "$tmp_dir" ] && rm -rf -- "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

chown 0:"$target_gid" "$tmp_dir"
chmod 0750 "$tmp_dir"
install -o 0 -g "$target_gid" -m 0440 "$source_file" "$tmp_dir/api_signature_sso_client_secret"
cmp -s "$source_file" "$tmp_dir/api_signature_sso_client_secret" || fail 'A cópia governada divergiu da fonte UNO.'
mv "$tmp_dir" "$target_dir"
tmp_dir=

printf '%s\n' 'Secret SSO candidato provisionado para o grupo isolado do DocuSeal.'
