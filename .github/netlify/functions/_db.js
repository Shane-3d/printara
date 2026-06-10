// Shared MySQL connection helper for all Netlify Functions.
const mysql = require('mysql2/promise');

function dbConfig() {
  return {
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_DATABASE,
    user:     process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD || '',
  };
}

async function getConn() {
  return mysql.createConnection(dbConfig());
}

function ok(body, status = 200) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function err(message, status = 400) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: message }) };
}
function parseBody(event) {
  try { return JSON.parse(event.body); } catch { return null; }
}

module.exports = { getConn, ok, err, parseBody };
