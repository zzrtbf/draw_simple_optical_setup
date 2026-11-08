/**
 * Dependency-free static server for the production build.
 * Starts on 127.0.0.1:5180 and (with --open) pops the app up in a chromeless window.
 *
 *   node scripts/serve.mjs --open
 *   node scripts/serve.mjs --port=5181
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appBundle, findBrowser } from './browser-path.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'dist');
const portArg = process.argv.find((a) => a.startsWith('--port='));
const port = Number(portArg ? portArg.split('=')[1] : process.env.PORT || 5180);
const shouldOpen = process.argv.includes('--open');
const host = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('dist/index.html is missing — run `npm run build` first.');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(root, 'index.html');
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
});

function openBrowser() {
  const url = `http://${host}:${port}/`;
  const exe = findBrowser();
  if (process.platform === 'win32') {
    // a chromeless app window looks like a real desktop app
    exec(exe ? `start "" "${exe}" --app=${url} --window-size=1600,980` : `start "" "${url}"`);
  } else if (process.platform === 'darwin') {
    // macOS default is Safari: it cannot do a chromeless app window, but it is
    // the browser the user actually works in. `OB_BROWSER=chrome` switches to
    // the Chrome/Edge `--app=` window when one is installed.
    const wantChromium = /^(chrome|chromium|edge|brave)$/i.test(process.env.OB_BROWSER || '');
    if (wantChromium && exe) exec(`open -na "${appBundle(exe)}" --args --app=${url}`);
    else exec(`open -a Safari "${url}"`);
  } else {
    exec(exe ? `"${exe}" --app=${url}` : `xdg-open "${url}"`);
  }
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${port} is already serving something — opening it instead.`);
    if (shouldOpen) openBrowser();
    setTimeout(() => process.exit(0), 800);
    return;
  }
  throw err;
});

server.listen(port, host, () => {
  console.log(`Optical Bench running at http://${host}:${port}/`);
  console.log('Close this window to stop the server.');
  if (shouldOpen) openBrowser();
});
