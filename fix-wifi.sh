#!/usr/bin/env bash
# =============================================================================
# fix-wifi.sh (v0026 — HARDENED, POLICY-AWARE, AUTO-RECOVERY + SQLITE AUDIT)
# =============================================================================
#
# OBJECTIVE:
#   Deterministic network controller with autonomous self-healing and 
#   forensic observability via SQLite.
#
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------------------------
PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
LOG_FILE="${PROJECT_ROOT}/verbatim_handshake.log"
DB_FILE="${PROJECT_ROOT}/recovery_state.db"
AUTO_REENABLE_NETWORKING="${AUTO_REENABLE_NETWORKING:-1}"

# -----------------------------------------------------------------------------
# DATABASE INITIALIZATION
# -----------------------------------------------------------------------------
init_db() {
  if [ ! -f "$DB_FILE" ]; then
    sqlite3 "$DB_FILE" <<EOF
CREATE TABLE IF NOT EXISTS milestones (
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  name TEXT,
  details TEXT
);
CREATE TABLE IF NOT EXISTS commands (
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  command TEXT,
  exit_code INTEGER,
  output TEXT
);
EOF
  fi
}

# -----------------------------------------------------------------------------
# LOGGING & AUDIT
# -----------------------------------------------------------------------------
log() {
  local msg="[$(date -Is)] $*"
  echo "$msg" | tee -a "$LOG_FILE"
}

record_milestone() {
  local name="$1"
  local details="${2:-}"
  log "MILESTONE: $name | $details"
  sqlite3 "$DB_FILE" "INSERT INTO milestones (name, details) VALUES ('$name', '$details');" || true
}

record_command() {
  local cmd="$1"
  local code="$2"
  local output="$3"
  # Escape single quotes for SQL
  local safe_output="${output//\'/\'\'}"
  sqlite3 "$DB_FILE" "INSERT INTO commands (command, exit_code, output) VALUES ('$cmd', $code, '$safe_output');" || true
}

# -----------------------------------------------------------------------------
# SAFE EXECUTION
# -----------------------------------------------------------------------------
run_audit() {
  local label="$1"
  shift
  log "RUN: $label"
  local output
  local exit_code=0
  output=$(timeout 5s "$@" 2>&1) || exit_code=$?
  
  if [ $exit_code -ne 0 ]; then
    log "ERROR: $label failed (exit $exit_code)"
  fi
  
  record_command "$*" "$exit_code" "$output"
  return $exit_code
}

# -----------------------------------------------------------------------------
# NETWORKMANAGER STATE CHECKS
# -----------------------------------------------------------------------------
networking_enabled() {
  nmcli networking 2>/dev/null | grep -q "enabled" || return 1
}

nm_enabled() {
  nmcli general status 2>/dev/null | grep -q "connected" || return 1
}

# -----------------------------------------------------------------------------
# HEALTH CHECK
# -----------------------------------------------------------------------------
network_is_healthy() {
  if ! nmcli -t -f UUID,DEVICE connection show --active 2>/dev/null | grep -q .; then
    return 1
  fi
  ip route 2>/dev/null | grep -q "^default" || return 1
  return 0
}

# -----------------------------------------------------------------------------
# SELECT BEST CONNECTION (PREFER WIRED, THEN WIFI)
# -----------------------------------------------------------------------------
select_best_connection() {
  # Wired first
  nmcli -t -f NAME,UUID,DEVICE connection show 2>/dev/null | while IFS=: read -r name uuid dev; do
    [[ -z "$uuid" ]] && continue
    [[ "$dev" == "lo" ]] && continue
    if nmcli device status 2>/dev/null | grep -q "^$dev.*ethernet.*connected"; then
      echo "$name:$uuid:$dev"
      return 0
    fi
  done

  # Then WiFi
  nmcli -t -f NAME,UUID,DEVICE connection show 2>/dev/null | while IFS=: read -r name uuid dev; do
    [[ -z "$uuid" ]] && continue
    [[ "$dev" == "lo" ]] && continue
    if nmcli device status 2>/dev/null | grep -q "^$dev.*wifi"; then
      echo "$name:$uuid:$dev"
      return 0
    fi
  done
}

# -----------------------------------------------------------------------------
# RECOVERY ENGINE
# -----------------------------------------------------------------------------
recover() {
  record_milestone "RECOVERY_START"

  if ! networking_enabled; then
    record_milestone "NETWORKING_DISABLED"
    if [[ "$AUTO_REENABLE_NETWORKING" -eq 1 ]]; then
      run_audit "enable networking" nmcli networking on
    fi
    return
  fi

  if network_is_healthy; then
    record_milestone "HEALTHY_SKIP"
    return
  fi

  local selected
  selected=$(select_best_connection || true)

  if [[ -z "$selected" ]]; then
    record_milestone "NO_VALID_CONNECTIONS"
    # Attempt to bring up ANY known connection
    local first_uuid
    first_uuid=$(nmcli -t -f UUID connection show | head -n1)
    if [[ -n "$first_uuid" ]]; then
      run_audit "activate fallback" nmcli connection up uuid "$first_uuid"
    fi
    return
  fi

  IFS=: read -r name uuid dev <<< "$selected"
  run_audit "activate $name" nmcli connection up uuid "$uuid"
  
  record_milestone "RECOVERY_COMPLETE"
}

# -----------------------------------------------------------------------------
# MAIN LOOP
# -----------------------------------------------------------------------------
main() {
  init_db
  record_milestone "CONTROLLER_START"

  while true; do
    if network_is_healthy; then
      log "HEARTBEAT: network OK"
    else
      log "HEARTBEAT: recovery triggered"
      recover
    fi
    sleep 10
  done
}

if [[ "${1:-}" == "--force" ]]; then
  init_db
  recover
  exit 0
fi

main
