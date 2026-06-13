#!/usr/bin/env node
// Pro-Fab 3D — Alter existing tables to fix schema issues.
// Safe to run on a live database — uses ALTER IF NOT EXISTS patterns.
// Run: node db/update-schema.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function getConn() {
  const database = (process.env.DB_DATABASE || '').replace(/^"|"$/g, '');
  return mysql.createConnection({
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '3306', 10),
    database,
    user:     process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
  });
}

async function columnExists(conn, table, column) {
  const db = (process.env.DB_DATABASE || '').replace(/^"|"$/g, '');
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column]
  );
  return rows[0].cnt > 0;
}

async function run(conn, label, sql) {
  try {
    await conn.execute(sql);
    console.log('  ✓', label);
  } catch (e) {
    console.log('  ✗', label, '—', e.message);
  }
}

async function main() {
  let conn;
  try {
    conn = await getConn();
    console.log('Connected.\n');

    // ── listings ────────────────────────────────────────────────────────────
    console.log('listings:');
    // Fix emoji column: widen to 64 chars with utf8mb4 so all emoji render correctly
    await run(conn, 'emoji → VARCHAR(64) CHARACTER SET utf8mb4',
      `ALTER TABLE listings MODIFY COLUMN emoji VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '📦'`);
    // Widen image to LONGTEXT (base64 AI photos can be large)
    await run(conn, 'image → LONGTEXT',
      `ALTER TABLE listings MODIFY COLUMN image LONGTEXT NULL`);
    // Ensure description is TEXT
    await run(conn, 'description → TEXT',
      `ALTER TABLE listings MODIFY COLUMN description TEXT NULL`);

    // ── orders ──────────────────────────────────────────────────────────────
    console.log('\norders:');
    // Add photo column for custom order attachments
    if (!await columnExists(conn, 'orders', 'photo')) {
      await run(conn, 'add photo LONGTEXT',
        `ALTER TABLE orders ADD COLUMN photo LONGTEXT NULL AFTER description`);
    } else {
      console.log('  – photo already exists');
    }
    // Widen description to TEXT
    await run(conn, 'description → TEXT',
      `ALTER TABLE orders MODIFY COLUMN description TEXT NULL`);
    // notes → TEXT
    await run(conn, 'notes → TEXT',
      `ALTER TABLE orders MODIFY COLUMN notes TEXT NULL`);

    // ── admin_accounts ───────────────────────────────────────────────────────
    console.log('\nadmin_accounts:');
    if (!await columnExists(conn, 'admin_accounts', 'created_at')) {
      await run(conn, 'add created_at TIMESTAMP',
        `ALTER TABLE admin_accounts ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    } else {
      console.log('  – created_at already exists');
    }

    // ── accounts ─────────────────────────────────────────────────────────────
    console.log('\naccounts:');
    // profile already JSON — ensure merits_balance column exists for future use
    if (!await columnExists(conn, 'accounts', 'merits_balance')) {
      await run(conn, 'add merits_balance INT DEFAULT 0',
        `ALTER TABLE accounts ADD COLUMN merits_balance INT NOT NULL DEFAULT 0`);
    } else {
      console.log('  – merits_balance already exists');
    }

    // ── notifications ────────────────────────────────────────────────────────
    console.log('\nnotifications:');
    await run(conn, 'message → TEXT',
      `ALTER TABLE notifications MODIFY COLUMN message TEXT NULL`);

    // ── clock_sessions ───────────────────────────────────────────────────────
    console.log('\nclock_sessions: no changes needed');

    // ── clock_active ─────────────────────────────────────────────────────────
    console.log('\nclock_active: no changes needed');

    console.log('\n✅  Schema update complete.');
  } catch (e) {
    console.error('\n❌  Update failed:', e.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
