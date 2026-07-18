#!/usr/bin/env node
/**
 * Unified server: static game files + multiplayer WebSocket relay on one port.
 *
 * Usage: npm start
 *   PORT=8080 node server/index.js
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { attachMultiplayerRelay } = require('./relay');

const PORT = parseInt(process.env.PORT || '8080', 10);
const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
let indexHtmlCache = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.glsl': 'text/plain; charset=utf-8',
  '.vert': 'text/plain; charset=utf-8',
  '.frag': 'text/plain; charset=utf-8',
  '.weathersandbox': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const BLOCKED_DIRS = new Set([
  'node_modules',
  'server',
  '.git',
  '.cursor',
  'test',
  'tools',
  'scripts',
  'docs',
  'attached_assets',
  '_ref_frames',
]);

const BLOCKED_FILE_PREFIXES = ['_extract_', '_panel_', '_line', '_grid_', '_dyn_', '_replace_', '_measure_', '_skewfn_'];

function safePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent((urlPath || '/').split('?')[0]);
  } catch (e) {
    return null;
  }
  const rel = decoded.replace(/^\/+/, '') || 'index.html';
  const normalized = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  const abs = path.resolve(ROOT, normalized);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (abs !== ROOT && !abs.startsWith(rootWithSep))
    return null;
  const relCheck = path.relative(ROOT, abs);
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck))
    return null;
  const parts = normalized.split(/[/\\]/);
  if (parts.some((p) => BLOCKED_DIRS.has(p)))
    return null;
  const base = parts[parts.length - 1] || '';
  if (BLOCKED_FILE_PREFIXES.some((p) => base.startsWith(p)) || base.endsWith('_diff.txt'))
    return null;
  return abs;
}

function getPublicPlayUrlInject() {
  const parts = [];
  const external = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_PLAY_URL || '';
  if (external)
    parts.push('window.__WEATHER_PUBLIC_PLAY_URL=' + JSON.stringify(String(external).trim().replace(/\/$/, '')) + ';');
  const corsProxy = process.env.WEATHER_CORS_PROXY || '';
  if (corsProxy)
    parts.push('window.__WEATHER_CORS_PROXY=' + JSON.stringify(String(corsProxy)) + ';');
  if (!parts.length) return '';
  return '<script>' + parts.join('') + '</script>\n    ';
}

function serveIndexHtml(res) {
  if (!indexHtmlCache) {
    try {
      indexHtmlCache = fs.readFileSync(INDEX_PATH, 'utf8');
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('index.html not found');
      return;
    }
  }
  const inject = getPublicPlayUrlInject();
  let body = indexHtmlCache;
  if (inject) {
    const marker = '<script type="text/javascript" src="network/config.js"></script>';
    if (body.includes(marker))
      body = body.replace(marker, inject + marker);
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function serveFile(res, filePath) {
  if (path.resolve(filePath) === path.resolve(INDEX_PATH)) {
    serveIndexHtml(res);
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(filePath).pipe(res);
  });
}

function staticHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed');
    return;
  }

  const filePath = safePath(req.url || '/');
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      serveFile(res, path.join(filePath, 'index.html'));
      return;
    }
    if (err) {
      const fallback = safePath('/index.html');
      if (fallback) serveFile(res, fallback);
      else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
      return;
    }
    serveFile(res, filePath);
  });
}

const server = http.createServer(staticHandler);
attachMultiplayerRelay(server);

server.listen(PORT, () => {
  console.log('2D Weather Sandbox running at http://localhost:' + PORT);
  console.log('Multiplayer relay active on the same port (WebSocket)');
});
