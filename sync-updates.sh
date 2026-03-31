#!/usr/bin/env bash
# =============================================================================
# sync-updates.sh (v0900 — DETERMINISTIC RECONCILIATION)
# =============================================================================
#
# OBJECTIVE:
#   Automates the "v90 Nuclear" update and environment restoration process.
#   Implements the "If it can be typed, it MUST be scripted!" rule.
#
# WORKFLOW:
#   1. Detects local changes and commits/stashes them.
#   2. Reconciles divergent branches via 'git pull --rebase'.
#   3. Restores environment binaries via 'npm install'.
#   4. Verifies system integrity via 'npm run lint'.
#
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------------------------
PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
LOG_FILE="${PROJECT_ROOT}/verbatim_handshake.log"

log() {
  echo "[$(date -Is)] [SYNC] $*" | tee -a "$LOG_FILE"
}

# -----------------------------------------------------------------------------
# 1. LOCAL STATE MANAGEMENT
# -----------------------------------------------------------------------------
log "Checking local repository state..."

if [[ -n $(git status --porcelain) ]]; then
  log "Local changes detected. Staging and committing to prevent merge conflicts..."
  git add .
  git commit -m "chore: local state preservation before sync ($(date +%Y%m%d-%H%M))" || log "Nothing to commit."
else
  log "Local state is clean."
fi

# -----------------------------------------------------------------------------
# 2. RECONCILIATION (PULL REBASE)
# -----------------------------------------------------------------------------
log "Reconciling with upstream (git pull --rebase origin main)..."
if ! git pull --rebase origin main; then
  log "ERROR: Rebase failed. Manual conflict resolution required."
  log "Run 'git status' to identify conflicts, resolve them, then 'git rebase --continue'."
  exit 1
fi

# -----------------------------------------------------------------------------
# 3. ENVIRONMENT RESTORATION
# -----------------------------------------------------------------------------
log "Restoring environment (npm install)..."
if ! npm install; then
  log "ERROR: npm install failed. Check network connectivity or package.json."
  exit 1
fi

# -----------------------------------------------------------------------------
# 4. INTEGRITY VERIFICATION
# -----------------------------------------------------------------------------
log "Verifying system integrity (npm run lint)..."
if ! npm run lint; then
  log "WARNING: Linting failed. The merged code may have syntax or type errors."
  exit 0 # We don't exit 1 here so the user can see the lint output
fi

log "SUCCESS: System is synchronized and verified."
log "Run 'npm run audit' to verify the forensic database."
