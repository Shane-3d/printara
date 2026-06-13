#!/usr/bin/env node
// ============================================================
// Pro-Fab 3D — One-time migration: JSONBin.io → MySQL
//
// Usage (from project root, after `npm install`):
//   node db/migrate-from-cloud.js
//
// Reads .env automatically. Safe to re-run — uses INSERT IGNORE
// so existing rows are never duplicated or overwritten.
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const JSONBIN_KEY = process.env.JSONBIN_MASTER_KEY;
const JSONBIN_BIN = process.env.JSONBIN_BIN_ID;

async function fetchCloud() {
  if (!JSONBIN_KEY || !JSONBIN_BIN) {
    throw new Error('JSONBIN_MASTER_KEY or JSONBIN_BIN_ID is missing from .env');
  }
  console.log('Fetching data from JSONBin…');
  const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN}/latest`, {
    headers: { 'X-Master-Key': JSONBIN_KEY }
  });
  if (!res.ok) throw new Error(`JSONBin fetch failed: ${res.status} ${res.statusText}`);
  const { record } = await res.json();
  console.log('Cloud data received.');
  return record;
}

async function getConn() {
  // Strip surrounding quotes from DB_DATABASE if present
  const database = (process.env.DB_DATABASE || '').replace(/^"|"$/g, '');
  return mysql.createConnection({
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '3306', 10),
    database,
    user:     process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: false,
  });
}

function safe(val) {
  return val ?? null;
}
function safeFloat(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}
function safeInt(val) {
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}
function safeDate(val) {
  if (!val) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  const d = new Date(val);
  return isNaN(d) ? new Date().toISOString().slice(0, 19).replace('T', ' ') : d.toISOString().slice(0, 19).replace('T', ' ');
}

async function migrateProducts(conn, products = []) {
  console.log(`\nMigrating ${products.length} listings…`);
  let ok = 0, skip = 0;
  for (const p of products) {
    if (!p.id || !p.name) { skip++; continue; }
    const [r] = await conn.execute(
      `INSERT IGNORE INTO listings
         (id, name, category, description, price, sale_price, material, print_time, dimensions, image, emoji, in_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id, p.name,
        safe(p.category), safe(p.description),
        safeFloat(p.price),
        p.salePrice != null ? safeFloat(p.salePrice) : null,
        safe(p.material), safe(p.printTime), safe(p.dimensions),
        safe(p.image), p.emoji || '📦',
        p.inStock ? 1 : 0,
      ]
    );
    r.affectedRows ? ok++ : skip++;
  }
  console.log(`  ✓ ${ok} inserted, ${skip} skipped (already existed or invalid)`);
}

async function migrateAccounts(conn, users = []) {
  console.log(`\nMigrating ${users.length} customer accounts…`);
  let ok = 0, skip = 0;
  for (const u of users) {
    if (!u.id || !u.email) { skip++; continue; }
    const [r] = await conn.execute(
      `INSERT IGNORE INTO accounts (id, name, email, pw_hash, profile, registered_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        u.id, u.name || '',
        u.email.toLowerCase(),
        safe(u.pwHash),
        u.profile ? JSON.stringify(u.profile) : null,
        safeDate(u.registeredAt),
      ]
    );
    r.affectedRows ? ok++ : skip++;
  }
  console.log(`  ✓ ${ok} inserted, ${skip} skipped`);
}

async function migrateOrders(conn, orders = []) {
  console.log(`\nMigrating ${orders.length} orders…`);
  let ok = 0, skip = 0;
  for (const o of orders) {
    if (!o.id) { skip++; continue; }
    const [r] = await conn.execute(
      `INSERT IGNORE INTO orders
         (id, date, status, type, user_id, customer, notes, payment_method, items, total, merits_total, stripe_id, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        o.id,
        safeDate(o.date),
        o.status || 'New',
        o.type   || 'order',
        safe(o.userId),
        o.customer   ? JSON.stringify(o.customer) : null,
        o.notes      || '',
        o.paymentMethod || 'cash',
        o.items      ? JSON.stringify(o.items) : null,
        safeFloat(o.total),
        safeInt(o.meritsTotal),
        safe(o.stripeId),
        safe(o.description),
      ]
    );
    r.affectedRows ? ok++ : skip++;
  }
  console.log(`  ✓ ${ok} inserted, ${skip} skipped`);
}

async function migrateNotifications(conn, notifications = []) {
  console.log(`\nMigrating ${notifications.length} notifications…`);
  let ok = 0, skip = 0;
  for (const n of notifications) {
    if (!n.id || !n.userId) { skip++; continue; }
    const [r] = await conn.execute(
      `INSERT IGNORE INTO notifications (id, user_id, type, order_id, message, date, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        n.id, n.userId,
        n.type    || '',
        safe(n.orderId),
        n.message || '',
        safeDate(n.date),
        n.read ? 1 : 0,
      ]
    );
    r.affectedRows ? ok++ : skip++;
  }
  console.log(`  ✓ ${ok} inserted, ${skip} skipped`);
}

async function migrateAdminAccounts(conn, adminAccounts = []) {
  // Also seed the owner from ADMIN_SALT / ADMIN_HASH in .env if no accounts exist
  const list = [...adminAccounts];
  if (list.length === 0 && process.env.ADMIN_SALT && process.env.ADMIN_HASH) {
    console.log('\n  No admin accounts in cloud — seeding owner from .env credentials…');
    list.push({
      id: 'owner',
      username: 'owner',
      salt: process.env.ADMIN_SALT,
      hash: process.env.ADMIN_HASH,
      role: 'owner',
      permissions: ['add','manage','orders','custom','users','sales','revenue','clockin','settings'],
    });
  }
  console.log(`\nMigrating ${list.length} admin accounts…`);
  let ok = 0, skip = 0;
  for (const a of list) {
    if (!a.id || !a.username) { skip++; continue; }
    const [r] = await conn.execute(
      `INSERT IGNORE INTO admin_accounts (id, username, salt, hash, role, permissions)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        a.id, a.username,
        a.salt || '', a.hash || '',
        a.role || 'staff',
        JSON.stringify(a.permissions || []),
      ]
    );
    r.affectedRows ? ok++ : skip++;
  }
  console.log(`  ✓ ${ok} inserted, ${skip} skipped`);
}

async function migrateCISessions(conn, ciSessions = [], ciActive = null) {
  console.log(`\nMigrating ${ciSessions.length} clock-in sessions…`);
  let ok = 0, skip = 0;
  for (const s of ciSessions) {
    if (!s.start || !s.end || !s.accountId) { skip++; continue; }
    try {
      await conn.execute(
        `INSERT IGNORE INTO clock_sessions (account_id, username, start_time, end_time, duration_ms)
         VALUES (?, ?, ?, ?, ?)`,
        [s.accountId, s.username || '', safeDate(s.start), safeDate(s.end), safeInt(s.ms)]
      );
      ok++;
    } catch { skip++; }
  }
  console.log(`  ✓ ${ok} inserted, ${skip} skipped`);

  // Active sessions
  if (ciActive && typeof ciActive === 'object') {
    // Normalise: could be a map { accountId: { start, accountId, username } } or legacy single object
    const entries = ciActive.start && ciActive.accountId
      ? [ciActive]
      : Object.values(ciActive).filter(v => v && v.start && v.accountId);
    console.log(`\nMigrating ${entries.length} active clock-in entries…`);
    let aok = 0;
    for (const a of entries) {
      await conn.execute(
        `INSERT INTO clock_active (account_id, username, start_time)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE username = VALUES(username), start_time = VALUES(start_time)`,
        [a.accountId, a.username || '', safeDate(a.start)]
      );
      aok++;
    }
    console.log(`  ✓ ${aok} upserted`);
  }
}

async function applySchema(conn) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // Split on semicolons, run each non-empty statement individually
  // Remove full-line comments, then split on semicolons
  const stripped = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    await conn.execute(stmt);
  }
  console.log('Schema applied (tables created if missing).');
}

async function main() {
  let conn;
  try {
    const record = await fetchCloud();
    console.log('\nConnecting to MySQL…');
    conn = await getConn();
    console.log('Connected.');
    console.log('\nApplying schema…');
    await applySchema(conn);

    await migrateProducts(conn,       record.products        || []);
    await migrateAccounts(conn,       record.users           || []);
    await migrateOrders(conn,         record.orders          || []);
    await migrateNotifications(conn,  record.notifications   || []);
    await migrateAdminAccounts(conn,  record.admin_accounts  || []);
    await migrateCISessions(conn,     record.ci_sessions     || [], record.ci_active || null);

    console.log('\n✅  Migration complete. All cloud data is now in MySQL.');
  } catch (e) {
    console.error('\n❌  Migration failed:', e.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
