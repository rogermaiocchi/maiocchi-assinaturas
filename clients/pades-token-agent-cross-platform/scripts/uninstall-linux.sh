#!/usr/bin/env bash
set -euo pipefail

install_dir=${XDG_DATA_HOME:-"$HOME/.local/share"}/../libexec/maiocchi
service_dir=${XDG_CONFIG_HOME:-"$HOME/.config"}/systemd/user

systemctl --user disable --now maiocchi-pades-agent.service 2>/dev/null || true
rm -f "$service_dir/maiocchi-pades-agent.service"
rm -f "$install_dir/maiocchi-pades-token-agent"
systemctl --user daemon-reload
