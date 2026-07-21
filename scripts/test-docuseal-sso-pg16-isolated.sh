#!/usr/bin/env bash
set -Eeuo pipefail

umask 077
export DOCKER_CLI_HINTS=false

repo_dir="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
base_archive="$repo_dir/compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz"
sso_patch="$repo_dir/patches/docuseal/0009-maiocchi-uno-sso.patch"
build_inputs_patch="$repo_dir/patches/docuseal/0010-pin-build-inputs.patch"
native_security_patch="$repo_dir/patches/docuseal/0011-update-native-image-libraries.patch"
tiff_source="$repo_dir/compliance/sources/tiff-4.7.2.tar.gz"
harness_dockerfile="$repo_dir/tests/docuseal-sso-pg16/Dockerfile"

readonly expected_base_sha='e8f3b6e8ba3a8e70c7ea66846b57f6c0bddcd582be87bd4ae3ee074c2f9ff26c'
readonly expected_sso_patch_sha='2339df1880f6fc2af3706c51d29fc158a7c592a50c0deba5771b5a6eca51d54c'
readonly expected_build_inputs_patch_sha='0e36b9a594e3da75f64c3c37909be5fa9f57e3eefeeed2d21d993590496a5987'
readonly expected_native_security_patch_sha='83250e4672db3a4256d7ec44f04f621ef7c1ee178718d9831948f9261580c30c'
readonly expected_tiff_source_sha='672bd7d10aee4606171afb864f3570b83340f6a33e2c186dc0512f7145ffdf6a'
readonly expected_tiff_source_sha512='bad66954a7e7e158c6dcbfc0e2d0032b8f3e2a354b6d0fdbb8038a7963e36c5b8a433dd4ee81c6c4dabfb50094152d440aa1f32b5299098c9ae29e55de2e41fc'
readonly expected_tiff_apkbuild_sha='f7b0bdc5ae7c8340960afaeed18a1e1e09089a8ec99c2ac0335df70c4f046985'
readonly expected_tiff_version='4.7.2-r0'
readonly expected_openexr_version='3.4.13-r0'
readonly expected_harness_dockerfile_sha='95c14b2db45e9fa198809fd56bd4664d9256773f4423349c2393cb88058c826d'
readonly ruby_image='ruby:4.0.5-alpine@sha256:f48938e9ae72a4d32e728b03c306e7a7ff21f0cb6c2ed33f44a078c700b2aea6'
readonly postgres_image='pgvector/pgvector:pg16@sha256:00ba258a66dac104fd5171074a0084462a64a1369d8513f3d0a634e2f24d15bc'
readonly postgres_user='docuseal_sso_test'
readonly postgres_database='docuseal_test'
readonly postgres_password='synthetic-harness-only-not-production'
readonly postgres_alias='docuseal-sso-pg16-db'

run_id="$(date -u +%Y%m%d%H%M%S)-$$"
readonly run_id
[[ "$run_id" =~ ^[0-9]{14}-[1-9][0-9]*$ ]] || {
  printf '%s\n' 'Identificador do ensaio isolado é inválido.' >&2
  exit 1
}

readonly network_name="maiocchi-docuseal-sso-pg16-net-$run_id"
readonly database_container="maiocchi-docuseal-sso-pg16-db-$run_id"
readonly migration_container="maiocchi-docuseal-sso-pg16-migrate-$run_id"
readonly specs_container="maiocchi-docuseal-sso-pg16-specs-$run_id"
readonly syntax_container="maiocchi-docuseal-sso-pg16-syntax-$run_id"
readonly package_probe_container="maiocchi-docuseal-sso-pg16-packages-$run_id"
readonly app_container="maiocchi-docuseal-sso-pg16-app-$run_id"
readonly harness_image="maiocchi/docuseal-sso-pg16-harness:$run_id"
readonly ownership_label='br.adv.maiocchi.harness-run'
readonly recipe_commit_label='br.adv.maiocchi.recipe-commit'

candidate_root=''

fail() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 1
}

verify_recipe_git_state() {
  local observed_commit

  observed_commit="$(git -C "$repo_dir" rev-parse --verify 'HEAD^{commit}' 2>/dev/null)" || \
    fail 'HEAD não resolve para um commit Git válido.'
  [[ "$observed_commit" =~ ^[0-9a-f]{40}$ || "$observed_commit" =~ ^[0-9a-f]{64}$ ]] || \
    fail 'SHA do commit HEAD possui formato inválido.'
  [[ "$observed_commit" == "$recipe_commit" ]] || \
    fail 'HEAD mudou após a fixação do commit de receita.'
  git -C "$repo_dir" cat-file -e "$observed_commit^{commit}" 2>/dev/null || \
    fail 'Objeto apontado por HEAD não é um commit Git válido.'
  git -C "$repo_dir" verify-commit "$observed_commit" >/dev/null 2>&1 || \
    fail 'Commit de receita não possui assinatura Git verificável.'
  git -C "$repo_dir" diff --quiet --no-ext-diff -- || \
    fail 'Worktree tracked contém alterações; o harness exige receita congelada.'
  git -C "$repo_dir" diff --cached --quiet --no-ext-diff -- || \
    fail 'Index Git contém alterações; o harness exige receita congelada.'
}

container_is_owned() {
  local name="$1" label
  label="$(docker container inspect --format "{{ index .Config.Labels \"$ownership_label\" }}" "$name" 2>/dev/null || true)"
  [[ "$label" == "$run_id" ]]
}

network_is_owned() {
  local label
  label="$(docker network inspect --format "{{ index .Labels \"$ownership_label\" }}" "$network_name" 2>/dev/null || true)"
  [[ "$label" == "$run_id" ]]
}

image_is_owned() {
  local label
  label="$(docker image inspect --format "{{ index .Config.Labels \"$ownership_label\" }}" "$harness_image" 2>/dev/null || true)"
  [[ "$label" == "$run_id" ]]
}

cleanup() {
  local status=$? name
  trap - EXIT HUP INT TERM
  set +e

  for name in "$app_container" "$specs_container" "$package_probe_container" "$syntax_container" "$migration_container" "$database_container"; do
    if container_is_owned "$name"; then
      docker container rm --force --volumes "$name" >/dev/null 2>&1
    fi
  done

  if network_is_owned; then
    docker network rm "$network_name" >/dev/null 2>&1
  fi

  if image_is_owned; then
    docker image rm --force "$harness_image" >/dev/null 2>&1
  fi

  if [[ -n "$candidate_root" ]]; then
    case "$candidate_root" in
      */maiocchi-docuseal-sso-pg16."$run_id".*)
        rm -rf -- "$candidate_root"
        ;;
      *)
        printf '%s\n' 'Limpeza do diretório temporário recusada: alvo inesperado.' >&2
        status=1
        ;;
    esac
  fi

  exit "$status"
}

for required_tool in awk cp cut date find git grep id mktemp sed shasum sort tar tr wc; do
  command -v "$required_tool" >/dev/null 2>&1 || fail "$required_tool não está disponível."
done

recipe_commit="$(git -C "$repo_dir" rev-parse --verify 'HEAD^{commit}' 2>/dev/null)" || \
  fail 'HEAD não resolve para um commit Git válido.'
readonly recipe_commit
verify_recipe_git_state
command -v docker >/dev/null 2>&1 || fail 'docker não está disponível.'

trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

host_uid="$(id -u)"
host_gid="$(id -g)"
readonly host_uid host_gid
[[ "$host_uid" =~ ^[1-9][0-9]*$ ]] || fail 'O ensaio deve ser executado por um usuário host não-root.'
[[ "$host_gid" =~ ^[1-9][0-9]*$ ]] || fail 'O grupo primário do usuário host deve ser não-root.'

docker info >/dev/null 2>&1 || fail 'Docker Engine não está disponível.'

for input_file in "$base_archive" "$sso_patch" "$build_inputs_patch" "$native_security_patch" "$tiff_source" "$harness_dockerfile"; do
  [[ -f "$input_file" && ! -L "$input_file" ]] || fail "Input ausente, não regular ou simbólico: $input_file"
done

actual_base_sha="$(shasum -a 256 "$base_archive" | awk '{print $1}')"
actual_sso_patch_sha="$(shasum -a 256 "$sso_patch" | awk '{print $1}')"
actual_build_inputs_patch_sha="$(shasum -a 256 "$build_inputs_patch" | awk '{print $1}')"
actual_native_security_patch_sha="$(shasum -a 256 "$native_security_patch" | awk '{print $1}')"
actual_tiff_source_sha="$(shasum -a 256 "$tiff_source" | awk '{print $1}')"
actual_tiff_source_sha512="$(shasum -a 512 "$tiff_source" | awk '{print $1}')"
actual_harness_dockerfile_sha="$(shasum -a 256 "$harness_dockerfile" | awk '{print $1}')"

[[ "$actual_base_sha" == "$expected_base_sha" ]] || fail 'Base DocuSeal .14 divergiu do hash aprovado.'
[[ "$actual_sso_patch_sha" == "$expected_sso_patch_sha" ]] || fail 'Patch SSO 0009 divergiu do hash aprovado.'
[[ "$actual_build_inputs_patch_sha" == "$expected_build_inputs_patch_sha" ]] || fail 'Patch de inputs 0010 divergiu do hash aprovado.'
[[ "$actual_native_security_patch_sha" == "$expected_native_security_patch_sha" ]] || fail 'Patch de bibliotecas nativas 0011 divergiu do hash aprovado.'
[[ "$actual_tiff_source_sha" == "$expected_tiff_source_sha" ]] || fail 'Fonte vendorizada TIFF divergiu do SHA-256 aprovado.'
[[ "$actual_tiff_source_sha512" == "$expected_tiff_source_sha512" ]] || fail 'Fonte vendorizada TIFF divergiu do SHA-512 upstream aprovado.'
[[ "$actual_harness_dockerfile_sha" == "$expected_harness_dockerfile_sha" ]] || fail 'Dockerfile do harness divergiu do hash aprovado.'
[[ "$(grep -Fxc "FROM $ruby_image AS docuseal-sso-tiff-package" "$harness_dockerfile")" == '1' ]] || \
  fail 'Stage TIFF do harness não está preso ao digest Ruby aprovado.'
[[ "$(grep -Fxc "FROM $ruby_image AS docuseal-sso-pg16-test" "$harness_dockerfile")" == '1' ]] || \
  fail 'Imagem Ruby do harness não está presa ao digest aprovado.'

for name in "$database_container" "$migration_container" "$syntax_container" "$package_probe_container" "$specs_container" "$app_container"; do
  if docker container inspect "$name" >/dev/null 2>&1; then
    fail "Nome exclusivo de container já existe: $name"
  fi
done
if docker network inspect "$network_name" >/dev/null 2>&1; then
  fail "Nome exclusivo de rede já existe: $network_name"
fi
if docker image inspect "$harness_image" >/dev/null 2>&1; then
  fail "Tag exclusiva do harness já existe: $harness_image"
fi

tmp_parent="$(CDPATH='' cd -- "${TMPDIR:-/tmp}" && pwd -P)"
[[ "$tmp_parent" == /* && -d "$tmp_parent" ]] || fail 'Raiz temporária inválida.'
candidate_root="$(mktemp -d "$tmp_parent/maiocchi-docuseal-sso-pg16.$run_id.XXXXXX")"
candidate_source="$candidate_root/source"
archive_listing="$candidate_root/archive.list"
mkdir -m 0700 "$candidate_source"

tar -tzf "$base_archive" >"$archive_listing"
archive_entry_count="$(wc -l <"$archive_listing" | tr -d '[:space:]')"
[[ "$archive_entry_count" =~ ^[1-9][0-9]*$ ]] || fail 'Listagem da base é vazia ou inválida.'
(( archive_entry_count <= 5000 )) || fail 'Base excede o limite de 5.000 entradas.'

while IFS= read -r archive_entry; do
  [[ -n "$archive_entry" && "$archive_entry" != /* ]] || fail 'Base contém caminho absoluto ou vazio.'
  normalized_entry="${archive_entry#./}"
  [[ -n "$normalized_entry" ]] || fail 'Base contém entrada raiz ambígua.'
  case "/$normalized_entry/" in
    */../*) fail 'Base contém travessia de diretório.' ;;
  esac
done <"$archive_listing"

archive_types="$(tar -tvzf "$base_archive" | cut -c1 | sort -u | tr -d '\n')"
[[ "$archive_types" == '-' ]] || fail 'Base contém tipo de entrada não regular.'

tar -xzf "$base_archive" -C "$candidate_source" --no-same-owner --no-same-permissions
[[ ! -e "$candidate_source/.git" ]] || fail 'Base reconstruída contém metadados Git inesperados.'

git -C "$candidate_source" apply --check "$sso_patch"
git -C "$candidate_source" apply "$sso_patch"
git -C "$candidate_source" apply --check "$build_inputs_patch"
git -C "$candidate_source" apply "$build_inputs_patch"
git -C "$candidate_source" apply --check "$native_security_patch"
git -C "$candidate_source" apply "$native_security_patch"

candidate_tiff_apkbuild="$candidate_source/build/tiff/APKBUILD"
candidate_tiff_source="$candidate_source/build/tiff/tiff-4.7.2.tar.gz"
[[ -f "$candidate_tiff_apkbuild" && ! -L "$candidate_tiff_apkbuild" ]] || \
  fail 'APKBUILD TIFF não foi materializado como arquivo regular pelo patch 0011.'
[[ ! -e "$candidate_tiff_source" ]] || fail 'Destino da fonte TIFF já existia antes da cópia governada.'
actual_tiff_apkbuild_sha="$(shasum -a 256 "$candidate_tiff_apkbuild" | awk '{print $1}')"
[[ "$actual_tiff_apkbuild_sha" == "$expected_tiff_apkbuild_sha" ]] || \
  fail 'APKBUILD TIFF aplicado divergiu do hash aprovado.'
cp "$tiff_source" "$candidate_tiff_source"
[[ -f "$candidate_tiff_source" && ! -L "$candidate_tiff_source" ]] || \
  fail 'Fonte TIFF não foi copiada como arquivo regular para o contexto candidato.'
[[ "$(shasum -a 256 "$candidate_tiff_source" | awk '{print $1}')" == "$expected_tiff_source_sha" ]] || \
  fail 'Fonte TIFF copiada divergiu do SHA-256 aprovado.'
[[ "$(shasum -a 512 "$candidate_tiff_source" | awk '{print $1}')" == "$expected_tiff_source_sha512" ]] || \
  fail 'Fonte TIFF copiada divergiu do SHA-512 upstream aprovado.'

[[ "$(sed -n '1p' "$candidate_source/.version")" == '3.0.1-maiocchi.15' ]] || \
  fail 'Versão reconstruída não é 3.0.1-maiocchi.15.'
[[ "$(grep -Fxc "FROM $ruby_image AS download" "$candidate_source/Dockerfile")" == '1' ]] || \
  fail 'Stage download do candidato não está preso ao digest aprovado.'
[[ "$(grep -Fxc "FROM $ruby_image AS webpack" "$candidate_source/Dockerfile")" == '1' ]] || \
  fail 'Stage webpack do candidato não está preso ao digest aprovado.'
[[ "$(grep -Fxc "FROM $ruby_image AS app" "$candidate_source/Dockerfile")" == '1' ]] || \
  fail 'Stage app do candidato não está preso ao digest aprovado.'
[[ "$(grep -Ec 'releases/latest|refs/heads/(main|master)|/raw/master/' "$candidate_source/Dockerfile" || true)" == '0' ]] || \
  fail 'Dockerfile reconstruído ainda contém input flutuante.'
[[ "$(grep -Fc 'sha256sum -c -' "$candidate_source/Dockerfile")" == '1' ]] || \
  fail 'Verificação dos downloads pinados não está presente uma única vez.'
[[ "$(grep -Fxc "FROM $ruby_image AS tiff-package" "$candidate_source/Dockerfile")" == '1' ]] || \
  fail 'Stage de construção TIFF do candidato não está preso ao digest Ruby aprovado.'
[[ "$(grep -Fc "'tiff=$expected_tiff_version'" "$candidate_source/Dockerfile")" -ge 2 ]] || \
  fail 'Versão TIFF aprovada não está pinada e verificada no Dockerfile reconstruído.'
for openexr_package in openexr-libiex openexr-libilmthread openexr-libopenexr openexr-libopenexrcore; do
  [[ "$(grep -Fc "'$openexr_package=$expected_openexr_version'" "$candidate_source/Dockerfile")" -ge 2 ]] || \
    fail "Versão aprovada de $openexr_package não está pinada e verificada no Dockerfile reconstruído."
done
if grep -Fq -- '--allow-untrusted' "$candidate_source/Dockerfile" "$harness_dockerfile"; then
  fail 'Instalação APK sem validação de assinatura foi recusada.'
fi

readonly -a sso_specs=(
  'spec/lib/maiocchi_sso_configuration_spec.rb'
  'spec/lib/maiocchi_sso_identity_resolver_spec.rb'
  'spec/lib/maiocchi_sso_token_exchange_spec.rb'
  'spec/requests/maiocchi_sso_spec.rb'
)
for spec_file in "${sso_specs[@]}"; do
  [[ -f "$candidate_source/$spec_file" ]] || fail "Spec SSO esperado não existe: $spec_file"
done
discovered_sso_specs=()
while IFS= read -r discovered_spec; do
  discovered_sso_specs+=("$discovered_spec")
done < <(CDPATH='' cd -- "$candidate_source" && find spec -type f -name '*maiocchi_sso*spec.rb' -print | LC_ALL=C sort)
[[ "${#discovered_sso_specs[@]}" == "${#sso_specs[@]}" ]] || fail 'Conjunto de specs SSO divergiu do conjunto fechado.'
for spec_index in "${!sso_specs[@]}"; do
  [[ "${discovered_sso_specs[$spec_index]}" == "${sso_specs[$spec_index]}" ]] || \
    fail 'Conjunto de specs SSO divergiu do conjunto fechado.'
done

docker pull --platform linux/amd64 "$ruby_image" >/dev/null
docker run --rm \
  --name "$syntax_container" \
  --network none \
  --platform linux/amd64 \
  --label "$ownership_label=$run_id" \
  --user "$host_uid:$host_gid" \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --volume "$candidate_source:/source:ro" \
  --workdir /source \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16777216,mode=1777 \
  "$ruby_image" \
  sh -eu -c 'for ruby_file do ruby -c "$ruby_file" >/dev/null; done' sh "${sso_specs[@]}"

docker pull --platform linux/amd64 "$postgres_image" >/dev/null

verify_recipe_git_state
docker build \
  --pull \
  --platform linux/amd64 \
  --provenance=false \
  --file "$harness_dockerfile" \
  --label "$ownership_label=$run_id" \
  --label "$recipe_commit_label=$recipe_commit" \
  --build-arg "DOCUSEAL_BASE_SOURCE_SHA256=$actual_base_sha" \
  --build-arg "DOCUSEAL_SSO_PATCH_SHA256=$actual_sso_patch_sha" \
  --build-arg "DOCUSEAL_BUILD_INPUTS_PATCH_SHA256=$actual_build_inputs_patch_sha" \
  --build-arg "DOCUSEAL_NATIVE_SECURITY_PATCH_SHA256=$actual_native_security_patch_sha" \
  --build-arg "TIFF_APKBUILD_SHA256=$actual_tiff_apkbuild_sha" \
  --build-arg "TIFF_SOURCE_SHA256=$actual_tiff_source_sha" \
  --build-arg "TIFF_VERSION=$expected_tiff_version" \
  --build-arg "OPENEXR_VERSION=$expected_openexr_version" \
  --build-arg "HARNESS_DOCKERFILE_SHA256=$actual_harness_dockerfile_sha" \
  --tag "$harness_image" \
  "$candidate_source"

image_is_owned || fail 'Imagem do harness não recebeu o marcador exclusivo do ensaio.'
[[ "$(docker image inspect --format "{{ index .Config.Labels \"$recipe_commit_label\" }}" "$harness_image")" == "$recipe_commit" ]] || \
  fail 'Label do commit de receita do harness divergiu do HEAD assinado.'
[[ "$(docker image inspect --format '{{.Architecture}}' "$harness_image")" == 'amd64' ]] || \
  fail 'Arquitetura da imagem do harness divergiu de amd64.'
[[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.base-source-sha256" }}' "$harness_image")" == "$actual_base_sha" ]] || \
  fail 'Label de proveniência da base divergiu.'
[[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.sso-patch-sha256" }}' "$harness_image")" == "$actual_sso_patch_sha" ]] || \
  fail 'Label de proveniência do patch SSO divergiu.'
[[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.build-inputs-patch-sha256" }}' "$harness_image")" == "$actual_build_inputs_patch_sha" ]] || \
  fail 'Label de proveniência do patch de build divergiu.'
[[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.native-security-patch-sha256" }}' "$harness_image")" == "$actual_native_security_patch_sha" ]] || \
  fail 'Label de proveniência do patch de bibliotecas nativas divergiu.'
[[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.tiff-apkbuild-sha256" }}' "$harness_image")" == "$actual_tiff_apkbuild_sha" ]] || \
  fail 'Label de proveniência do APKBUILD TIFF divergiu.'
[[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.tiff-source-sha256" }}' "$harness_image")" == "$actual_tiff_source_sha" ]] || \
  fail 'Label de proveniência da fonte TIFF divergiu.'
[[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.tiff-version" }}' "$harness_image")" == "$expected_tiff_version" ]] || \
  fail 'Label da versão TIFF divergiu.'
[[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.openexr-version" }}' "$harness_image")" == "$expected_openexr_version" ]] || \
  fail 'Label da versão OpenEXR divergiu.'

docker run --rm \
  --name "$package_probe_container" \
  --network none \
  --platform linux/amd64 \
  --label "$ownership_label=$run_id" \
  --user 2100:2100 \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=33554432,mode=1777 \
  --env "EXPECTED_TIFF_VERSION=$expected_tiff_version" \
  --env "EXPECTED_OPENEXR_VERSION=$expected_openexr_version" \
  --entrypoint /bin/sh \
  "$harness_image" \
  -eu -c '
    apk info -e "tiff=$EXPECTED_TIFF_VERSION"
    tiff_library="$(apk info -L tiff | awk '\''/^usr\/lib\/libtiff\.so\.[0-9]/ { print "/" $0; exit }'\'')"
    test -n "$tiff_library"
    apk info --who-owns "$tiff_library" | grep -F "tiff-$EXPECTED_TIFF_VERSION" >/dev/null

    vips_library="$(find /usr/lib -maxdepth 1 -type f -name '\''libvips.so.*'\'' -print | sort | head -n 1)"
    test -n "$vips_library"
    ldd "$vips_library" > /tmp/vips.ldd
    grep -F '\''libtiff.so.6'\'' /tmp/vips.ldd >/dev/null
    grep -F '\''libOpenEXR-'\'' /tmp/vips.ldd >/dev/null
    if grep -F '\''not found'\'' /tmp/vips.ldd >/dev/null; then exit 1; fi

    for package in openexr-libiex openexr-libilmthread openexr-libopenexr openexr-libopenexrcore; do
      apk info -e "$package=$EXPECTED_OPENEXR_VERSION"
      package_library="$(apk info -L "$package" | awk '\''/^usr\/lib\/.*\.so\.[0-9]/ { print "/" $0; exit }'\'')"
      test -n "$package_library"
      apk info --who-owns "$package_library" | grep -F "$package-$EXPECTED_OPENEXR_VERSION" >/dev/null
      ldd "$package_library" > /tmp/openexr.ldd
      if grep -F '\''not found'\'' /tmp/openexr.ldd >/dev/null; then exit 1; fi
    done

    bundle exec ruby -rvips -e "image = Vips::Image.black(2, 2); image.tiffsave(\"/tmp/maiocchi-tiff-probe.tif\"); decoded = Vips::Image.new_from_file(\"/tmp/maiocchi-tiff-probe.tif\"); abort unless decoded.width == 2 && decoded.height == 2"
  '

docker network create \
  --driver bridge \
  --internal \
  --label "$ownership_label=$run_id" \
  "$network_name" >/dev/null
network_is_owned || fail 'Rede não recebeu o marcador exclusivo do ensaio.'
[[ "$(docker network inspect --format '{{.Internal}}' "$network_name")" == 'true' ]] || \
  fail 'Rede do ensaio não é interna.'

docker run --detach \
  --name "$database_container" \
  --hostname "$postgres_alias" \
  --network "$network_name" \
  --network-alias "$postgres_alias" \
  --platform linux/amd64 \
  --label "$ownership_label=$run_id" \
  --read-only \
  --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,nodev,size=1073741824 \
  --tmpfs /var/run/postgresql:rw,nosuid,nodev,size=16777216 \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=67108864 \
  --env "POSTGRES_USER=$postgres_user" \
  --env "POSTGRES_PASSWORD=$postgres_password" \
  --env "POSTGRES_DB=$postgres_database" \
  --env 'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256' \
  "$postgres_image" >/dev/null
container_is_owned "$database_container" || fail 'PostgreSQL não recebeu o marcador exclusivo do ensaio.'
[[ "$(docker container inspect --format '{{len .HostConfig.PortBindings}}' "$database_container")" == '0' ]] || \
  fail 'PostgreSQL publicou porta no host.'
[[ -z "$(docker container inspect --format '{{range .Mounts}}{{if ne .Type "tmpfs"}}{{.Type}} {{end}}{{end}}' "$database_container")" ]] || \
  fail 'PostgreSQL recebeu bind ou volume persistente.'

database_ready=false
for ((attempt = 1; attempt <= 90; attempt += 1)); do
  if docker exec "$database_container" pg_isready -U "$postgres_user" -d "$postgres_database" >/dev/null 2>&1; then
    database_ready=true
    break
  fi
  sleep 1
done
if [[ "$database_ready" != 'true' ]]; then
  docker logs --tail 100 "$database_container" >&2 || true
  fail 'PostgreSQL 16 isolado não ficou pronto em 90 segundos.'
fi

server_version_num="$(
  docker exec \
    --env "PGPASSWORD=$postgres_password" \
    "$database_container" \
    psql -U "$postgres_user" -d "$postgres_database" -Atc 'SHOW server_version_num'
)"
[[ "$server_version_num" =~ ^16[0-9]{4}$ ]] || fail "Servidor não é PostgreSQL 16: $server_version_num"

readonly -a rails_environment=(
  --env 'RAILS_ENV=test'
  --env 'NODE_ENV=test'
  --env 'TZ=UTC'
  --env 'DEFAULT_LOCALE=en-US'
  --env "PGHOST=$postgres_alias"
  --env 'PGPORT=5432'
  --env "PGUSER=$postgres_user"
  --env "PGPASSWORD=$postgres_password"
  --env "PGDATABASE=$postgres_database"
  --env 'SECRET_KEY_BASE=synthetic-harness-secret-key-base-0000000000000000000000000000000000000000'
  --env 'MAIOCCHI_SSO_ENABLED=false'
  --env 'RAILS_LOG_TO_STDOUT=1'
)

readonly -a ephemeral_app_storage=(
  --tmpfs '/app/log:rw,noexec,nosuid,nodev,size=33554432,uid=2100,gid=2100,mode=0700'
  --tmpfs '/app/storage:rw,noexec,nosuid,nodev,size=134217728,uid=2100,gid=2100,mode=0700'
  --tmpfs '/app/tmp:rw,noexec,nosuid,nodev,size=268435456,uid=2100,gid=2100,mode=0700'
)

docker run --rm \
  --name "$migration_container" \
  --network "$network_name" \
  --platform linux/amd64 \
  --label "$ownership_label=$run_id" \
  "${rails_environment[@]}" \
  "${ephemeral_app_storage[@]}" \
  "$harness_image" rails db:migrate

migration_versions="$(
  docker exec \
    --env "PGPASSWORD=$postgres_password" \
    "$database_container" \
    psql -U "$postgres_user" -d "$postgres_database" -Atc \
      "SELECT string_agg(version, ',' ORDER BY version) FROM schema_migrations WHERE version IN ('20260718090000', '20260718090100')"
)"
[[ "$migration_versions" == '20260718090000,20260718090100' ]] || \
  fail 'Migrations SSO e de repair pós-schema-load não foram registradas no PostgreSQL 16.'

guard_count="$(
  docker exec \
    --env "PGPASSWORD=$postgres_password" \
    "$database_container" \
    psql -U "$postgres_user" -d "$postgres_database" -Atc \
      "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('trg_maiocchi_sso_identity_binding', 'trg_maiocchi_sso_exchange_append_only')"
)"
[[ "$guard_count" == '2' ]] || fail 'Guards PostgreSQL de imutabilidade/append-only não foram instalados.'

docker run --rm \
  --name "$specs_container" \
  --network "$network_name" \
  --platform linux/amd64 \
  --label "$ownership_label=$run_id" \
  "${rails_environment[@]}" \
  "${ephemeral_app_storage[@]}" \
  "$harness_image" rspec --format progress "${sso_specs[@]}"

docker run --detach \
  --name "$app_container" \
  --network "$network_name" \
  --platform linux/amd64 \
  --label "$ownership_label=$run_id" \
  "${rails_environment[@]}" \
  "${ephemeral_app_storage[@]}" \
  --env 'MULTITENANT=true' \
  --env 'WEB_CONCURRENCY=0' \
  --env 'RAILS_MAX_THREADS=2' \
  --env 'SIDEKIQ_THREADS=1' \
  --env 'PORT=3000' \
  "$harness_image" puma -C /app/config/puma.rb --dir /app >/dev/null
container_is_owned "$app_container" || fail 'Aplicação smoke não recebeu o marcador exclusivo do ensaio.'
[[ "$(docker container inspect --format '{{len .HostConfig.PortBindings}}' "$app_container")" == '0' ]] || \
  fail 'Aplicação smoke publicou porta no host.'
[[ -z "$(docker container inspect --format '{{range .Mounts}}{{if ne .Type "tmpfs"}}{{.Type}} {{end}}{{end}}' "$app_container")" ]] || \
  fail 'Aplicação smoke recebeu bind ou volume persistente.'

app_healthy=false
for ((attempt = 1; attempt <= 90; attempt += 1)); do
  if docker exec "$app_container" ruby -rnet/http -e \
    "response = Net::HTTP.get_response(URI('http://127.0.0.1:3000/up')); exit(response.code == '200' ? 0 : 1)" \
    >/dev/null 2>&1; then
    app_healthy=true
    break
  fi
  if [[ "$(docker container inspect --format '{{.State.Running}}' "$app_container" 2>/dev/null || true)" != 'true' ]]; then
    break
  fi
  sleep 1
done
if [[ "$app_healthy" != 'true' ]]; then
  docker logs --tail 150 "$app_container" >&2 || true
  fail 'Smoke boot/health do candidato falhou na rede isolada.'
fi

printf '%s\n' \
  "DocuSeal SSO validado em PostgreSQL $server_version_num isolado." \
  "Base SHA-256: $actual_base_sha" \
  "Patch 0009 SHA-256: $actual_sso_patch_sha" \
  "Patch 0010 SHA-256: $actual_build_inputs_patch_sha" \
  "Patch 0011 SHA-256: $actual_native_security_patch_sha" \
  "Fonte TIFF SHA-256: $actual_tiff_source_sha" \
  "APKBUILD TIFF SHA-256: $actual_tiff_apkbuild_sha" \
  "Commit de receita assinado: $recipe_commit" \
  "Pacotes nativos: tiff=$expected_tiff_version; openexr-lib*=$expected_openexr_version (4/4)" \
  'Pacotes nativos/linkage: APK ownership, ldd e round-trip TIFF via Ruby/Vips validados antes dos specs.' \
  "Specs executados: ${#sso_specs[@]} (conjunto fechado)" \
  'Portas publicadas: 0; volumes persistentes/binds: 0; health interno: 200.'
