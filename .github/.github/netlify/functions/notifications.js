// Netlify Function — CRUD for notifications.
// GET    /notifications            → all notifications
// POST   /notifications            → create notification
// PUT    /notifications            → mark read (by id or userId)
// DELETE /notifications?id=xxx     → delete notification

const { getConn, ok, err, parseBody } = require('./_db');

function rowToNotif(r) {
  return {
    id:      r.id,
    userId:  r.user_id,
    type:    r.type,
    orderId: r.order_id,
    message: r.message,
    date:    r.date,
    read:    r.is_read === 1,
  };
}

exports.handler = async (event) => {
  let conn;
  try { conn = await getConn(); } catch (e) { return err('DB connection failed: ' + e.message, 500); }
  try {
    const method = event.httpMethod;

    if (method === 'GET') {
      const [rows] = await conn.execute('SELECT * FROM notifications ORDER BY date DESC');
      return ok(rows.map(rowToNotif));
    }

    if (method === 'POST') {
      const body = parseBody(event);
      if (!body) return err('Invalid JSON');
      const { id, userId, type = '', orderId, message = '', date, read = false } = body;
      if (!id || !userId) return err('id and userId are required');
      await conn.execute(
        'INSERT INTO notifications (id, user_id, type, order_id, message, date, is_read) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, userId, type, orderId || null, message, date || new Date().toISOString(), read ? 1 : 0]
      );
      return ok({ success: true }, 201);
    }

    if (method === 'PUT') {
      const body = parseBody(event);
      if (!body) return err('Invalid JSON');
      // Mark single notification read by id, or all for a userId
      const { id, userId, read } = body;
      if (id) {
        await conn.execute('UPDATE notifications SET is_read = ? WHERE id = ?', [read ? 1 : 0, id]);
      } else if (userId) {
        await conn.execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
      } else {
        return err('id or userId required');
      }
      return ok({ success: true });
    }

    if (method === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return err('id required');
      await conn.execute('DELETE FROM notifications WHERE id = ?', [id]);
      return ok({ success: true });
    }

    return err('Method not allowed', 405);
  } catch (e) {
    return err('Query error: ' + e.message, 500);
  } finally {
    await conn.end();
  }
};
