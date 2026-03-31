#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
FIX_SCRIPT="/usr/local/bin/fix-wifi"
LOG_FILE="${PROJECT_ROOT}/verbatim_handshake.log"

echo "🚀 Cold-Start Nuclear Orchestrator v31 starting..."
echo "LOG_PATH: ${LOG_FILE}"

# Idempotent skip: Check for recovery flag
if [[ -f "${PROJECT_ROOT}/recovery_complete.flag" ]]; then
  echo "✅ Idempotent skip: Previous full recovery already successful."
  exit 0
fi

# Check if global script exists, fallback to local
if [[ ! -x "$FIX_SCRIPT" ]]; then
  FIX_SCRIPT="$PROJECT_ROOT/fix-wifi.sh"
fi

# Clear ports if needed
echo "🧹 Self-healing: Aggressively clearing ports 3000 and 24678..."
sudo fuser -k 3000/tcp 24678/tcp || true
sleep 2

# Trigger recovery
echo "🔥 Executing Nuclear Recovery via fix-wifi.sh..."
sudo "$FIX_SCRIPT" --force

# Verify completion
if [[ -f "${PROJECT_ROOT}/recovery_complete.flag" ]]; then
  echo "📡 Notifying Broadcom Control Center..."
  curl -s http://localhost:3000/api/audit || echo "⚠️ Server audit endpoint not yet responding"
fi

echo "✅ Cold-Start complete."
