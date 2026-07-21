#!/bin/sh
set -eu
umask 077

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
image_validator="$repo_dir/scripts/validate-sso-candidate-images.sh"
runtime_validator="$repo_dir/scripts/validate-sso-e2e-runtime.sh"
evidence_finalizer="$repo_dir/scripts/finalize-sso-e2e-evidence.mjs"
teardown_finalizer="$repo_dir/scripts/finalize-sso-e2e-teardown.mjs"
project_name=
compose_root=$repo_dir
runtime_root=
lock_dir=

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

file_mode() {
  if stat -f '%Lp' "$1" >/dev/null 2>&1; then stat -f '%Lp' "$1"; else stat -c '%a' "$1"; fi
}

file_owner() {
  if stat -f '%u:%g' "$1" >/dev/null 2>&1; then stat -f '%u:%g' "$1"; else stat -c '%u:%g' "$1"; fi
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

validate_local_recipe() {
  allowed_signers=${SSO_E2E_ALLOWED_SIGNERS_FILE:?SSO_E2E_ALLOWED_SIGNERS_FILE é obrigatório}
  [ -f "$allowed_signers" ] && [ ! -L "$allowed_signers" ] || fail 'Arquivo allowed_signers E2E inválido.'
  SSO_E2E_SIGNATURE_RECIPE_COMMIT=$(git -C "$repo_dir" rev-parse HEAD)
  printf '%s\n' "$SSO_E2E_SIGNATURE_RECIPE_COMMIT" | grep -Eq '^[0-9a-f]{40}$' || fail 'Commit da receita E2E inválido.'
  git -C "$repo_dir" -c gpg.ssh.allowedSignersFile="$allowed_signers" verify-commit "$SSO_E2E_SIGNATURE_RECIPE_COMMIT" >/dev/null 2>&1 || \
    fail 'Receita E2E não possui assinatura válida pela política declarada.'
  git -C "$repo_dir" diff --quiet --no-ext-diff -- || fail 'Receita E2E possui alterações rastreadas.'
  git -C "$repo_dir" diff --cached --quiet --no-ext-diff -- || fail 'Index da receita E2E possui alterações.'
  export SSO_E2E_SIGNATURE_RECIPE_COMMIT
}

resolve_pinned_image() {
  reference=$1
  exact_repo_digest=$2
  docker image pull --quiet "$reference" >/dev/null
  image_id=$(docker image inspect --format '{{.Id}}' "$reference") || fail 'Image pin do laboratório não pôde ser inspecionado.'
  printf '%s\n' "$image_id" | grep -Eq '^sha256:[0-9a-f]{64}$' || fail 'Image ID do laboratório inválido.'
  docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$image_id" | grep -Fx "$exact_repo_digest" >/dev/null || \
    fail 'Image local do laboratório não está vinculada ao repo digest fechado.'
  printf '%s\n' "$image_id"
}

materialize_lab_images() {
  ruby_ref='ruby:4.0.5-alpine@sha256:f48938e9ae72a4d32e728b03c306e7a7ff21f0cb6c2ed33f44a078c700b2aea6'
  ruby_digest='ruby@sha256:f48938e9ae72a4d32e728b03c306e7a7ff21f0cb6c2ed33f44a078c700b2aea6'
  postgres_ref='postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777'
  postgres_digest='postgres@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777'
  gateway_ref='nginxinc/nginx-unprivileged:1.30.3-alpine3.23-slim@sha256:3b24c4bfb2b9f60359b1475605ca1c8ed6e4963eb8369c6835be4d96bdb3ea81'
  gateway_digest='nginxinc/nginx-unprivileged@sha256:3b24c4bfb2b9f60359b1475605ca1c8ed6e4963eb8369c6835be4d96bdb3ea81'
  SSO_E2E_HTTP_VERIFIER_IMAGE_ID=$(resolve_pinned_image "$ruby_ref" "$ruby_digest")
  SSO_E2E_DB_VERIFIER_IMAGE_ID=$(resolve_pinned_image "$postgres_ref" "$postgres_digest")
  SSO_E2E_GATEWAY_IMAGE_ID=$(resolve_pinned_image "$gateway_ref" "$gateway_digest")
  export SSO_E2E_HTTP_VERIFIER_IMAGE_ID SSO_E2E_DB_VERIFIER_IMAGE_ID SSO_E2E_GATEWAY_IMAGE_ID
}

compose() {
  docker compose \
    --project-name "$project_name" \
    --project-directory "$compose_root" \
    --env-file /dev/null \
    --file "$compose_root/deploy/portal-sso.candidate.yml" \
    --file "$compose_root/deploy/docuseal-sso.candidate.yml" \
    --file "$compose_root/deploy/sso-e2e-gateway.candidate.yml" \
    "$@"
}

activate_recipe_stage() {
  stage_dir=${SSO_E2E_EVIDENCE_DIR:?SSO_E2E_EVIDENCE_DIR é obrigatório}/recipe-stage
  [ -d "$stage_dir" ] && [ ! -L "$stage_dir" ] || fail 'Staging imutável da receita E2E ausente.'
  compose_root=$stage_dir
  evidence_finalizer="$stage_dir/scripts/finalize-sso-e2e-evidence.mjs"
  teardown_finalizer="$stage_dir/scripts/finalize-sso-e2e-teardown.mjs"
  [ -f "$evidence_finalizer" ] && [ ! -L "$evidence_finalizer" ] || fail 'Finalizador de protocolo staged inválido.'
  [ -f "$teardown_finalizer" ] && [ ! -L "$teardown_finalizer" ] || fail 'Finalizador de teardown staged inválido.'
}

assert_project_absent() {
  containers=$(docker container ls --all --quiet --filter "label=com.docker.compose.project=$project_name")
  networks=$(docker network ls --quiet --filter "label=com.docker.compose.project=$project_name")
  volumes=$(docker volume ls --quiet --filter "label=com.docker.compose.project=$project_name")
  [ -z "$containers$networks$volumes" ] || fail 'Já existem recursos Docker para o run_id E2E.'
}

acquire_run_lock() {
  lock_dir="/run/lock/$project_name.lock"
  mkdir -m 0700 "$lock_dir" 2>/dev/null || fail 'run_id E2E já está bloqueado por outra execução.'
  e2e_lock_active=true
  [ "$(file_owner "$lock_dir")" = 0:0 ] || fail 'Lock E2E possui owner divergente.'
}

release_run_lock() {
  [ "$lock_dir" = "/run/lock/$project_name.lock" ] || fail 'Path do lock E2E diverge.'
  [ -d "$lock_dir" ] && [ ! -L "$lock_dir" ] || fail 'Lock E2E ausente ou simbólico.'
  [ -z "$(find "$lock_dir" -mindepth 1 -maxdepth 1 -print -quit)" ] || fail 'Lock E2E contém artefatos inesperados.'
  rmdir "$lock_dir"
  e2e_lock_active=false
}

prepare_runtime_materials() {
  [ "$(id -u)" -eq 0 ] || fail 'O laboratório E2E exige root.'
  source_uno_secrets=${UNO_CANARY_SECRETS_DIR:?UNO_CANARY_SECRETS_DIR é obrigatório}
  [ -d "$source_uno_secrets" ] && [ ! -L "$source_uno_secrets" ] || fail 'Diretório de secrets UNO inválido.'
  source_uno_secrets=$(CDPATH='' cd -- "$source_uno_secrets" && pwd -P)
  runtime_root="/run/$project_name"
  [ ! -e "$runtime_root" ] && [ ! -L "$runtime_root" ] || fail 'Runtime efêmero E2E já existe.'
  mkdir -m 0700 "$runtime_root"
  e2e_runtime_active=true
  (set -C; printf '%s\n' "$run_id" >"$runtime_root/.maiocchi-sso-e2e-runtime") || fail 'Não foi possível criar marker E2E.'
  chmod 0400 "$runtime_root/.maiocchi-sso-e2e-runtime"

  "$repo_dir/scripts/generate-sso-e2e-canary-pki.sh" "$runtime_root/pki"
  "$repo_dir/scripts/provision-docuseal-sso-canary-secret.sh" \
    "$source_uno_secrets/api_signature_sso_client_secret" \
    "$runtime_root/docuseal-secrets" "${DOCUSEAL_CANARY_SECRET_GID:-3400}"
  install -d -o 0 -g 0 -m 0700 "$runtime_root/probe-secrets"
  install -o 0 -g 0 -m 0400 "$source_uno_secrets/e2e_staff_password" \
    "$runtime_root/probe-secrets/e2e_staff_password"
  cmp -s "$source_uno_secrets/e2e_staff_password" "$runtime_root/probe-secrets/e2e_staff_password" || \
    fail 'A cópia efêmera do password sintético divergiu.'

  DOCUSEAL_CANARY_SECRET_DIR="$runtime_root/docuseal-secrets"
  SSO_E2E_PROBE_SECRET_DIR="$runtime_root/probe-secrets"
  SSO_E2E_CA_FILE="$runtime_root/pki/ca.crt"
  SSO_E2E_CERT_FILE="$runtime_root/pki/server.crt"
  SSO_E2E_KEY_FILE="$runtime_root/pki/server.key"
  SSO_E2E_RUNTIME_ROOT=$runtime_root
  export DOCUSEAL_CANARY_SECRET_DIR SSO_E2E_PROBE_SECRET_DIR
  export SSO_E2E_CA_FILE SSO_E2E_CERT_FILE SSO_E2E_KEY_FILE SSO_E2E_RUNTIME_ROOT
}

cleanup_runtime_materials() {
  [ "$runtime_root" = "/run/$project_name" ] || fail 'Path do runtime efêmero diverge.'
  [ -d "$runtime_root" ] && [ ! -L "$runtime_root" ] || fail 'Runtime efêmero ausente ou simbólico.'
  [ "$(file_mode "$runtime_root")" = 700 ] && [ "$(file_owner "$runtime_root")" = 0:0 ] || \
    fail 'Runtime efêmero possui modo/owner divergente.'
  if [ -e "$runtime_root/.maiocchi-sso-e2e-runtime" ] || [ -L "$runtime_root/.maiocchi-sso-e2e-runtime" ]; then
    [ -f "$runtime_root/.maiocchi-sso-e2e-runtime" ] && [ ! -L "$runtime_root/.maiocchi-sso-e2e-runtime" ] || fail 'Marker do runtime inválido.'
    [ "$(sed -n '1p' "$runtime_root/.maiocchi-sso-e2e-runtime")" = "$run_id" ] || fail 'Marker do runtime diverge.'
  fi
  while IFS= read -r child; do
    [ -n "$child" ] || continue
    case "$child" in
      "$runtime_root/.maiocchi-sso-e2e-runtime")
        [ -f "$child" ] && [ ! -L "$child" ] || fail 'Marker do runtime possui tipo divergente.'
        ;;
      "$runtime_root/docuseal-secrets" | "$runtime_root/pki" | "$runtime_root/probe-secrets")
        [ -d "$child" ] && [ ! -L "$child" ] || fail 'Subdiretório do runtime possui tipo divergente.'
        ;;
      *) fail 'Runtime efêmero contém path inesperado.' ;;
    esac
  done <<EOF
$(find "$runtime_root" -mindepth 1 -maxdepth 1 -print)
EOF
  if [ -d "$runtime_root/pki" ] && [ ! -L "$runtime_root/pki" ]; then
    while IFS= read -r child; do
      [ -n "$child" ] || continue
      case "$child" in "$runtime_root/pki/ca.crt" | "$runtime_root/pki/server.crt" | "$runtime_root/pki/server.key") ;; *) fail 'PKI efêmera contém path inesperado.' ;; esac
    done <<EOF
$(find "$runtime_root/pki" -mindepth 1 -maxdepth 1 -print)
EOF
  fi
  if [ -d "$runtime_root/docuseal-secrets" ] && [ ! -L "$runtime_root/docuseal-secrets" ]; then
    [ "$(find "$runtime_root/docuseal-secrets" -mindepth 1 -maxdepth 1 -print | wc -l | awk '{print $1}')" -le 1 ] || fail 'Secret DocuSeal efêmero possui cardinalidade divergente.'
    while IFS= read -r child; do
      [ -n "$child" ] || continue
      [ "$child" = "$runtime_root/docuseal-secrets/api_signature_sso_client_secret" ] || fail 'Secret DocuSeal efêmero contém path inesperado.'
    done <<EOF
$(find "$runtime_root/docuseal-secrets" -mindepth 1 -maxdepth 1 -print)
EOF
  fi
  if [ -d "$runtime_root/probe-secrets" ] && [ ! -L "$runtime_root/probe-secrets" ]; then
    [ "$(find "$runtime_root/probe-secrets" -mindepth 1 -maxdepth 1 -print | wc -l | awk '{print $1}')" -le 1 ] || fail 'Secret do probe possui cardinalidade divergente.'
    while IFS= read -r child; do
      [ -n "$child" ] || continue
      [ "$child" = "$runtime_root/probe-secrets/e2e_staff_password" ] || fail 'Secret do probe contém path inesperado.'
    done <<EOF
$(find "$runtime_root/probe-secrets" -mindepth 1 -maxdepth 1 -print)
EOF
  fi
  rm -f -- \
    "$runtime_root/pki/ca.crt" "$runtime_root/pki/server.crt" "$runtime_root/pki/server.key" \
    "$runtime_root/docuseal-secrets/api_signature_sso_client_secret" \
    "$runtime_root/probe-secrets/e2e_staff_password" \
    "$runtime_root/.maiocchi-sso-e2e-runtime"
  [ ! -d "$runtime_root/pki" ] || rmdir "$runtime_root/pki"
  [ ! -d "$runtime_root/docuseal-secrets" ] || rmdir "$runtime_root/docuseal-secrets"
  [ ! -d "$runtime_root/probe-secrets" ] || rmdir "$runtime_root/probe-secrets"
  rmdir "$runtime_root"
  [ ! -e "$runtime_root" ] && [ ! -L "$runtime_root" ] || fail 'Runtime efêmero não foi integralmente removido.'
  e2e_runtime_active=false
}

load_candidate_images() {
  portal_evidence_dir=${PORTAL_SSO_EVIDENCE_DIR:-}
  docuseal_evidence_dir=${DOCUSEAL_SSO_EVIDENCE_DIR:-}
  PORTAL_SSO_CANDIDATE_IMAGE_ID=$(read_image_id "$portal_evidence_dir" 'portal-1.15.1.image-id.txt' 'Portal')
  DOCUSEAL_SSO_CANDIDATE_IMAGE_ID=$(read_image_id "$docuseal_evidence_dir" 'docuseal-3.0.1-maiocchi.15.image-id.txt' 'DocuSeal')
  export PORTAL_SSO_CANDIDATE_IMAGE_ID DOCUSEAL_SSO_CANDIDATE_IMAGE_ID
}

validate_up_contract() {
  [ -x "$image_validator" ] || fail 'Preflight de imagens ausente ou não executável.'
  [ -x "$runtime_validator" ] || fail 'Preflight de runtime E2E ausente ou não executável.'
  [ -f "$evidence_finalizer" ] && [ ! -L "$evidence_finalizer" ] || fail 'Finalizador de evidência E2E ausente ou simbólico.'
  [ -f "$teardown_finalizer" ] && [ ! -L "$teardown_finalizer" ] || fail 'Finalizador de teardown E2E ausente ou simbólico.'
  load_candidate_images
  "$image_validator"
  "$runtime_validator"
  activate_recipe_stage
  compose config --quiet
}

up_stack() {
  validate_up_contract
  compose up \
    --detach \
    --wait \
    --wait-timeout 900 \
    --force-recreate \
    --remove-orphans \
    portal-sso-candidate \
    docuseal-sso-candidate \
    sso-e2e-gateway-candidate
}

down_stack() {
  zero_id=sha256:0000000000000000000000000000000000000000000000000000000000000000
  PORTAL_SSO_CANDIDATE_IMAGE_ID=${PORTAL_SSO_CANDIDATE_IMAGE_ID:-$zero_id}
  DOCUSEAL_SSO_CANDIDATE_IMAGE_ID=${DOCUSEAL_SSO_CANDIDATE_IMAGE_ID:-$zero_id}
  DOCUSEAL_CANARY_DB_PASS=${DOCUSEAL_CANARY_DB_PASS:-unused-candidate-teardown}
  DOCUSEAL_CANARY_SECRET_KEY_BASE=${DOCUSEAL_CANARY_SECRET_KEY_BASE:-unused-candidate-teardown}
  DOCUSEAL_CANARY_SECRET_DIR=${DOCUSEAL_CANARY_SECRET_DIR:-/tmp}
  UNO_CANARY_SECRETS_DIR=${UNO_CANARY_SECRETS_DIR:-/tmp}
  SSO_E2E_CA_FILE=${SSO_E2E_CA_FILE:-/dev/null}
  SSO_E2E_CERT_FILE=${SSO_E2E_CERT_FILE:-/dev/null}
  SSO_E2E_KEY_FILE=${SSO_E2E_KEY_FILE:-/dev/null}
  SSO_E2E_EVIDENCE_DIR=${SSO_E2E_EVIDENCE_DIR:-/tmp}
  UNO_SSO_CANDIDATE_NETWORK=${UNO_SSO_CANDIDATE_NETWORK:-maiocchi-uno-canary-blue_canary-internal}
  SSO_E2E_HTTP_VERIFIER_IMAGE_ID=${SSO_E2E_HTTP_VERIFIER_IMAGE_ID:-$zero_id}
  SSO_E2E_DB_VERIFIER_IMAGE_ID=${SSO_E2E_DB_VERIFIER_IMAGE_ID:-$zero_id}
  SSO_E2E_GATEWAY_IMAGE_ID=${SSO_E2E_GATEWAY_IMAGE_ID:-$zero_id}
  export PORTAL_SSO_CANDIDATE_IMAGE_ID DOCUSEAL_SSO_CANDIDATE_IMAGE_ID
  export DOCUSEAL_CANARY_DB_PASS DOCUSEAL_CANARY_SECRET_KEY_BASE DOCUSEAL_CANARY_SECRET_DIR
  export UNO_CANARY_SECRETS_DIR SSO_E2E_CA_FILE SSO_E2E_CERT_FILE SSO_E2E_KEY_FILE
  export SSO_E2E_EVIDENCE_DIR UNO_SSO_CANDIDATE_NETWORK
  export SSO_E2E_HTTP_VERIFIER_IMAGE_ID SSO_E2E_DB_VERIFIER_IMAGE_ID SSO_E2E_GATEWAY_IMAGE_ID
  compose down --remove-orphans --timeout 30 --volumes
}

production_fingerprint() {
  fingerprint_payload=
  for container_name in assinatura-portal docuseal docuseal-db pades-provider pki-bridge pki-db; do
    fingerprint_line=$(docker container inspect --format '{{.Id}}|{{.Image}}|{{.Name}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container_name") || \
      fail "Container produtivo obrigatório ausente: $container_name"
    printf '%s\n' "$fingerprint_line" | grep -Eq '[|]true[|]healthy$' || \
      fail "Container produtivo obrigatório não está saudável: $container_name"
    if [ -z "$fingerprint_payload" ]; then
      fingerprint_payload=$fingerprint_line
    else
      fingerprint_payload="$fingerprint_payload
$fingerprint_line"
    fi
  done
  printf '%s\n' "$fingerprint_payload" | shasum -a 256 | awk '{print $1}'
}

e2e_cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "${e2e_stack_active:-false}" = true ]; then
    down_stack >/dev/null 2>&1 || printf '%s\n' 'AVISO: teardown E2E automático falhou.' >&2
  fi
  if [ "${e2e_runtime_active:-false}" = true ]; then
    cleanup_runtime_materials >/dev/null 2>&1 || printf '%s\n' 'AVISO: limpeza de secrets/PKI E2E falhou.' >&2
  fi
  if [ "${e2e_lock_active:-false}" = true ]; then
    release_run_lock >/dev/null 2>&1 || printf '%s\n' 'AVISO: liberação do lock E2E falhou.' >&2
  fi
  exit "$status"
}

[ "$#" -eq 1 ] || fail 'Uso: run-sso-candidate-compose.sh config|e2e'
case "$1" in config | e2e) ;; *) fail 'Subcomando inválido; use config ou e2e.' ;; esac
run_id=${SSO_E2E_RUN_ID:-}
printf '%s\n' "$run_id" | grep -Eq '^[0-9a-f]{12}-a[0-9]{2}$' || fail 'SSO_E2E_RUN_ID inválido.'
project_name="maiocchi-sso-$run_id"
for command in docker git shasum awk grep node stat mkdir rmdir install cmp find sed sort wc chmod rm id; do
  command -v "$command" >/dev/null 2>&1 || fail "$command não está disponível."
done
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 não está disponível.'

case "$1" in
  config)
    compose config --quiet --no-interpolate
    ;;
  e2e)
    e2e_stack_active=false
    e2e_runtime_active=false
    e2e_lock_active=false
    trap e2e_cleanup EXIT HUP INT TERM
    acquire_run_lock
    assert_project_absent
    validate_local_recipe
    materialize_lab_images
    prepare_runtime_materials
    production_before=$(production_fingerprint)
    e2e_stack_active=true
    up_stack
    compose --profile e2e run --rm --no-deps sso-e2e-probe-candidate
    compose --profile e2e run --rm --no-deps sso-e2e-db-verifier-candidate
    production_after=$(production_fingerprint)
    node "$evidence_finalizer" \
      "${SSO_E2E_EVIDENCE_DIR:?SSO_E2E_EVIDENCE_DIR é obrigatório}" \
      "$production_before" "$production_after"
    down_stack
    e2e_stack_active=false
    cleanup_runtime_materials
    release_run_lock
    production_after_teardown=$(production_fingerprint)
    node "$teardown_finalizer" \
      "$SSO_E2E_EVIDENCE_DIR" "$project_name" \
      "$production_before" "$production_after_teardown"
    e2e_stack_active=false
    trap - EXIT HUP INT TERM
    ;;
esac
