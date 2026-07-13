#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
install_dir="$HOME/Library/Application Support/MaiocchiPadesAgent"
launch_agents="$HOME/Library/LaunchAgents"
logs="$HOME/Library/Logs/MaiocchiPadesAgent"
plist="$launch_agents/br.adv.maiocchi.pades-agent.plist"
binary="$install_dir/maiocchi-pades-agent"

cd "$project_dir"
"$project_dir/scripts/preflight-macos.sh" --require-m5-max
swift package resolve
swift build -c release --arch arm64
bin_dir=$(swift build -c release --arch arm64 --show-bin-path)
install -d -m 0700 "$install_dir" "$logs"
install -d -m 0755 "$launch_agents"
install -m 0755 "$bin_dir/maiocchi-pades-agent" "$binary"
codesign --force --sign - --identifier br.adv.maiocchi.pades-agent "$binary"
codesign --verify --strict "$binary"
case "$(file "$binary")" in
  *"Mach-O 64-bit executable arm64"*) ;;
  *)
    echo "A compilação não gerou um binário Mach-O arm64." >&2
    exit 1
    ;;
esac
install -m 0600 Resources/br.adv.maiocchi.pades-agent.plist "$plist"
/usr/libexec/PlistBuddy -c "Set :ProgramArguments:0 $binary" "$plist"
/usr/libexec/PlistBuddy -c "Set :StandardOutPath $logs/agent.log" "$plist"
/usr/libexec/PlistBuddy -c "Set :StandardErrorPath $logs/agent-error.log" "$plist"
touch "$logs/agent.log" "$logs/agent-error.log"
chmod 0600 "$logs/agent.log" "$logs/agent-error.log"
plutil -lint "$plist"

launchctl bootout "gui/$(id -u)/br.adv.maiocchi.pades-agent" 2>/dev/null || true
bootstrap_attempt=0
until launchctl bootstrap "gui/$(id -u)" "$plist"; do
  bootstrap_attempt=$((bootstrap_attempt + 1))
  if [ "$bootstrap_attempt" -ge 8 ]; then
    echo "O LaunchAgent não pôde ser carregado após a substituição controlada." >&2
    exit 1
  fi
  sleep 0.25
done
launchctl enable "gui/$(id -u)/br.adv.maiocchi.pades-agent"
launchctl kickstart -k "gui/$(id -u)/br.adv.maiocchi.pades-agent"

attempt=0
until curl --fail --silent \
  -H 'Origin: https://assinatura.maiocchi.adv.br' \
  -H 'Host: 127.0.0.1:35100' \
  http://127.0.0.1:35100/v1/status >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 20 ]; then
    echo "O agente não respondeu em 127.0.0.1:35100 dentro do prazo." >&2
    exit 1
  fi
  sleep 0.25
done

"$project_dir/scripts/preflight-macos.sh" --require-m5-max --require-agent --require-token
