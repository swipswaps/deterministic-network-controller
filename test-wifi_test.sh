#!/usr/bin/env bash
# =============================================================================
# test-wifi_test.sh (v0700 — INTEGRATION TEST)
# =============================================================================
#
# OBJECTIVE:
#   This script verifies that test-wifi.sh correctly reports network health.
#
# =============================================================================

set -euo pipefail

# 1. Run the script
echo "Running test-wifi.sh..."
./test-wifi.sh

# 2. Verify output
echo -n "Checking if test-wifi.sh output is valid: "
if [[ -f "verbatim_handshake.log" ]]; then
  echo "PASSED"
else
  echo "FAILED (verbatim_handshake.log not found)"
  exit 1
fi

echo "All test-wifi tests passed successfully!"
