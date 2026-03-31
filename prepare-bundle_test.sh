#!/usr/bin/env bash
# =============================================================================
# prepare-bundle_test.sh (v0700 — INTEGRATION TEST)
# =============================================================================
#
# OBJECTIVE:
#   This script verifies that prepare-bundle.sh correctly creates and
#   populates the offline recovery bundle.
#
# =============================================================================

set -euo pipefail

BUNDLE_DIR="offline_bundle"

# 1. Cleanup before testing
echo "Cleaning up before testing..."
rm -rf "$BUNDLE_DIR"

# 2. Run the script
echo "Running prepare-bundle.sh..."
./prepare-bundle.sh

# 3. Verify the directory exists
echo -n "Checking if $BUNDLE_DIR exists: "
if [[ -d "$BUNDLE_DIR" ]]; then
  echo "PASSED"
else
  echo "FAILED"
  exit 1
fi

# 4. Verify critical files exist
files=("manifest.txt" "ucode29_mimo.fw" "b0g0initvals13.fw" "b0g0bsinitvals13.fw")
for file in "${files[@]}"; do
  echo -n "Checking if $BUNDLE_DIR/$file exists: "
  if [[ -f "$BUNDLE_DIR/$file" ]]; then
    echo "PASSED"
  else
    echo "FAILED"
    exit 1
  fi
done

# 5. Verify manifest content
echo -n "Checking manifest content: "
if grep -q "Broadcom BCM4331 Firmware Bundle" "$BUNDLE_DIR/manifest.txt"; then
  echo "PASSED"
else
  echo "FAILED"
  exit 1
fi

echo "All prepare-bundle tests passed successfully!"
