#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DOCUSEAL_ROOT="$ROOT/work/docuseal-3.0.1-maiocchi.5"
TEST_IMAGE=${DOCUSEAL_TEST_IMAGE:-maiocchi/docuseal-rspec:test-harness}
RSPEC_TARGETS=${RSPEC_TARGETS:-"spec/integration/private_evidence_composer_pipeline_spec.rb spec/system/signing_form_spec.rb"}
RAILS_LOG_TO_STDOUT=${RAILS_LOG_TO_STDOUT:-0}
SUFFIX=$$
NETWORK="maiocchi-evidence-test-$SUFFIX"
DATABASE="maiocchi-evidence-db-$SUFFIX"
BRIDGE="maiocchi-evidence-bridge-$SUFFIX"
HMAC_KEY=$(openssl rand -hex 32)

if [ -n "${TEST_ARTIFACT_DIR:-}" ]; then
  mkdir -p "$TEST_ARTIFACT_DIR"
  TMP_MOUNT="type=bind,source=$TEST_ARTIFACT_DIR,target=/app/tmp"
else
  TMP_MOUNT="type=tmpfs,destination=/app/tmp,tmpfs-size=268435456,tmpfs-mode=1777"
fi

cleanup() {
  docker rm -f "$BRIDGE" "$DATABASE" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker image inspect "$TEST_IMAGE" >/dev/null
docker network create "$NETWORK" >/dev/null
docker run -d --name "$DATABASE" --network "$NETWORK" --network-alias docuseal-db \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=docuseal_test postgres:16-alpine >/dev/null

until docker exec "$DATABASE" pg_isready -U postgres -d docuseal_test >/dev/null 2>&1; do sleep 1; done

docker run -d --name "$BRIDGE" --network "$NETWORK" --network-alias pki-bridge-internal \
  -e INTEGRATION_HMAC_KEY="$HMAC_KEY" -v "$ROOT/services/pki-bridge:/app:ro" -w /app \
  node:24-alpine node test/rails-evidence-harness.mjs >/dev/null

until docker exec "$BRIDGE" wget -qO- http://127.0.0.1:3401/healthz >/dev/null 2>&1; do sleep 1; done

docker run --rm --network "$NETWORK" -e PGHOST=docuseal-db -e PGUSER=postgres -e PGPASSWORD= \
  -e REAL_PKI_BRIDGE_INTEGRATION=1 \
  -e RAILS_LOG_TO_STDOUT="$RAILS_LOG_TO_STDOUT" \
  -e RSPEC_TARGETS="$RSPEC_TARGETS" \
  -e PRIVATE_EVIDENCE_COMPOSER_URL=http://pki-bridge-internal:3401/internal/evidence/compose \
  -e AUTHENTICITY_INTERNAL_HMAC_KEY="$HMAC_KEY" \
  -v "$DOCUSEAL_ROOT:/app:ro" --mount "$TMP_MOUNT" --tmpfs /app/log:size=16m,mode=1777 \
  -w /app --entrypoint sh "$TEST_IMAGE" \
  -lc 'bundle exec rails db:prepare && set -- $RSPEC_TARGETS && bundle exec rspec "$@"'
