#!/bin/bash
# Builds Token Hero and assembles a .app bundle
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/.build/release"
APP_DIR="$SCRIPT_DIR/dist/Token Hero.app"
CONTENTS="$APP_DIR/Contents"
MACOS="$CONTENTS/MacOS"

echo "[1/3] Building release..."
cd "$SCRIPT_DIR"
swift build -c release

echo "[2/3] Assembling .app bundle..."
rm -rf "$APP_DIR"
mkdir -p "$MACOS"

# Copy binary
cp "$BUILD_DIR/TokenHero" "$MACOS/TokenHero"

# Copy Info.plist
cp "$SCRIPT_DIR/TokenHero/Resources/Info.plist" "$CONTENTS/Info.plist"

echo "[3/3] Done."
echo "  App bundle: $APP_DIR"
echo ""
echo "  To run:  open \"$APP_DIR\""
echo "  To install: cp -r \"$APP_DIR\" /Applications/"
