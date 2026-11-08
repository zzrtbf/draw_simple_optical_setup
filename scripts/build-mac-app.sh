#!/bin/bash
# Builds "Optical Bench.app" (and a .dmg) for macOS.
#
#   bash scripts/build-mac-app.sh              # web build + swift build + .app + .dmg
#   bash scripts/build-mac-app.sh --skip-web   # reuse the existing dist/
#   bash scripts/build-mac-app.sh --no-dmg     # .app only
#
# Needs only the Xcode Command Line Tools (swiftc + iconutil + hdiutil).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

SKIP_WEB=0
MAKE_DMG=1
for arg in "$@"; do
  case "$arg" in
    --skip-web) SKIP_WEB=1 ;;
    --no-dmg) MAKE_DMG=0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

VERSION="$(node -p "require('./package.json').version")"
BUILD="$(node -p "const v=require('./package.json').version.split('.').map(Number); v[0]*10000+v[1]*100+v[2]")"
APP_NAME="Optical Bench"
APP="build/$APP_NAME.app"

echo "==> Optical Bench $VERSION (build $BUILD)"

if [ "$SKIP_WEB" -eq 0 ]; then
  echo "==> bundling the frontend"
  npm run build
fi
[ -f dist/index.html ] || { echo "dist/index.html is missing — run without --skip-web" >&2; exit 1; }

echo "==> compiling the Swift shell"
mkdir -p build
swiftc -O -swift-version 5 \
  -target arm64-apple-macos11.0 \
  -o build/OpticalBench \
  macos/src/main.swift macos/src/NativeBridge.swift macos/src/WebSchemeHandler.swift \
  -framework Cocoa -framework WebKit -framework UniformTypeIdentifiers

echo "==> assembling $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"
cp build/OpticalBench "$APP/Contents/MacOS/OpticalBench"
sed -e "s/__VERSION__/$VERSION/g" -e "s/__BUILD__/$BUILD/g" macos/Info.plist > "$APP/Contents/Info.plist"
cp -R dist/. "$APP/Contents/Resources/web/"

if [ -d assets/app.iconset ]; then
  iconutil -c icns assets/app.iconset -o "$APP/Contents/Resources/AppIcon.icns"
else
  echo "    (no assets/app.iconset — running npm run icon)"
  npm run icon >/dev/null
  iconutil -c icns assets/app.iconset -o "$APP/Contents/Resources/AppIcon.icns"
fi

echo "==> ad-hoc signing"
codesign --force --sign - "$APP" >/dev/null 2>&1
xattr -cr "$APP" 2>/dev/null || true
codesign --verify --deep --strict "$APP" && echo "    signature ok"

if [ "$MAKE_DMG" -eq 1 ]; then
  DMG="build/$APP_NAME $VERSION.dmg"
  echo "==> building $DMG"
  rm -f "$DMG"
  hdiutil create -quiet -volname "$APP_NAME" -srcfolder "$APP" -ov -format UDZO "$DMG"
fi

echo
echo "==> done"
du -sh "$APP" | sed 's/^/    app: /'
du -sh "$APP/Contents/Resources/web" | sed 's/^/      web assets: /'
if [ "$MAKE_DMG" -eq 1 ]; then
  du -sh "build/$APP_NAME $VERSION.dmg" | sed 's/^/    dmg: /'
fi
