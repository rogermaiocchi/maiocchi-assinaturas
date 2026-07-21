#!/usr/bin/env bash
# Promote hermético DocuSeal SSO a02 → produção (imagem), fail-closed.
#
# - Exige image ID a02 pinado (sha256:7de80849…)
# - Captura fingerprint before/after dos containers de assinatura saudáveis
# - NÃO liga MAIOCCHI_SSO_ENABLED (ADR-0005: enable só após gates)
# - Backup do compose antes de mutar
# - Rollback documentado se health falhar
#
# Uso (VPS, com sudo docker):
#   CONFIRM=promote-docuseal-a02-hermetic \
#   ./scripts/promote-docuseal-sso-hermetic.sh
set -Eeuo pipefail
umask 077

EXPECTED_IMAGE_ID='sha256:7de80849ac097f7b10c771814d742c1485a817a9778fcfa53e383d24d5db0e55'
EXPECTED_TAG='maiocchi/docuseal:3.0.1-maiocchi.15-sso-454b383cfb1c-a02'
PROMOTE_TAG='maiocchi/docuseal:3.0.1-maiocchi.15'
PREV_TAG='maiocchi/docuseal:3.0.1-maiocchi.14'
COMPOSE_DIR='/opt/docuseal'
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
EVIDENCE_ROOT='/opt/build/backups'
CONFIRM_LITERAL='promote-docuseal-a02-hermetic'

PROD_CONTAINERS=(assinatura-portal docuseal pki-bridge pades-provider)

fail() { echo "ERRO: $*" >&2; exit 1; }

[[ ${CONFIRM:-} == "$CONFIRM_LITERAL" ]] || \
  fail "defina CONFIRM=$CONFIRM_LITERAL para executar o promote"

command -v docker >/dev/null || fail 'docker ausente'
command -v sha256sum >/dev/null || command -v shasum >/dev/null || fail 'sha256 tool ausente'
command -v python3 >/dev/null || fail 'python3 ausente'

hash_cmd() {
  if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

ts=$(date -u +%Y%m%dT%H%M%SZ)
evid="$EVIDENCE_ROOT/docuseal-promote-a02-$ts"
mkdir -m 0700 -p "$evid"

fingerprint_prod() {
  local line payload=""
  local c
  for c in "${PROD_CONTAINERS[@]}"; do
    line=$(docker container inspect --format \
      '{{.Id}}|{{.Image}}|{{.Name}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.Config.Image}}' \
      "$c" 2>/dev/null) || fail "container prod ausente: $c"
    printf '%s\n' "$line" | grep -Eq '[|]true[|](healthy)?[|]' || fail "container não running: $c ($line)"
    if [[ -z $payload ]]; then payload=$line; else payload="$payload"$'\n'"$line"; fi
  done
  printf '%s\n' "$payload" | hash_cmd | awk '{print $1}'
  printf '%s\n' "$payload" >"$1"
}

echo "== preflight image a02 =="
id=$(docker image inspect --format '{{.Id}}' "$EXPECTED_TAG") || fail "imagem $EXPECTED_TAG ausente"
[[ $id == "$EXPECTED_IMAGE_ID" ]] || fail "image ID diverge: got $id want $EXPECTED_IMAGE_ID"
docker image tag "$EXPECTED_IMAGE_ID" "$PROMOTE_TAG"
printf '%s\n' "$EXPECTED_IMAGE_ID" >"$evid/docuseal-a02.image-id.txt"
printf '%s\n' "$PROMOTE_TAG" >"$evid/docuseal-promote.tag.txt"

echo "== fingerprint BEFORE =="
before=$(fingerprint_prod "$evid/prod-fingerprint-before.txt")
printf '%s\n' "$before" | tee "$evid/prod-fingerprint-before.sha256"

# backup compose
[[ -f $COMPOSE_FILE && ! -L $COMPOSE_FILE ]] || fail "compose prod ausente"
cp -a "$COMPOSE_FILE" "$evid/docker-compose.yml.before"
cp -a "$COMPOSE_FILE" "$COMPOSE_FILE.bak-promote-a02-$ts"

# mutate image line only for service docuseal (first maiocchi/docuseal match)
python3 - "$COMPOSE_FILE" "$PREV_TAG" "$PROMOTE_TAG" "$evid/docker-compose.yml.after" <<'PY'
import pathlib, re, sys

src = pathlib.Path(sys.argv[1])
prev = sys.argv[2]
new = sys.argv[3]
out = pathlib.Path(sys.argv[4])
text = src.read_text()
pattern = re.compile(r'(^\s+image:\s*)(maiocchi/docuseal:[^\s#]+)', re.M)
if not pattern.search(text):
    raise SystemExit('image docuseal não encontrada no compose')
if prev not in text and 'maiocchi/docuseal:3.0.1-maiocchi.14' not in text:
    # allow re-run if already on .15
    if 'maiocchi/docuseal:3.0.1-maiocchi.15' not in text:
        raise SystemExit('compose sem imagem docuseal esperada (.14/.15)')
new_text, n = pattern.subn(lambda m: f'{m.group(1)}{new}', text, count=1)
if n != 1:
    raise SystemExit(f'substituições inesperadas: {n}')
out.write_text(new_text)
src.write_text(new_text)
print(f'compose image -> {new}')
PY

echo "== recreate docuseal =="
(
  cd "$COMPOSE_DIR"
  docker compose up -d --no-deps docuseal
)

# wait health
echo "== wait healthy =="
ok=0
for i in $(seq 1 60); do
  st=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' docuseal 2>/dev/null || echo missing)
  img=$(docker inspect --format '{{.Config.Image}}' docuseal 2>/dev/null || true)
  id_now=$(docker inspect --format '{{.Image}}' docuseal 2>/dev/null || true)
  echo "t=${i}s status=$st image=$img id=${id_now:0:19}"
  if [[ $st == healthy && $id_now == "$EXPECTED_IMAGE_ID" ]]; then ok=1; break; fi
  sleep 2
done
[[ $ok == 1 ]] || {
  echo "FALHA health/id — iniciando rollback de compose" >&2
  cp -a "$evid/docker-compose.yml.before" "$COMPOSE_FILE"
  (
    cd "$COMPOSE_DIR"
    docker compose up -d --no-deps docuseal
  ) || true
  fail "promote falhou; compose restaurado (verifique docker logs docuseal)"
}

echo "== fingerprint AFTER =="
after=$(fingerprint_prod "$evid/prod-fingerprint-after.txt")
printf '%s\n' "$after" | tee "$evid/prod-fingerprint-after.sha256"

# smoke endpoints (no auth)
smoke_codes=$( {
  curl -sk -o /dev/null -w '%{http_code}' --max-time 10 https://assinatura.maiocchi.adv.br/ || echo ERR
  echo -n ' '
  curl -sk -o /dev/null -w '%{http_code}' --max-time 10 https://assinatura.maiocchi.adv.br/up || echo ERR
  echo -n ' '
  curl -sk -o /dev/null -w '%{http_code}' --max-time 10 https://assinatura.maiocchi.adv.br/dashboard || echo ERR
} )
printf '%s\n' "$smoke_codes" | tee "$evid/smoke-http.txt"

# SSO must remain disabled in prod env
sso_env=$(docker inspect docuseal --format '{{range .Config.Env}}{{println .}}{{end}}' | awk -F= '$1=="MAIOCCHI_SSO_ENABLED"{print $2}')
printf 'MAIOCCHI_SSO_ENABLED=%s\n' "${sso_env:-<unset>}" | tee "$evid/sso-enabled.txt"
if [[ ${sso_env:-} == true ]]; then
  fail 'MAIOCCHI_SSO_ENABLED=true em produção — promote abortado por política ADR (não esperado neste script)'
fi

python3 - "$evid" "$before" "$after" "$EXPECTED_IMAGE_ID" "$smoke_codes" <<'PY'
import json, pathlib, sys
evid, before, after, image_id, smoke = sys.argv[1:6]
# note: before/after are fingerprints of full stack; they SHOULD change because docuseal container id/image changed
doc = {
  "schema": "maiocchi.docuseal.promote-a02.v1",
  "promote_image_id": image_id,
  "promote_tag": "maiocchi/docuseal:3.0.1-maiocchi.15",
  "source_tag": "maiocchi/docuseal:3.0.1-maiocchi.15-sso-454b383cfb1c-a02",
  "fingerprint_before_sha256": before,
  "fingerprint_after_sha256": after,
  "fingerprint_changed": before != after,
  "fingerprint_note": "expected change: docuseal container id/image after promote",
  "sso_enabled_in_prod": False,
  "smoke_http": smoke.strip(),
  "ok": True,
}
path = pathlib.Path(evid) / "promote-result.json"
path.write_text(json.dumps(doc, indent=2) + "\n")
print(json.dumps(doc, indent=2))
PY

echo "PROMOTE OK evidence=$evid"
echo "SSO continua DESLIGADO (ADR-0005). Enable exige secrets+account+portal 1.15.1+E2E."
