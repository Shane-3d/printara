#!/usr/bin/env node
/**
 * Printara — Local Network Server
 *
 * Serves the web app and proxies MQTT + FTP to your Bambu printers so any
 * device on your WiFi can use the full app without the Electron desktop app.
 *
 * Usage:
 *   node server.js
 *
 * Then open the printed URL on any phone, tablet, or computer.
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const mqtt = require('mqtt');
const ftp  = require('basic-ftp');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

// ── HTTP server ────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // ── Probe endpoint: GET /server.json ──────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/server.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ printara: true, version: 1 }));
    return;
  }

  // ── FTP upload proxy: POST /ftp-upload?ip=&pin=&filename= ──────────────────
  if (req.method === 'POST' && url.pathname === '/ftp-upload') {
    const ip       = url.searchParams.get('ip');
    const pin      = url.searchParams.get('pin');
    const filename = url.searchParams.get('filename');

    if (!ip || !pin || !filename) {
      res.writeHead(400); res.end('Missing ip, pin, or filename'); return;
    }

    try {
      // Read raw body (the gcode file bytes)
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buf = Buffer.concat(chunks);

      const tmpPath = path.join(os.tmpdir(), 'printara_' + filename);
      fs.writeFileSync(tmpPath, buf);

      const client = new ftp.Client();
      client.ftp.verbose = false;
      try {
        await client.access({
          host: ip, port: 990,
          user: 'bblp', password: pin,
          secure: 'implicit',
          secureOptions: { rejectUnauthorized: false },
        });
        await client.cd('/model');
        await client.uploadFrom(tmpPath, filename);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } finally {
        client.close();
        try { fs.unlinkSync(tmpPath); } catch (_) {}
      }
    } catch (e) {
      console.error('[FTP]', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── Printer HTTP proxy: /printer-proxy/{ip}{path} ─────────────────────────
  // Forwards requests to LAN printers so HTTPS-hosted pages avoid mixed-content blocks.
  const proxyMatch = url.pathname.match(/^\/printer-proxy\/([^/]+)(\/.*)?$/);
  if (proxyMatch) {
    const printerIp   = decodeURIComponent(proxyMatch[1]);
    const printerPath = (proxyMatch[2] || '/') + (url.search || '');

    const forward = ['content-type', 'content-length', 'x-api-key', 'authorization'];
    const fwdHeaders = {};
    for (const h of forward) { if (req.headers[h]) fwdHeaders[h] = req.headers[h]; }

    const proxyReq = http.request(
      { hostname: printerIp, port: 80, path: printerPath, method: req.method, headers: fwdHeaders },
      proxyRes => {
        const out = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
        };
        if (proxyRes.headers['content-type']) out['content-type'] = proxyRes.headers['content-type'];
        res.writeHead(proxyRes.statusCode, out);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on('error', e => {
      console.error('[proxy]', printerIp, e.message);
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });
    req.pipe(proxyReq);
    return;
  }

  // ── Static file server ─────────────────────────────────────────────────────
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  // Prevent directory traversal
  filePath = path.join(__dirname, path.normalize(filePath).replace(/^(\.\.[/\\])+/, ''));

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ── MQTT WebSocket proxy ───────────────────────────────────────────────────────
// Browser connects: ws://SERVER:3000/mqtt-proxy?ip=PRINTER_IP&pin=ACCESS_CODE
// Server connects:  mqtts://PRINTER_IP:8883  (native TLS — bypasses browser mixed-content block)
//
// Protocol (JSON frames):
//   server→browser: { type:"connected" } | { type:"message", topic, payload } | { type:"error", message }
//   browser→server: { topic, payload }   (publish to printer)

const wss = new WebSocketServer({ server, path: '/mqtt-proxy' });

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const ip  = params.get('ip');
  const pin = params.get('pin');

  if (!ip || !pin) { ws.close(4000, 'Missing ip/pin'); return; }
  console.log(`[MQTT] Connecting → ${ip} for WS client`);

  const client = mqtt.connect(`mqtts://${ip}:8883`, {
    clientId: 'printara_proxy_' + Math.random().toString(36).slice(2, 8),
    username: 'bblp',
    password: pin,
    rejectUnauthorized: false,
    connectTimeout: 8000,
    reconnectPeriod: 0,
    clean: true,
  });

  client.on('connect', () => {
    client.subscribe('device/+/report', () => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'connected' }));
      console.log(`[MQTT] Connected → ${ip}`);
    });
  });

  client.on('message', (topic, payload) => {
    if (ws.readyState === ws.OPEN)
      ws.send(JSON.stringify({ type: 'message', topic, payload: payload.toString() }));
  });

  client.on('error', err => {
    console.error(`[MQTT] Error (${ip}):`, err.message);
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'error', message: err.message }));
    ws.close();
  });

  client.on('close', () => {
    console.log(`[MQTT] Closed → ${ip}`);
    try { ws.close(4001, 'MQTT disconnected'); } catch (_) {}
  });

  // Browser → printer: forward publish messages
  ws.on('message', raw => {
    try {
      const { topic, payload } = JSON.parse(raw);
      client.publish(topic, payload);
    } catch (_) {}
  });

  ws.on('close', () => { try { client.end(true); } catch (_) {} });
});

// ── Start ──────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  // Find local IP
  let localIP = 'YOUR-PC-IP';
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) { localIP = net.address; break; }
    }
    if (localIP !== 'YOUR-PC-IP') break;
  }

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║          Printara — Local Network Server         ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  This PC:   http://localhost:${PORT}                 ║`);
  console.log(`║  Network:   http://${localIP.padEnd(28)}║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  Open the network URL on any phone or tablet     ║');
  console.log('║  connected to the same WiFi as your printers.    ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
});
