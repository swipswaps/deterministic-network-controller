#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
FIX_SCRIPT="/usr/local/bin/fix-wifi"

echo "🚀 Cold-Start Nuclear Orchestrator starting..."

# Check if global script exists, fallback to local
if [[ ! -x "$FIX_SCRIPT" ]]; then
  FIX_SCRIPT="$PROJECT_ROOT/fix-wifi.sh"
fi

# Clear ports if needed
echo "🧹 Self-healing: Clearing ports 3000..."
sudo fuser -k 3000/tcp || true

# Trigger recovery
echo "🔥 Executing Nuclear Recovery..."
sudo "$FIX_SCRIPT" --force

echo "✅ Cold-Start complete."
