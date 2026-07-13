#!/bin/sh
set -eu

require_agent=false
require_token=false
require_m5_max=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --require-agent) require_agent=true ;;
    --require-token) require_token=true ;;
    --require-m5-max) require_m5_max=true ;;
    *)
      echo "Opção desconhecida: $1" >&2
      exit 2
      ;;
  esac
  shift
done

for required in swift xcrun codesign plutil system_profiler curl launchctl; do
  if ! command -v "$required" >/dev/null 2>&1; then
    echo "Ferramenta nativa ausente: $required" >&2
    exit 1
  fi
done

architecture=$(uname -m)
if [ "$architecture" != "arm64" ]; then
  echo "Arquitetura não homologada: $architecture; esperado arm64." >&2
  exit 1
fi

hardware_file=$(mktemp -t maiocchi-pades-hardware)
status_file=$(mktemp -t maiocchi-pades-status)
certificates_file=$(mktemp -t maiocchi-pades-certificates)
launchd_file=$(mktemp -t maiocchi-pades-launchd)
cleanup() {
  rm -f "$hardware_file" "$status_file" "$certificates_file" "$launchd_file"
}
trap cleanup EXIT HUP INT TERM

system_profiler SPHardwareDataType -json >"$hardware_file"
model=$(plutil -extract SPHardwareDataType.0.machine_model raw -o - "$hardware_file")
chip=$(plutil -extract SPHardwareDataType.0.chip_type raw -o - "$hardware_file")

if $require_m5_max && [ "$chip" != "Apple M5 Max" ]; then
  echo "Perfil M5 Max exigido; hardware encontrado: $chip." >&2
  exit 1
fi

printf 'hardware=ok architecture=%s model=%s chip=%s\n' "$architecture" "$model" "$chip"

if $require_agent || $require_token; then
  curl --fail --silent --show-error \
    -H 'Origin: https://assinatura.maiocchi.adv.br' \
    -H 'Host: 127.0.0.1:35100' \
    http://127.0.0.1:35100/v1/status >"$status_file"

  status=$(plutil -extract status raw -o - "$status_file")
  version=$(plutil -extract version raw -o - "$status_file")
  provider=$(plutil -extract provider raw -o - "$status_file")
  agent_architecture=$(plutil -extract architecture raw -o - "$status_file")
  token_policy=$(plutil -extract tokenPolicy raw -o - "$status_file")

  if [ "$status" != "ok" ] || [ "$provider" != "CryptoTokenKit" ] || \
     [ "$agent_architecture" != "arm64" ] || \
     [ "$token_policy" != "external-store-rsa-2048-fail-closed" ]; then
    echo "Status do agente incompatível com o perfil nativo homologado." >&2
    exit 1
  fi

  binary="$HOME/Library/Application Support/MaiocchiPadesAgent/maiocchi-pades-agent"
  codesign --verify --strict "$binary"
  case "$(file "$binary")" in
    *"Mach-O 64-bit executable arm64"*) ;;
    *)
      echo "O binário instalado não é Mach-O arm64." >&2
      exit 1
      ;;
  esac

  launchctl print "gui/$(id -u)/br.adv.maiocchi.pades-agent" >"$launchd_file"
  launchd_pid=$(awk '$1 == "pid" && $2 == "=" { print $3; exit }' "$launchd_file")
  listener_pid=$(/usr/sbin/lsof -t -nP -iTCP@127.0.0.1:35100 -sTCP:LISTEN | sort -u)
  if [ -z "$launchd_pid" ] || [ "$listener_pid" != "$launchd_pid" ]; then
    echo "O listener local não pertence ao processo registrado no launchd." >&2
    exit 1
  fi
  listener_binary=$(/usr/sbin/lsof -a -p "$listener_pid" -d txt -Fn | sed -n 's/^n//p' | head -n 1)
  if [ "$listener_binary" != "$binary" ]; then
    echo "O processo na porta 35100 não executa o binário instalado e verificado." >&2
    exit 1
  fi

  printf 'agent=ok version=%s provider=%s policy=%s\n' "$version" "$provider" "$token_policy"
fi

if $require_token; then
  curl --fail --silent --show-error \
    -H 'Origin: https://assinatura.maiocchi.adv.br' \
    -H 'Host: 127.0.0.1:35100' \
    http://127.0.0.1:35100/v1/certificates >"$certificates_file"

  index=0
  approved=0
  while token_backed=$(plutil -extract "certificates.$index.tokenBacked" raw -o - "$certificates_file" 2>/dev/null); do
    key_origin=$(plutil -extract "certificates.$index.keyOrigin" raw -o - "$certificates_file")
    key_algorithm=$(plutil -extract "certificates.$index.keyAlgorithm" raw -o - "$certificates_file")
    key_size=$(plutil -extract "certificates.$index.keySizeInBits" raw -o - "$certificates_file")
    trust_classification=$(plutil -extract "certificates.$index.trustClassification" raw -o - "$certificates_file")
    if [ "$token_backed" = "true" ] && [ "$key_origin" = "CryptoTokenKit" ] && \
       [ "$key_algorithm" = "RSA" ] && [ "$key_size" -ge 2048 ] && \
       [ "$trust_classification" = "external-token-unverified" ]; then
      approved=$((approved + 1))
    fi
    index=$((index + 1))
  done

  if [ "$approved" -lt 1 ]; then
    echo "Nenhuma identidade token-backed passou pela política fail-closed." >&2
    exit 1
  fi

  printf 'token=ok eligible_identities=%s\n' "$approved"
fi
