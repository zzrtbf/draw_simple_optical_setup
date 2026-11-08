/**
 * Finds a Chromium-based browser for the launcher and the Playwright tests.
 * Override with EDGE_PATH or CHROME_PATH.
 */
import fs from 'node:fs';

const CANDIDATES = {
  win32: [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
};

export function findBrowser() {
  for (const env of ['EDGE_PATH', 'CHROME_PATH']) {
    const v = process.env[env];
    if (v && fs.existsSync(v)) return v;
  }
  for (const p of CANDIDATES[process.platform] ?? []) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" -> "/Applications/Google Chrome.app" */
export function appBundle(exe) {
  const i = exe.indexOf('.app/');
  return i > 0 ? exe.slice(0, i + 4) : exe;
}
