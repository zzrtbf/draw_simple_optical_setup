/**
 * Builds "Optical Bench.app" so the tool gets a real Dock icon and can be
 * double-clicked from Finder. macOS only.
 *
 *   node scripts/make-mac-app.mjs
 *
 * NOTE: authored on Windows and therefore **unverified on macOS** — run it and
 * check that the app launches with a chromeless window before relying on it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  console.error('This script only builds macOS app bundles.');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'Optical Bench.app');
const contents = path.join(appPath, 'Contents');
const macos = path.join(contents, 'MacOS');
const resources = path.join(contents, 'Resources');

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('dist/index.html missing — run `npm run build` first.');
  process.exit(1);
}

fs.rmSync(appPath, { recursive: true, force: true });
fs.mkdirSync(macos, { recursive: true });
fs.mkdirSync(resources, { recursive: true });

/* icon: iconset -> icns */
const iconset = path.join(root, 'assets', 'app.iconset');
if (!fs.existsSync(iconset)) {
  console.error('assets/app.iconset missing — run `npm run icon` first.');
  process.exit(1);
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(resources, 'app.icns')]);

/* launcher: bake the node binary in, since a .app starts with a minimal PATH */
const run = `#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$DIR" || exit 1
exec "${process.execPath}" "$DIR/scripts/serve.mjs" --open
`;
fs.writeFileSync(path.join(macos, 'run'), run, { mode: 0o755 });

/* Info.plist */
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Optical Bench</string>
  <key>CFBundleDisplayName</key><string>Optical Bench</string>
  <key>CFBundleIdentifier</key><string>local.opticalbench</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>run</string>
  <key>CFBundleIconFile</key><string>app</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSApplicationCategoryType</key><string>public.app-category.graphics-design</string>
</dict>
</plist>
`;
fs.writeFileSync(path.join(contents, 'Info.plist'), plist);

console.log(`built ${path.relative(root, appPath)}`);
console.log('Double-click it from Finder. Closing the app quits the local server.');
