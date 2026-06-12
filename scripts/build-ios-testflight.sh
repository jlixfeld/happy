#!/usr/bin/env bash
# Local TestFlight build for the Happy fork (bundle ca.lixfeld.happy).
# Headless signing via App Store Connect API key — Seneca/SoundSpotter pattern:
# the three -authenticationKey* flags must be on BOTH archive and -exportArchive,
# otherwise headless automatic signing fails ("error: No Accounts") or produces
# a generic profile missing entitlements.
#
# Requires in env: APPLE_ASC_KEY_ID, APPLE_ASC_ISSUER_ID, APPLE_TEAM_ID
# Requires on disk: ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Pull APPLE_ASC_KEY_ID / APPLE_ASC_ISSUER_ID from Infisical unless already set.
if [[ -z "${APPLE_ASC_KEY_ID:-}" || -z "${APPLE_ASC_ISSUER_ID:-}" ]]; then
    eval "$("$SCRIPT_DIR/fetch-secrets.sh" "$REPO_ROOT")"
fi

# Apple developer team (not a secret — same team as SoundSpotter/Governor).
APPLE_TEAM_ID="${APPLE_TEAM_ID:-9V7672H2GA}"

cd "$REPO_ROOT/packages/happy-app"

: "${APPLE_ASC_KEY_ID:?APPLE_ASC_KEY_ID not set}"
: "${APPLE_ASC_ISSUER_ID:?APPLE_ASC_ISSUER_ID not set}"

P8_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_${APPLE_ASC_KEY_ID}.p8"
[[ -f "$P8_PATH" ]] || { echo "ERROR: ASC API key not found at $P8_PATH" >&2; exit 1; }

command -v pod >/dev/null || { echo "ERROR: CocoaPods not installed (brew install cocoapods)" >&2; exit 1; }

export HAPPY_BUILD_NUMBER="$(date +%y%m%d%H%M)"
BUILD_DIR="$(pwd)/build-testflight"
rm -rf "$BUILD_DIR" ios
mkdir -p "$BUILD_DIR"

# react-native-audio-api 0.8.x: Constants.h uses size_t without <cstddef>;
# Xcode 26.5 clang rejects it. patch-package can't persist this under pnpm's
# hoisted layout, so apply idempotently here.
AUDIO_HDR="$REPO_ROOT/node_modules/react-native-audio-api/common/cpp/audioapi/core/Constants.h"
if [[ -f "$AUDIO_HDR" ]] && ! grep -q '<cstddef>' "$AUDIO_HDR"; then
    sed -i '' 's|#include <cmath>|#include <cmath>\n#include <cstddef>|' "$AUDIO_HDR"
    echo "==> Patched react-native-audio-api Constants.h (<cstddef>)"
fi

echo "==> Prebuild (APP_ENV=production, buildNumber=$HAPPY_BUILD_NUMBER)"
# FORCE_COLOR=0: expo's FORCE_COLOR=1 makes `node --print` emit ANSI-wrapped
# "undefined" inside VisionCamera.podspec's worklets probe, which then
# mis-detects react-native-worklets-core as installed ("found at .") and
# enables FrameProcessors → pod install fails on the missing podspec.
APP_ENV=production FORCE_COLOR=0 npx expo prebuild --platform ios

WORKSPACE=$(ls -d ios/*.xcworkspace | head -1)
SCHEME=$(basename "$WORKSPACE" .xcworkspace)

echo "==> Archive ($SCHEME)"
xcodebuild archive \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath "$BUILD_DIR/Happy.xcarchive" \
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
    CODE_SIGN_STYLE=Automatic \
    -allowProvisioningUpdates \
    -authenticationKeyPath "$P8_PATH" \
    -authenticationKeyID "$APPLE_ASC_KEY_ID" \
    -authenticationKeyIssuerID "$APPLE_ASC_ISSUER_ID"

cat > "$BUILD_DIR/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key><string>app-store-connect</string>
    <key>teamID</key><string>${APPLE_TEAM_ID}</string>
</dict>
</plist>
EOF

echo "==> Export"
# macOS 15+ ships openrsync at /usr/bin/rsync. Xcode's IPA packaging spawns
# rsync which finds Homebrew GNU rsync in PATH; the two disagree on `-E`
# (openrsync = extended-attrs, GNU = executability) and export fails with
# "Copy failed". Force system PATH for export. (Lifted from the apple-build
# plugin's canonical build-ios.sh.)
PATH=/usr/bin:/bin:/usr/sbin:/sbin xcodebuild -exportArchive \
    -archivePath "$BUILD_DIR/Happy.xcarchive" \
    -exportPath "$BUILD_DIR/export" \
    -exportOptionsPlist "$BUILD_DIR/ExportOptions.plist" \
    -allowProvisioningUpdates \
    -authenticationKeyPath "$P8_PATH" \
    -authenticationKeyID "$APPLE_ASC_KEY_ID" \
    -authenticationKeyIssuerID "$APPLE_ASC_ISSUER_ID"

IPA=$(ls "$BUILD_DIR"/export/*.ipa | head -1)
echo "==> Upload $IPA"
xcrun altool --upload-app -f "$IPA" -t ios \
    --apiKey "$APPLE_ASC_KEY_ID" --apiIssuer "$APPLE_ASC_ISSUER_ID"

echo "==> Done (build $HAPPY_BUILD_NUMBER)"
