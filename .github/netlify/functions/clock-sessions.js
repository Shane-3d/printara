// Netlify Function — clock-in sessions and active clock-in state.
//
// Completed sessions:
//   GET  /clock-sessions               → all completed sessions
//   POST /clock-sessions               → save a completed session
//   DELETE /clock-sessions?accountId=x → clear all sessions for an account
//
// Active sessions (currently clocked in):
//   GET  /clock-sessions?active=1            → all active sessions (map)
//   POST /clock-sessions?active=1            → set active session for an account
//   DELETE /clock-sessions?active=1&accountId=x → clear active session

const { getConn, ok, err, parseBody } = require('./_db');

exports.handler = async (event) => {
  let conn;
  try { conn = await getConn(); } catch (e) { return err('DB connection failed: ' + e.message, 500); }
  const isActive = event.queryStringParameters?.active === '1';
  try {
    const method = event.httpMethod;

    // ── Active sessions ─────────────────────────────────────────────────────
    if (isActive) {
      if (method === 'GET') {
        const [rows] = await conn.execute('SELECT * FROM clock_active');
        // Return as map { accountId: { start, accountId, username } }
        const map = {};
        for (const r of rows) {
          map[r.account_id] = { accountId: r.account_id, username: r.username, start: r.start_time };
        }
        return ok(map);
      }
      if (method === 'POST') {
        const body = parseBody(event);
        if (!body) return err('Invalid JSON');
        const { accountId, username = '', start } = body;
        if (!accountId || !start) return err('accountId and start required');
        await conn.execute(
          'INSERT INTO clock_active (account_id, username, start_time) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE username = VALUES(username), start_time = VALUES(start_time)',
          [accountId, username, start]
        );
        return ok({ success: true });
      }
      if (method === 'DELETE') {
        const accountId = event.queryStringParameters?.accountId;
        if (!accountId) return err('accountId required');
        await conn.execute('DELETE FROM clock_active WHERE account_id = ?', [accountId]);
        return ok({ success: true });
      }
    }

    // ── Completed sessions ───────────────────────────────────────────────────
    if (method === 'GET') {
      const [rows] = await conn.execute('SELECT * FROM clock_sessions ORDER BY start_time DESC');
      return ok(rows.map(r => ({
        id:        r.id,
        accountId: r.account_id,
        username:  r.username,
        start:     r.start_time,
        end:       r.end_time,
        ms:        r.duration_ms,
      })));
    }

    if (method === 'POST') {
      const body = parseBody(event);
      if (!body) return err('Invalid JSON');
      const { accountId, username = '', start, end, ms } = body;
      if (!accountId || !start || !end) return err('accountId, start, and end required');
      await conn.execute(
        'INSERT INTO clock_sessions (account_id, username, start_time, end_time, duration_ms) VALUES (?, ?, ?, ?, ?)',
        [accountId, username, start, end, ms || 0]
      );
      return ok({ success: true }, 201);
    }

    if (method === 'DELETE') {
      const accountId = event.queryStringParameters?.accountId;
      if (!accountId) return err('accountId required');
      await conn.execute('DELETE FROM clock_sessions WHERE account_id = ?', [accountId]);
      return ok({ success: true });
    }

    return err('Method not allowed', 405);
  } catch (e) {
    return err('Query error: ' + e.message, 500);
  } finally {
    await conn.end();
  }
};
