#!/bin/sh
set -eu
umask 077

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
base_archive="$repo_dir/compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz"
sso_patch="$repo_dir/patches/docuseal/0009-maiocchi-uno-sso.patch"
build_inputs_patch="$repo_dir/patches/docuseal/0010-pin-build-inputs.patch"
native_security_patch="$repo_dir/patches/docuseal/0011-update-native-image-libraries.patch"
certificate_join_patch="$repo_dir/patches/docuseal/0012-uno-certificate-return-to-join.patch"
tiff_source="$repo_dir/compliance/sources/tiff-4.7.2.tar.gz"
vex_template="$repo_dir/compliance/vex/docuseal-sso-tiff-4.7.2.openvex.template.json"
syft_config="$repo_dir/compliance/config/syft-candidate.yaml"
grype_config="$repo_dir/compliance/config/grype-candidate.yaml"
expected_base_sha='e8f3b6e8ba3a8e70c7ea66846b57f6c0bddcd582be87bd4ae3ee074c2f9ff26c'
expected_patch_sha='2339df1880f6fc2af3706c51d29fc158a7c592a50c0deba5771b5a6eca51d54c'
expected_build_inputs_patch_sha='0e36b9a594e3da75f64c3c37909be5fa9f57e3eefeeed2d21d993590496a5987'
expected_native_security_patch_sha='83250e4672db3a4256d7ec44f04f621ef7c1ee178718d9831948f9261580c30c'
expected_certificate_join_patch_sha='54ef28c039597f4aec5521616d51a085d8c55b22199a04a989be858de98d2355'
expected_tiff_source_sha='672bd7d10aee4606171afb864f3570b83340f6a33e2c186dc0512f7145ffdf6a'
expected_tiff_source_sha512='bad66954a7e7e158c6dcbfc0e2d0032b8f3e2a354b6d0fdbb8038a7963e36c5b8a433dd4ee81c6c4dabfb50094152d440aa1f32b5299098c9ae29e55de2e41fc'
expected_tiff_apkbuild_sha='f7b0bdc5ae7c8340960afaeed18a1e1e09089a8ec99c2ac0335df70c4f046985'
expected_vex_template_sha='5b6f912098890a5c5126fa4e9eb410432f3749ec34f7b148b1b82b67108139e3'
expected_syft_config_sha='8d154f9e73d36bc74ae76d45b76020ec3ad591e81325f0a626ec2d9f67d0b893'
expected_grype_config_sha='50b1ced07b248a9044339b243c85957608de3ed8869f296ec8ed58ef21b11d8d'
expected_syft_version='1.46.0'
expected_syft_git_commit='b15c5dbfe2bb21c9d73002c1056a829c8c411c75'
expected_syft_build_date='2026-06-26T09:36:01Z'
expected_syft_go_version='go1.26.3'
expected_syft_schema_version='16.1.5'
expected_syft_binary_sha256='574df1a0862ff88ad933be214e81069e35b17618a13e019f8f1c84fe063222a2'
expected_syft_release_archive_url='https://github.com/anchore/syft/releases/download/v1.46.0/syft_1.46.0_linux_amd64.tar.gz'
expected_syft_release_archive_sha256='d654f678b709eb53c393d38519d5ed7d2e57205529404018614cfefa0fb2b5ca'
expected_grype_version='0.115.0'
expected_grype_git_commit='fa8b7e2a528cf1f8b098123f256c61db9e5df69c'
expected_grype_build_date='2026-06-26T11:33:27Z'
expected_grype_go_version='go1.26.3'
expected_grype_supported_db_schema='6'
expected_grype_binary_sha256='05ffd2c28a607e48fb2269d9aac5b3d53e8a51bbac501946644745eae2119907'
expected_grype_release_archive_url='https://github.com/anchore/grype/releases/download/v0.115.0/grype_0.115.0_linux_amd64.tar.gz'
expected_grype_release_archive_sha256='3fad92940650e514c0aa2dad83526942a055e210cec09a8a59d9c024adc2b90e'
grype_db_max_age_seconds='86400'
tiff_version='4.7.2-r0'
openexr_version='3.4.13-r0'
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

for scanner_config in "$syft_config" "$grype_config"; do
  if [ ! -f "$scanner_config" ] || [ -L "$scanner_config" ]; then
    printf '%s\n' 'Configuração de scanner deve ser arquivo regular versionado, não link simbólico.' >&2
    exit 1
  fi
done

actual_base_sha=$(shasum -a 256 "$base_archive" | awk '{print $1}')
actual_patch_sha=$(shasum -a 256 "$sso_patch" | awk '{print $1}')
actual_build_inputs_patch_sha=$(shasum -a 256 "$build_inputs_patch" | awk '{print $1}')
actual_native_security_patch_sha=$(shasum -a 256 "$native_security_patch" | awk '{print $1}')
actual_certificate_join_patch_sha=$(shasum -a 256 "$certificate_join_patch" | awk '{print $1}')
actual_tiff_source_sha=$(shasum -a 256 "$tiff_source" | awk '{print $1}')
actual_tiff_source_sha512=$(shasum -a 512 "$tiff_source" | awk '{print $1}')
actual_vex_template_sha=$(shasum -a 256 "$vex_template" | awk '{print $1}')
actual_syft_config_sha=$(shasum -a 256 "$syft_config" | awk '{print $1}')
actual_grype_config_sha=$(shasum -a 256 "$grype_config" | awk '{print $1}')
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
[ "$actual_native_security_patch_sha" = "$expected_native_security_patch_sha" ] || {
  printf '%s\n' 'Patch de bibliotecas nativas 0011 divergiu do hash aprovado.' >&2
  exit 1
}
[ "$actual_certificate_join_patch_sha" = "$expected_certificate_join_patch_sha" ] || {
  printf '%s\n' 'Patch certificate join 0012 divergiu do hash aprovado.' >&2
  exit 1
}
if [ "$actual_tiff_source_sha" != "$expected_tiff_source_sha" ] || \
  [ "$actual_tiff_source_sha512" != "$expected_tiff_source_sha512" ]; then
  printf '%s\n' 'Fonte libtiff 4.7.2 divergiu dos hashes aprovados.' >&2
  exit 1
fi
[ "$actual_vex_template_sha" = "$expected_vex_template_sha" ] || {
  printf '%s\n' 'Template OpenVEX TIFF divergiu do hash aprovado.' >&2
  exit 1
}
[ "$actual_syft_config_sha" = "$expected_syft_config_sha" ] || {
  printf '%s\n' 'Configuração hermética do Syft divergiu do hash aprovado.' >&2
  exit 1
}
[ "$actual_grype_config_sha" = "$expected_grype_config_sha" ] || {
  printf '%s\n' 'Configuração hermética do Grype divergiu do hash aprovado.' >&2
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
git -C "$candidate_work" apply --check "$native_security_patch"
git -C "$candidate_work" apply "$native_security_patch"
git -C "$candidate_work" apply --check "$certificate_join_patch"
git -C "$candidate_work" apply "$certificate_join_patch"
install -m 0644 "$tiff_source" "$candidate_work/build/tiff/tiff-4.7.2.tar.gz"
[ "$(sed -n '1p' "$candidate_work/.version")" = '3.0.1-maiocchi.15' ]

[ "$(grep -c "^FROM ${ruby_base}@${ruby_base_digest} AS " "$candidate_work/Dockerfile")" -eq 4 ]
[ "$(grep -Ec 'releases/latest|refs/heads/(main|master)|/raw/master/' "$candidate_work/Dockerfile" || true)" -eq 0 ]
[ "$(grep -c "sha256sum -c -" "$candidate_work/Dockerfile")" -eq 1 ]
[ "$(shasum -a 256 "$candidate_work/build/tiff/APKBUILD" | awk '{print $1}')" = "$expected_tiff_apkbuild_sha" ]
[ "$(shasum -a 256 "$candidate_work/build/tiff/tiff-4.7.2.tar.gz" | awk '{print $1}')" = "$expected_tiff_source_sha" ]
[ "$(grep -Fxc "pkgver=4.7.2" "$candidate_work/build/tiff/APKBUILD")" -eq 1 ]
[ "$(grep -Fxc "source=\"tiff-\$pkgver.tar.gz\"" "$candidate_work/build/tiff/APKBUILD")" -eq 1 ]
[ "$(grep -Fc "cmake3.5 -B build -G Ninja" "$candidate_work/build/tiff/APKBUILD")" -eq 1 ]
[ "$(grep -Fc "$expected_tiff_source_sha512  tiff-4.7.2.tar.gz" "$candidate_work/build/tiff/APKBUILD")" -eq 1 ]
[ "$(grep -Fc -- '--allow-untrusted' "$candidate_work/Dockerfile" || true)" -eq 0 ]
[ "$(grep -Fc "'tiff=$tiff_version'" "$candidate_work/Dockerfile")" -eq 2 ]
for openexr_package in openexr-libiex openexr-libilmthread openexr-libopenexr openexr-libopenexrcore; do
  [ "$(grep -Fc "'$openexr_package=$openexr_version'" "$candidate_work/Dockerfile")" -eq 2 ]
done

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
  "$candidate_work/app/controllers/certificate_auth/base_controller.rb" \
  "$candidate_work/app/controllers/certificate_auth/sessions_controller.rb" \
  "$candidate_work/app/models/maiocchi_sso_exchange.rb" \
  "$candidate_work/app/models/maiocchi_sso_identity.rb" \
  "$candidate_work/app/services/maiocchi_uno_certificate_join.rb" \
  "$candidate_work/lib/maiocchi_sso.rb" \
  "$candidate_work/lib/maiocchi_sso/configuration.rb" \
  "$candidate_work/lib/maiocchi_sso/identity_resolver.rb" \
  "$candidate_work/lib/maiocchi_sso/token_exchange.rb" \
  "$candidate_work/config/initializers/maiocchi_session_store.rb" \
  "$candidate_work/db/migrate/20260718090000_create_maiocchi_sso_identities.rb" \
  "$candidate_work/db/migrate/20260718090100_install_maiocchi_sso_guards.rb" \
  "$candidate_work/spec/lib/maiocchi_sso_configuration_spec.rb" \
  "$candidate_work/spec/lib/maiocchi_sso_identity_resolver_spec.rb" \
  "$candidate_work/spec/lib/maiocchi_sso_token_exchange_spec.rb" \
  "$candidate_work/spec/requests/maiocchi_sso_spec.rb"
do
  "$ruby_bin" -c "$ruby_file" >/dev/null
done

if [ "${DOCUSEAL_SSO_VERIFY_ONLY:-false}" = 'true' ]; then
  printf '%s\n' "Receita DocuSeal verificável: $actual_base_sha + $actual_patch_sha + $actual_build_inputs_patch_sha + $actual_native_security_patch_sha + $actual_certificate_join_patch_sha"
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
if [ -z "$evidence_dir" ] || [ "${evidence_dir#/}" = "$evidence_dir" ]; then
  printf '%s\n' 'DOCUSEAL_SSO_EVIDENCE_DIR absoluto é obrigatório.' >&2
  exit 1
fi

for required_tool in docker syft grype jq env uuidgen tr; do
  command -v "$required_tool" >/dev/null 2>&1 || {
    printf '%s\n' "$required_tool não está disponível; evidência candidata não foi produzida." >&2
    exit 1
  }
done

scanner_home=${HOME:?HOME é obrigatório para o cache validado do Grype}
scanner_path=${PATH:?PATH é obrigatório para localizar os scanners aprovados}
syft_bin=$(command -v syft)
grype_bin=$(command -v grype)
case "$syft_bin:$grype_bin" in
  /*:/*) ;;
  *) printf '%s\n' 'Scanners devem resolver para caminhos absolutos.' >&2; exit 1 ;;
esac
verify_scanner_binary() (
  scanner_bin=$1
  expected_sha256=$2
  scanner_label=$3
  [ -f "$scanner_bin" ] && [ ! -L "$scanner_bin" ] && [ -x "$scanner_bin" ] || {
    printf '%s\n' "$scanner_label deve ser executável regular, não link simbólico." >&2
    exit 1
  }
  [ "$(shasum -a 256 "$scanner_bin" | awk '{print $1}')" = "$expected_sha256" ] || {
    printf '%s\n' "$scanner_label diverge do asset oficial aprovado." >&2
    exit 1
  }
)
verify_scanner_binary "$syft_bin" "$expected_syft_binary_sha256" 'Binário Syft'
verify_scanner_binary "$grype_bin" "$expected_grype_binary_sha256" 'Binário Grype'
run_syft() {
  env -i HOME="$scanner_home" PATH="$scanner_path" \
    "$syft_bin" --config "$syft_config" "$@"
}
run_grype() {
  env -i HOME="$scanner_home" PATH="$scanner_path" \
    "$grype_bin" --config "$grype_config" "$@"
}

syft_version_json=$(run_syft version -o json)
grype_version_json=$(run_grype version -o json)
jq -e \
  --arg version "$expected_syft_version" \
  --arg git_commit "$expected_syft_git_commit" \
  --arg build_date "$expected_syft_build_date" \
  --arg go_version "$expected_syft_go_version" \
  --arg schema_version "$expected_syft_schema_version" '
    (keys == [
      "application", "buildDate", "compiler", "gitCommit", "gitDescription",
      "goVersion", "platform", "schemaVersion", "version"
    ]) and
    .application == "syft" and
    .version == $version and
    .gitCommit == $git_commit and
    .gitDescription == ("v" + $version) and
    .buildDate == $build_date and
    .compiler == "gc" and
    .goVersion == $go_version and
    .platform == "linux/amd64" and
    .schemaVersion == $schema_version
  ' >/dev/null <<EOF
$syft_version_json
EOF
jq -e \
  --arg version "$expected_grype_version" \
  --arg git_commit "$expected_grype_git_commit" \
  --arg build_date "$expected_grype_build_date" \
  --arg go_version "$expected_grype_go_version" \
  --argjson supported_db_schema "$expected_grype_supported_db_schema" \
  --arg syft_version "v$expected_syft_version" '
    (keys == [
      "application", "buildDate", "compiler", "gitCommit", "gitDescription",
      "goVersion", "platform", "supportedDbSchema", "syftVersion", "version"
    ]) and
    .application == "grype" and
    .version == $version and
    .gitCommit == $git_commit and
    .gitDescription == ("v" + $version) and
    .buildDate == $build_date and
    .compiler == "gc" and
    .goVersion == $go_version and
    .platform == "linux/amd64" and
    .supportedDbSchema == $supported_db_schema and
    .syftVersion == $syft_version
  ' >/dev/null <<EOF
$grype_version_json
EOF

run_syft config --load >"$candidate_work/syft-config.loaded.yaml"
run_grype config --load >"$candidate_work/grype-config.loaded.yaml"
[ "$(grep -Fxc 'check-for-app-update: false' "$candidate_work/syft-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc 'check-for-app-update: false' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc 'ignore: []' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc 'exclude: []' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc 'vex-documents: []' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc 'vex-add: []' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc '  auto-update: false' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc '  validate-by-hash-on-start: true' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc '  validate-age: true' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc '  max-allowed-built-age: 24h0m0s' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
run_grype db update >/dev/null

evidence_parent=$(dirname -- "$evidence_dir")
if [ ! -d "$evidence_parent" ] || [ -L "$evidence_parent" ]; then
  printf '%s\n' 'Diretório-pai de evidência deve existir e não pode ser link simbólico.' >&2
  exit 1
fi

tag_lock_root=$(git -C "$repo_dir" rev-parse --git-path maiocchi-release-tag-locks)
case "$tag_lock_root" in
  /*) ;;
  *) tag_lock_root="$repo_dir/$tag_lock_root" ;;
esac
mkdir -p "$tag_lock_root"
if [ ! -d "$tag_lock_root" ] || [ -L "$tag_lock_root" ]; then
  printf '%s\n' 'Diretório de locks Git inválido.' >&2
  exit 1
fi
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
  --label "br.adv.maiocchi.native-security-patch-sha256=$actual_native_security_patch_sha" \
  --label "br.adv.maiocchi.certificate-join-patch-sha256=$actual_certificate_join_patch_sha" \
  --label "br.adv.maiocchi.tiff-apkbuild-sha256=$expected_tiff_apkbuild_sha" \
  --label "br.adv.maiocchi.tiff-source-sha256=$actual_tiff_source_sha" \
  --label "br.adv.maiocchi.tiff-version=$tiff_version" \
  --label "br.adv.maiocchi.openexr-version=$openexr_version" \
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
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.native-security-patch-sha256" }}' "$candidate_image_id")" = "$actual_native_security_patch_sha" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.certificate-join-patch-sha256" }}' "$candidate_image_id")" = "$actual_certificate_join_patch_sha" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.tiff-apkbuild-sha256" }}' "$candidate_image_id")" = "$expected_tiff_apkbuild_sha" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.tiff-source-sha256" }}' "$candidate_image_id")" = "$actual_tiff_source_sha" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.tiff-version" }}' "$candidate_image_id")" = "$tiff_version" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.openexr-version" }}' "$candidate_image_id")" = "$openexr_version" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.ruby-base-digest" }}' "$candidate_image_id")" = "$ruby_base_digest" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.recipe-commit" }}' "$candidate_image_id")" = "$recipe_commit" ]
[ "$(docker image inspect --format '{{.Config.User}}' "$candidate_image_id")" = 'docuseal' ]

docker run --rm \
  --network none \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --entrypoint /bin/sh \
  "$candidate_image_id" \
  -eu -c '
    apk info -e "tiff=4.7.2-r0" >/dev/null
    apk info -W /usr/lib/libtiff.so.6.3.0 | grep -Fqx "/usr/lib/libtiff.so.6.3.0 is owned by tiff-4.7.2-r0"
    libvips=$(apk info -L vips | grep -E "^usr/lib/libvips[.]so[.][0-9]+[.][0-9]+[.][0-9]+$" | head -n 1)
    test -n "$libvips"
    ldd "/$libvips" | grep -F "libtiff.so.6" >/dev/null
    for package in openexr-libiex openexr-libilmthread openexr-libopenexr openexr-libopenexrcore; do
      apk info -e "$package=3.4.13-r0" >/dev/null
    done
    cd /usr/share/maiocchi/tiff-repository
    sha256sum -c SHA256SUMS >/dev/null
    test "$(find . -type f -name "*.rsa" | wc -l)" -eq 0
    audit_output=$(apk audit --system)
    test -z "$audit_output"
  '

printf '%s\n' "$candidate_image_id" >"$evidence_dir/docuseal-3.0.1-maiocchi.15.image-id.txt"
docker image inspect "$candidate_image_id" >"$evidence_dir/docuseal-3.0.1-maiocchi.15.image-inspect.json"
docker image save --output "$evidence_dir/docuseal-3.0.1-maiocchi.15.docker-image.tar" "$candidate_image_id"
run_syft "$candidate_image_id" >"$evidence_dir/docuseal-3.0.1-maiocchi.15.cdx.json"
docker run --rm \
  --network none \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --entrypoint /bin/cat \
  "$candidate_image_id" \
  /usr/share/maiocchi/tiff-repository/x86_64/tiff-4.7.2-r0.apk \
  >"$evidence_dir/docuseal-3.0.1-maiocchi.15.tiff-4.7.2-r0.apk"
docker run --rm \
  --network none \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --entrypoint /bin/cat \
  "$candidate_image_id" \
  /usr/share/maiocchi/tiff-repository/SHA256SUMS \
  >"$evidence_dir/docuseal-3.0.1-maiocchi.15.tiff-repository.SHA256SUMS"
docker run --rm \
  --network none \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --entrypoint /sbin/apk \
  "$candidate_image_id" \
  manifest \
  tiff \
  openexr-libiex \
  openexr-libilmthread \
  openexr-libopenexr \
  openexr-libopenexrcore \
  >"$evidence_dir/docuseal-3.0.1-maiocchi.15.native-packages.manifest"
[ "$(wc -l <"$evidence_dir/docuseal-3.0.1-maiocchi.15.native-packages.manifest" | tr -d ' ')" -eq 10 ]
grep -Eq '^sha1:[0-9a-f]{40}  usr/lib/libtiff[.]so[.]6[.]3[.]0$' \
  "$evidence_dir/docuseal-3.0.1-maiocchi.15.native-packages.manifest"
for native_library in libIex libIlmThread libOpenEXR libOpenEXRCore; do
  grep -Eq "^sha1:[0-9a-f]{40}  usr/lib/${native_library}-3_4[.]so[.]33[.]3[.]4[.]13$" \
    "$evidence_dir/docuseal-3.0.1-maiocchi.15.native-packages.manifest"
done

jq -e --arg tiff "$tiff_version" --arg openexr "$openexr_version" '
  .components as $components |
  ([$components[] | select(.name == "tiff")] | length >= 1) and
  (all($components[]; if .name == "tiff" then .version == $tiff else true end)) and
  (["openexr-libiex", "openexr-libilmthread", "openexr-libopenexr", "openexr-libopenexrcore"] |
    all(.[]; . as $name | any($components[]; .name == $name and .version == $openexr))) and
  (all($components[];
    if (.name | startswith("openexr-lib")) then .version == $openexr else true end))
' "$evidence_dir/docuseal-3.0.1-maiocchi.15.cdx.json" >/dev/null

vex_timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
vex_uuid=$(uuidgen | tr '[:upper:]' '[:lower:]')
printf '%s\n' "$vex_uuid" | grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
sed \
  -e "s|__IMAGE_ID__|$candidate_image_id|g" \
  -e "s|__TIMESTAMP__|$vex_timestamp|g" \
  -e "s|__VEX_UUID__|$vex_uuid|g" \
  "$vex_template" \
  >"$evidence_dir/docuseal-3.0.1-maiocchi.15.openvex.json"
jq -e \
  --arg image_id "$candidate_image_id" \
  --arg vex_timestamp "$vex_timestamp" '
  (."@id" | test("^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")) and
  (.version == 1) and
  (.timestamp | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")) and
  (all(.statements[]; .timestamp == $vex_timestamp)) and
  (.statements | length == 2) and
  ((.statements | map([
      .vulnerability.name,
      .status,
      (.justification // "")
    ]) | sort) == [
      ["CVE-2023-52356", "not_affected", "vulnerable_code_not_present"],
      ["CVE-2026-4775", "fixed", ""]
    ]) and
  (all(.statements[];
    any(.products[]; .["@id"] == "pkg:apk/alpine/tiff@4.7.2-r0?arch=x86_64&distro=alpine-3.24.1") and
    any(.products[]; (.["@id"] | contains($image_id)))))
' "$evidence_dir/docuseal-3.0.1-maiocchi.15.openvex.json" >/dev/null

grype_db_status_before=$(run_grype db status -o json)
grype_db_checked_at_epoch=$(date -u '+%s')
jq -e \
  --argjson checked_at "$grype_db_checked_at_epoch" \
  --argjson max_age "$grype_db_max_age_seconds" '
    .valid == true and
    (.schemaVersion | test("^v6[.]")) and
    (.from | test("[?&]checksum=sha256%3A[0-9a-f]{64}(&.*)?$")) and
    (.built | fromdateiso8601) as $built_at |
    (($checked_at - $built_at) >= -300) and
    (($checked_at - $built_at) <= $max_age) and
    (.path | startswith("/"))
  ' >/dev/null <<EOF
$grype_db_status_before
EOF
grype_db_path=$(printf '%s\n' "$grype_db_status_before" | jq -er '.path')
if [ ! -f "$grype_db_path" ] || [ -L "$grype_db_path" ]; then
  printf '%s\n' 'Banco local do Grype deve ser arquivo regular, não link simbólico.' >&2
  exit 1
fi
grype_db_sha_before=$(shasum -a 256 "$grype_db_path" | awk '{print $1}')
printf '%s\n' "$grype_db_sha_before" | grep -Eq '^[0-9a-f]{64}$'

run_grype "$candidate_image_id" \
  >"$evidence_dir/docuseal-3.0.1-maiocchi.15.grype.raw.json"
run_grype "$candidate_image_id" \
  --vex "$evidence_dir/docuseal-3.0.1-maiocchi.15.openvex.json" \
  --fail-on high \
  >"$evidence_dir/docuseal-3.0.1-maiocchi.15.grype.json"
grype_db_status_after=$(run_grype db status -o json)
grype_db_sha_after=$(shasum -a 256 "$grype_db_path" | awk '{print $1}')
[ "$grype_db_sha_after" = "$grype_db_sha_before" ] || {
  printf '%s\n' 'Banco do Grype mudou durante os scans raw/filtered.' >&2
  exit 1
}
jq -e -n \
  --argjson before "$grype_db_status_before" \
  --argjson after "$grype_db_status_after" \
  '$before == $after' >/dev/null
verify_scanner_binary "$syft_bin" "$expected_syft_binary_sha256" 'Binário Syft após os scans'
verify_scanner_binary "$grype_bin" "$expected_grype_binary_sha256" 'Binário Grype após os scans'
jq -e \
  --arg image_id "$candidate_image_id" \
  --argjson db_status "$grype_db_status_before" '
    .source.target.userInput == $image_id and
    (.ignoredMatches | length == 0) and
    .descriptor.db.status == $db_status and
    .descriptor.configuration["check-for-app-update"] == false and
    .descriptor.configuration["only-fixed"] == false and
    .descriptor.configuration["only-notfixed"] == false and
    .descriptor.configuration["ignore-wontfix"] == "" and
    .descriptor.configuration.search.scope == "squashed" and
    .descriptor.configuration.exclude == [] and
    .descriptor.configuration.externalSources.enable == false and
    .descriptor.configuration["vex-documents"] == [] and
    .descriptor.configuration["vex-add"] == [] and
    .descriptor.configuration["fail-on-severity"] == "" and
    .descriptor.configuration.db["auto-update"] == false and
    .descriptor.configuration.db["validate-by-hash-on-start"] == true and
    .descriptor.configuration.db["validate-age"] == true
  ' "$evidence_dir/docuseal-3.0.1-maiocchi.15.grype.raw.json" >/dev/null
jq -e \
  --arg image_id "$candidate_image_id" \
  --arg vex "$evidence_dir/docuseal-3.0.1-maiocchi.15.openvex.json" \
  --argjson db_status "$grype_db_status_before" '
    .source.target.userInput == $image_id and
    .descriptor.db.status == $db_status and
    .descriptor.configuration["check-for-app-update"] == false and
    .descriptor.configuration["only-fixed"] == false and
    .descriptor.configuration["only-notfixed"] == false and
    .descriptor.configuration["ignore-wontfix"] == "" and
    .descriptor.configuration.search.scope == "squashed" and
    .descriptor.configuration.exclude == [] and
    .descriptor.configuration.externalSources.enable == false and
    .descriptor.configuration["vex-documents"] == [$vex] and
    .descriptor.configuration["vex-add"] == [] and
    .descriptor.configuration["fail-on-severity"] == "high" and
    .descriptor.configuration.db["auto-update"] == false and
    .descriptor.configuration.db["validate-by-hash-on-start"] == true and
    .descriptor.configuration.db["validate-age"] == true
  ' "$evidence_dir/docuseal-3.0.1-maiocchi.15.grype.json" >/dev/null
jq -e -s '
  def severe: .vulnerability.severity == "High" or .vulnerability.severity == "Critical";
  def tuple: [.vulnerability.id, .artifact.name, .artifact.version];
  ([.[0].matches[] | select(severe) | tuple] | unique | sort) as $raw_high |
  ([
    ["CVE-2023-52356", "tiff", "4.7.2-r0"],
    ["CVE-2026-4775", "tiff", "4.7.2-r0"]
  ] | sort) as $allowed_high |
  ([.[1].matches[] | select(severe)] | length == 0) and
  ($raw_high == $allowed_high) and
  (([.[1].ignoredMatches[] | tuple] | unique | sort) == $raw_high) and
  (all(.[1].ignoredMatches[];
    any(.appliedIgnoreRules[];
      .namespace == "vex" and
      (.["vex-status"] == "fixed" or .["vex-status"] == "not_affected"))))
' \
  "$evidence_dir/docuseal-3.0.1-maiocchi.15.grype.raw.json" \
  "$evidence_dir/docuseal-3.0.1-maiocchi.15.grype.json" \
  >/dev/null

jq -n \
  --argjson syft "$syft_version_json" \
  --argjson grype "$grype_version_json" \
  --argjson grype_db "$grype_db_status_before" \
  --arg grype_db_sha256 "$grype_db_sha_before" \
  --arg syft_binary_sha256 "$expected_syft_binary_sha256" \
  --arg syft_release_archive_url "$expected_syft_release_archive_url" \
  --arg syft_release_archive_sha256 "$expected_syft_release_archive_sha256" \
  --arg grype_binary_sha256 "$expected_grype_binary_sha256" \
  --arg grype_release_archive_url "$expected_grype_release_archive_url" \
  --arg grype_release_archive_sha256 "$expected_grype_release_archive_sha256" '
    {
      schema: "maiocchi.scanner-evidence.v1",
      syft: ($syft | {
        application,
        version,
        gitCommit,
        gitDescription,
        platform,
        schemaVersion
      } + {
        binarySha256: $syft_binary_sha256,
        releaseArchive: {
          url: $syft_release_archive_url,
          sha256: $syft_release_archive_sha256
        }
      }),
      grype: ($grype | {
        application,
        version,
        gitCommit,
        gitDescription,
        platform,
        supportedDbSchema,
        syftVersion
      } + {
        binarySha256: $grype_binary_sha256,
        releaseArchive: {
          url: $grype_release_archive_url,
          sha256: $grype_release_archive_sha256
        }
      }),
      grypeDb: (($grype_db | {
        schemaVersion,
        from,
        built,
        valid
      }) + {sha256: $grype_db_sha256})
    }
  ' >"$evidence_dir/docuseal-3.0.1-maiocchi.15.scan-metadata.json"
jq -e '
  (keys == ["grype", "grypeDb", "schema", "syft"]) and
  .schema == "maiocchi.scanner-evidence.v1" and
  (.syft | keys == [
    "application", "binarySha256", "gitCommit", "gitDescription", "platform",
    "releaseArchive", "schemaVersion", "version"
  ]) and
  (.grype | keys == [
    "application", "binarySha256", "gitCommit", "gitDescription", "platform",
    "releaseArchive", "supportedDbSchema", "syftVersion", "version"
  ]) and
  (.syft.releaseArchive | keys == ["sha256", "url"]) and
  (.grype.releaseArchive | keys == ["sha256", "url"]) and
  (.grypeDb | keys == ["built", "from", "schemaVersion", "sha256", "valid"]) and
  .grypeDb.valid == true and
  (.grypeDb.sha256 | test("^[0-9a-f]{64}$"))
' "$evidence_dir/docuseal-3.0.1-maiocchi.15.scan-metadata.json" >/dev/null
[ "$(docker image inspect --format '{{.Id}}' "$candidate_image")" = "$candidate_image_id" ]

(
  cd "$evidence_dir"
  shasum -a 256 \
    docuseal-3.0.1-maiocchi.15.image-id.txt \
    docuseal-3.0.1-maiocchi.15.image-inspect.json \
    docuseal-3.0.1-maiocchi.15.docker-image.tar \
    docuseal-3.0.1-maiocchi.15.cdx.json \
    docuseal-3.0.1-maiocchi.15.grype.raw.json \
    docuseal-3.0.1-maiocchi.15.openvex.json \
    docuseal-3.0.1-maiocchi.15.grype.json \
    docuseal-3.0.1-maiocchi.15.scan-metadata.json \
    docuseal-3.0.1-maiocchi.15.tiff-4.7.2-r0.apk \
    docuseal-3.0.1-maiocchi.15.tiff-repository.SHA256SUMS \
    docuseal-3.0.1-maiocchi.15.native-packages.manifest \
    >SHA256SUMS
)

printf '%s\n' "Imagem e evidência candidatas produzidas em: $evidence_dir"
