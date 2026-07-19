#!/bin/sh
set -eu

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
validator="$repo_dir/scripts/validate-sso-candidate-images.sh"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

read_image_id() {
  evidence_dir=$1
  evidence_name=$2
  evidence_label=$3

  [ -n "$evidence_dir" ] || fail "$evidence_label: diretório de evidência obrigatório."
  [ "${evidence_dir#/}" != "$evidence_dir" ] || fail "$evidence_label: diretório de evidência deve ser absoluto."
  [ -d "$evidence_dir" ] && [ ! -L "$evidence_dir" ] || fail "$evidence_label: diretório de evidência ausente ou simbólico."
  evidence_file="$evidence_dir/$evidence_name"
  [ -f "$evidence_file" ] && [ ! -L "$evidence_file" ] || fail "$evidence_label: arquivo de image ID ausente ou simbólico."
  evidence_size=$(wc -c <"$evidence_file" | awk '{print $1}')
  [ "$evidence_size" -eq 72 ] || fail "$evidence_label: arquivo de image ID deve conter exatamente um ID e newline."
  image_id=$(sed -n '1p' "$evidence_file")
  printf '%s\n' "$image_id" | grep -Eq '^sha256:[0-9a-f]{64}$' || fail "$evidence_label: image ID inválido."
  printf '%s\n' "$image_id"
}

[ "$#" -gt 0 ] || fail 'Informe um subcomando do Docker Compose (por exemplo: config).'
[ -x "$validator" ] || fail 'Preflight obrigatório ausente ou não executável.'

compose_subcommand=$1
case "$compose_subcommand" in
  config)
    [ "$#" -eq 3 ] || fail 'Config só é permitido com --quiet e --no-interpolate.'
    case "$2:$3" in
      --quiet:--no-interpolate | --no-interpolate:--quiet | -q:--no-interpolate | --no-interpolate:-q) ;;
      *) fail 'Config só é permitido com --quiet e --no-interpolate.' ;;
    esac
    ;;
  up | create | start | stop | restart | pause | unpause | wait | ps | logs | top | events | images | down | rm | kill) ;;
  *) fail 'Subcomando Compose não permitido pelo contrato do canário.' ;;
esac

for compose_arg in "$@"; do
  case "$compose_arg" in
    -f | -f?* | --file | --file=* | \
      -p | -p?* | --project-name | --project-name=* | \
      --project-directory | --project-directory=* | \
      --env-file | --env-file=* | --environment | --environment=* | \
      --privileged | --privileged=* | --remove-orphans | \
      --rmi | --rmi=*)
      fail 'Opção global de Compose não permitida; os arquivos e o projeto candidatos são fixos.'
      ;;
  esac
done

command -v docker >/dev/null 2>&1 || fail 'docker não está disponível.'

portal_evidence_dir=${PORTAL_SSO_EVIDENCE_DIR:-}
docuseal_evidence_dir=${DOCUSEAL_SSO_EVIDENCE_DIR:-}
PORTAL_SSO_CANDIDATE_IMAGE_ID=$(read_image_id "$portal_evidence_dir" 'portal-1.15.1.image-id.txt' 'Portal')
DOCUSEAL_SSO_CANDIDATE_IMAGE_ID=$(read_image_id "$docuseal_evidence_dir" 'docuseal-3.0.1-maiocchi.15.image-id.txt' 'DocuSeal')
export PORTAL_SSO_CANDIDATE_IMAGE_ID DOCUSEAL_SSO_CANDIDATE_IMAGE_ID

"$validator"
exec docker compose \
  --project-name maiocchi-sso-candidate \
  --project-directory "$repo_dir" \
  --env-file /dev/null \
  --file "$repo_dir/deploy/portal-sso.candidate.yml" \
  --file "$repo_dir/deploy/docuseal-sso.candidate.yml" \
  "$@"
