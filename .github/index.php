<?php
/**
 * Laravel Herd router for Printara (static HTML + Netlify Functions).
 *
 * Herd/nginx routes all requests here via try_files.
 * - /.netlify/functions/*  → proxied to the local Node API server (port 8888)
 * - /queue, /tools, etc.  → served as HTML files
 * - Static assets          → nginx serves them directly before reaching here
 */

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = ltrim($uri, '/');

// ── Proxy /.netlify/functions/* to local Node API (node api-server.js) ────────
if (str_starts_with($uri, '.netlify/functions/')) {
    $qs      = $_SERVER['QUERY_STRING'] ? '?' . $_SERVER['QUERY_STRING'] : '';
    $apiUrl  = 'http://127.0.0.1:8888/' . $uri . $qs;
    $method  = $_SERVER['REQUEST_METHOD'];
    $body    = file_get_contents('php://input');
    $reqType = $_SERVER['CONTENT_TYPE'] ?? 'application/json';

    if ($method === 'OPTIONS') {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        http_response_code(204);
        exit;
    }

    $opts = [
        'http' => [
            'method'        => $method,
            'header'        => "Content-Type: $reqType\r\n",
            'content'       => $body,
            'ignore_errors' => true,
            'timeout'       => 10,
        ],
    ];
    $ctx      = stream_context_create($opts);
    $response = @file_get_contents($apiUrl, false, $ctx);

    if ($response === false) {
        http_response_code(503);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'API server not running — start it with: node api-server.js']);
        exit;
    }

    // Forward the status code from Node response
    $code = 200;
    foreach ($http_response_header as $h) {
        if (preg_match('#^HTTP/\S+ (\d+)#', $h, $m)) $code = (int) $m[1];
    }
    http_response_code($code);
    header('Content-Type: application/json');
    echo $response;
    exit;
}

// ── Serve static assets that reach PHP (fallback — nginx handles most) ─────────
if ($uri) {
    $file = __DIR__ . DIRECTORY_SEPARATOR . $uri;
    if (file_exists($file) && !is_dir($file)) {
        $ext  = strtolower(pathinfo($uri, PATHINFO_EXTENSION));
        $mime = [
            'css'   => 'text/css',
            'js'    => 'application/javascript; charset=utf-8',
            'png'   => 'image/png',
            'jpg'   => 'image/jpeg',
            'jpeg'  => 'image/jpeg',
            'gif'   => 'image/gif',
            'svg'   => 'image/svg+xml',
            'ico'   => 'image/x-icon',
            'woff'  => 'font/woff',
            'woff2' => 'font/woff2',
            'html'  => 'text/html; charset=utf-8',
            'json'  => 'application/json',
        ];
        header('Content-Type: ' . ($mime[$ext] ?? 'application/octet-stream'));
        readfile($file);
        exit;
    }
}

// ── Route HTML pages ────────────────────────────────────────────────────────────
$slug   = rtrim($uri, '/');
$routes = [
    ''         => 'index.html',
    'queue'    => 'queue.html',
    'tools'    => 'tools.html',
    'download' => 'download.html',
    'admin'    => 'admin.html',
];

$page = $routes[$slug] ?? 'index.html';
$path = __DIR__ . DIRECTORY_SEPARATOR . $page;

if (file_exists($path)) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($path);
} else {
    http_response_code(404);
    echo '404 Not Found';
}
