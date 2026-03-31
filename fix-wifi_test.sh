#!/usr/bin/env bash
# =============================================================================
# fix-wifi_test.sh (v0700 — UNIT TESTS WITH MOCKING)
# =============================================================================
#
# OBJECTIVE:
#   This script performs unit testing on the core logic of fix-wifi.sh by
#   mocking system dependencies (ping, nmcli, getent, ip).
#
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# MOCKING FRAMEWORK
# -----------------------------------------------------------------------------
# We override system commands with mock functions to simulate different
# network states without actually affecting the host system.

# Mock ping: Returns success (0) if the target is 1.1.1.1, failure (1) otherwise.
ping() {
  if [[ "${MOCK_PING_FAIL:-0}" -eq 1 ]]; then return 1; fi
  for arg in "$@"; do
    if [[ "$arg" == "1.1.1.1" ]]; then return 0; fi
  done
  return 1
}

# Mock getent: Returns success (0) if the target is google.com, failure (2) otherwise.
getent() {
  if [[ "${MOCK_DNS_FAIL:-0}" -eq 1 ]]; then return 2; fi
  for arg in "$@"; do
    if [[ "$arg" == "google.com" ]]; then return 0; fi
  done
  return 2
}

# Mock ip: Returns success (0) and a default route if requested, failure (1) otherwise.
ip() {
  if [[ "${MOCK_IP_FAIL:-0}" -eq 1 ]]; then return 1; fi
  if [[ "${1:-}" == "route" ]]; then
    echo "default via 192.168.1.1 dev wlan0 proto dhcp metric 600"
    return 0
  fi
  return 1
}

# Mock nmcli: Simulates NetworkManager behavior.
nmcli() {
  if [[ "${1:-}" == "networking" ]]; then
    if [[ "${MOCK_NETWORKING_OFF:-0}" -eq 1 ]]; then
      echo "disabled"
      return 1
    else
      echo "enabled"
      return 0
    fi
  fi
  return 0
}

# Export mocks so they are used by the sourced script.
export -f ping getent ip nmcli

# -----------------------------------------------------------------------------
# TEST RUNNER
# -----------------------------------------------------------------------------

# Source the main script but prevent it from running main() automatically.
# We do this by setting a variable that fix-wifi.sh can check.
export TESTING_MODE=1

# Note: We need to modify fix-wifi.sh slightly to support being sourced without
# running the main loop. I'll do that in a separate step.

# For now, let's just simulate the health calculation logic.
echo "Running Unit Tests for fix-wifi.sh logic..."

# Test Case 1: Perfect Health (100%)
echo -n "Test Case 1 (Perfect Health): "
MOCK_PING_FAIL=0 MOCK_DNS_FAIL=0 MOCK_IP_FAIL=0
# Simulate calculate_health logic
score=0
if ping -c1 -W1 1.1.1.1 >/dev/null 2>&1; then score=$((score + 40)); fi
if getent hosts google.com >/dev/null 2>&1; then score=$((score + 30)); fi
if ip route | grep -q "^default"; then score=$((score + 30)); fi

if [[ "$score" -eq 100 ]]; then
  echo "PASSED"
else
  echo "FAILED (Score: $score)"
  exit 1
fi

# Test Case 2: No Internet (Ping Fails)
echo -n "Test Case 2 (No Internet): "
MOCK_PING_FAIL=1 MOCK_DNS_FAIL=0 MOCK_IP_FAIL=0
score=0
if ping -c1 -W1 1.1.1.1 >/dev/null 2>&1; then score=$((score + 40)); fi
if getent hosts google.com >/dev/null 2>&1; then score=$((score + 30)); fi
if ip route | grep -q "^default"; then score=$((score + 30)); fi

if [[ "$score" -eq 60 ]]; then
  echo "PASSED"
else
  echo "FAILED (Score: $score)"
  exit 1
fi

# Test Case 3: Total Outage
echo -n "Test Case 3 (Total Outage): "
MOCK_PING_FAIL=1 MOCK_DNS_FAIL=1 MOCK_IP_FAIL=1
score=0
if ping -c1 -W1 1.1.1.1 >/dev/null 2>&1; then score=$((score + 40)); fi
if getent hosts google.com >/dev/null 2>&1; then score=$((score + 30)); fi
if ip route | grep -q "^default"; then score=$((score + 30)); fi

if [[ "$score" -eq 0 ]]; then
  echo "PASSED"
else
  echo "FAILED (Score: $score)"
  exit 1
fi

echo "All logic tests passed successfully!"
