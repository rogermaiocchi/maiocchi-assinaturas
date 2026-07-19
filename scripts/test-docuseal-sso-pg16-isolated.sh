#!/usr/bin/env bash
set -Eeuo pipefail

umask 077
export DOCKER_CLI_HINTS=false

repo_dir="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
base_archive="$repo_dir/compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz"
sso_patch="$repo_dir/patches/docuseal/0009-maiocchi-uno-sso.patch"
build_inputs_patch="$repo_dir/patches/docuseal/0010-pin-build-inputs.patch"
harness_dockerfile="$repo_dir/tests/docuseal-sso-pg16/Dockerfile"

readonly expected_base_sha='e8f3b6e8ba3a8e70c7ea66846b57f6c0bddcd582be87bd4ae3ee074c2f9ff26c'
readonly expected_sso_patch_sha='27be8a116d8ed918c1773e9cc0d301f42e064de493e3f88d8ae56e47e24001cd'
readonly expected_build_inputs_patch_sha='752e6ff168f093169dd120d509da4a10c79c04e2967799327edb0ef5e92481bc'
readonly expected_harness_dockerfile_sha='d3b6293cb9469b996a9115ea6a3cbebad2fbedb76706b2b1527e6c2139100aac'
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
readonly app_container="maiocchi-docuseal-sso-pg16-app-$run_id"
readonly harness_image="maiocchi/docuseal-sso-pg16-harness:$run_id"
readonly ownership_label='br.adv.maiocchi.harness-run'

candidate_root=''

fail() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 1
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

  for name in "$app_container" "$specs_container" "$migration_container" "$database_container"; do
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

trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

for required_tool in awk cut date docker find git grep mktemp sed shasum sort tar tr wc; do
  command -v "$required_tool" >/dev/null 2>&1 || fail "$required_tool não está disponível."
done

docker info >/dev/null 2>&1 || fail 'Docker Engine não está disponível.'

for input_file in "$base_archive" "$sso_patch" "$build_inputs_patch" "$harness_dockerfile"; do
  [[ -f "$input_file" && ! -L "$input_file" ]] || fail "Input ausente, não regular ou simbólico: $input_file"
done

actual_base_sha="$(shasum -a 256 "$base_archive" | awk '{print $1}')"
actual_sso_patch_sha="$(shasum -a 256 "$sso_patch" | awk '{print $1}')"
actual_build_inputs_patch_sha="$(shasum -a 256 "$build_inputs_patch" | awk '{print $1}')"
actual_harness_dockerfile_sha="$(shasum -a 256 "$harness_dockerfile" | awk '{print $1}')"

[[ "$actual_base_sha" == "$expected_base_sha" ]] || fail 'Base DocuSeal .14 divergiu do hash aprovado.'
[[ "$actual_sso_patch_sha" == "$expected_sso_patch_sha" ]] || fail 'Patch SSO 0009 divergiu do hash aprovado.'
[[ "$actual_build_inputs_patch_sha" == "$expected_build_inputs_patch_sha" ]] || fail 'Patch de inputs 0010 divergiu do hash aprovado.'
[[ "$actual_harness_dockerfile_sha" == "$expected_harness_dockerfile_sha" ]] || fail 'Dockerfile do harness divergiu do hash aprovado.'
[[ "$(grep -Fxc "FROM $ruby_image AS docuseal-sso-pg16-test" "$harness_dockerfile")" == '1' ]] || \
  fail 'Imagem Ruby do harness não está presa ao digest aprovado.'

for name in "$database_container" "$migration_container" "$specs_container" "$app_container"; do
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

docker pull --platform linux/amd64 "$postgres_image" >/dev/null

docker build \
  --pull \
  --platform linux/amd64 \
  --provenance=false \
  --file "$harness_dockerfile" \
  --label "$ownership_label=$run_id" \
  --build-arg "DOCUSEAL_BASE_SOURCE_SHA256=$actual_base_sha" \
  --build-arg "DOCUSEAL_SSO_PATCH_SHA256=$actual_sso_patch_sha" \
  --build-arg "DOCUSEAL_BUILD_INPUTS_PATCH_SHA256=$actual_build_inputs_patch_sha" \
  --build-arg "HARNESS_DOCKERFILE_SHA256=$actual_harness_dockerfile_sha" \
  --tag "$harness_image" \
  "$candidate_source"

image_is_owned || fail 'Imagem do harness não recebeu o marcador exclusivo do ensaio.'
[[ "$(docker image inspect --format '{{.Architecture}}' "$harness_image")" == 'amd64' ]] || \
  fail 'Arquitetura da imagem do harness divergiu de amd64.'
[[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.base-source-sha256" }}' "$harness_image")" == "$actual_base_sha" ]] || \
  fail 'Label de proveniência da base divergiu.'
[[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.sso-patch-sha256" }}' "$harness_image")" == "$actual_sso_patch_sha" ]] || \
  fail 'Label de proveniência do patch SSO divergiu.'
[[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.build-inputs-patch-sha256" }}' "$harness_image")" == "$actual_build_inputs_patch_sha" ]] || \
  fail 'Label de proveniência do patch de build divergiu.'

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
  "Specs executados: ${#sso_specs[@]} (conjunto fechado)" \
  'Portas publicadas: 0; volumes persistentes/binds: 0; health interno: 200.'
