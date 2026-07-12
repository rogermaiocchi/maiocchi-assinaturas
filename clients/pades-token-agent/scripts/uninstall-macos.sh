#!/bin/sh
set -eu

label=br.adv.maiocchi.pades-agent
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$label.plist"
rm -rf "$HOME/Library/Application Support/MaiocchiPadesAgent"
