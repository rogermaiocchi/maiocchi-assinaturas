#!/usr/bin/env bash
set -euo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
binary=${1:-"$root_dir/target/release/maiocchi-pades-token-agent"}
install_dir=${XDG_DATA_HOME:-"$HOME/.local/share"}/../libexec/maiocchi
service_dir=${XDG_CONFIG_HOME:-"$HOME/.config"}/systemd/user
config_dir=${XDG_CONFIG_HOME:-"$HOME/.config"}/maiocchi

if [[ ! -x "$binary" ]]; then
  cargo build --release --manifest-path "$root_dir/Cargo.toml"
fi

install -d -m 0700 "$install_dir" "$service_dir" "$config_dir"
install -m 0755 "$binary" "$install_dir/maiocchi-pades-token-agent"
install -m 0600 "$root_dir/packaging/linux/maiocchi-pades-agent.service" "$service_dir/maiocchi-pades-agent.service"

systemctl --user daemon-reload
systemctl --user enable --now maiocchi-pades-agent.service

status=$(curl --silent --show-error --fail \
  --header 'Origin: https://assinatura.maiocchi.adv.br' \
  http://127.0.0.1:35100/v1/status)
printf '%s\n' "$status"
