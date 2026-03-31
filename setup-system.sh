#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
FIX_SCRIPT="$PROJECT_ROOT/fix-wifi.sh"

echo "Initializing system for Broadcom Recovery Kit..."

# Ensure scripts are executable
chmod +x "$PROJECT_ROOT/fix-wifi.sh"
chmod +x "$PROJECT_ROOT/cold-start.sh"

# Install globally if possible (optional, but good for UI integration)
if [[ $EUID -eq 0 ]]; then
  cp "$FIX_SCRIPT" /usr/local/bin/fix-wifi
  chmod +x /usr/local/bin/fix-wifi
  echo "Installed globally to /usr/local/bin/fix-wifi"
else
  echo "Skipping global install (not root). Use 'sudo npm run setup' for global install."
fi

echo "Setup complete."
