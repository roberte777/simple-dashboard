#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

echo "Building Tauri app..."
npx tauri build

BUNDLE_DIR="src-tauri/target/release/bundle"
DMG_SCRIPT="$BUNDLE_DIR/dmg/bundle_dmg.sh"
APP_PATH="$BUNDLE_DIR/macos/GH Dash.app"
DMG_PATH="$BUNDLE_DIR/dmg/GH Dash_0.1.0_aarch64.dmg"

if [ ! -f "$DMG_SCRIPT" ]; then
  echo "Error: bundle_dmg.sh not found at $DMG_SCRIPT"
  exit 1
fi

echo "Creating DMG..."
rm -f "$DMG_PATH"
"$DMG_SCRIPT" \
  --volname "GH Dash" \
  --icon "GH Dash.app" 180 170 \
  --app-drop-link 480 170 \
  --window-size 660 400 \
  --icon-size 80 \
  --hide-extension "GH Dash.app" \
  "$DMG_PATH" \
  "$APP_PATH"

echo ""
echo "Done! DMG created at:"
echo "  $BUNDLE_DIR/dmg/GH Dash_0.1.0_aarch64.dmg"
