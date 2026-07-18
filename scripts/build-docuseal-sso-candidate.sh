#!/bin/sh
set -eu
umask 077

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
base_archive="$repo_dir/compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz"
sso_patch="$repo_dir/patches/docuseal/0009-maiocchi-uno-sso.patch"
expected_base_sha='e8f3b6e8ba3a8e70c7ea66846b57f6c0bddcd582be87bd4ae3ee074c2f9ff26c'
expected_patch_sha='293e9b6ee123f6312a8fd101eda5e5a45383086121f471b0b71748c5df9ebfa3'
ruby_base='ruby:4.0.5-alpine'
ruby_base_digest='sha256:f48938e9ae72a4d32e728b03c306e7a7ff21f0cb6c2ed33f44a078c700b2aea6'
candidate_image="${DOCUSEAL_SSO_CANDIDATE_IMAGE:-maiocchi/docuseal:3.0.1-maiocchi.15}"

actual_base_sha=$(shasum -a 256 "$base_archive" | awk '{print $1}')
actual_patch_sha=$(shasum -a 256 "$sso_patch" | awk '{print $1}')
[ "$actual_base_sha" = "$expected_base_sha" ] || {
  printf '%s\n' 'Base DocuSeal 3.0.1-maiocchi.14 divergiu do hash aprovado.' >&2
  exit 1
}
[ "$actual_patch_sha" = "$expected_patch_sha" ] || {
  printf '%s\n' 'Patch SSO 0009 divergiu do hash aprovado.' >&2
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
[ "$(sed -n '1p' "$candidate_work/.version")" = '3.0.1-maiocchi.15' ]

from_count=$(grep -c "^FROM ${ruby_base} AS " "$candidate_work/Dockerfile")
[ "$from_count" -eq 3 ] || {
  printf '%s\n' 'Dockerfile DocuSeal não contém exatamente as três bases Ruby esperadas.' >&2
  exit 1
}
sed -i.bak "s|^FROM ${ruby_base} AS |FROM ${ruby_base}@${ruby_base_digest} AS |" "$candidate_work/Dockerfile"
rm -f -- "$candidate_work/Dockerfile.bak"
[ "$(grep -c "^FROM ${ruby_base}@${ruby_base_digest} AS " "$candidate_work/Dockerfile")" -eq 3 ]

ruby_bin="${DOCUSEAL_SSO_RUBY_BIN:-$(command -v ruby 2>/dev/null || true)}"
[ -x "$ruby_bin" ] || {
  printf '%s\n' 'Ruby não está disponível para a auditoria de sintaxe do snapshot.' >&2
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
  "$candidate_work/db/migrate/20260718090000_create_maiocchi_sso_identities.rb"
do
  "$ruby_bin" -c "$ruby_file" >/dev/null
done

if [ "${DOCUSEAL_SSO_VERIFY_ONLY:-false}" = 'true' ]; then
  printf '%s\n' "Patch SSO verificável sobre a base aprovada: $actual_base_sha + $actual_patch_sha"
  exit 0
fi

for required_tool in docker syft grype; do
  command -v "$required_tool" >/dev/null 2>&1 || {
    printf '%s\n' "$required_tool não está disponível; evidência candidata não foi produzida." >&2
    exit 1
  }
done

evidence_dir="${DOCUSEAL_SSO_EVIDENCE_DIR:-$repo_dir/artifacts/docuseal-sso-3.0.1-maiocchi.15-candidate}"
[ ! -e "$evidence_dir" ] || {
  printf '%s\n' 'Diretório de evidência já existe; sobrescrita recusada.' >&2
  exit 1
}
mkdir -p "$evidence_dir"

docker build \
  --pull \
  --build-arg "SOURCE_REVISION=$actual_patch_sha" \
  --label "br.adv.maiocchi.base-source-sha256=$actual_base_sha" \
  --label "br.adv.maiocchi.patch-sha256=$actual_patch_sha" \
  --label "br.adv.maiocchi.ruby-base-digest=$ruby_base_digest" \
  --tag "$candidate_image" \
  "$candidate_work"

[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.base-source-sha256" }}' "$candidate_image")" = "$actual_base_sha" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.patch-sha256" }}' "$candidate_image")" = "$actual_patch_sha" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.ruby-base-digest" }}' "$candidate_image")" = "$ruby_base_digest" ]

docker image inspect "$candidate_image" >"$evidence_dir/docuseal-3.0.1-maiocchi.15.image-inspect.json"
syft "$candidate_image" -o cyclonedx-json >"$evidence_dir/docuseal-3.0.1-maiocchi.15.cdx.json"
grype "$candidate_image" -o json >"$evidence_dir/docuseal-3.0.1-maiocchi.15.grype.json"
grype "$candidate_image" --fail-on high >/dev/null

(
  cd "$evidence_dir"
  shasum -a 256 \
    docuseal-3.0.1-maiocchi.15.image-inspect.json \
    docuseal-3.0.1-maiocchi.15.cdx.json \
    docuseal-3.0.1-maiocchi.15.grype.json \
    >SHA256SUMS
)

printf '%s\n' "Imagem e evidência candidatas produzidas em: $evidence_dir"
