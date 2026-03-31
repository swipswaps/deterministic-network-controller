#!/usr/bin/env bash
# =============================================================================
# fix-wifi.sh (v0700 — VERBOSE, LINTED, PRODUCTION-READY)
# =============================================================================
#
# OBJECTIVE:
#   This script acts as a deterministic network controller designed to manage
#   and recover Broadcom Wi-Fi connectivity on Linux systems (specifically Fedora).
#   It uses a Betaflight-inspired PID (Proportional-Integral-Derivative) control
#   loop to monitor network health and trigger recovery actions when stability
#   degrades below defined thresholds.
#
# DESIGN PRINCIPLES:
#   1. DETERMINISM: Avoids "magic" fixes; actions are based on measurable health.
#   2. OBSERVABILITY: Every action, command, and milestone is logged to SQLite.
#   3. SAFETY: Uses file locking to prevent concurrent execution and SQL
#      parameterization to prevent injection.
#   4. RESILIENCE: Implements anti-windup logic in the PID controller to prevent
#      runaway integral error during prolonged outages.
#
# =============================================================================

# Exit immediately if a command fails, if an unset variable is used, 
# or if any command in a pipeline fails.
set -euo pipefail

# -----------------------------------------------------------------------------
# SIGNAL HANDLING
# -----------------------------------------------------------------------------
# Gracefully handle termination signals to ensure the script doesn't leave
# the system in an inconsistent state or keep the lock file unnecessarily.
trap 'echo "[EXIT] Shutting down network controller..."; exit 0' INT TERM

# -----------------------------------------------------------------------------
# DEPENDENCY PRECHECK
# -----------------------------------------------------------------------------
# Ensure all required system utilities are available before proceeding.
# sqlite3: For forensic logging and state persistence.
# nmcli: For interacting with NetworkManager.
# ping: For basic connectivity testing.
# getent: For DNS resolution testing.
# ip: For routing table inspection.
# timeout: To prevent hanging on stalled system commands.
for cmd in sqlite3 nmcli ping getent ip timeout; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "CRITICAL ERROR: Missing required dependency: $cmd" >&2
    echo "Please install the missing package (e.g., sudo dnf install $cmd)" >&2
    exit 1
  fi
done

# -----------------------------------------------------------------------------
# CONFIGURATION & PATHS
# -----------------------------------------------------------------------------
# PROJECT_ROOT: The base directory for all logs and databases.
PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
# LOG_FILE: A verbatim text log of all script activity.
LOG_FILE="${PROJECT_ROOT}/verbatim_handshake.log"
# DB_FILE: The SQLite database for structured forensic data.
DB_FILE="${PROJECT_ROOT}/recovery_state.db"
# LOCK_FILE: Used to ensure only one instance of the script runs at a time.
LOCK_FILE="${PROJECT_ROOT}/fix-wifi.lock"
# AUTO_REENABLE_NETWORKING: If 1, the script will try to turn on networking if disabled.
AUTO_REENABLE_NETWORKING="${AUTO_REENABLE_NETWORKING:-1}"

# Dynamic Wi-Fi interface detection (works for wlan0, wlp*, wl*)
detect_interface() {
  INTERFACE=$(ls /sys/class/net 2>/dev/null | grep -E '^(wl|wlan)' | head -n1 || echo "wlan0")
  log "INTERFACE_DETECTED: ${INTERFACE}"
}

# -----------------------------------------------------------------------------
# SINGLE INSTANCE LOCKING
# -----------------------------------------------------------------------------
# We use file descriptor 9 for the lock to avoid conflicts with standard IO.
# flock ensures that if another instance is running, this one exits immediately.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "ERROR: Another instance of fix-wifi is already running (Lock: $LOCK_FILE)." >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# PID CONTROLLER CONFIGURATION
# -----------------------------------------------------------------------------
# The PID (Proportional-Integral-Derivative) controller is the "brain" of the
# recovery engine. It calculates a control signal based on the difference 
# (error) between the target health (100%) and the current measured health.
#
# We use scaled integer math (multiplied by 1000) because bash does not 
# support floating point numbers natively. This allows us to represent 
# fractional gains (e.g., Kp=0.8 becomes Kp=800).
SCALE=1000

# Kp (Proportional Gain): 
#   Immediate reaction to the current error. A higher Kp makes the system 
#   react faster to health drops but can cause overshoot or oscillation.
Kp=800
# Ki (Integral Gain): 
#   Accumulates past errors over time. This helps eliminate small, persistent 
#   offsets that the proportional term might ignore.
Ki=50
# Kd (Derivative Gain): 
#   Predicts future error based on the current rate of change. This acts as 
#   a "damper" to prevent the system from overreacting to rapid fluctuations.
Kd=300

# PID STATE VARIABLES
# prev_error: Stores the error from the previous loop iteration for the derivative term.
prev_error=0
# I_error: Stores the accumulated integral error.
I_error=0
# I_CLAMP: Prevents the integral term from growing too large (Integral Windup).
# This is crucial when the network is down for a long time; without a clamp,
# the integral term would grow so large that it would take a long time to 
# "unwind" once the network is actually fixed.
I_CLAMP=50000

# CONTROL THRESHOLDS
# DEADBAND: 
#   If the calculated error is below this value, we treat it as zero. This 
#   prevents the controller from making tiny, unnecessary adjustments due 
#   to minor network jitter.
DEADBAND=5
# HYSTERESIS: 
#   Used to prevent rapid toggling between states (e.g., flipping networking 
#   on and off repeatedly).
#   - LOW: If the signal is below this, the system is stable.
#   - HIGH: If the signal exceeds this, a critical failure is declared.
HYSTERESIS_HIGH=60
HYSTERESIS_LOW=40
# OUTPUT LIMITS: 
#   The absolute maximum and minimum values the control signal can reach.
MAX_OUTPUT=1000
MIN_OUTPUT=-1000

# install_dependencies: Checks for and attempts to install missing system tools.
install_dependencies() {
  local deps=("sqlite3" "nmcli" "ping" "getent" "ip" "timeout" "haveged" "chrony" "iw" "rfkill" "tcpdump" "mtr" "bind-utils")
  local missing=()
  
  for dep in "${deps[@]}"; do
    if ! command -v "$dep" &>/dev/null && ! rpm -q "$dep" &>/dev/null; then
      missing+=("$dep")
    fi
  done
  
  if [[ ${#missing[@]} -gt 0 ]]; then
    log "Missing dependencies: ${missing[*]}"
    if [[ "$EUID" -eq 0 ]] || command -v sudo &>/dev/null; then
      log "Attempting to install missing dependencies via dnf..."
      sudo dnf install -y "${missing[@]}" || log "WARNING: Failed to install some dependencies."
    else
      log "ERROR: Missing dependencies and cannot run sudo dnf. Script may fail."
    fi
  fi
}

# -----------------------------------------------------------------------------
# DATABASE INITIALIZATION
# -----------------------------------------------------------------------------
# Creates the SQLite schema if it doesn't already exist.
init_db() {
  log "Ensuring forensic database schema at $DB_FILE..."
  sqlite3 "$DB_FILE" <<'EOF'
-- Stores high-level events (e.g., script start, recovery triggered)
CREATE TABLE IF NOT EXISTS milestones (
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  name TEXT,
  details TEXT
);
-- Stores every system command executed via run_audit
CREATE TABLE IF NOT EXISTS commands (
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  command TEXT,
  exit_code INTEGER,
  output TEXT
);
-- Tracks success/failure rates for specific connections
CREATE TABLE IF NOT EXISTS connection_stats (
  name TEXT PRIMARY KEY,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0
);
EOF
}

# -----------------------------------------------------------------------------
# LOGGING & AUDIT UTILITIES
# -----------------------------------------------------------------------------
# log: Prints a timestamped message to stdout and the log file.
log() {
  local msg="[$(date -Is)] $*"
  echo "$msg" | tee -a "$LOG_FILE"
}

# sql_escape: Escapes single quotes for safe inclusion in SQL strings.
sql_escape() {
  printf "%s" "${1//\'/\'\'}"
}

# record_milestone: Logs a significant event to the database.
record_milestone() {
  local name="$1"
  local details="${2:-}"
  log "MILESTONE: $name | $details"
  
  sqlite3 "$DB_FILE" "INSERT INTO milestones (name, details) VALUES ('$(sql_escape "$name")', '$(sql_escape "$details")');"
}

# record_command: Logs the result of a shell command to the database.
record_command() {
  local cmd="$1"
  local code="$2"
  local output="$3"
  
  # Ensure the exit code is a valid integer.
  [[ "$code" =~ ^[0-9]+$ ]] || code=999

  sqlite3 "$DB_FILE" "INSERT INTO commands (command, exit_code, output) VALUES ('$(sql_escape "$cmd")', $code, '$(sql_escape "$output")');"
}

# run_audit: Executes a command with a default 10s timeout.
run_audit() {
  run_audit_timeout 10s "$@"
}

# run_audit_timeout: Executes a command with a custom timeout and logs its output/exit code.
run_audit_timeout() {
  local timeout_val="$1"
  local label="$2"
  shift 2
  log "RUNNING COMMAND: $label ($*) [Timeout: $timeout_val]"
  local output
  local exit_code=0
  
  # We use the provided timeout to prevent stalled commands from blocking the controller.
  # We use 'eval' to support complex commands if needed, but carefully.
  output=$(timeout "$timeout_val" "$@" 2>&1) || exit_code=$?
  
  # Print output to terminal verbatim if it's a failure or if verbose mode (implied by log)
  if [[ $exit_code -ne 0 ]]; then
    log "COMMAND FAILED: $label (Exit Code: $exit_code)"
    echo "--- FAILURE OUTPUT ---"
    echo "$output"
    echo "----------------------"
  fi
  
  record_command "$label $*" "$exit_code" "$output"
  return "$exit_code"
}

# forensic_handshake: Performs a deep audit of the network state.
forensic_handshake() {
  record_milestone "FORENSIC_HANDSHAKE_START"
  detect_interface
  
  # ICMP & DNS
  run_audit "ICMP Check" ping -c 3 -W 2 8.8.8.8 || true
  run_audit "DNS Forensic (System)" getent hosts google.com || true
  run_audit "DNS Forensic (External)" dig @8.8.8.8 +short google.com || true
  
  # Path & Quality
  run_audit "Path Forensic" ip route || true
  run_audit "ARP Forensic" ip neighbor show || true
  
  # Broadcom-specific forensics
  run_audit "Broadcom Forensic (rfkill)" rfkill list || true
  run_audit "Broadcom Forensic (dmesg)" dmesg | tail -50 | grep -Ei 'broadcom|bcm|wifi|wl|brcm' || true
  run_audit "Broadcom Forensic (NM status)" nmcli device status || true
  
  record_milestone "FORENSIC_HANDSHAKE_COMPLETE"
}

# -----------------------------------------------------------------------------
# NETWORK SENSORS
# -----------------------------------------------------------------------------
# networking_enabled: Checks if NetworkManager has networking globally enabled.
networking_enabled() {
  nmcli networking 2>/dev/null | grep -q "enabled" || return 1
}

# calculate_health: Performs a multi-layered check to determine network health.
# Returns a score from 0 to 100.
calculate_health() {
  local score=0
  # Layer 1: ICMP Ping to a reliable public IP (Cloudflare DNS).
  if ping -c1 -W1 1.1.1.1 >/dev/null 2>&1; then
    score=$((score + 40))
  fi
  # Layer 2: DNS Resolution check.
  if getent hosts google.com >/dev/null 2>&1; then
    score=$((score + 30))
  fi
  # Layer 3: Routing Table check (presence of a default gateway).
  if ip route | grep -q "^default"; then
    score=$((score + 30))
  fi
  echo "$score"
}

# -----------------------------------------------------------------------------
# PID CONTROL LOGIC
# -----------------------------------------------------------------------------
# PID_CONTROL: Calculates the control signal based on the health sensor.
# Uses scaled integer math to simulate proportional, integral, and derivative logic.
PID_CONTROL() {
  local current error D_error output
  current=$(calculate_health)
  
  # Error is the difference between target (100% health) and current health.
  error=$(( (100 - current) * SCALE ))

  # Low-pass filter (LPF) to smooth out transient noise in the health signal.
  # Alpha = 0.3 (300/1000)
  error=$(( (prev_error * 700 + error * 300) / 1000 ))

  # Deadband: If the error is small enough, we treat it as zero to avoid
  # unnecessary "hunting" or small corrections.
  local abs_error=${error#-}
  if (( abs_error < DEADBAND * SCALE )); then
    prev_error=$error
    echo 0
    return
  fi

  # Derivative: Rate of change of the error.
  D_error=$((error - prev_error))

  # Tentative Integral: Accumulate the error.
  local tentative_I=$((I_error + error))

  # Compute the raw control signal.
  local raw_output=$(( (Kp * error + Ki * tentative_I + Kd * D_error) / SCALE ))

  # Saturation & Anti-Windup Logic:
  # If the output is already at its maximum, we stop accumulating the integral
  # term to prevent it from "winding up" to an unrecoverable value.
  local saturated=0
  if (( raw_output > MAX_OUTPUT )); then
    output=$MAX_OUTPUT
    saturated=1
  elif (( raw_output < MIN_OUTPUT )); then
    output=$MIN_OUTPUT
    saturated=1
  else
    output=$raw_output
  fi

  # Only integrate if the controller is not currently saturated.
  if (( saturated == 0 )); then
    I_error=$tentative_I
    # Hard safety clamp on the integral term as a secondary defense.
    if (( I_error > I_CLAMP * SCALE )); then I_error=$((I_CLAMP * SCALE)); fi
    if (( I_error < -I_CLAMP * SCALE )); then I_error=$((-I_CLAMP * SCALE)); fi
  fi

  # Store current error for the next derivative calculation.
  prev_error=$error
  echo "$output"
}

# -----------------------------------------------------------------------------
# CONNECTION SELECTION
# -----------------------------------------------------------------------------
# select_best_connection: 
#   Scans available NetworkManager connections and picks the most suitable 
#   candidate for activation.
# 
# Priority Logic:
#   1. Connected Ethernet: If a wired connection is already active, we 
#      prioritize it to avoid unnecessary Wi-Fi toggling.
#   2. Configured Wireless: If no Ethernet is found, we look for any 
#      configured 802.11 (Wi-Fi) connection.
#
# This function uses UUIDs for all operations because connection names 
# can contain spaces, colons, or other characters that break simple 
# string parsing. UUIDs are guaranteed to be safe.
select_best_connection() {
  local best_uuid=""
  
  # Fetch all connection UUIDs from NetworkManager.
  # -t: Terse mode (no headers).
  # -f UUID: Only output the UUID field.
  local uuids
  uuids=$(nmcli -t -f UUID connection show)

  # Phase 1: Search for an active Ethernet connection.
  # We iterate through all UUIDs and check their type and state.
  for uuid in $uuids; do
    [[ -z "$uuid" ]] && continue
    local type
    # connection.type: e.g., '802-3-ethernet' or '802-11-wireless'
    type=$(nmcli -g connection.type connection show uuid "$uuid" 2>/dev/null || echo "unknown")
    if [[ "$type" == "802-3-ethernet" ]]; then
      local state
      # GENERAL.STATE: e.g., '100 (connected)'
      state=$(nmcli -g GENERAL.STATE device show uuid "$uuid" 2>/dev/null || echo "unknown")
      if [[ "$state" == "100 (connected)" ]]; then
        # If we find a connected Ethernet, we stop immediately and return its UUID.
        echo "$uuid"
        return 0
      fi
    fi
  done

  # Phase 2: Search for any configured Wireless connection.
  # If no active Ethernet was found, we look for a Wi-Fi connection to activate.
  # We prefer connections that are already "active" but might be in a degraded state.
  for uuid in $uuids; do
    [[ -z "$uuid" ]] && continue
    local type
    type=$(nmcli -g connection.type connection show uuid "$uuid" 2>/dev/null || echo "unknown")
    if [[ "$type" == "802-11-wireless" ]]; then
      local state
      state=$(nmcli -g GENERAL.STATE device show uuid "$uuid" 2>/dev/null || echo "unknown")
      if [[ "$state" == "100 (connected)" ]]; then
        # If it's already connected, we return it as the best candidate.
        echo "$uuid"
        return 0
      fi
    fi
  done

  # Fallback: Return the first Wi-Fi connection found.
  for uuid in $uuids; do
    [[ -z "$uuid" ]] && continue
    local type
    type=$(nmcli -g connection.type connection show uuid "$uuid" 2>/dev/null || echo "unknown")
    if [[ "$type" == "802-11-wireless" ]]; then
      echo "$uuid"
      return 0
    fi
  done

  # Return an empty string if no suitable connection is found.
  echo ""
}

# -----------------------------------------------------------------------------
# RECOVERY ACTIONS
# -----------------------------------------------------------------------------
# recover: The main recovery sequence triggered when health is critically low.
recover() {
  local current_health
  current_health=$(calculate_health)
  
  if [[ "$current_health" -eq 100 ]]; then
    log "RECOVERY_SKIPPED: System health is already 100/100. No action required."
    record_milestone "RECOVERY_SKIPPED" "Health is 100/100"
    return 0
  fi

  record_milestone "RECOVERY_SEQUENCE_START" "Current Health: $current_health/100"
  detect_interface

  # Nuclear Step 1: Nuclear Clear (kill conflicting processes and reset NM)
  record_milestone "NUCLEAR_CLEAR_START"
  run_audit "Nuclear Clear (kill)" pkill -9 -f 'wpa_supplicant|dhclient|NetworkManager' || true
  sleep 1
  run_audit "Nuclear Clear (restart NM)" systemctl restart NetworkManager || true
  sleep 2
  
  # Nuclear Step 2: System Setup (driver/firmware reload)
  record_milestone "SYSTEM_SETUP_START"
  # Try to unload both common Broadcom modules if they are loaded
  local modules_to_unload=()
  for mod in brcmfmac wl; do
    if lsmod | grep -q "^$mod"; then
      modules_to_unload+=("$mod")
    fi
  done
  
  if [[ ${#modules_to_unload[@]} -gt 0 ]]; then
    run_audit "System Setup (unload)" modprobe -r "${modules_to_unload[@]}" || true
  fi
  # Reload the open-source driver (standard for Fedora BCM4331)
  run_audit "System Setup (reload)" modprobe brcmfmac || true
  # Disable power management which often causes drops on Broadcom
  run_audit "System Setup (power_save off)" iw dev "${INTERFACE}" set power_save off || true
  run_audit "System Setup (NM managed)" nmcli device set "${INTERFACE}" managed yes || true

  # Step 3: Ensure networking is globally enabled in NetworkManager.
  if ! networking_enabled; then
    record_milestone "NETWORKING_GLOBALLY_DISABLED"
    if [[ "$AUTO_REENABLE_NETWORKING" -eq 1 ]]; then
      run_audit "global networking enable" nmcli networking on
    fi
    # Give it a moment to initialize.
    sleep 2
  fi

  # Step 4: Identify the best connection to attempt activation.
  local uuid
  uuid=$(select_best_connection)

  if [[ -z "$uuid" ]]; then
    record_milestone "NO_CONFIGURED_CONNECTIONS_FOUND"
    # Fallback: Try to activate the very first connection in the list.
    uuid=$(nmcli -t -f UUID connection show | head -n1)
  fi

  # Step 5: Perform Forensic Handshake before activation
  forensic_handshake

  # Step 6: Attempt to bring the connection up with retries.
  if [[ -n "$uuid" ]]; then
    # Check if the connection is already active and healthy.
    local state
    state=$(nmcli -g GENERAL.STATE device show uuid "$uuid" 2>/dev/null || echo "unknown")
    if [[ "$state" == "100 (connected)" ]]; then
      log "Connection $uuid is already active. Checking health..."
      local health
      health=$(calculate_health)
      if [[ "$health" -eq 100 ]]; then
        record_milestone "CONNECTION_ALREADY_ACTIVE_AND_HEALTHY" "UUID $uuid"
        return 0
      fi
      log "Connection $uuid is active but health is degraded ($health/100). Re-activating..."
    fi

    local retries=3
    local attempt=1
    local success=0
    
    while [[ $attempt -le $retries ]]; do
      record_milestone "CONNECTION_ACTIVATION_ATTEMPT" "Attempt $attempt of $retries for UUID $uuid"
      # We use a longer 60s timeout for connection activation specifically for BCM4331.
      if run_audit_timeout 60s "connection activation" nmcli connection up uuid "$uuid"; then
        success=1
        break
      fi
      log "WARNING: Connection activation attempt $attempt failed. Retrying in 5s..."
      sleep 5
      attempt=$((attempt + 1))
    done
    
    if [[ $success -eq 1 ]]; then
      record_milestone "CONNECTION_ACTIVATION_SUCCESS" "UUID $uuid"
    else
      record_milestone "CONNECTION_ACTIVATION_FAILURE" "All $retries attempts failed for UUID $uuid"
      # If activation failed, try a soft reset of the interface.
      run_audit "interface reset (disconnect)" nmcli device disconnect uuid "$uuid" 2>/dev/null || true
      sleep 2
      run_audit "interface reset (connect)" nmcli device connect uuid "$uuid" 2>/dev/null || true
    fi
  else
    record_milestone "CRITICAL_FAILURE_NO_UUID"
  fi
  
  # Step 7: Final verification
  local final_health
  final_health=$(calculate_health)
  record_milestone "RECOVERY_SEQUENCE_COMPLETE" "Final Health: $final_health/100"
}

# -----------------------------------------------------------------------------
# MAIN EXECUTION LOOP
# -----------------------------------------------------------------------------
main() {
  init_db
  install_dependencies
  detect_interface
  record_milestone "CONTROLLER_INITIALIZED"

  log "Broadcom Network Controller active. Monitoring health..."

  while true; do
    local control
    # Calculate the control signal from the PID loop.
    control=$(PID_CONTROL)
    
    log "PID CONTROL SIGNAL: $control"

    # Decision Logic based on the control signal:
    if (( control < HYSTERESIS_LOW )); then
      # Signal is low: Network is performing within acceptable parameters.
      log "STATUS: Stable. No action required."
    elif (( control < HYSTERESIS_HIGH )); then
      # Signal is moderate: Performance is degrading. Perform a "soft" reset.
      log "STATUS: Degrading. Triggering soft network toggle..."
      run_audit "soft reset" nmcli networking off
      sleep 1
      run_audit "soft reset" nmcli networking on
    else
      # Signal is high: Critical failure detected. Trigger full recovery.
      log "STATUS: Critical failure. Triggering full recovery engine..."
      recover
    fi
    
    # Wait 10 seconds before the next sensor reading.
    sleep 10
  done
}

# -----------------------------------------------------------------------------
# ENTRY POINT
# -----------------------------------------------------------------------------
# Support for manual "force" recovery via CLI argument.
if [[ "${1:-}" == "--force" ]]; then
  init_db
  install_dependencies
  detect_interface
  recover
  exit 0
fi

# Start the main monitoring loop.
main

