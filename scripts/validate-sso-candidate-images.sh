#!/bin/sh
set -eu

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)

portal_version='1.15.1'
portal_base_commit='7e864d548b39ff3bbdcc6693f0bc05b3a72ed44d'
portal_patch="$repo_dir/patches/portal/0001-maiocchi-sso-portal-1.15.1.patch"

docuseal_version='3.0.1-maiocchi.15'
docuseal_base_archive="$repo_dir/compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz"
docuseal_base_sha256='e8f3b6e8ba3a8e70c7ea66846b57f6c0bddcd582be87bd4ae3ee074c2f9ff26c'
docuseal_patch="$repo_dir/patches/docuseal/0009-maiocchi-uno-sso.patch"
docuseal_build_inputs_patch="$repo_dir/patches/docuseal/0010-pin-build-inputs.patch"
docuseal_build_inputs_sha256='752e6ff168f093169dd120d509da4a10c79c04e2967799327edb0ef5e92481bc'
docuseal_ruby_base_digest='sha256:f48938e9ae72a4d32e728b03c306e7a7ff21f0cb6c2ed33f44a078c700b2aea6'

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
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

validate_evidence_set() {
  evidence_dir=$1
  evidence_label=$2
  shift 2

  [ -n "$evidence_dir" ] || fail "$evidence_label: diretório de evidência obrigatório."
  [ "${evidence_dir#/}" != "$evidence_dir" ] || fail "$evidence_label: diretório de evidência deve ser absoluto."
  [ -d "$evidence_dir" ] && [ ! -L "$evidence_dir" ] || fail "$evidence_label: diretório de evidência ausente ou simbólico."

  evidence_manifest="$evidence_dir/SHA256SUMS"
  [ -f "$evidence_manifest" ] && [ ! -L "$evidence_manifest" ] || fail "$evidence_label: manifesto SHA256SUMS ausente ou simbólico."

  expected_directory_names=$(printf '%s\n' SHA256SUMS "$@" | LC_ALL=C sort)
  actual_directory_names=$(
    find "$evidence_dir" ! -path "$evidence_dir" -prune -exec basename {} \; | LC_ALL=C sort
  )
  [ "$actual_directory_names" = "$expected_directory_names" ] || fail "$evidence_label: diretório contém arquivos fora do conjunto fechado de evidências."

  manifest_line_count=$(wc -l <"$evidence_manifest" | awk '{print $1}')
  [ "$manifest_line_count" -eq "$#" ] || fail "$evidence_label: manifesto não contém o conjunto fechado de evidências."

  manifest_names=$(LC_ALL=C awk '
    NF != 2 || length($1) != 64 || $1 !~ /^[0-9a-f]+$/ { invalid = 1; next }
    { print $2 }
    END { if (invalid) exit 1 }
  ' "$evidence_manifest") || fail "$evidence_label: formato do manifesto SHA256SUMS é inválido."
  actual_names=$(printf '%s\n' "$manifest_names" | LC_ALL=C sort)
  expected_names=$(printf '%s\n' "$@" | LC_ALL=C sort)
  [ "$actual_names" = "$expected_names" ] || fail "$evidence_label: manifesto referencia arquivos inesperados ou omite evidências."

  for evidence_name in "$@"; do
    evidence_file="$evidence_dir/$evidence_name"
    [ -f "$evidence_file" ] && [ ! -L "$evidence_file" ] || fail "$evidence_label: artefato de evidência ausente ou simbólico."
  done

  (
    CDPATH='' cd -- "$evidence_dir"
    shasum -a 256 -c SHA256SUMS >/dev/null
  ) || fail "$evidence_label: verificação do manifesto SHA256SUMS falhou."
}

expect_inspect() {
  image_id=$1
  inspect_format=$2
  expected=$3
  description=$4

  actual=$(docker image inspect --format "$inspect_format" "$image_id") || fail "$description: imagem local indisponível."
  [ "$actual" = "$expected" ] || fail "$description: metadado divergente."
}

for required_tool in git docker shasum awk sed grep wc sort find basename; do
  command -v "$required_tool" >/dev/null 2>&1 || fail "$required_tool não está disponível."
done

recipe_commit=$(git -C "$repo_dir" rev-parse --verify 'HEAD^{commit}') || fail 'Não foi possível resolver o commit da receita.'
printf '%s\n' "$recipe_commit" | grep -Eq '^[0-9a-f]{40}$' || fail 'HEAD da receita não é um SHA Git de 40 caracteres.'

git -C "$repo_dir" diff --quiet HEAD -- || fail 'Worktree rastreada diverge do commit da receita.'
git -C "$repo_dir" diff --cached --quiet || fail 'Índice Git diverge do commit da receita.'
git -C "$repo_dir" verify-commit "$recipe_commit" >/dev/null 2>&1 || fail 'Commit da receita não possui assinatura Git verificável.'
git -C "$repo_dir" cat-file -e "$portal_base_commit^{commit}" || fail 'Commit-base do portal não está disponível no repositório.'

[ -f "$portal_patch" ] && [ ! -L "$portal_patch" ] || fail 'Patch do portal ausente ou simbólico.'
[ -f "$docuseal_patch" ] && [ ! -L "$docuseal_patch" ] || fail 'Patch DocuSeal SSO ausente ou simbólico.'
[ -f "$docuseal_base_archive" ] && [ ! -L "$docuseal_base_archive" ] || fail 'Base DocuSeal ausente ou simbólica.'
[ -f "$docuseal_build_inputs_patch" ] && [ ! -L "$docuseal_build_inputs_patch" ] || fail 'Patch de inputs DocuSeal ausente ou simbólico.'

portal_patch_sha256=$(sha256_file "$portal_patch")
docuseal_patch_sha256=$(sha256_file "$docuseal_patch")
[ "$(sha256_file "$docuseal_base_archive")" = "$docuseal_base_sha256" ] || fail 'Base DocuSeal diverge do SHA-256 aprovado.'
[ "$(sha256_file "$docuseal_build_inputs_patch")" = "$docuseal_build_inputs_sha256" ] || fail 'Patch de inputs DocuSeal diverge do SHA-256 aprovado.'

portal_evidence_dir=${PORTAL_SSO_EVIDENCE_DIR:-}
docuseal_evidence_dir=${DOCUSEAL_SSO_EVIDENCE_DIR:-}
portal_image_id_before=$(read_image_id "$portal_evidence_dir" "portal-$portal_version.image-id.txt" 'Portal')
docuseal_image_id_before=$(read_image_id "$docuseal_evidence_dir" "docuseal-$docuseal_version.image-id.txt" 'DocuSeal')
validate_evidence_set "$portal_evidence_dir" 'Portal' \
  "portal-$portal_version.image-id.txt" \
  "portal-$portal_version.image-inspect.json" \
  "portal-$portal_version.docker-image.tar" \
  "portal-$portal_version.cdx.json" \
  "portal-$portal_version.grype.json"
validate_evidence_set "$docuseal_evidence_dir" 'DocuSeal' \
  "docuseal-$docuseal_version.image-id.txt" \
  "docuseal-$docuseal_version.image-inspect.json" \
  "docuseal-$docuseal_version.docker-image.tar" \
  "docuseal-$docuseal_version.cdx.json" \
  "docuseal-$docuseal_version.grype.json"
portal_image_id=$(read_image_id "$portal_evidence_dir" "portal-$portal_version.image-id.txt" 'Portal')
docuseal_image_id=$(read_image_id "$docuseal_evidence_dir" "docuseal-$docuseal_version.image-id.txt" 'DocuSeal')
[ "$portal_image_id" = "$portal_image_id_before" ] || fail 'Portal: image ID mudou durante a verificação da evidência.'
[ "$docuseal_image_id" = "$docuseal_image_id_before" ] || fail 'DocuSeal: image ID mudou durante a verificação da evidência.'

if [ -n "${PORTAL_SSO_CANDIDATE_IMAGE_ID:-}" ]; then
  [ "$PORTAL_SSO_CANDIDATE_IMAGE_ID" = "$portal_image_id" ] || fail 'Portal: ID exportado diverge da evidência.'
fi
if [ -n "${DOCUSEAL_SSO_CANDIDATE_IMAGE_ID:-}" ]; then
  [ "$DOCUSEAL_SSO_CANDIDATE_IMAGE_ID" = "$docuseal_image_id" ] || fail 'DocuSeal: ID exportado diverge da evidência.'
fi

expect_inspect "$portal_image_id" '{{.Id}}' "$portal_image_id" 'Portal image ID'
expect_inspect "$portal_image_id" '{{.Os}}' 'linux' 'Portal sistema operacional'
expect_inspect "$portal_image_id" '{{.Architecture}}' 'amd64' 'Portal arquitetura'
expect_inspect "$portal_image_id" '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$portal_version" 'Portal versão'
expect_inspect "$portal_image_id" '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$recipe_commit" 'Portal revisão'
expect_inspect "$portal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.base-commit" }}' "$portal_base_commit" 'Portal commit-base'
expect_inspect "$portal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.patch-sha256" }}' "$portal_patch_sha256" 'Portal patch'
expect_inspect "$portal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.recipe-commit" }}' "$recipe_commit" 'Portal receita'

expect_inspect "$docuseal_image_id" '{{.Id}}' "$docuseal_image_id" 'DocuSeal image ID'
expect_inspect "$docuseal_image_id" '{{.Os}}' 'linux' 'DocuSeal sistema operacional'
expect_inspect "$docuseal_image_id" '{{.Architecture}}' 'amd64' 'DocuSeal arquitetura'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$docuseal_version" 'DocuSeal versão'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$recipe_commit" 'DocuSeal revisão'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.base-source-sha256" }}' "$docuseal_base_sha256" 'DocuSeal base'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.patch-sha256" }}' "$docuseal_patch_sha256" 'DocuSeal patch SSO'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.build-inputs-patch-sha256" }}' "$docuseal_build_inputs_sha256" 'DocuSeal inputs de build'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.ruby-base-digest" }}' "$docuseal_ruby_base_digest" 'DocuSeal digest Ruby'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.recipe-commit" }}' "$recipe_commit" 'DocuSeal receita'

printf '%s\n' 'Preflight das imagens candidatas SSO aprovado.'
