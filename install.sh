#!/bin/bash
set -e

REPO="NesanSelvan/Agents-Space"
APP_NAME="Agents Space"

echo "🚀 Installing $APP_NAME..."

# Detect OS and architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

# Get latest release download URL
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST" ]; then
  echo "Error: Could not fetch latest release. Check https://github.com/$REPO/releases"
  exit 1
fi

echo "Latest version: $LATEST"

case "$OS" in
  Darwin)
    if [ "$ARCH" = "arm64" ]; then
      ASSET_PATTERN="arm64.dmg"
    else
      ASSET_PATTERN="x64.dmg"
    fi

    DMG_URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
      | grep "browser_download_url" \
      | grep "$ASSET_PATTERN" \
      | head -1 \
      | sed -E 's/.*"([^"]+)".*/\1/')

    if [ -z "$DMG_URL" ]; then
      # Fallback: grab any .dmg
      DMG_URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
        | grep "browser_download_url" \
        | grep ".dmg" \
        | head -1 \
        | sed -E 's/.*"([^"]+)".*/\1/')
    fi

    if [ -z "$DMG_URL" ]; then
      echo "Error: No macOS installer found in release $LATEST"
      exit 1
    fi

    TMPDIR_PATH=$(mktemp -d)
    TMPFILE="$TMPDIR_PATH/agents-space.dmg"
    echo "⬇  Downloading $APP_NAME $LATEST..."
    curl -fSL --progress-bar -o "$TMPFILE" "$DMG_URL"

    echo "📦 Mounting disk image..."
    hdiutil attach "$TMPFILE" -nobrowse -noverify -noautoopen -mountpoint /tmp/agents-space-mount > /dev/null 2>&1

    echo "📂 Copying to /Applications..."
    rm -rf "/Applications/$APP_NAME.app"
    cp -R "/tmp/agents-space-mount/$APP_NAME.app" "/Applications/"

    echo "🧹 Cleaning up..."
    hdiutil detach /tmp/agents-space-mount > /dev/null 2>&1
    rm -rf "$TMPDIR_PATH"

    echo ""
    echo "✅ $APP_NAME $LATEST installed successfully!"
    echo "   Run it from Spotlight or: open '/Applications/$APP_NAME.app'"
    ;;

  MINGW*|MSYS*|CYGWIN*)
    EXE_URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
      | grep "browser_download_url" \
      | grep ".exe" \
      | head -1 \
      | sed -E 's/.*"([^"]+)".*/\1/')

    if [ -z "$EXE_URL" ]; then
      echo "Error: No Windows installer found in release $LATEST"
      exit 1
    fi

    TMPFILE="$TEMP/AgentsSpace-Setup.exe"
    echo "Downloading $EXE_URL..."
    curl -fSL -o "$TMPFILE" "$EXE_URL"

    echo "Running installer..."
    start "" "$TMPFILE"

    echo "✅ Installer launched! Follow the setup wizard."
    ;;

  *)
    echo "Error: Unsupported OS ($OS). Download manually from:"
    echo "https://github.com/$REPO/releases/latest"
    exit 1
    ;;
esac
