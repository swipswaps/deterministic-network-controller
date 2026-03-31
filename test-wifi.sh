#!/usr/bin/env bash
# =============================================================================
# test-wifi.sh (v0700 — NETWORK HEALTH DIAGNOSTIC)
# =============================================================================
#
# OBJECTIVE:
#   This script performs a one-time network health check and logs the results.
#
# =============================================================================

set -euo pipefail

# 1. Source the main script to get the calculate_health function
# Note: We need to modify fix-wifi.sh slightly to support being sourced without
# running the main loop. I'll do that in a separate step.

# For now, let's just implement the logic directly.
echo "Running network health diagnostic..."

score=0
if ping -c1 -W1 1.1.1.1 >/dev/null 2>&1; then
  echo "Layer 1: ICMP Ping (1.1.1.1) - SUCCESS (+40)"
  score=$((score + 40))
else
  echo "Layer 1: ICMP Ping (1.1.1.1) - FAILURE"
fi

if getent hosts google.com >/dev/null 2>&1; then
  echo "Layer 2: DNS Resolution (google.com) - SUCCESS (+30)"
  score=$((score + 30))
else
  echo "Layer 2: DNS Resolution (google.com) - FAILURE"
fi

if ip route | grep -q "^default"; then
  echo "Layer 3: Routing Table (default gateway) - SUCCESS (+30)"
  score=$((score + 30))
else
  echo "Layer 3: Routing Table (default gateway) - FAILURE"
fi

echo "------------------------------------------------"
echo "TOTAL NETWORK HEALTH SCORE: $score/100"
echo "------------------------------------------------"

# Log the result to verbatim_handshake.log
echo "[$(date -Is)] DIAGNOSTIC: Total Health Score: $score" >> verbatim_handshake.log

if [[ "$score" -lt 100 ]]; then
  echo "WARNING: Network health is degraded. Consider running fix-wifi.sh."
  exit 1
fi

echo "Network health is optimal."
exit 0
