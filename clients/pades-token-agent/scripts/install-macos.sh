#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
install_dir="$HOME/Library/Application Support/MaiocchiPadesAgent"
launch_agents="$HOME/Library/LaunchAgents"
logs="$HOME/Library/Logs/MaiocchiPadesAgent"
plist="$launch_agents/br.adv.maiocchi.pades-agent.plist"
binary="$install_dir/maiocchi-pades-agent"

cd "$project_dir"
swift build -c release
mkdir -p "$install_dir" "$launch_agents" "$logs"
install -m 0755 .build/release/maiocchi-pades-agent "$binary"
codesign --force --sign - --identifier br.adv.maiocchi.pades-agent "$binary"
install -m 0644 Resources/br.adv.maiocchi.pades-agent.plist "$plist"
/usr/libexec/PlistBuddy -c "Set :ProgramArguments:0 $binary" "$plist"
/usr/libexec/PlistBuddy -c "Set :StandardOutPath $logs/agent.log" "$plist"
/usr/libexec/PlistBuddy -c "Set :StandardErrorPath $logs/agent-error.log" "$plist"
plutil -lint "$plist"

launchctl bootout "gui/$(id -u)/br.adv.maiocchi.pades-agent" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"
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
