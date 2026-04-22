#!/usr/bin/env bash
# embers uninstall — unload agent, optionally remove config

set -euo pipefail

LAUNCH_AGENT="$HOME/Library/LaunchAgents/com.embers.listener.plist"
CONFIG_DIR="$HOME/.embers"

echo "stopping embers listener..."

if [[ -f "$LAUNCH_AGENT" ]]; then
    /bin/launchctl unload "$LAUNCH_AGENT" 2>/dev/null || true
    /bin/rm -f "$LAUNCH_AGENT"
    echo "✓ launch agent removed"
else
    echo "  no launch agent found"
fi

if [[ -d "$CONFIG_DIR" ]]; then
    printf "remove config + logs at %s? [y/N]: " "$CONFIG_DIR"
    read -r answer
    if [[ "$answer" =~ ^[Yy]$ ]]; then
        /bin/rm -rf "$CONFIG_DIR"
        echo "✓ config and logs removed"
    else
        echo "  keeping config (re-run ./install.sh to restart)"
    fi
fi

echo "done."
