#!/bin/sh
set -eu
umask 077

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
base_archive="$repo_dir/compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz"
sso_patch="$repo_dir/patches/docuseal/0009-maiocchi-uno-sso.patch"
build_inputs_patch="$repo_dir/patches/docuseal/0010-pin-build-inputs.patch"
expected_base_sha='e8f3b6e8ba3a8e70c7ea66846b57f6c0bddcd582be87bd4ae3ee074c2f9ff26c'
expected_patch_sha='30b925b53d7f778cd1320cea03e58f9b0d425de9bea6732dc3ee4816affc5c92'
expected_build_inputs_patch_sha='752e6ff168f093169dd120d509da4a10c79c04e2967799327edb0ef5e92481bc'
ruby_base='ruby:4.0.5-alpine'
ruby_base_digest='sha256:f48938e9ae72a4d32e728b03c306e7a7ff21f0cb6c2ed33f44a078c700b2aea6'
candidate_image="${DOCUSEAL_SSO_CANDIDATE_IMAGE:-}"
recipe_commit=$(git -C "$repo_dir" rev-parse HEAD)
recipe_short=$(printf '%s' "$recipe_commit" | cut -c1-12)

git -C "$repo_dir" diff --quiet HEAD -- || {
  printf '%s\n' 'Worktree rastreada diverge do commit da receita.' >&2
  exit 1
}
git -C "$repo_dir" diff --cached --quiet || {
  printf '%s\n' 'Índice Git diverge do commit da receita.' >&2
  exit 1
}
git -C "$repo_dir" verify-commit "$recipe_commit" >/dev/null 2>&1 || {
  printf '%s\n' 'Commit da receita não possui assinatura Git verificável.' >&2
  exit 1
}

actual_base_sha=$(shasum -a 256 "$base_archive" | awk '{print $1}')
actual_patch_sha=$(shasum -a 256 "$sso_patch" | awk '{print $1}')
actual_build_inputs_patch_sha=$(shasum -a 256 "$build_inputs_patch" | awk '{print $1}')
[ "$actual_base_sha" = "$expected_base_sha" ] || {
  printf '%s\n' 'Base DocuSeal 3.0.1-maiocchi.14 divergiu do hash aprovado.' >&2
  exit 1
}
[ "$actual_patch_sha" = "$expected_patch_sha" ] || {
  printf '%s\n' 'Patch SSO 0009 divergiu do hash aprovado.' >&2
  exit 1
}
[ "$actual_build_inputs_patch_sha" = "$expected_build_inputs_patch_sha" ] || {
  printf '%s\n' 'Patch de inputs de build 0010 divergiu do hash aprovado.' >&2
  exit 1
}

candidate_work=$(mktemp -d "${TMPDIR:-/tmp}/docuseal-sso-candidate.XXXXXX")
cleanup() {
  case "$candidate_work" in
    "${TMPDIR:-/tmp}"/docuseal-sso-candidate.*) rm -rf -- "$candidate_work" ;;
    *) printf '%s\n' 'Diretório temporário inesperado; limpeza recusada.' >&2 ;;
  esac
}
trap cleanup EXIT HUP INT TERM

tar -xzf "$base_archive" -C "$candidate_work"
git -C "$candidate_work" apply --check "$sso_patch"
git -C "$candidate_work" apply "$sso_patch"
git -C "$candidate_work" apply --check "$build_inputs_patch"
git -C "$candidate_work" apply "$build_inputs_patch"
[ "$(sed -n '1p' "$candidate_work/.version")" = '3.0.1-maiocchi.15' ]

[ "$(grep -c "^FROM ${ruby_base}@${ruby_base_digest} AS " "$candidate_work/Dockerfile")" -eq 3 ]
[ "$(grep -Ec 'releases/latest|refs/heads/(main|master)|/raw/master/' "$candidate_work/Dockerfile" || true)" -eq 0 ]
[ "$(grep -c "sha256sum -c -" "$candidate_work/Dockerfile")" -eq 1 ]

ruby_bin="${DOCUSEAL_SSO_RUBY_BIN:-$(command -v ruby 2>/dev/null || true)}"
[ -x "$ruby_bin" ] || {
  printf '%s\n' 'Ruby não está disponível para a auditoria de sintaxe do snapshot.' >&2
  exit 1
}
[ "$("$ruby_bin" -e 'print RUBY_VERSION')" = '4.0.5' ] || {
  printf '%s\n' 'Ruby 4.0.5 é obrigatório para auditar o snapshot DocuSeal.' >&2
  exit 1
}

for ruby_file in \
  "$candidate_work/app/controllers/maiocchi_sso_controller.rb" \
  "$candidate_work/app/models/maiocchi_sso_exchange.rb" \
  "$candidate_work/app/models/maiocchi_sso_identity.rb" \
  "$candidate_work/lib/maiocchi_sso.rb" \
  "$candidate_work/lib/maiocchi_sso/configuration.rb" \
  "$candidate_work/lib/maiocchi_sso/identity_resolver.rb" \
  "$candidate_work/lib/maiocchi_sso/token_exchange.rb" \
  "$candidate_work/config/initializers/maiocchi_session_store.rb" \
  "$candidate_work/db/migrate/20260718090000_create_maiocchi_sso_identities.rb" \
  "$candidate_work/db/migrate/20260718090100_install_maiocchi_sso_guards.rb"
do
  "$ruby_bin" -c "$ruby_file" >/dev/null
done

if [ "${DOCUSEAL_SSO_VERIFY_ONLY:-false}" = 'true' ]; then
  printf '%s\n' "Patch SSO verificável sobre a base aprovada: $actual_base_sha + $actual_patch_sha"
  exit 0
fi

[ -n "$candidate_image" ] || {
  printf '%s\n' 'DOCUSEAL_SSO_CANDIDATE_IMAGE é obrigatório para impedir tag reutilizável.' >&2
  exit 1
}
printf '%s\n' "$candidate_image" | grep -Eq "^maiocchi/docuseal:3[.]0[.]1-maiocchi[.]15-sso-${recipe_short}-a[0-9][0-9]$" || {
  printf '%s\n' 'Tag candidata DocuSeal não está vinculada ao commit e à tentativa.' >&2
  exit 1
}

evidence_dir="${DOCUSEAL_SSO_EVIDENCE_DIR:-}"
[ -n "$evidence_dir" ] && [ "${evidence_dir#/}" != "$evidence_dir" ] || {
  printf '%s\n' 'DOCUSEAL_SSO_EVIDENCE_DIR absoluto é obrigatório.' >&2
  exit 1
}

for required_tool in docker syft grype; do
  command -v "$required_tool" >/dev/null 2>&1 || {
    printf '%s\n' "$required_tool não está disponível; evidência candidata não foi produzida." >&2
    exit 1
  }
done

evidence_parent=$(dirname -- "$evidence_dir")
[ -d "$evidence_parent" ] && [ ! -L "$evidence_parent" ] || {
  printf '%s\n' 'Diretório-pai de evidência deve existir e não pode ser link simbólico.' >&2
  exit 1
}

tag_lock_root=$(git -C "$repo_dir" rev-parse --git-path maiocchi-release-tag-locks)
case "$tag_lock_root" in
  /*) ;;
  *) tag_lock_root="$repo_dir/$tag_lock_root" ;;
esac
mkdir -p "$tag_lock_root"
[ -d "$tag_lock_root" ] && [ ! -L "$tag_lock_root" ] || {
  printf '%s\n' 'Diretório de locks Git inválido.' >&2
  exit 1
}
tag_lock_key=$(printf '%s' "$candidate_image" | shasum -a 256 | awk '{print $1}')
if ! mkdir "$tag_lock_root/$tag_lock_key"; then
  printf '%s\n' 'Tag candidata já foi reservada por outra tentativa.' >&2
  exit 1
fi

if ! mkdir "$evidence_dir"; then
  printf '%s\n' 'Diretório de evidência já existe; sobrescrita recusada.' >&2
  exit 1
fi
if docker image inspect "$candidate_image" >/dev/null 2>&1; then
  printf '%s\n' 'Tag candidata já existe; sobrescrita recusada.' >&2
  exit 1
fi

docker build \
  --pull \
  --platform linux/amd64 \
  --provenance=false \
  --build-arg "SOURCE_REVISION=$recipe_commit" \
  --label "br.adv.maiocchi.base-source-sha256=$actual_base_sha" \
  --label "br.adv.maiocchi.patch-sha256=$actual_patch_sha" \
  --label "br.adv.maiocchi.build-inputs-patch-sha256=$actual_build_inputs_patch_sha" \
  --label "br.adv.maiocchi.ruby-base-digest=$ruby_base_digest" \
  --label "br.adv.maiocchi.recipe-commit=$recipe_commit" \
  --tag "$candidate_image" \
  "$candidate_work"

candidate_image_id=$(docker image inspect --format '{{.Id}}' "$candidate_image")
printf '%s\n' "$candidate_image_id" | grep -Eq '^sha256:[0-9a-f]{64}$'
[ "$(docker image inspect --format '{{.Id}}' "$candidate_image")" = "$candidate_image_id" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$candidate_image_id")" = '3.0.1-maiocchi.15' ]
[ "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$candidate_image_id")" = "$recipe_commit" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.base-source-sha256" }}' "$candidate_image_id")" = "$actual_base_sha" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.patch-sha256" }}' "$candidate_image_id")" = "$actual_patch_sha" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.build-inputs-patch-sha256" }}' "$candidate_image_id")" = "$actual_build_inputs_patch_sha" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.ruby-base-digest" }}' "$candidate_image_id")" = "$ruby_base_digest" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.recipe-commit" }}' "$candidate_image_id")" = "$recipe_commit" ]

printf '%s\n' "$candidate_image_id" >"$evidence_dir/docuseal-3.0.1-maiocchi.15.image-id.txt"
docker image inspect "$candidate_image_id" >"$evidence_dir/docuseal-3.0.1-maiocchi.15.image-inspect.json"
docker image save --output "$evidence_dir/docuseal-3.0.1-maiocchi.15.docker-image.tar" "$candidate_image_id"
syft "$candidate_image_id" --from docker -o cyclonedx-json >"$evidence_dir/docuseal-3.0.1-maiocchi.15.cdx.json"
grype "$candidate_image_id" --from docker -o json >"$evidence_dir/docuseal-3.0.1-maiocchi.15.grype.json"
grype "$candidate_image_id" --from docker --fail-on high >/dev/null
[ "$(docker image inspect --format '{{.Id}}' "$candidate_image")" = "$candidate_image_id" ]

(
  cd "$evidence_dir"
  shasum -a 256 \
    docuseal-3.0.1-maiocchi.15.image-id.txt \
    docuseal-3.0.1-maiocchi.15.image-inspect.json \
    docuseal-3.0.1-maiocchi.15.docker-image.tar \
    docuseal-3.0.1-maiocchi.15.cdx.json \
    docuseal-3.0.1-maiocchi.15.grype.json \
    >SHA256SUMS
)

printf '%s\n' "Imagem e evidência candidatas produzidas em: $evidence_dir"
