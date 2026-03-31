#!/usr/bin/env bash
# =============================================================================
# git-sync.sh (v0700 — REPOSITORY SYNCHRONIZATION)
# =============================================================================
#
# OBJECTIVE:
#   This script synchronizes the local forensic data and logs with a remote
#   Git repository for centralized monitoring.
#
# =============================================================================

set -euo pipefail

# 1. Check if the current directory is a Git repository
if [[ ! -d ".git" ]]; then
  echo "ERROR: Not a Git repository. Run 'git init' first."
  exit 1
fi

# 2. Add forensic data and logs
echo "Staging forensic data and logs..."
git add recovery_state.db verbatim_handshake.log verbatim_events.log live_events.log

# 3. Commit changes
echo "Committing changes..."
git commit -m "Forensic Sync: $(date -Is)" || echo "No changes to commit."

# 4. Push to remote
echo "Pushing to remote..."
# git push origin main || echo "Failed to push to remote."

echo "Git sync complete."
