#!/usr/bin/env node
/**
 * Printara — Local API server for Laravel Herd.
 *
 * Herd's index.php proxies every /.netlify/functions/* request here (port 8888)
 * so the same serverless functions (Stripe checkout, etc.) run locally during
 * development without deploying to Netlify.
 *
 * Usage:  node api-server.js
 * Secrets (STRIPE_SECRET_KEY, …) are loaded from the gitignored .env file.
 */

const http = require('http');
try { require('dotenv').config(); } catch (_) {}

const PORT = process.env.API_PORT || 8888;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const fnMatch = url.pathname.match(/^\/\.netlify\/functions\/([\w-]+)$/);
  if (!fnMatch) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const fnName = fnMatch[1];
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const mod = require(`./netlify/functions/${fnName}.js`);
    const event = {
      httpMethod: req.method,
      body: Buffer.concat(chunks).toString(),
      headers: req.headers,
      queryStringParameters: Object.fromEntries(url.searchParams),
    };
    const result = await mod.handler(event, {});
    res.writeHead(result.statusCode || 200, result.headers || { 'Content-Type': 'application/json' });
    res.end(result.body || '');
  } catch (e) {
    console.error('[api]', fnName, e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Printara API server → http://127.0.0.1:${PORT}  (Netlify functions for Herd)`);
});
