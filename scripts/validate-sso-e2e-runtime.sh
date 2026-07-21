#!/bin/sh
set -eu

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

canonical_dir() {
  (CDPATH='' cd -- "$1" && pwd -P)
}

file_mode() {
  if stat -f '%Lp' "$1" >/dev/null 2>&1; then stat -f '%Lp' "$1"; else stat -c '%a' "$1"; fi
}

file_owner() {
  if stat -f '%u:%g' "$1" >/dev/null 2>&1; then stat -f '%u:%g' "$1"; else stat -c '%u:%g' "$1"; fi
}

require_regular_file() {
  path=$1
  label=$2
  [ -f "$path" ] && [ ! -L "$path" ] || fail "$label ausente, não regular ou simbólico."
}

for command in docker openssl stat awk sed grep cmp git node shasum id tr wc install tar find rm chmod basename dirname; do
  command -v "$command" >/dev/null 2>&1 || fail "$command não está disponível."
done
[ "$(id -u)" -eq 0 ] || fail 'O preflight de runtime E2E deve ser executado como root.'

[ "${MAIOCCHI_CANARY_SSO_ENABLED:-}" = true ] || fail 'MAIOCCHI_CANARY_SSO_ENABLED deve ser exatamente true.'
[ -n "${DOCUSEAL_CANARY_DB_PASS:-}" ] || fail 'DOCUSEAL_CANARY_DB_PASS é obrigatório.'
[ -n "${DOCUSEAL_CANARY_SECRET_KEY_BASE:-}" ] || fail 'DOCUSEAL_CANARY_SECRET_KEY_BASE é obrigatório.'

docuseal_secrets=${DOCUSEAL_CANARY_SECRET_DIR:-}
uno_secrets=${UNO_CANARY_SECRETS_DIR:-}
case "$docuseal_secrets:$uno_secrets" in
  /*:/*) ;;
  *) fail 'Os diretórios de secrets devem ser absolutos.' ;;
esac
[ -d "$docuseal_secrets" ] && [ ! -L "$docuseal_secrets" ] || fail 'Diretório de secrets DocuSeal inválido.'
[ -d "$uno_secrets" ] && [ ! -L "$uno_secrets" ] || fail 'Diretório de secrets UNO inválido.'
docuseal_secrets=$(canonical_dir "$docuseal_secrets")
uno_secrets=$(canonical_dir "$uno_secrets")
[ "$docuseal_secrets" != "$uno_secrets" ] || fail 'O bind DocuSeal deve ser separado do diretório 0700 do UNO.'

runtime_uid=${UNO_CANARY_RUNTIME_UID:-10001}
runtime_gid=${UNO_CANARY_RUNTIME_GID:-10001}
docuseal_gid=${DOCUSEAL_CANARY_SECRET_GID:-3400}
gateway_gid=${SSO_E2E_GATEWAY_GID:-101}
for numeric in "$runtime_uid" "$runtime_gid" "$docuseal_gid" "$gateway_gid"; do
  printf '%s\n' "$numeric" | grep -Eq '^[1-9][0-9]*$' || fail 'UID/GID de runtime inválido.'
done

[ "$(file_mode "$uno_secrets")" = 700 ] || fail 'Diretório de secrets UNO deve possuir modo 0700.'
[ "$(file_owner "$uno_secrets")" = "$runtime_uid:$runtime_gid" ] || \
  fail 'Diretório de secrets UNO deve pertencer ao UID:GID do runtime canário.'
uno_client_secret="$uno_secrets/api_signature_sso_client_secret"
require_regular_file "$uno_client_secret" 'api_signature_sso_client_secret UNO'
case "$(file_mode "$uno_client_secret")" in 400 | 600) ;; *) fail 'api_signature_sso_client_secret UNO deve possuir modo 0400 ou 0600.' ;; esac
[ "$(file_owner "$uno_client_secret")" = "$runtime_uid:$runtime_gid" ] || \
  fail 'api_signature_sso_client_secret UNO deve pertencer ao UID:GID do runtime canário.'
e2e_staff_password="$uno_secrets/e2e_staff_password"
require_regular_file "$e2e_staff_password" 'e2e_staff_password UNO'
[ "$(file_mode "$e2e_staff_password")" = 400 ] || fail 'e2e_staff_password UNO deve possuir modo 0400.'
[ "$(file_owner "$e2e_staff_password")" = 0:0 ] || fail 'e2e_staff_password UNO deve pertencer a root:root.'

[ "$(file_mode "$docuseal_secrets")" = 750 ] || fail 'Diretório de secrets DocuSeal deve possuir modo 0750.'
[ "$(file_owner "$docuseal_secrets")" = "0:$docuseal_gid" ] || fail 'Diretório de secrets DocuSeal possui owner divergente.'
docuseal_client_secret="$docuseal_secrets/api_signature_sso_client_secret"
require_regular_file "$docuseal_client_secret" 'client secret DocuSeal'
[ "$(file_mode "$docuseal_client_secret")" = 440 ] || fail 'Client secret DocuSeal deve possuir modo 0440.'
[ "$(file_owner "$docuseal_client_secret")" = "0:$docuseal_gid" ] || fail 'Client secret DocuSeal possui owner divergente.'
cmp -s "$uno_client_secret" "$docuseal_client_secret" || \
  fail 'As cópias governadas do client secret UNO e DocuSeal divergem.'

ca_file=${SSO_E2E_CA_FILE:-}
cert_file=${SSO_E2E_CERT_FILE:-}
key_file=${SSO_E2E_KEY_FILE:-}
require_regular_file "$ca_file" 'CA E2E'
require_regular_file "$cert_file" 'certificado E2E'
require_regular_file "$key_file" 'chave E2E'
[ "$(file_mode "$key_file")" = 440 ] || fail 'A chave E2E deve possuir modo 0440.'
[ "$(file_owner "$key_file")" = "0:$gateway_gid" ] || fail 'A chave E2E deve pertencer ao grupo isolado do gateway.'

openssl verify -CAfile "$ca_file" "$cert_file" >/dev/null || fail 'A cadeia TLS E2E é inválida.'
openssl x509 -checkend 1800 -noout -in "$cert_file" >/dev/null || fail 'O certificado E2E expira em menos de 30 minutos.'
cert_pub=$(openssl x509 -in "$cert_file" -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256 | awk '{print $NF}')
key_pub=$(openssl pkey -in "$key_file" -pubout -outform DER | openssl dgst -sha256 | awk '{print $NF}')
[ "$cert_pub" = "$key_pub" ] || fail 'Certificado e chave TLS E2E não correspondem.'

san=$(openssl x509 -in "$cert_file" -noout -ext subjectAltName | sed -n '2,$p' | tr -d '[:space:]')
[ "$san" = 'DNS:uno-canary.maiocchi.adv.br,DNS:assinatura-canary.maiocchi.adv.br' ] || \
  fail 'A allowlist SAN do certificado E2E diverge.'

evidence_dir=${SSO_E2E_EVIDENCE_DIR:-}
case "$evidence_dir" in /*) ;; *) fail 'SSO_E2E_EVIDENCE_DIR deve ser absoluto.' ;; esac
[ -d "$evidence_dir" ] && [ ! -L "$evidence_dir" ] || fail 'Diretório de evidência E2E inválido.'
[ "$(file_mode "$evidence_dir")" = 700 ] || fail 'Diretório de evidência E2E deve possuir modo 0700.'
[ "$(file_owner "$evidence_dir")" = 0:0 ] || fail 'Diretório de evidência E2E deve pertencer a root:root.'
for evidence_name in \
  sso-e2e-runtime-envelope.json \
  sso-e2e-protocol-manifest.json \
  sso-e2e-teardown.json \
  sso-e2e-final-manifest.json
do
  [ ! -e "$evidence_dir/$evidence_name" ] && [ ! -L "$evidence_dir/$evidence_name" ] || \
    fail "A evidência $evidence_name desta execução já existe."
done
[ ! -e "$evidence_dir/probe-output" ] && [ ! -L "$evidence_dir/probe-output" ] || \
  fail 'O diretório de saída do probe desta execução já existe.'
[ ! -e "$evidence_dir/recipe-stage" ] && [ ! -L "$evidence_dir/recipe-stage" ] || \
  fail 'O staging de receita desta execução já existe.'

run_id=${SSO_E2E_RUN_ID:-}
printf '%s\n' "$run_id" | grep -Eq '^[0-9a-f]{12}-a[0-9]{2}$' || fail 'SSO_E2E_RUN_ID inválido.'
project_name="maiocchi-sso-$run_id"
runtime_root=${SSO_E2E_RUNTIME_ROOT:-}
[ "$runtime_root" = "/run/$project_name" ] || fail 'SSO_E2E_RUNTIME_ROOT diverge do run_id.'
[ -d "$runtime_root" ] && [ ! -L "$runtime_root" ] || fail 'Runtime efêmero E2E inválido.'
[ "$(file_mode "$runtime_root")" = 700 ] && [ "$(file_owner "$runtime_root")" = 0:0 ] || \
  fail 'Runtime efêmero E2E deve ser root:root 0700.'
runtime_marker="$runtime_root/.maiocchi-sso-e2e-runtime"
require_regular_file "$runtime_marker" 'marker do runtime E2E'
[ "$(file_mode "$runtime_marker")" = 400 ] && [ "$(file_owner "$runtime_marker")" = 0:0 ] || \
  fail 'Marker do runtime E2E deve ser root:root 0400.'
[ "$(sed -n '1p' "$runtime_marker")" = "$run_id" ] && [ "$(wc -l <"$runtime_marker" | awk '{print $1}')" -eq 1 ] || \
  fail 'Marker do runtime E2E diverge.'
[ "$docuseal_secrets" = "$runtime_root/docuseal-secrets" ] || fail 'Secret DocuSeal não pertence ao runtime efêmero.'
[ "$(find "$docuseal_secrets" -mindepth 1 -maxdepth 1 -print | wc -l | awk '{print $1}')" -eq 1 ] || \
  fail 'Diretório de secret DocuSeal não possui conteúdo fechado.'

probe_secrets=${SSO_E2E_PROBE_SECRET_DIR:-}
[ -d "$probe_secrets" ] && [ ! -L "$probe_secrets" ] || fail 'Diretório de secret do probe inválido.'
probe_secrets=$(canonical_dir "$probe_secrets")
[ "$probe_secrets" = "$runtime_root/probe-secrets" ] || fail 'Secret do probe não pertence ao runtime efêmero.'
[ "$(file_mode "$probe_secrets")" = 700 ] && [ "$(file_owner "$probe_secrets")" = 0:0 ] || \
  fail 'Diretório de secret do probe deve ser root:root 0700.'
[ "$(find "$probe_secrets" -mindepth 1 -maxdepth 1 -print | wc -l | awk '{print $1}')" -eq 1 ] || \
  fail 'Diretório de secret do probe não possui conteúdo fechado.'
probe_staff_password="$probe_secrets/e2e_staff_password"
require_regular_file "$probe_staff_password" 'cópia efêmera de e2e_staff_password'
[ "$(file_mode "$probe_staff_password")" = 400 ] && [ "$(file_owner "$probe_staff_password")" = 0:0 ] || \
  fail 'Cópia de e2e_staff_password deve ser root:root 0400.'
cmp -s "$e2e_staff_password" "$probe_staff_password" || fail 'Cópia efêmera de e2e_staff_password diverge da fonte UNO.'

pki_dir=$(canonical_dir "$(dirname -- "$ca_file")")
[ "$pki_dir" = "$runtime_root/pki" ] || fail 'PKI E2E não pertence ao runtime efêmero.'
[ "$ca_file" = "$runtime_root/pki/ca.crt" ] && [ "$cert_file" = "$runtime_root/pki/server.crt" ] && [ "$key_file" = "$runtime_root/pki/server.key" ] || \
  fail 'Paths dos arquivos PKI E2E divergem.'
[ "$(find "$pki_dir" -mindepth 1 -maxdepth 1 -print | wc -l | awk '{print $1}')" -eq 3 ] || fail 'PKI E2E não possui conteúdo fechado.'
[ "$(file_mode "$ca_file")" = 444 ] && [ "$(file_owner "$ca_file")" = 0:0 ] || fail 'CA E2E deve ser root:root 0444.'
[ "$(file_mode "$cert_file")" = 444 ] && [ "$(file_owner "$cert_file")" = 0:0 ] || fail 'Certificado E2E deve ser root:root 0444.'

signature_commit=${SSO_E2E_SIGNATURE_RECIPE_COMMIT:-}
uno_commit=${SSO_E2E_UNO_RECIPE_COMMIT:-}
printf '%s\n' "$signature_commit" | grep -Eq '^[0-9a-f]{40}$' || fail 'Commit da receita de assinaturas inválido.'
printf '%s\n' "$uno_commit" | grep -Eq '^[0-9a-f]{40}$' || fail 'Commit da receita UNO inválido.'
allowed_signers=${SSO_E2E_ALLOWED_SIGNERS_FILE:-}
require_regular_file "$allowed_signers" 'arquivo allowed_signers E2E'
case "$(file_mode "$allowed_signers")" in 444 | 644) ;; *) fail 'allowed_signers E2E deve possuir modo 0444 ou 0644.' ;; esac
[ "$(file_owner "$allowed_signers")" = 0:0 ] || fail 'allowed_signers E2E deve pertencer a root:root.'
allowed_signers_sha=$(shasum -a 256 "$allowed_signers" | awk '{print $1}')

[ "$(git -C "$repo_dir" rev-parse HEAD)" = "$signature_commit" ] || fail 'Checkout de assinaturas diverge do commit declarado.'
git -C "$repo_dir" -c gpg.ssh.allowedSignersFile="$allowed_signers" verify-commit "$signature_commit" >/dev/null 2>&1 || \
  fail 'Commit de assinaturas não possui assinatura válida pela política declarada.'
git -C "$repo_dir" diff --quiet --no-ext-diff -- || fail 'Worktree de assinaturas possui alterações rastreadas.'
git -C "$repo_dir" diff --cached --quiet --no-ext-diff -- || fail 'Index de assinaturas possui alterações.'
signature_tree=$(git -C "$repo_dir" rev-parse "${signature_commit}^{tree}")

uno_source_dir=${SSO_E2E_UNO_SOURCE_DIR:-}
case "$uno_source_dir" in /*) ;; *) fail 'SSO_E2E_UNO_SOURCE_DIR deve ser absoluto.' ;; esac
[ -e "$uno_source_dir/.git" ] && [ ! -L "$uno_source_dir" ] || fail 'Checkout fonte UNO inválido.'
uno_source_dir=$(canonical_dir "$uno_source_dir")
[ "$(git -C "$uno_source_dir" rev-parse --is-inside-work-tree)" = true ] || fail 'SSO_E2E_UNO_SOURCE_DIR não é worktree Git.'
[ "$(git -C "$uno_source_dir" rev-parse HEAD)" = "$uno_commit" ] || fail 'Checkout UNO diverge do commit declarado.'
git -C "$uno_source_dir" -c gpg.ssh.allowedSignersFile="$allowed_signers" verify-commit "$uno_commit" >/dev/null 2>&1 || \
  fail 'Commit UNO não possui assinatura válida pela política declarada.'
git -C "$uno_source_dir" diff --quiet --no-ext-diff -- || fail 'Worktree UNO possui alterações rastreadas.'
git -C "$uno_source_dir" diff --cached --quiet --no-ext-diff -- || fail 'Index UNO possui alterações.'
uno_tree=$(git -C "$uno_source_dir" rev-parse "${uno_commit}^{tree}")

portal_candidate_image=${PORTAL_SSO_CANDIDATE_IMAGE_ID:-}
docuseal_candidate_image=${DOCUSEAL_SSO_CANDIDATE_IMAGE_ID:-}
for image_id in "$portal_candidate_image" "$docuseal_candidate_image"; do
  printf '%s\n' "$image_id" | grep -Eq '^sha256:[0-9a-f]{64}$' || fail 'Image ID candidato inválido.'
done

http_verifier_image=${SSO_E2E_HTTP_VERIFIER_IMAGE_ID:-}
db_verifier_image=${SSO_E2E_DB_VERIFIER_IMAGE_ID:-}
gateway_image=${SSO_E2E_GATEWAY_IMAGE_ID:-}
for image_id in "$http_verifier_image" "$db_verifier_image" "$gateway_image"; do
  printf '%s\n' "$image_id" | grep -Eq '^sha256:[0-9a-f]{64}$' || fail 'Image ID do laboratório E2E inválido.'
done
http_verifier_ref='ruby@sha256:f48938e9ae72a4d32e728b03c306e7a7ff21f0cb6c2ed33f44a078c700b2aea6'
db_verifier_ref='postgres@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777'
gateway_ref='nginxinc/nginx-unprivileged@sha256:3b24c4bfb2b9f60359b1475605ca1c8ed6e4963eb8369c6835be4d96bdb3ea81'
for binding in \
  "$http_verifier_image|$http_verifier_ref" \
  "$db_verifier_image|$db_verifier_ref" \
  "$gateway_image|$gateway_ref"
do
  image_id=${binding%%|*}
  repo_digest=${binding#*|}
  docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image_id" | grep -Fx "$repo_digest" >/dev/null || \
    fail 'Image do laboratório diverge do repo digest fechado.'
done

uno_network=${UNO_SSO_CANDIDATE_NETWORK:-}
printf '%s\n' "$uno_network" | grep -Eq '^maiocchi-uno-canary-(blue|green)_canary-internal$' || \
  fail 'UNO_SSO_CANDIDATE_NETWORK não pertence a um slot canário permitido.'

network_contract=$(docker network inspect --format \
  '{{.Internal}}|{{index .Labels "com.docker.compose.network"}}|{{index .Labels "com.docker.compose.project"}}' \
  "$uno_network" 2>/dev/null) || fail 'Rede interna do UNO canário não encontrada.'
slot=$(printf '%s\n' "$uno_network" | sed -E 's/^maiocchi-uno-canary-(blue|green)_canary-internal$/\1/')
[ "$network_contract" = "true|canary-internal|maiocchi-uno-canary-$slot" ] || \
  fail 'Rede UNO não satisfaz o contrato interno e de propriedade do Compose.'

uno_project="maiocchi-uno-canary-$slot"
inspect_uno_service() {
  service=$1
  ids=$(docker ps --no-trunc --quiet \
    --filter "label=com.docker.compose.project=$uno_project" \
    --filter "label=com.docker.compose.service=$service")
  [ "$(printf '%s\n' "$ids" | sed '/^$/d' | wc -l | awk '{print $1}')" -eq 1 ] || \
    fail "Serviço UNO $service não possui cardinalidade unitária."
  container_id=$(printf '%s\n' "$ids" | sed -n '1p')
  printf '%s\n' "$container_id" | grep -Eq '^[0-9a-f]{64}$' || fail "Container UNO $service não é imutável."
  state=$(docker inspect --format '{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container_id")
  [ "$state" = 'true|healthy' ] || fail "Serviço UNO $service não está saudável."
  attachment=$(docker inspect --format "{{with index .NetworkSettings.Networks \"$uno_network\"}}attached{{end}}" "$container_id")
  [ "$attachment" = attached ] || fail "Serviço UNO $service não pertence à rede esperada."
  image_id=$(docker inspect --format '{{.Image}}' "$container_id")
  printf '%s\n' "$image_id" | grep -Eq '^sha256:[0-9a-f]{64}$' || fail "Image ID UNO $service inválido."
  revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_id")
  [ "$revision" = "$uno_commit" ] || fail "Imagem UNO $service diverge do commit assinado declarado."
  printf '%s|%s\n' "$container_id" "$image_id"
}

portal_runtime=$(inspect_uno_service maiocchi-uno-canary-portal)
api_runtime=$(inspect_uno_service maiocchi-uno-canary-api)
uno_portal_container=${portal_runtime%%|*}
uno_portal_image=${portal_runtime#*|}
uno_api_container=${api_runtime%%|*}
uno_api_image=${api_runtime#*|}
network_id=$(docker network inspect --format '{{.Id}}' "$uno_network")
printf '%s\n' "$network_id" | grep -Eq '^[0-9a-f]{64}$' || fail 'Network ID UNO inválido.'

uno_data_project="maiocchi-uno-canary-data-$slot"
uno_data_network="maiocchi-uno-canary-$slot-data"
data_network_contract=$(docker network inspect --format \
  '{{.Id}}|{{.Internal}}|{{index .Labels "com.maiocchi.data-class"}}|{{index .Labels "com.docker.compose.project"}}' \
  "$uno_data_network" 2>/dev/null) || fail 'Rede de dados sintéticos UNO não encontrada.'
uno_data_network_id=${data_network_contract%%|*}
[ "$data_network_contract" = "$uno_data_network_id|true|synthetic-only|$uno_data_project" ] || \
  fail 'Rede de dados UNO diverge do contrato synthetic-only.'
printf '%s\n' "$uno_data_network_id" | grep -Eq '^[0-9a-f]{64}$' || fail 'Network ID de dados UNO inválido.'

uno_db_ids=$(docker ps --no-trunc --quiet \
  --filter "label=com.docker.compose.project=$uno_data_project" \
  --filter 'label=com.docker.compose.service=maiocchi-uno-canary-postgres')
[ "$(printf '%s\n' "$uno_db_ids" | sed '/^$/d' | wc -l | awk '{print $1}')" -eq 1 ] || \
  fail 'PostgreSQL UNO sintético não possui cardinalidade unitária.'
uno_db_container=$(printf '%s\n' "$uno_db_ids" | sed -n '1p')
printf '%s\n' "$uno_db_container" | grep -Eq '^[0-9a-f]{64}$' || fail 'Container PostgreSQL UNO inválido.'
uno_db_state=$(docker inspect --format '{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$uno_db_container")
[ "$uno_db_state" = 'true|healthy' ] || fail 'PostgreSQL UNO sintético não está saudável.'
uno_db_attachment=$(docker inspect --format "{{with index .NetworkSettings.Networks \"$uno_data_network\"}}attached{{end}}" "$uno_db_container")
[ "$uno_db_attachment" = attached ] || fail 'PostgreSQL UNO não pertence à rede de dados sintéticos.'
uno_db_image=$(docker inspect --format '{{.Image}}' "$uno_db_container")
printf '%s\n' "$uno_db_image" | grep -Eq '^sha256:[0-9a-f]{64}$' || fail 'Image ID PostgreSQL UNO inválido.'
uno_db_name="maiocchi_uno_${slot}_synthetic_canary"
uno_db_user=maiocchi_canary_admin
uno_db_env=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$uno_db_container")
[ "$(printf '%s\n' "$uno_db_env" | grep -Fxc "POSTGRES_DB=$uno_db_name")" -eq 1 ] || fail 'Database UNO sintético divergente.'
[ "$(printf '%s\n' "$uno_db_env" | grep -Fxc "POSTGRES_USER=$uno_db_user")" -eq 1 ] || fail 'Role administrativa UNO sintética divergente.'

stage_dir="$evidence_dir/recipe-stage"
stage_archive="$evidence_dir/.recipe-stage.tar"
install -d -o 0 -g 0 -m 0700 "$stage_dir"
git -C "$repo_dir" archive --format=tar --output="$stage_archive" "$signature_commit" -- \
  deploy/portal-sso.candidate.yml \
  deploy/docuseal-sso.candidate.yml \
  deploy/sso-e2e-gateway.candidate.yml \
  deploy/sso-e2e/gateway.conf \
  deploy/sso-e2e/docuseal-sso-bootstrap.rb \
  deploy/sso-e2e/sso-e2e-probe.rb \
  deploy/sso-e2e/verify-docuseal-sso-db.sh \
  scripts/run-sso-candidate-compose.sh \
  scripts/validate-sso-e2e-runtime.sh \
  scripts/generate-sso-e2e-canary-pki.sh \
  scripts/provision-docuseal-sso-canary-secret.sh \
  scripts/finalize-sso-e2e-evidence.mjs \
  scripts/finalize-sso-e2e-teardown.mjs
tar -xf "$stage_archive" -C "$stage_dir"
rm -f -- "$stage_archive"
find "$stage_dir" -type f -exec chmod 0444 {} +
find "$stage_dir" -type d -exec chmod 0555 {} +

cert_sha=$(shasum -a 256 "$cert_file" | awk '{print $1}')
portal_compose_sha=$(shasum -a 256 "$stage_dir/deploy/portal-sso.candidate.yml" | awk '{print $1}')
docuseal_compose_sha=$(shasum -a 256 "$stage_dir/deploy/docuseal-sso.candidate.yml" | awk '{print $1}')
gateway_compose_sha=$(shasum -a 256 "$stage_dir/deploy/sso-e2e-gateway.candidate.yml" | awk '{print $1}')
gateway_config_sha=$(shasum -a 256 "$stage_dir/deploy/sso-e2e/gateway.conf" | awk '{print $1}')
bootstrap_sha=$(shasum -a 256 "$stage_dir/deploy/sso-e2e/docuseal-sso-bootstrap.rb" | awk '{print $1}')
probe_sha=$(shasum -a 256 "$stage_dir/deploy/sso-e2e/sso-e2e-probe.rb" | awk '{print $1}')
db_verifier_sha=$(shasum -a 256 "$stage_dir/deploy/sso-e2e/verify-docuseal-sso-db.sh" | awk '{print $1}')
runner_sha=$(shasum -a 256 "$stage_dir/scripts/run-sso-candidate-compose.sh" | awk '{print $1}')
runtime_preflight_sha=$(shasum -a 256 "$stage_dir/scripts/validate-sso-e2e-runtime.sh" | awk '{print $1}')
pki_generator_sha=$(shasum -a 256 "$stage_dir/scripts/generate-sso-e2e-canary-pki.sh" | awk '{print $1}')
secret_provisioner_sha=$(shasum -a 256 "$stage_dir/scripts/provision-docuseal-sso-canary-secret.sh" | awk '{print $1}')
evidence_finalizer_sha=$(shasum -a 256 "$stage_dir/scripts/finalize-sso-e2e-evidence.mjs" | awk '{print $1}')
teardown_finalizer_sha=$(shasum -a 256 "$stage_dir/scripts/finalize-sso-e2e-teardown.mjs" | awk '{print $1}')

runtime_envelope="$evidence_dir/sso-e2e-runtime-envelope.json"
install -d -o 0 -g 0 -m 0700 "$evidence_dir/probe-output"
node - "$runtime_envelope" "$run_id" "$signature_commit" "$signature_tree" \
  "$portal_candidate_image" "$docuseal_candidate_image" \
  "$http_verifier_image" "$db_verifier_image" "$gateway_image" \
  "$uno_commit" "$uno_tree" "$uno_network" "$network_id" \
  "$uno_portal_container" "$uno_portal_image" "$uno_api_container" "$uno_api_image" \
  "$uno_data_network" "$uno_data_network_id" "$uno_db_container" "$uno_db_image" "$uno_db_name" "$uno_db_user" \
  "$cert_sha" "$allowed_signers_sha" \
  "$portal_compose_sha" "$docuseal_compose_sha" "$gateway_compose_sha" "$gateway_config_sha" \
  "$bootstrap_sha" "$probe_sha" "$db_verifier_sha" "$runner_sha" "$runtime_preflight_sha" "$pki_generator_sha" \
  "$secret_provisioner_sha" "$evidence_finalizer_sha" "$teardown_finalizer_sha" <<'NODE'
const fs = require('node:fs');

const [
  output, runId, signatureCommit, signatureTree, portalCandidateImage,
  docusealCandidateImage, httpVerifierImage, dbVerifierImage, gatewayImage,
  unoCommit, unoTree, unoNetwork, networkId, unoPortalContainer,
  unoPortalImage, unoApiContainer, unoApiImage, unoDataNetwork, unoDataNetworkId,
  unoDbContainer, unoDbImage, unoDbName, unoDbUser, certificateSha256, allowedSignersSha256,
  portalComposeSha256, docusealComposeSha256, gatewayComposeSha256,
  gatewayConfigSha256, bootstrapSha256, probeSha256, dbVerifierSha256, runnerSha256,
  runtimePreflightSha256, pkiGeneratorSha256, secretProvisionerSha256,
  evidenceFinalizerSha256, teardownFinalizerSha256,
] = process.argv.slice(2);

const envelope = {
  schema: 'maiocchi.sso-e2e-runtime-envelope.v1',
  generated_at: new Date().toISOString(),
  run_id: runId,
  data_class: 'synthetic-only',
  public_exposure: false,
  signature_recipe: { commit: signatureCommit, tree: signatureTree },
  signature_images: {
    portal: portalCandidateImage,
    docuseal: docusealCandidateImage,
  },
  lab_images: {
    http_probe: {
      reference: 'ruby@sha256:f48938e9ae72a4d32e728b03c306e7a7ff21f0cb6c2ed33f44a078c700b2aea6',
      image_id: httpVerifierImage,
    },
    database_verifier: {
      reference: 'postgres@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777',
      image_id: dbVerifierImage,
    },
    tls_gateway: {
      reference: 'nginxinc/nginx-unprivileged@sha256:3b24c4bfb2b9f60359b1475605ca1c8ed6e4963eb8369c6835be4d96bdb3ea81',
      image_id: gatewayImage,
    },
  },
  uno_recipe: { commit: unoCommit, tree: unoTree },
  uno_runtime: {
    network: { name: unoNetwork, id: networkId },
    data_network: { name: unoDataNetwork, id: unoDataNetworkId },
    portal: { container_id: unoPortalContainer, image_id: unoPortalImage },
    api: { container_id: unoApiContainer, image_id: unoApiImage },
    database: {
      container_id: unoDbContainer,
      image_id: unoDbImage,
      database: unoDbName,
      user: unoDbUser,
    },
  },
  tls_certificate_sha256: certificateSha256,
  trust_policy_sha256: allowedSignersSha256,
  source_bindings: {
    portal_compose_sha256: portalComposeSha256,
    docuseal_compose_sha256: docusealComposeSha256,
    gateway_compose_sha256: gatewayComposeSha256,
    gateway_config_sha256: gatewayConfigSha256,
    docuseal_bootstrap_sha256: bootstrapSha256,
    protocol_probe_sha256: probeSha256,
    database_verifier_sha256: dbVerifierSha256,
    runner_sha256: runnerSha256,
    runtime_preflight_sha256: runtimePreflightSha256,
    pki_generator_sha256: pkiGeneratorSha256,
    secret_provisioner_sha256: secretProvisionerSha256,
    evidence_finalizer_sha256: evidenceFinalizerSha256,
    teardown_finalizer_sha256: teardownFinalizerSha256,
  },
};

fs.writeFileSync(output, `${JSON.stringify(envelope, null, 2)}\n`, {
  flag: 'wx', mode: 0o400,
});
NODE
[ "$(file_mode "$runtime_envelope")" = 400 ] || fail 'Envelope de runtime possui modo divergente.'
[ "$(file_owner "$runtime_envelope")" = 0:0 ] || fail 'Envelope de runtime possui owner divergente.'

printf '%s\n' 'Runtime E2E: PKI, secrets, evidência e rede UNO validados.'
